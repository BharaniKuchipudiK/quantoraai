import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSigningSecret, type SessionUser } from "./session.js";
import {
  DESKTOP_GRANT_TTL_SECONDS,
  isValidPkceChallenge,
  isValidPkceVerifier,
} from "../../shared/desktop-contract.js";

/*
 * Desktop sign-in: grant code + PKCE exchange.
 *
 * The desktop shell cannot receive the session cookie (its renderer lives on
 * quantora://app, not on APP_URL), and Google's sign-in widget refuses a
 * custom scheme. So the desktop opens the real website in the system browser,
 * the user signs in there with any existing provider, and the browser hands a
 * short-lived GRANT CODE back through a deep link. The desktop then exchanges
 * the code — plus the PKCE verifier only it ever held — for the same HMAC
 * session token the cookie carries (see session.ts), and sends it as a bearer
 * header from then on.
 *
 * Why a signed blob and not a table: the code is HMAC-signed with the session
 * secret under a distinct domain prefix, carries the user and the challenge,
 * and expires in DESKTOP_GRANT_TTL_SECONDS. A stolen code is useless without
 * the verifier, which never leaves the desktop; a replay by the desktop
 * itself is harmless. An in-memory nonce set closes even that within one
 * function instance. Nothing needs Supabase.
 *
 * Why three dot-separated parts: readSessionToken() accepts exactly two, so a
 * grant code presented as a session is rejected by shape before signature.
 */

const PREFIX = "dg";
const DOMAIN = "quantora-desktop-grant\n";

type GrantPayload = {
  sub: string;
  email: string;
  name: string;
  picture: string;
  ch: string;   // PKCE S256 challenge the exchange must satisfy
  exp: number;  // unix seconds
  n: string;    // nonce for single use
};

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

function sign(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(DOMAIN + body).digest());
}

/** RFC 7636 S256: base64url(sha256(ascii(verifier))). */
export function pkceChallengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier, "ascii").digest());
}

export function createDesktopGrantCode(
  user: SessionUser,
  challenge: string,
  now: number = Math.floor(Date.now() / 1000),
): string | null {
  const secret = sessionSigningSecret();
  if (!secret) return null;
  if (!isValidPkceChallenge(challenge)) return null;

  const payload: GrantPayload = {
    sub: user.sub,
    email: user.email,
    name: user.name || "",
    picture: user.picture || "",
    ch: challenge,
    exp: now + DESKTOP_GRANT_TTL_SECONDS,
    n: base64url(randomBytes(12)),
  };
  const body = base64url(JSON.stringify(payload));
  return `${PREFIX}.${body}.${sign(body, secret)}`;
}

export type DesktopGrantVerification =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "malformed" | "signature" | "expired" | "verifier" | "used" | "unconfigured" };

/*
 * Single-use ledger. Process-local on purpose: it is a second line behind
 * PKCE + the 60 s TTL, not the first. Pruned on each call so it cannot grow.
 */
const usedNonces = new Map<string, number>();

function markUsed(nonce: string, exp: number, now: number): boolean {
  for (const [key, expiry] of usedNonces) {
    if (expiry < now) usedNonces.delete(key);
  }
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, exp);
  return true;
}

export function verifyDesktopGrantCode(
  code: unknown,
  verifier: unknown,
  now: number = Math.floor(Date.now() / 1000),
): DesktopGrantVerification {
  const secret = sessionSigningSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (typeof code !== "string" || !isValidPkceVerifier(verifier)) {
    return { ok: false, reason: "malformed" };
  }

  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: "malformed" };
  const [, body, presentedSig] = parts;

  const expected = Buffer.from(sign(body, secret));
  const presented = Buffer.from(presentedSig);
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return { ok: false, reason: "signature" };
  }

  let payload: GrantPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8")) as GrantPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.exp !== "number" || !payload.sub || !payload.email || !payload.n) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < now) return { ok: false, reason: "expired" };

  const challenge = pkceChallengeFromVerifier(verifier as string);
  const a = Buffer.from(challenge);
  const b = Buffer.from(String(payload.ch || ""));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "verifier" };

  if (!markUsed(payload.n, payload.exp, now)) return { ok: false, reason: "used" };

  return {
    ok: true,
    user: {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || "",
      picture: payload.picture || "",
    },
  };
}
