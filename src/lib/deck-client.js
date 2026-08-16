/*
 * Client for the dedicated deck generator (Roadmap: MS Office integration).
 * Presentations go through /api/generate-deck (strict JSON mode) instead of the
 * conversational chat stream, then render with the deterministic consulting
 * renderer. The endpoint always returns JSON; we still guard against a platform
 * error page so the UI never crashes on a bad parse.
 */
export async function generateDeck(prompt, { userKey } = {}) {
  try {
    const res = await fetch('/api/generate-deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, userKey }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // A non-JSON body means a platform-level error page — surface it cleanly.
      return { ok: false, error: 'The server returned an unexpected response. Please try again.' };
    }
    if (!res.ok && !data?.error) return { ok: false, error: `Request failed (${res.status}).` };
    return data;
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error while generating the deck.' };
  }
}
