const STUDY_SUPABASE_TIMEOUT_MS = 4_000;
const STUDY_SUPABASE_PAGE_SIZE = 250;
const STUDY_SUPABASE_MAX_REPLAY_ROWS = 5_000;

type StudySupabaseRequestInit = RequestInit & {
  headers?: Record<string, string>;
};

function studySupabaseConfig() {
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

export type StudySupabasePagedRowsResult = {
  rows: any[];
  status: 'complete' | 'overflow';
  pages: number;
};

/**
 * Read an append-ordered Study result set without silently truncating learner
 * history. Callers provide a base path with a deterministic order and no
 * `limit`/`offset`; this helper owns pagination.
 *
 * H3.3 deliberately has a hard safety ceiling. Exceeding it returns `overflow`
 * so learner truth fails closed rather than pretending the first N rows are the
 * complete ledger. A later snapshot checkpoint may safely remove that ceiling
 * only after delta/full-replay parity is proven.
 */
export async function readStudySupabaseRowsPaged(
  basePath: string,
  options: {
    operation: string;
    timeoutMs?: number;
    pageSize?: number;
    maxRows?: number;
  },
): Promise<StudySupabasePagedRowsResult | null> {
  if (/[?&](?:limit|offset)=/i.test(basePath)) return null;
  const pageSize = Math.max(1, Math.min(500, Math.floor(options.pageSize ?? STUDY_SUPABASE_PAGE_SIZE)));
  const maxRows = Math.max(pageSize, Math.min(20_000, Math.floor(options.maxRows ?? STUDY_SUPABASE_MAX_REPLAY_ROWS)));
  const rows: any[] = [];
  let pages = 0;

  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const separator = basePath.includes('?') ? '&' : '?';
    const page = await readStudySupabaseRows(
      `${basePath}${separator}limit=${limit}&offset=${rows.length}`,
      { operation: options.operation, timeoutMs: options.timeoutMs },
    );
    if (page === null) return null;
    pages += 1;
    rows.push(...page);
    if (page.length < limit) return { rows, status: 'complete', pages };
  }

  const separator = basePath.includes('?') ? '&' : '?';
  const probe = await readStudySupabaseRows(
    `${basePath}${separator}limit=1&offset=${maxRows}`,
    { operation: options.operation, timeoutMs: options.timeoutMs },
  );
  if (probe === null) return null;
  pages += 1;
  return probe.length > 0
    ? { rows, status: 'overflow', pages }
    : { rows, status: 'complete', pages };
}
