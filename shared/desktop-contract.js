/*
 * Desktop client ↔ web ↔ API contract.
 *
 * Pure constants and validators shared by three parties that must never drift
 * apart in silence: the API (api/_lib/desktop-auth.ts and its handlers), the
 * web app (src/lib/desktop-auth-handoff.js, which finishes a desktop sign-in
 * inside the browser) and the desktop shell (desktop/, which opens the grant
 * URL and receives the deep link). See docs/architecture/desktop-client-v1.md §4.
 *
 * No DOM, no Node — this file is imported from all three runtimes.
 */

/** URL scheme the desktop registers with the OS. */
export const DESKTOP_DEEP_LINK_SCHEME = 'quantora';

/** Origin the bundled renderer is served from inside the desktop shell. */
export const DESKTOP_APP_ORIGIN = 'quantora://app';

/** Deep link the grant step redirects to: quantora://auth/callback?code&state */
export const DESKTOP_AUTH_CALLBACK_URL = `${DESKTOP_DEEP_LINK_SCHEME}://auth/callback`;

/** API routes (also vercel.json rewrite sources and server.ts routes). */
export const DESKTOP_AUTH_GRANT_PATH = '/api/auth/desktop/grant';
export const DESKTOP_AUTH_EXCHANGE_PATH = '/api/auth/desktop/exchange';

/** Query parameters that carry a pending desktop sign-in through the web app. */
export const DESKTOP_AUTH_QUERY = Object.freeze({
  flag: 'desktop_auth',
  challenge: 'challenge',
  state: 'state',
});

/** A grant code is valid this long. Long enough for a deep link, no longer. */
export const DESKTOP_GRANT_TTL_SECONDS = 60;

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const BASE64URL_SHA256 = /^[A-Za-z0-9\-_]{43}$/;
const STATE = /^[A-Za-z0-9\-._~]{8,256}$/;

/** RFC 7636 code_verifier: 43–128 unreserved characters. */
export function isValidPkceVerifier(value) {
  return typeof value === 'string' && PKCE_VERIFIER.test(value);
}

/** RFC 7636 S256 code_challenge: base64url(sha256(verifier)), always 43 chars. */
export function isValidPkceChallenge(value) {
  return typeof value === 'string' && BASE64URL_SHA256.test(value);
}

/** Opaque state echoed back on the deep link so the desktop can match the reply. */
export function isValidDesktopAuthState(value) {
  return typeof value === 'string' && STATE.test(value);
}

/**
 * The deep link the browser hands back to the desktop. Both inputs are
 * validated before this is called; the scheme is a constant, so this can
 * never become an open redirect.
 */
export function buildDesktopCallbackUrl({ code, state }) {
  const params = new URLSearchParams({ code, state });
  return `${DESKTOP_AUTH_CALLBACK_URL}?${params.toString()}`;
}

/** The URL the desktop opens in the system browser to start a sign-in. */
export function buildDesktopGrantUrl(apiOrigin, { challenge, state }) {
  const params = new URLSearchParams({
    [DESKTOP_AUTH_QUERY.challenge]: challenge,
    [DESKTOP_AUTH_QUERY.state]: state,
  });
  return `${String(apiOrigin || '').replace(/\/+$/, '')}${DESKTOP_AUTH_GRANT_PATH}?${params.toString()}`;
}
