import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { createPasswordResetToken } from "../reset-token.js";
import { sendPasswordResetEmail, sendProviderSignInNotice } from "../mail.js";
import { findUserByEmail } from "../store.js";
import { appOrigin } from "../app-origin.js";
import { PASSWORD_RESET_GENERIC_MESSAGE, passwordResetDelivery, providerLabel } from "../auth-privacy.js";
import { verifyPasswordAgainstStore } from "../password.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`reset:${clientIp(req)}`, 6, 60_000)) {
    return res.status(429).json({ error: "Too many reset attempts. Please wait a minute." });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const user = await findUserByEmail(email);
  const delivery = passwordResetDelivery(user);

  if (delivery === "reset") {
    const token = createPasswordResetToken(email);
    if (token) {
      const resetUrl = `${appOrigin()}/?reset=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail(email, resetUrl);
    }
  } else if (delivery === "provider-notice") {
    await sendProviderSignInNotice(email, providerLabel(user?.auth_provider));
  } else {
    // Equalize timing with a password check so missing accounts are not cheaper.
    await verifyPasswordAgainstStore("quantora-reset-padding", null);
  }

  return res.status(200).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
}
