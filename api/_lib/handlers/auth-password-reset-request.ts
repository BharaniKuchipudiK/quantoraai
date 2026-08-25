import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { createPasswordResetToken } from "../reset-token.js";
import { sendPasswordResetEmail } from "../mail.js";
import { findUserByEmail } from "../store.js";
import { appOrigin } from "../app-origin.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`reset:${clientIp(req)}`, 6, 60_000)) {
    return res.status(429).json({ error: "Too many reset attempts. Please wait a minute." });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address.", exists: false });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(404).json({
      exists: false,
      error: "No account found with that email address.",
    });
  }

  if (!user.password_hash) {
    return res.status(400).json({
      exists: true,
      error: "This account uses Google or GitHub sign-in. Use that provider instead.",
    });
  }

  const token = createPasswordResetToken(email);
  if (!token) {
    return res.status(503).json({ exists: true, error: "Password reset is not configured." });
  }

  const resetUrl = `${appOrigin()}/?reset=${encodeURIComponent(token)}`;
  const sent = await sendPasswordResetEmail(email, resetUrl);
  if (!sent) {
    return res.status(503).json({ exists: true, error: "Could not send reset email. Try again later." });
  }

  return res.status(200).json({
    exists: true,
    message: "Reset link sent. Check your inbox.",
  });
}
