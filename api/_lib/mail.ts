function isProdLikeRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

/**
 * Password-reset delivery. Uses Resend when configured.
 * Locally, missing RESEND_API_KEY logs the link. Production and Vercel
 * deployments fail closed so a live reset token never lands in logs.
 */
async function sendAuthEmail(email: string, subject: string, html: string, devLog: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Quantora <noreply@quantora.app>";

  if (!apiKey) {
    if (isProdLikeRuntime()) {
      console.warn("[auth] Transactional email is not configured (missing RESEND_API_KEY).");
      return false;
    }
    console.info(devLog);
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], subject, html }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch (err: any) {
    console.warn("Auth email failed:", err?.message || err);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  return sendAuthEmail(
    email,
    "Reset your Quantora password",
    `
      <p>You asked to reset your Quantora password.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>This link expires in one hour. If you did not request this, you can ignore this email.</p>
    `,
    `[auth] Password reset for ${email}: ${resetUrl}`,
  );
}

export async function sendProviderSignInNotice(email: string, provider: string): Promise<boolean> {
  const label = provider || "your original sign-in method";
  return sendAuthEmail(
    email,
    "How to sign in to Quantora",
    `
      <p>You asked to reset a Quantora password.</p>
      <p>This email is signed in with ${label}, so there is no password to reset. Use ${label} on the sign-in screen.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
    `[auth] Provider sign-in notice for ${email} (${label})`,
  );
}
