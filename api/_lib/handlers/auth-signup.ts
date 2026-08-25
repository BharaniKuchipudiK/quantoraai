import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { isSessionConfigured } from "../session.js";
import { hashPassword, isStrongEnoughPassword } from "../password.js";
import { issueSessionResponse } from "../auth-response.js";
import { createEmailUser, findUserByEmail } from "../store.js";
import { getRequestGeo } from "../geo.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`signup:${clientIp(req)}`, 8, 60_000)) {
    return res.status(429).json({ error: "Too many sign-up attempts. Please wait a minute." });
  }

  if (!isSessionConfigured()) {
    return res.status(503).json({ error: "Sign-up is not configured on this deployment." });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
  }

  try {
    const passwordHash = await hashPassword(password);
    const created = await createEmailUser({
      email,
      name: name || email.split("@")[0],
      passwordHash,
    });
    if (!created) {
      return res.status(503).json({ error: "Could not create account right now. Try again shortly." });
    }

    const session = await issueSessionResponse(res, {
      sub: created.google_sub,
      email: created.email,
      name: created.name || name || email.split("@")[0],
      picture: created.picture || "",
      authProvider: "Email & password",
      geo: getRequestGeo(req),
    });
    if (!session.ok) return res.status(session.status).json({ error: session.error });
    return res.status(201).json(session.body);
  } catch (err: any) {
    console.error("Signup failed:", err?.message || err);
    return res.status(500).json({ error: "Sign-up failed. Please try again." });
  }
}
