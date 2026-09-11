import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Server-issued sessions.
 *
 * Replaces the previous model, in which the browser decoded a Google ID token
 * with jwt-decode and the resulting object WAS the identity — never checked by
 * anything. Under that scheme a user could open devtools, edit
 * localStorage.quantora_user, and hand themselves any name, email or tier they
 * liked. Nothing server-side would notice, because nothing server-side looked.
 *
 * Now: Google's token is verified on the server (see google-verify.ts), and the
 * server issues its own signed session. The browser is given a cookie it cannot
 * read or forge, and every protected endpoint checks it.
 *
 * The token is HMAC-SHA256 signed rather than encrypted — its contents are not
 * secret (the user knows their own email), but its integrity is everything.
 * HMAC with a server-held secret means a tampered payload fails verification.
 *
 * Deliberately no JWT library and no RS256: signing with a symmetric HMAC over
 * a fixed, self-generated payload avoids the entire family of JWT parsing
 * vulnerabilities (alg:none confusion, RS256/HS256 key confusion) by never
 * accepting an algorithm claim from the token in the first place.
 */

const SESSION_COOKIE = "quantora_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionUser = {
  sub: string;      // Google's stable user id — the real primary key
  email: string;
  name: string;
  picture: string;
};

type SessionPayload = SessionUser & { exp: number };

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  // Fails closed: a short or missing secret makes forgery cheap, and silently
  // accepting one is how a dev placeholder ends up signing production sessions.
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function isSessionConfigured(): boolean {
  return getSecret() !== null;
}

/*
 * The same secret, for sibling signers (desktop grant codes) that must fail
 * closed under exactly the same rule. They domain-separate their HMAC input,
 * so a token minted by one can never verify under the other.
 */
export function sessionSigningSecret(): string | null {
  return getSecret();
}

function sign(data: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(data).digest());
}

export function createSessionToken(user: SessionUser): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function readSessionToken(token: string | null | undefined): SessionUser | null {
  const secret = getSecret();
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, presentedSig] = parts;
  const expectedSig = sign(body, secret);

  // Constant-time: a fast-failing compare leaks how much of a forged signature
  // was correct, which is enough to reconstruct one byte at a time.
  const a = Buffer.from(presentedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64url(body).toString("utf8")) as SessionPayload;
    if (!payload || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.email) return null;

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || "",
      picture: payload.picture || "",
    };
  } catch {
    return null;
  }
}

function parseCookies(header: unknown): Record<string, string> {
  if (typeof header !== "string") return {};
  const out: Record<string, string> = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const raw = part.slice(index + 1).trim();

    /*
     * Decoded per-cookie inside a try, because decodeURIComponent throws a
     * URIError on a stray '%', and plenty of third-party cookies contain one —
     * analytics values, anything storing a literal percentage.
     *
     * Decoding the whole jar in one pass meant a single malformed cookie set by
     * an unrelated script threw before this function returned. In
     * getSessionUser that surfaces as "not signed in" for someone holding a
     * perfectly valid session; in api/chat.ts, where the call sits outside the
     * try block, it takes the whole request down with a 500.
     *
     * One bad neighbour must not cost someone their login.
     */
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }

  return out;
}

/*
 * Second carrier for the same token: `Authorization: Bearer <token>`.
 *
 * The desktop client's renderer is served from quantora://app, so the
 * browser cookie jar never applies to it. It obtains the identical HMAC
 * session token through the PKCE grant in desktop-auth.ts and presents it
 * here. One token format, one verifier, two carriers — nothing about the
 * trust model changes, and a web session is still cookie-only in practice
 * because nothing in the web app ever sets this header.
 */
function bearerToken(req: any): string | null {
  const header = req?.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

/* The signed-in user for this request, or null. The single source of truth. */
export function getSessionUser(req: any): SessionUser | null {
  const cookies = parseCookies(req?.headers?.cookie);
  const fromCookie = readSessionToken(cookies[SESSION_COOKIE]);
  if (fromCookie) return fromCookie;
  return readSessionToken(bearerToken(req));
}

export const OAUTH_STATE_COOKIE = "quantora_github_oauth_state";

function isSecureCookieRuntime(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

export function cookieAttributes(maxAge: number): string {
  /*
   * HttpOnly   — script cannot read it, so an XSS bug cannot exfiltrate the
   *              session the way it could with a token in localStorage.
   * Secure     — never sent over plain HTTP. Skipped on localhost only,
   *              because dev has no TLS and the cookie would be dropped.
   * SameSite=Lax — not sent on cross-site POSTs, which blocks CSRF against
   *              the state-changing endpoints while keeping normal navigation
   *              working.
   */
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isSecureCookieRuntime() ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function appendSetCookie(res: any, cookie: string): void {
  const prev = typeof res.getHeader === "function" ? res.getHeader("Set-Cookie") : undefined;
  if (!prev) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  const list = Array.isArray(prev) ? prev.map(String) : [String(prev)];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

export function setSessionCookie(res: any, token: string): void {
  appendSetCookie(res, `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_TTL_SECONDS)}`);
}

export function clearSessionCookie(res: any): void {
  appendSetCookie(res, `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

export function oauthStateCookie(value: string, maxAge = 600): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; ${cookieAttributes(maxAge)}`;
}

export function clearOAuthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; ${cookieAttributes(0)}`;
}

/*
 * The GitHub CONNECT flow gets its own state cookie, separate from the sign-in
 * one above.
 *
 * They are different grants with different consequences — sign-in asks for an
 * email address, connect asks for repository write access — and sharing one
 * cookie would let a connect callback land on a state minted by a sign-in
 * redirect. Two names, two flows, no overlap.
 */
export const GITHUB_CONNECT_STATE_COOKIE = "quantora_github_connect_state";

export function githubConnectStateCookie(value: string, maxAge = 600): string {
  return `${GITHUB_CONNECT_STATE_COOKIE}=${encodeURIComponent(value)}; ${cookieAttributes(maxAge)}`;
}

export function clearGithubConnectStateCookie(): string {
  return `${GITHUB_CONNECT_STATE_COOKIE}=; ${cookieAttributes(0)}`;
}

/*
 * Where to send the browser back to once the connect flow finishes.
 *
 * Without this, the callback always redirected to bare "/" — the marketing
 * homepage — no matter what workspace or chat the person clicked "Connect
 * GitHub" from. The connection itself was never lost, only the page you were
 * looking at, which reads as "it kicked me out" to someone mid-task even
 * though nothing was destroyed.
 *
 * The value is attacker-controllable input (it starts life as a query param
 * on a link the frontend renders), so it is stored, not trusted blind: only
 * an already-validated safe local path is ever written here, and the same
 * validator runs again on read in case a cookie were ever tampered with.
 */
export const GITHUB_CONNECT_RETURN_COOKIE = "quantora_github_connect_return";

/**
 * A same-origin path only: must start with exactly one "/", never "//" (which
 * a browser resolves as protocol-relative, i.e. a different host) and must
 * contain no "://" (an absolute URL to somewhere else). Anything else is
 * rejected rather than sanitized, so this can never become an open redirect.
 */
export function isSafeGithubConnectReturnPath(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("://")) return false;
  if (value.includes("\\")) return false;
  return true;
}

export function githubConnectReturnCookie(path: string, maxAge = 600): string {
  return `${GITHUB_CONNECT_RETURN_COOKIE}=${encodeURIComponent(path)}; ${cookieAttributes(maxAge)}`;
}

export function clearGithubConnectReturnCookie(): string {
  return `${GITHUB_CONNECT_RETURN_COOKIE}=; ${cookieAttributes(0)}`;
}

/** Cookie jar for a request, tolerant of one malformed neighbour. */
export function readRequestCookies(req: any): Record<string, string> {
  return parseCookies(req?.headers?.cookie);
}

/* Convenience for generating a SESSION_SECRET during setup. */
export function generateSecret(): string {
  return randomBytes(32).toString("base64");
}
