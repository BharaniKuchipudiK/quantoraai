import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { SESSION_TTL_SECONDS, createSessionToken } from "../session.js";
import { isAdminUser, readStoredUser } from "../store.js";
import { providerLabel } from "../auth-privacy.js";
import { verifyDesktopGrantCode } from "../desktop-auth.js";

/*
 * Step 2 of a desktop sign-in (docs/architecture/desktop-client-v1.md §4).
 *
 * The desktop posts the grant code it received on the deep link together
 * with the PKCE verifier it generated before opening the browser. A valid
 * pair yields the same HMAC session token the cookie carries; the desktop
 * stores it in the OS keychain and presents it as `Authorization: Bearer`.
 *
 * Every rejection is the same 400. Distinguishing "expired" from "wrong
 * verifier" from "already used" tells an attacker which part to fix; the
 * legitimate desktop simply starts the flow again.
 */

const REJECTED = "This sign-in link has expired or was already used. Start again from the desktop app.";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "no-store");

  if (isRateLimited(`desktop-exchange:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Please wait a minute." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const verification = verifyDesktopGrantCode(body.code, body.codeVerifier);
  if (verification.ok === false) {
    if (verification.reason === "unconfigured") {
      return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
    }
    return res.status(400).json({ error: REJECTED });
  }

  const { user } = verification;
  const [stored, isAdminFlag] = await Promise.all([
    readStoredUser(user.sub),
    isAdminUser(user.sub),
  ]);
  if (stored?.blocked_at) {
    return res.status(403).json({ error: stored.blocked_reason || "This account has been suspended." });
  }

  const token = createSessionToken(user);
  if (!token) {
    return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
  }

  return res.status(200).json({
    token,
    expiresInSeconds: SESSION_TTL_SECONDS,
    user: {
      name: user.name || stored?.name || "Creator",
      email: user.email,
      picture: user.picture || stored?.picture || "",
      authProvider: providerLabel(stored?.auth_provider),
      isAdmin: stored?.is_admin === true || isAdminFlag === true,
    },
  });
}
