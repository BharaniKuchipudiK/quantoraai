/*
 * Acceptance-Rate tracking (Roadmap 9.1).
 *
 * The PCL's North-Star is whether a proactive suggestion is *accepted*, not how
 * often the user chats. This fire-and-forget helper records the lifecycle of a
 * proactive act (shown / accepted / dismissed) per surface. It never throws,
 * never blocks the UI, and sends no prompt/response text — only the surface and
 * the action.
 */
export function trackSuggestion(surface, action, meta = {}) {
  if (typeof fetch !== 'function' || !surface || !action) return;
  try {
    fetch('/api/product-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true, // survive an unmount / navigation right after a click
      body: JSON.stringify({ eventType: 'suggestion', surface, action, meta }),
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}
