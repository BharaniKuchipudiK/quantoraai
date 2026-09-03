import { net, shell } from "electron";
import { DESKTOP_AUTH_EXCHANGE_PATH } from "../../shared/desktop-contract.js";
import { apiOrigin, isSmokeMode } from "./config.js";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./session-store.js";
import {
  createPendingSignIn,
  grantUrlFor,
  matchDeepLink,
  type PendingSignIn,
} from "./auth-flow.js";

/*
 * Sign-in orchestration for the desktop (design §4).
 *
 *   signIn()            → open the grant URL in the system browser
 *   handleDeepLink(url) → exchange the code for a session token, store it
 *   status()            → ask the API who the stored token belongs to
 *   signOut()           → drop the token (and tell the API, best effort)
 */

export type SessionUserInfo = {
  name: string;
  email: string;
  picture: string;
  authProvider: string;
  isAdmin: boolean;
};

let pending: PendingSignIn | null = null;

export function beginSignIn(): { grantUrl: string } {
  pending = createPendingSignIn();
  const grantUrl = grantUrlFor(apiOrigin(), pending);
  if (!isSmokeMode()) {
    void shell.openExternal(grantUrl);
  }
  return { grantUrl };
}

export type DeepLinkOutcome =
  | { ok: true; user: SessionUserInfo }
  | { ok: false; error: string };

export async function completeSignIn(url: string): Promise<DeepLinkOutcome> {
  const match = matchDeepLink(url, pending);
  if (match.ok === false) {
    if (match.reason === "not-callback") return { ok: false, error: "Not a sign-in link." };
    return { ok: false, error: "This sign-in link is not for the current attempt. Start again from the app." };
  }
  const attempt = pending!;
  pending = null;

  let response: Response;
  try {
    response = await net.fetch(`${apiOrigin()}${DESKTOP_AUTH_EXCHANGE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: match.code, codeVerifier: attempt.verifier }),
    });
  } catch (error: any) {
    return { ok: false, error: `Could not reach Quantora: ${error?.message || error}` };
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.token !== "string") {
    return { ok: false, error: data?.error || "Sign-in could not be completed." };
  }
  writeSessionToken(data.token);
  return { ok: true, user: normalizeUser(data.user) };
}

export async function sessionStatus(): Promise<{ signedIn: boolean; user: SessionUserInfo | null }> {
  const token = readSessionToken();
  if (!token) return { signedIn: false, user: null };
  try {
    const response = await net.fetch(`${apiOrigin()}/api/auth/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 403) {
      clearSessionToken(); // revoked server-side
      return { signedIn: false, user: null };
    }
    const data: any = await response.json().catch(() => ({}));
    if (!data?.user) return { signedIn: false, user: null };
    return { signedIn: true, user: normalizeUser(data.user) };
  } catch {
    // Offline: the token may still be fine. Report signed-in with no profile
    // rather than logging the user out over a network blip.
    return { signedIn: true, user: null };
  }
}

export async function signOut(): Promise<void> {
  const token = readSessionToken();
  clearSessionToken();
  pending = null;
  if (!token) return;
  try {
    await net.fetch(`${apiOrigin()}/api/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    /* best effort; the token is gone locally either way */
  }
}

function normalizeUser(user: any): SessionUserInfo {
  return {
    name: String(user?.name || "Creator"),
    email: String(user?.email || ""),
    picture: String(user?.picture || ""),
    authProvider: String(user?.authProvider || "Signed in"),
    isAdmin: user?.isAdmin === true,
  };
}
