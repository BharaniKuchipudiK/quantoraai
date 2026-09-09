import { guardHandler } from "./_lib/handler-guard.js";
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
import desktopGrant from "./_lib/handlers/auth-desktop-grant.js";
import desktopExchange from "./_lib/handlers/auth-desktop-exchange.js";
import releaseFlags from "./_lib/handlers/auth-release-flags.js";

/**
 * Single auth entrypoint for Vercel Hobby function budget.
 * Rewrites map /api/auth/* → /api/auth?route=…
 */

/*
 * WHY THIS FUNCTION MAY NEVER THROW (2026-09-07).
 *
 * Fourteen auth routes are collapsed behind this one function to fit the Hobby
 * function budget, and it is the first thing every new person touches: the
 * frontend calls `?route=session` on page load before anything else renders.
 *
 * An uncaught throw in a Vercel handler is not an error page. It is
 * FUNCTION_INVOCATION_FAILED — no body, no JSON, no message the frontend can
 * read or the person can act on. Sign-in simply does nothing, twice, and then
 * they leave.
 *
 * Five of the routes here carry no try/catch of their own — session, login,
 * logout, providers and github-start, which is precisely the set a first visit
 * touches. The ones that DO have one (signup, verify, github-callback,
 * password-reset-confirm) look like the ones that were debugged after failing.
 * That is the shape of a gap nobody chose.
 *
 * The store is already fail-soft — every Supabase call returns null rather than
 * throwing (store.ts requestRaw/request), so a database outage was never the
 * hazard. What is left is synchronous: a malformed password hash, a JWT secret
 * that is missing or too short, a body that is not the JSON it claims to be.
 * Rare, and total when it happens.
 *
 * So this is a net, not a fix: it cannot make a broken route work, and it does
 * not try to. It converts a blank crash into a readable 503 the frontend can
 * render and a log line that names the route, which is the difference between
 * "the site is broken" and one bad door. The success path is untouched.
 *
 * Deliberately NOT extended to the other eleven unguarded api/ entry points
 * tonight. This one is on the journey whose failure ends a pilot on the first
 * screen; the rest can follow with their own reasoning rather than being swept
 * up in a change nobody reviewed route by route.
 */
export default guardHandler(route, {
  label: (req) => String(req?.query?.route || "").trim(),
  message: "Sign-in is temporarily unavailable. Please try again in a moment.",
});

async function route(req: any, res: any) {
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
  if (route === "desktop-grant") return desktopGrant(req, res);
  if (route === "desktop-exchange") return desktopExchange(req, res);
  if (route === "release-flags") return releaseFlags(req, res);
  return res.status(404).json({ error: "Unknown auth route." });
}
