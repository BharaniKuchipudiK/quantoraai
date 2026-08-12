import { applyCors } from "../_lib/rate-limit.js";
import { getSessionUser } from "../_lib/session.js";
import { isAdminUser } from "../_lib/store.js";

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

  // A signed-out visitor is a normal state, not an error.
  res.setHeader("Cache-Control", "no-store");
  if (!sessionUser) {
    return res.status(200).json({ user: null });
  }

  const isAdmin = await isAdminUser(sessionUser.sub);
  return res.status(200).json({
    user: {
      ...sessionUser,
      isAdmin: isAdmin === true,
    },
  });
}
