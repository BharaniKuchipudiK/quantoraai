/**
 * Finish the GitHub CONNECT flow and store the user's sealed token.
 *
 * Three things are checked before anything is stored, and each one closes a
 * real attack rather than a hypothetical:
 *
 *   1. There is an active Quantora session. A token has to belong to someone.
 *   2. The `state` cookie matches the `state` GitHub returned — ordinary CSRF
 *      protection on the callback.
 *   3. The state's HMAC verifies against THIS session's subject. Without this,
 *      an attacker who starts a connect flow and lures a signed-in victim to
 *      the resulting callback URL grafts their own GitHub token onto the
 *      victim's Quantora account — every repository action the victim then
 *      takes would run against the attacker's repositories, and any code the
 *      victim pushed through Quantora would land there.
 */
import { applyCors } from "../rate-limit.js";
import { oauthOrigin } from "../app-origin.js";
import { resolveGithubOAuthClientId, resolveGithubOAuthClientSecret } from "../auth-env.js";
import {
  appendSetCookie,
  clearGithubConnectReturnCookie,
  clearGithubConnectStateCookie,
  getSessionUser,
  GITHUB_CONNECT_RETURN_COOKIE,
  GITHUB_CONNECT_STATE_COOKIE,
  isSafeGithubConnectReturnPath,
  readRequestCookies,
} from "../session.js";
import { connectStateMatches, GITHUB_CONNECT_SCOPES } from "../github-principal.js";
import { saveGithubConnection } from "../github-connection-store.js";

function back(req: any, res: any, query: string, basePath: string) {
  const separator = basePath.includes("?") ? "&" : "?";
  return res.redirect(302, `${oauthOrigin(req)}${basePath}${separator}${query}`);
}

function fail(req: any, res: any, message: string, basePath: string) {
  return back(req, res, `github=error&message=${encodeURIComponent(message)}`, basePath);
}

async function exchangeAndIdentify(code: string, req: any): Promise<{ token: string; login: string; scopes: string[] } | null> {
  const clientId = resolveGithubOAuthClientId();
  const clientSecret = resolveGithubOAuthClientSecret();
  if (!clientId || !clientSecret) return null;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${oauthOrigin(req)}/api/auth/github/connect/callback`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) return null;

  const tokenJson: any = await tokenRes.json();
  const token = typeof tokenJson?.access_token === "string" ? tokenJson.access_token : "";
  if (!token) return null;

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Quantora-GitHub-Connect",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!userRes.ok) return null;
  const user: any = await userRes.json();
  const login = typeof user?.login === "string" ? user.login : "";
  if (!login) return null;

  // GitHub reports the scopes it actually granted, which can be narrower than
  // what was asked for. Record what was granted, never what was requested —
  // the UI reads this to explain why an action later refuses.
  const granted = typeof tokenJson?.scope === "string" && tokenJson.scope.trim()
    ? tokenJson.scope.split(",").map((entry: string) => entry.trim()).filter(Boolean)
    : [...GITHUB_CONNECT_SCOPES];

  return { token, login, scopes: granted };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const cookies = readRequestCookies(req);
  const expectedState = cookies[GITHUB_CONNECT_STATE_COOKIE];
  appendSetCookie(res, clearGithubConnectStateCookie());

  const requestedReturn = cookies[GITHUB_CONNECT_RETURN_COOKIE];
  appendSetCookie(res, clearGithubConnectReturnCookie());
  const basePath = requestedReturn && isSafeGithubConnectReturnPath(requestedReturn) ? requestedReturn : "/";

  const sessionUser = getSessionUser(req);
  if (!sessionUser) return fail(req, res, "Your Quantora session expired before GitHub could be connected. Sign in and try again.", basePath);

  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const stateSecret = process.env.SESSION_SECRET || "";

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail(req, res, "Connecting GitHub was cancelled.", basePath);
  }
  if (!connectStateMatches(state, sessionUser.sub, stateSecret)) {
    return fail(req, res, "That GitHub authorization was started by a different Quantora account. Nothing was connected.", basePath);
  }

  try {
    const identity = await exchangeAndIdentify(code, req);
    if (!identity) return fail(req, res, "GitHub did not return a usable authorization. Nothing was connected.", basePath);

    const saved = await saveGithubConnection({
      userSub: sessionUser.sub,
      login: identity.login,
      token: identity.token,
      scopes: identity.scopes,
    });
    if (!saved) {
      return fail(req, res, "Quantora could not store your GitHub authorization, so it was discarded. Revoke it in GitHub settings if you prefer, and try again later.", basePath);
    }

    return back(req, res, `github=connected&login=${encodeURIComponent(identity.login)}`, basePath);
  } catch (err: any) {
    console.error("GitHub connect callback failed:", err?.message || err);
    return fail(req, res, "Connecting GitHub failed. Nothing was stored.", basePath);
  }
}
