import { applyCors } from "../rate-limit.js";
import { clearSessionCookie } from "../session.js";

/*
 * End the session server-side.
 *
 * POST rather than GET so that a stray <img> or link cannot log someone out,
 * and so it is covered by the SameSite=Lax protection on the cookie.
 */

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
