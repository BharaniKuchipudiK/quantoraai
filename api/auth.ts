import verify from "./_lib/handlers/auth-verify.js";
import session from "./_lib/handlers/auth-session.js";
import logout from "./_lib/handlers/auth-logout.js";
import signup from "./_lib/handlers/auth-signup.js";
import login from "./_lib/handlers/auth-login.js";
import passwordResetRequest from "./_lib/handlers/auth-password-reset-request.js";
import passwordResetConfirm from "./_lib/handlers/auth-password-reset-confirm.js";
import githubStart from "./_lib/handlers/auth-github-start.js";
import githubCallback from "./_lib/handlers/auth-github-callback.js";
import githubConnect from "./_lib/handlers/auth-github-connect.js";
import githubConnectCallback from "./_lib/handlers/auth-github-connect-callback.js";
import providers from "./_lib/handlers/auth-providers.js";

/**
 * Single auth entrypoint for Vercel Hobby function budget.
 * Rewrites map /api/auth/* → /api/auth?route=…
 */
export default async function handler(req: any, res: any) {
  const route = String(req.query?.route || "").trim();
  if (route === "verify") return verify(req, res);
  if (route === "session") return session(req, res);
  if (route === "logout") return logout(req, res);
  if (route === "signup") return signup(req, res);
  if (route === "login") return login(req, res);
  if (route === "password-reset-request") return passwordResetRequest(req, res);
  if (route === "password-reset-confirm") return passwordResetConfirm(req, res);
  if (route === "github") return githubStart(req, res);
  if (route === "github-callback") return githubCallback(req, res);
  if (route === "github-connect") return githubConnect(req, res);
  if (route === "github-connect-callback") return githubConnectCallback(req, res);
  if (route === "providers") return providers(req, res);
  return res.status(404).json({ error: "Unknown auth route." });
}
