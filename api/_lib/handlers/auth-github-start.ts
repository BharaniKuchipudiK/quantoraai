import { randomBytes } from "node:crypto";
import { applyCors } from "../rate-limit.js";
import { appOrigin } from "../app-origin.js";
import { resolveGithubOAuthClientId } from "../auth-env.js";
import { appendSetCookie, oauthStateCookie } from "../session.js";

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = resolveGithubOAuthClientId();
  if (!clientId) {
    return res.redirect(302, `${appOrigin(req)}/?auth=error&message=${encodeURIComponent("GitHub sign-in is not configured on this deployment.")}`);
  }

  const state = randomBytes(16).toString("hex");
  const callback = `${appOrigin(req)}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    scope: "read:user user:email",
    state,
  });

  appendSetCookie(res, oauthStateCookie(state));
  return res.redirect(302, `${GITHUB_AUTHORIZE}?${params.toString()}`);
}
