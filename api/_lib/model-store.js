const REST_TIMEOUT_MS = 5_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function request(path, init = {}) {
  const settings = config();
  if (!settings) return null;
  try {
    const response = await fetch(`${settings.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: settings.key,
        Authorization: `Bearer ${settings.key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Model registry store ${init.method || 'GET'} ${path} -> ${response.status}`);
      return null;
    }
    return response;
  } catch (error) {
    console.warn('Model registry store unavailable:', error?.message || error);
    return null;
  }
}

export async function readModelRegistry() {
  const response = await request('model_registry?select=*&order=last_changed_at.desc&limit=250', { method: 'GET' });
  if (!response) return [];
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/*
 * Hot-path cache for the model registry (Roadmap 0.3).
 *
 * The registry changes at most once a day (the model-scan cron), but the chat
 * handler reads it on every request — up to twice. A short module-level TTL cache
 * absorbs those reads on a warm serverless instance, cutting a Supabase
 * round-trip (and its latency) off the critical path. Empty results are NOT
 * cached: an empty array usually means the store was momentarily unreachable, and
 * caching that would blind routing for the whole TTL window.
 */
const REGISTRY_TTL_MS = 60_000;
let registryCache = null; // { at: number, rows: any[] }

export async function readModelRegistryCached(ttlMs = REGISTRY_TTL_MS) {
  const now = Date.now();
  if (registryCache && now - registryCache.at < ttlMs) return registryCache.rows;
  const rows = await readModelRegistry();
  if (rows.length) registryCache = { at: now, rows };
  return rows;
}

/** Test/edge hook: drop the cached registry so the next read is fresh. */
export function clearModelRegistryCache() {
  registryCache = null;
}

export async function readModelQualitySummary() {
  const response = await request('model_quality_summary?select=*', { method: 'GET' });
  if (!response) return [];
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

const QUALITY_SUMMARY_TTL_MS = 60_000;
let qualitySummaryCache = null; // { at: number, rows: any[] }

/**
 * Cached read of the measured-outcome summary for per-turn routing. Outcome
 * ledgers move slowly, so a short TTL keeps routing evidence fresh without a
 * database round-trip on every coding turn.
 */
export async function readModelQualitySummaryCached(ttlMs = QUALITY_SUMMARY_TTL_MS) {
  const now = Date.now();
  if (qualitySummaryCache && now - qualitySummaryCache.at < ttlMs) return qualitySummaryCache.rows;
  const rows = await readModelQualitySummary();
  qualitySummaryCache = { at: now, rows };
  return rows;
}

/** Test/edge hook: drop the cached quality summary so the next read is fresh. */
export function clearModelQualitySummaryCache() {
  qualitySummaryCache = null;
}

export async function writeModelRegistry(rows) {
  if (!rows.length) return false;
  const response = await request('model_registry?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  return Boolean(response);
}

export async function writeModelEvents(events) {
  if (!events.length) return false;
  const response = await request('model_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(events),
  });
  return Boolean(response);
}

export function isModelStoreConfigured() {
  return Boolean(config());
}
