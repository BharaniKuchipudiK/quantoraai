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
