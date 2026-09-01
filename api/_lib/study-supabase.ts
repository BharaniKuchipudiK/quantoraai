export const STUDY_SUPABASE_TIMEOUT_MS = 4_000;

type StudySupabaseRequestInit = RequestInit & {
  headers?: Record<string, string>;
};

export function studySupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function safeErrorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name.slice(0, 80) || 'Error';
  }
  return 'Error';
}

/**
 * Server-only Study REST transport.
 *
 * Deliberately never logs `path`, request bodies, learner identifiers, query
 * strings, credentials, or raw exception messages. Callers may log a bounded
 * operation label and HTTP status separately when that is operationally useful.
 */
export async function studySupabaseRequest(
  path: string,
  init: StudySupabaseRequestInit,
  options: { operation: string; timeoutMs?: number },
): Promise<Response | null> {
  const cfg = studySupabaseConfig();
  if (!cfg) return null;

  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? STUDY_SUPABASE_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    console.warn('Study Supabase request failed', {
      operation: String(options.operation || 'unknown').slice(0, 80),
      error: safeErrorName(error),
    });
    return null;
  }
}

export async function readStudySupabaseRows(
  path: string,
  options: { operation: string; timeoutMs?: number },
): Promise<any[] | null> {
  const response = await studySupabaseRequest(path, { method: 'GET' }, options);
  if (!response?.ok) return null;
  try {
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}
