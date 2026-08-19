const FEEDBACK_TIMEOUT_MS = 4_000;
const ADMIN_FEEDBACK_LIMIT = 500;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export type FeedbackType = 'feedback' | 'suggestion';
export type FeedbackStatus = 'new' | 'reviewed' | 'planned' | 'done' | 'closed';

export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'reviewed', 'planned', 'done', 'closed'];

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && FEEDBACK_STATUSES.includes(value as FeedbackStatus);
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const cfg = config();
  if (!cfg) return null;
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    ...extra,
  };
}

export async function saveUserFeedback(entry: {
  userSub: string;
  feedbackType: FeedbackType;
  message: string;
  pagePath?: string | null;
  surface?: string | null;
}): Promise<boolean> {
  const cfg = config();
  const headers = serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' });
  if (!cfg || !headers) return false;

  const message = String(entry.message || '').trim();
  if (!message || message.length > 500) return false;

  try {
    const response = await fetch(`${cfg.url}/rest/v1/user_feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{
        user_sub: entry.userSub,
        feedback_type: entry.feedbackType,
        message,
        page_path: entry.pagePath ? String(entry.pagePath).slice(0, 240) : null,
        surface: entry.surface ? String(entry.surface).slice(0, 80) : null,
      }]),
      signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Supabase feedback insert -> ${response.status}`, await response.text());
      return false;
    }
    return true;
  } catch (error: any) {
    console.warn('Supabase feedback insert failed:', error?.message || error);
    return false;
  }
}

export type AdminFeedbackItem = {
  id: string;
  userSub: string;
  feedbackType: FeedbackType;
  message: string;
  pagePath: string | null;
  surface: string | null;
  status: FeedbackStatus;
  createdAt: string;
  user: {
    name: string | null;
    email: string | null;
    picture: string | null;
  } | null;
};

function normalizeAdminFeedbackRow(row: any): AdminFeedbackItem {
  const embeddedUser = Array.isArray(row?.users) ? row.users[0] : row?.users;
  return {
    id: String(row?.id || ''),
    userSub: String(row?.user_sub || ''),
    feedbackType: row?.feedback_type === 'suggestion' ? 'suggestion' : 'feedback',
    message: String(row?.message || ''),
    pagePath: row?.page_path ? String(row.page_path) : null,
    surface: row?.surface ? String(row.surface) : null,
    status: isFeedbackStatus(row?.status) ? row.status : 'new',
    createdAt: String(row?.created_at || ''),
    user: embeddedUser ? {
      name: embeddedUser.name ? String(embeddedUser.name) : null,
      email: embeddedUser.email ? String(embeddedUser.email) : null,
      picture: embeddedUser.picture ? String(embeddedUser.picture) : null,
    } : null,
  };
}

/**
 * Admin-only feedback reader. The service-role key stays server-side and RLS
 * remains closed to browsers. User identity is embedded when PostgREST can
 * resolve the user_feedback.user_sub -> users.google_sub relationship.
 */
export async function listUserFeedback(limit = 250): Promise<AdminFeedbackItem[] | null> {
  const cfg = config();
  const headers = serviceHeaders({ Accept: 'application/json' });
  if (!cfg || !headers) return null;

  const boundedLimit = Math.max(1, Math.min(ADMIN_FEEDBACK_LIMIT, Number(limit) || 250));
  const baseSelect = 'id,user_sub,feedback_type,message,page_path,surface,status,created_at';
  const embeddedSelect = `${baseSelect},users(name,email,picture)`;

  try {
    let response = await fetch(
      `${cfg.url}/rest/v1/user_feedback?select=${encodeURIComponent(embeddedSelect)}&order=created_at.desc&limit=${boundedLimit}`,
      { headers, signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS) },
    );

    // Be resilient if the PostgREST relationship cache is temporarily stale:
    // the admin should still see feedback even if identity enrichment fails.
    if (!response.ok) {
      response = await fetch(
        `${cfg.url}/rest/v1/user_feedback?select=${encodeURIComponent(baseSelect)}&order=created_at.desc&limit=${boundedLimit}`,
        { headers, signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS) },
      );
    }

    if (!response.ok) {
      console.warn(`Supabase feedback admin list -> ${response.status}`, await response.text());
      return null;
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows.map(normalizeAdminFeedbackRow) : [];
  } catch (error: any) {
    console.warn('Supabase feedback admin list failed:', error?.message || error);
    return null;
  }
}

export async function updateUserFeedbackStatus(id: string, status: FeedbackStatus): Promise<AdminFeedbackItem | null> {
  const cfg = config();
  const headers = serviceHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=representation',
  });
  if (!cfg || !headers || !isFeedbackStatus(status)) return null;

  const normalizedId = String(id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedId)) {
    return null;
  }

  try {
    const response = await fetch(
      `${cfg.url}/rest/v1/user_feedback?id=eq.${encodeURIComponent(normalizedId)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.warn(`Supabase feedback status update -> ${response.status}`, await response.text());
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeAdminFeedbackRow(rows[0]);
  } catch (error: any) {
    console.warn('Supabase feedback status update failed:', error?.message || error);
    return null;
  }
}
