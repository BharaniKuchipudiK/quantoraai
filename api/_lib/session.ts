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
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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

/* The signed-in user for this request, or null. The single source of truth. */
export function getSessionUser(req: any): SessionUser | null {
  const cookies = parseCookies(req?.headers?.cookie);
  return readSessionToken(cookies[SESSION_COOKIE]);
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

/* Convenience for generating a SESSION_SECRET during setup. */
export function generateSecret(): string {
  return randomBytes(32).toString("base64");
}
