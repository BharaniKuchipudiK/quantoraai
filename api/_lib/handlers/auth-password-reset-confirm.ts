import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { readPasswordResetToken } from "../reset-token.js";
import { hashPassword, isStrongEnoughPassword } from "../password.js";
import { findUserByEmail, updateUserPassword } from "../store.js";
import { issueSessionResponse } from "../auth-response.js";
import { getRequestGeo } from "../geo.js";
import { passwordResetDelivery } from "../auth-privacy.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`reset-confirm:${clientIp(req)}`, 8, 60_000)) {
    return res.status(429).json({ error: "Too many attempts. Please wait a minute." });
  }

  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");

  if (!token) return res.status(400).json({ error: "Reset link is invalid or expired." });
  if (!isStrongEnoughPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const payload = readPasswordResetToken(token);
  if (!payload) {
    return res.status(400).json({ error: "Reset link is invalid or expired." });
  }

  const user = await findUserByEmail(payload.email);
  if (!user || user.blocked_at || passwordResetDelivery(user) !== "reset") {
    return res.status(400).json({ error: "Reset link is invalid or expired." });
  }

  try {
    const passwordHash = await hashPassword(password);
    const updated = await updateUserPassword(user.google_sub, passwordHash);
    if (!updated) {
      return res.status(503).json({ error: "Could not update password. Try again." });
    }

    const session = await issueSessionResponse(res, {
      sub: user.google_sub,
      email: user.email,
      name: user.name || payload.email.split("@")[0],
      picture: user.picture || "",
      authProvider: "Email & password",
      geo: getRequestGeo(req),
    });
    if (session.ok === false) {
      return res.status(200).json({ message: "Password updated. Sign in with your new password." });
    }
    return res.status(200).json(session.body);
  } catch (err: any) {
    console.error("Password reset confirm failed:", err?.message || err);
    return res.status(500).json({ error: "Could not update password." });
  }
}
