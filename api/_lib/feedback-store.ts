const FEEDBACK_TIMEOUT_MS = 4_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export type FeedbackType = 'feedback' | 'suggestion';

export async function saveUserFeedback(entry: {
  userSub: string;
  feedbackType: FeedbackType;
  message: string;
  pagePath?: string | null;
  surface?: string | null;
}): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;

  const message = String(entry.message || '').trim();
  if (!message || message.length > 500) return false;

  try {
    const response = await fetch(`${cfg.url}/rest/v1/user_feedback`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
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
