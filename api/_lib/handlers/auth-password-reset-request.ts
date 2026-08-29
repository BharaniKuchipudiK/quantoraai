import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { isSessionConfigured } from "../session.js";
import { createPasswordResetToken } from "../reset-token.js";
import { isAuthMailConfigured, sendPasswordResetEmail, sendProviderSignInNotice } from "../mail.js";
import { findUserByEmail } from "../store.js";
import { appOrigin } from "../app-origin.js";
import { PASSWORD_RESET_GENERIC_MESSAGE, passwordResetDelivery, providerLabel } from "../auth-privacy.js";
import { verifyPasswordAgainstStore } from "../password.js";

export const PASSWORD_RESET_UNAVAILABLE =
  "Password reset is not available on this deployment. Sign in with Google or GitHub, or try again later.";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`reset:${clientIp(req)}`, 6, 60_000)) {
    return res.status(429).json({ error: "Too many reset attempts. Please wait a minute." });
  }

  if (!isSessionConfigured() || !isAuthMailConfigured()) {
    return res.status(503).json({ error: PASSWORD_RESET_UNAVAILABLE });
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
    await verifyPasswordAgainstStore("quantora-reset-padding", null);
  }

  return res.status(200).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
}
