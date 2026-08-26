import { applyCors } from "../rate-limit.js";
import { getSessionUser } from "../session.js";
import { isAdminUser, readStoredUser } from "../store.js";
import { providerLabel } from "../auth-privacy.js";
import { requireActiveSession } from "../authz.js";

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

  res.setHeader("Cache-Control", "no-store");
  if (!sessionUser) {
    return res.status(200).json({ user: null });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;

  const stored = auth.value.storedUser.google_sub
    ? auth.value.storedUser
    : await readStoredUser(sessionUser.sub) || auth.value.storedUser;
  const isAdmin = stored.is_admin === true || await isAdminUser(sessionUser.sub) === true;

  return res.status(200).json({
    user: {
      name: sessionUser.name || stored.name || "Creator",
      email: sessionUser.email,
      picture: sessionUser.picture || stored.picture || "",
      authProvider: providerLabel(stored.auth_provider),
      isAdmin: isAdmin === true,
    },
  });
}
