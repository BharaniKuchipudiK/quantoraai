/**
 * Start the GitHub CONNECT flow.
 *
 * Separate from sign-in on purpose. Signing in with GitHub asks for
 * `read:user user:email`; connecting asks for `repo`, which is the authority to
 * read and write the user's repositories. Bundling the second into the first
 * would mean everyone who ever chose "Sign in with GitHub" had handed Quantora
 * write access to all their code on the chance they might one day open a pull
 * request. Connecting is an explicit, separately revocable decision, taken by
 * someone who is already signed in.
 */
import { applyCors } from "../rate-limit.js";
import { oauthOrigin } from "../app-origin.js";
import { resolveGithubOAuthClientId } from "../auth-env.js";
import {
  appendSetCookie,
  getSessionUser,
  githubConnectReturnCookie,
  githubConnectStateCookie,
  isSafeGithubConnectReturnPath,
} from "../session.js";
import { GITHUB_CONNECT_SCOPE_PARAM, mintConnectState } from "../github-principal.js";
import { isGithubConnectionStoreConfigured } from "../github-connection-store.js";

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

function redirectWithError(req: any, res: any, message: string) {
  return res.redirect(302, `${oauthOrigin(req)}/?github=error&message=${encodeURIComponent(message)}`);
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return redirectWithError(req, res, "Sign in to Quantora before connecting GitHub.");
  }

  const clientId = resolveGithubOAuthClientId();
  if (!clientId) {
    return redirectWithError(req, res, "GitHub is not configured on this deployment.");
  }

  // Refuse before sending the user to GitHub rather than after: an
  // authorization Quantora cannot store is an authorization the user granted
  // for nothing, and they would come back to a generic failure having already
  // said yes to repository access.
  if (!isGithubConnectionStoreConfigured()) {
    return redirectWithError(
      req,
      res,
      "GitHub connections are not configured on this deployment. GITHUB_CONNECTION_SECRET and Supabase credentials must be set server-side first.",
    );
  }

  const stateSecret = process.env.SESSION_SECRET;
  if (!stateSecret || stateSecret.length < 32) {
    return redirectWithError(req, res, "GitHub connections require a configured SESSION_SECRET.");
  }

  const state = mintConnectState(sessionUser.sub, stateSecret);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${oauthOrigin(req)}/api/auth/github/connect/callback`,
    scope: GITHUB_CONNECT_SCOPE_PARAM,
    state,
  });

  appendSetCookie(res, githubConnectStateCookie(state));

  // The frontend passes ?return=<path it was on> so the callback can send the
  // browser back there instead of the homepage. Only ever stored if it is
  // provably a same-origin path — see isSafeGithubConnectReturnPath.
  const requestedReturn = String(req.query?.return || "");
  if (isSafeGithubConnectReturnPath(requestedReturn)) {
    appendSetCookie(res, githubConnectReturnCookie(requestedReturn));
  }

  return res.redirect(302, `${GITHUB_AUTHORIZE}?${params.toString()}`);
}
