/*
 * Finishing a desktop sign-in inside the web app.
 *
 * The desktop shell opens /api/auth/desktop/grant in the system browser. When
 * no session cookie exists, that handler bounces to the web app with
 * ?desktop_auth=1&challenge=…&state=…. The app must then:
 *
 *   1. remember the pending handoff (sessionStorage — GitHub OAuth leaves the
 *      page and comes back, and the query string does not survive that),
 *   2. sign the user in with any existing provider, exactly as today,
 *   3. send the browser back to the grant URL, which now succeeds and hands
 *      the code to the desktop on the quantora:// deep link.
 *
 * Pure helpers, no React. The App wires them in two effects.
 */
import {
  DESKTOP_AUTH_GRANT_PATH,
  DESKTOP_AUTH_QUERY,
  isValidDesktopAuthState,
  isValidPkceChallenge,
} from '../../shared/desktop-contract.js';

const STORAGE_KEY = 'quantora_desktop_auth';

/** The pending handoff carried by a query string, or null when absent/invalid. */
export function readDesktopAuthHandoff(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (params.get(DESKTOP_AUTH_QUERY.flag) !== '1') return null;
  const challenge = params.get(DESKTOP_AUTH_QUERY.challenge) || '';
  const state = params.get(DESKTOP_AUTH_QUERY.state) || '';
  if (!isValidPkceChallenge(challenge) || !isValidDesktopAuthState(state)) return null;
  return { challenge, state };
}

export function stashDesktopAuthHandoff(handoff) {
  if (typeof sessionStorage === 'undefined' || !handoff) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ challenge: handoff.challenge, state: handoff.state }));
}

/** Non-destructive read: the handoff stays until the grant actually navigates. */
export function peekDesktopAuthHandoff() {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidPkceChallenge(parsed?.challenge) || !isValidDesktopAuthState(parsed?.state)) return null;
    return { challenge: parsed.challenge, state: parsed.state };
  } catch {
    return null;
  }
}

export function clearDesktopAuthHandoff() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Same-origin path the signed-in browser is sent to so the grant can complete. */
export function buildDesktopGrantPath({ challenge, state }) {
  const params = new URLSearchParams({
    [DESKTOP_AUTH_QUERY.challenge]: challenge,
    [DESKTOP_AUTH_QUERY.state]: state,
  });
  return `${DESKTOP_AUTH_GRANT_PATH}?${params.toString()}`;
}

/** Strip the handoff parameters from a URL once they have been stashed. */
export function stripDesktopAuthParams(href) {
  const url = new URL(href);
  Object.values(DESKTOP_AUTH_QUERY).forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}`;
}
