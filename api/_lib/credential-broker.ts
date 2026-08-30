/**
 * Quantora server credential broker.
 *
 * Security boundary: callers request a known credential/capability; they never
 * build arbitrary Supabase credential queries and never receive access to the
 * Supabase service-role key itself. The backend is intentionally replaceable so
 * a future Vault/KMS/remote broker can be introduced without changing callers.
 */
export const SERVER_CREDENTIAL_IDS = [
  'GEMINI',
  'OPENROUTER',
  'OPENAI',
  'ANTHROPIC',
  'VERCEL',
] as const;

export type ServerCredentialId = typeof SERVER_CREDENTIAL_IDS[number];

export const CREDENTIAL_CAPABILITIES = [
  'model:gemini',
  'model:openrouter',
  'model:openai',
  'model:anthropic',
  'deploy:vercel',
] as const;

export type CredentialCapability = typeof CREDENTIAL_CAPABILITIES[number];

const CAPABILITY_PROVIDER: Record<CredentialCapability, ServerCredentialId> = {
  'model:gemini': 'GEMINI',
  'model:openrouter': 'OPENROUTER',
  'model:openai': 'OPENAI',
  'model:anthropic': 'ANTHROPIC',
  'deploy:vercel': 'VERCEL',
};

const ENV_FALLBACK: Record<ServerCredentialId, string> = {
  GEMINI: 'GEMINI_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  VERCEL: 'VERCEL_ACCESS_TOKEN',
};

const DEFAULT_TIMEOUT_MS = 4_000;
const allowedIds = new Set<string>(SERVER_CREDENTIAL_IDS);

type BrokerDependencies = {
  fetchFn?: typeof fetch;
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Test seam for the last-known-good credential cache's TTL arithmetic. */
  now?: number;
};

export function normalizeServerCredentialId(value: unknown): ServerCredentialId | null {
  const normalized = String(value || '').trim().toUpperCase();
  return allowedIds.has(normalized) ? normalized as ServerCredentialId : null;
}

async function fetchWithDeadline(
  fetchFn: typeof fetch,
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  return fetchFn(input, { ...init, signal });
}


/*
 * Last-known-good credential cache — the fix for "no healthy AI route".
 *
 * Every chat turn re-reads the gateway credential from Supabase, and this
 * function fails SOFT (returns null) on any hiccup: a timeout, a cold start, a
 * transient non-2xx. That null then flows all the way to planInferenceRoutes as
 * "this gateway has no credential", every route is dropped, and a signed-in user
 * whose key is perfectly valid is told Quantora "could not reach a healthy AI
 * route" — on a plain question, seconds after the same key served a turn.
 *
 * A credential that resolved a moment ago has not stopped existing because one
 * lookup timed out. Cache the last good value per provider in module memory and
 * serve it when a live read fails, so a blip in the credential BACKEND can no
 * longer masquerade as a missing key. Bounded by TTL so a genuinely revoked or
 * rotated key still drains out; a successful read always refreshes the entry.
 *
 * Process-local by design (serverless instances each keep their own) — this is
 * a resilience buffer, never a source of truth.
 */
const CREDENTIAL_CACHE_TTL_MS = 10 * 60 * 1000;
const credentialCache = new Map<string, { value: string; storedAt: number }>();

/** Test seam: drop every cached credential. */
export function clearGatewayCredentialCache(): void {
  credentialCache.clear();
}

function cachedCredential(id: string, now: number): string | null {
  const hit = credentialCache.get(id);
  if (!hit) return null;
  if (now - hit.storedAt > CREDENTIAL_CACHE_TTL_MS) {
    credentialCache.delete(id);
    return null;
  }
  return hit.value;
}

/**
 * Read exactly one allow-listed credential from the existing Supabase gateway.
 * This compatibility backend fails soft and never exposes service-role material.
 */
export async function fetchGatewayCredential(
  provider: unknown,
  dependencies: BrokerDependencies = {},
): Promise<string | null> {
  const id = normalizeServerCredentialId(provider);
  if (!id) return null;

  const now = dependencies.now ?? Date.now();
  const supabaseUrl = dependencies.supabaseUrl ?? process.env.SUPABASE_URL ?? null;
  const serviceRoleKey = dependencies.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  // Missing configuration is a real "no credential", not a blip — do not serve
  // a cached value over it, or a deliberately unconfigured deployment would
  // keep answering from a key it is no longer meant to have.
  if (!supabaseUrl || !serviceRoleKey) return null;

  const fetchFn = dependencies.fetchFn || fetch;
  const timeoutMs = Math.min(10_000, Math.max(500, dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const base = supabaseUrl.replace(/\/+$/, '');
  const url = `${base}/rest/v1/api_gateway_keys?provider=eq.${encodeURIComponent(id)}&select=api_key&limit=1`;

  try {
    const response = await fetchWithDeadline(fetchFn, url, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }, timeoutMs);
    // A 5xx/timeout is the backend faltering, not the key vanishing. A 4xx is
    // the backend answering clearly, so it drains the cache instead.
    if (!response.ok) {
      if (response.status >= 500) return cachedCredential(id, now);
      credentialCache.delete(id);
      return null;
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.length) {
      credentialCache.delete(id);
      return null;
    }
    const apiKey = (data[0] as any)?.api_key;
    const resolved = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null;
    if (resolved) credentialCache.set(id, { value: resolved, storedAt: now });
    else credentialCache.delete(id);
    return resolved;
  } catch (error: any) {
    // Network/timeout: fall back to the last credential that actually worked so
    // one slow read cannot stand a whole turn down with "no healthy AI route".
    const fallback = cachedCredential(id, now);
    console.warn(
      `[CredentialBroker] ${id} credential backend unavailable:`,
      error?.message || 'request_failed',
      fallback ? '(served last-known-good credential)' : '(no cached credential)',
    );
    return fallback;
  }
}

/**
 * Capability-first credential resolution. New code should prefer this API so
 * business/PCL logic does not know storage layout or secret names.
 */
export async function resolveCapabilityCredential(
  capability: CredentialCapability,
  dependencies: BrokerDependencies & { preferGateway?: boolean } = {},
): Promise<string | null> {
  const provider = CAPABILITY_PROVIDER[capability];
  if (!provider) return null;

  const env = dependencies.env || process.env;
  const envValue = env[ENV_FALLBACK[provider]];
  const cleanEnv = typeof envValue === 'string' && envValue.trim() ? envValue.trim() : null;
  const preferGateway = dependencies.preferGateway === true;

  if (!preferGateway && cleanEnv) return cleanEnv;
  const gateway = await fetchGatewayCredential(provider, dependencies);
  if (gateway) return gateway;
  return cleanEnv;
}
