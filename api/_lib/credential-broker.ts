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

  const supabaseUrl = dependencies.supabaseUrl ?? process.env.SUPABASE_URL ?? null;
  const serviceRoleKey = dependencies.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
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
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.length) return null;
    const apiKey = (data[0] as any)?.api_key;
    return typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null;
  } catch (error: any) {
    console.warn(`[CredentialBroker] ${id} credential backend unavailable:`, error?.message || 'request_failed');
    return null;
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
