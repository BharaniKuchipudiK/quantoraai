import { createHash, randomBytes } from "node:crypto";
import {
  DESKTOP_AUTH_CALLBACK_URL,
  buildDesktopGrantUrl,
  isValidDesktopAuthState,
} from "../../shared/desktop-contract.js";

/*
 * The Electron-free half of desktop sign-in: PKCE material, the pending
 * attempt, and deep-link matching. auth-broker.ts wires it to the browser,
 * the network and the keychain. Keeping this pure is what lets the root
 * test runner cover it without an Electron binary.
 */

export type PendingSignIn = {
  verifier: string;
  challenge: string;
  state: string;
  startedAt: number; // ms
};

/** A sign-in attempt older than this is abandoned; the user starts over. */
export const PENDING_SIGN_IN_TTL_MS = 10 * 60 * 1000;

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createPendingSignIn(now: number = Date.now()): PendingSignIn {
  const verifier = base64url(randomBytes(48)); // 64 unreserved chars
  const challenge = base64url(createHash("sha256").update(verifier, "ascii").digest());
  const state = base64url(randomBytes(24));
  return { verifier, challenge, state, startedAt: now };
}

export function grantUrlFor(apiOrigin: string, pending: PendingSignIn): string {
  return buildDesktopGrantUrl(apiOrigin, { challenge: pending.challenge, state: pending.state });
}

export type DeepLinkMatch =
  | { ok: true; code: string }
  | { ok: false; reason: "not-callback" | "malformed" | "no-pending" | "expired" | "state-mismatch" };

/**
 * Decide whether a deep link completes the pending attempt. Only a callback
 * whose state equals the one we generated, inside the TTL, yields a code.
 */
export function matchDeepLink(
  url: string,
  pending: PendingSignIn | null,
  now: number = Date.now(),
): DeepLinkMatch {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const callback = new URL(DESKTOP_AUTH_CALLBACK_URL);
  if (parsed.protocol !== callback.protocol || parsed.host !== callback.host || parsed.pathname !== callback.pathname) {
    return { ok: false, reason: "not-callback" };
  }
  const code = parsed.searchParams.get("code") || "";
  const state = parsed.searchParams.get("state") || "";
  if (!code || !isValidDesktopAuthState(state)) return { ok: false, reason: "malformed" };
  if (!pending) return { ok: false, reason: "no-pending" };
  if (now - pending.startedAt > PENDING_SIGN_IN_TTL_MS) return { ok: false, reason: "expired" };
  if (state !== pending.state) return { ok: false, reason: "state-mismatch" };
  return { ok: true, code };
}

/** The quantora:// URL inside a process argv, if any (Windows/Linux deliver deep links this way). */
export function deepLinkFromArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === "string" && arg.startsWith(`${new URL(DESKTOP_AUTH_CALLBACK_URL).protocol}//`)) return arg;
  }
  return null;
}
