import verify from "./_lib/handlers/auth-verify.js";
import session from "./_lib/handlers/auth-session.js";
import logout from "./_lib/handlers/auth-logout.js";

/**
 * Single auth entrypoint for Vercel Hobby function budget.
 * Rewrites map /api/auth/{verify,session,logout} → /api/auth?route=…
 */
export default async function handler(req: any, res: any) {
  const route = String(req.query?.route || "").trim();
  if (route === "verify") return verify(req, res);
  if (route === "session") return session(req, res);
  if (route === "logout") return logout(req, res);
  return res.status(404).json({ error: "Unknown auth route." });
}
