import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { isSessionConfigured } from "../session.js";
import { verifyPasswordAgainstStore } from "../password.js";
import { issueSessionResponse } from "../auth-response.js";
import { findUserByEmail } from "../store.js";
import { getRequestGeo } from "../geo.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`login:${clientIp(req)}`, 12, 60_000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Please wait a minute." });
  }

  if (!isSessionConfigured()) {
    return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await findUserByEmail(email);
  const valid = await verifyPasswordAgainstStore(password, user?.password_hash);
  if (!user || !valid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const session = await issueSessionResponse(res, {
    sub: user.google_sub,
    email: user.email,
    name: user.name || email.split("@")[0],
    picture: user.picture || "",
    authProvider: user.auth_provider === "email" ? "Email & password" : (user.auth_provider || "Email & password"),
    geo: getRequestGeo(req),
  });
  if (session.ok === false) return res.status(session.status).json({ error: session.error });
  return res.status(200).json(session.body);
}
