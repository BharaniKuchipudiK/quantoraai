import { applyCors } from "../rate-limit.js";
import { clearSessionCookie, getSessionUser } from "../session.js";
import { isAdminUser, readStoredUser } from "../store.js";
import { providerLabel } from "../auth-privacy.js";
import { recordSignedOutSiteHit, shouldCountSignedOutBrowserHit } from "../site-traffic.js";

/*
 * Who is signed in on this request.
 *
 * The frontend calls this on load to restore a session, replacing the previous
 * approach of trusting a user object cached in localStorage — which the user
 * could edit at will.
 */

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const sessionUser = getSessionUser(req);
  const sideEffectFreeTelemetryProbe = req.query?.purpose === "product-telemetry";

  res.setHeader("Cache-Control", "no-store");
  if (!sessionUser) {
    /*
     * The browser's normal bootstrap request owns the signed-out site-hit
     * counter. ProductTelemetry may make one additional read-only session probe
     * to classify auth state; that probe must never increment the same page load
     * a second time.
     */
    if (!sideEffectFreeTelemetryProbe && shouldCountSignedOutBrowserHit(req.headers?.["user-agent"])) {
      await recordSignedOutSiteHit();
    }
    return res.status(200).json({ user: null });
  }

  const [stored, isAdminFlag] = await Promise.all([
    readStoredUser(sessionUser.sub),
    isAdminUser(sessionUser.sub),
  ]);

  if (stored?.blocked_at) {
    clearSessionCookie(res);
    return res.status(403).json({
      error: stored.blocked_reason || "This account has been suspended.",
      sessionRevoked: true,
    });
  }

  return res.status(200).json({
    user: {
      name: sessionUser.name || stored?.name || "Creator",
      email: sessionUser.email,
      picture: sessionUser.picture || stored?.picture || "",
      authProvider: providerLabel(stored?.auth_provider),
      isAdmin: stored?.is_admin === true || isAdminFlag === true,
    },
  });
}
