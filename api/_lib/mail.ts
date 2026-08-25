/**
 * Password-reset delivery. Uses Resend when configured; otherwise logs in dev.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Quantora <noreply@quantora.app>";

  if (!apiKey) {
    console.info(`[auth] Password reset for ${email}: ${resetUrl}`);
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Reset your Quantora password",
        html: `
          <p>You asked to reset your Quantora password.</p>
          <p><a href="${resetUrl}">Reset password</a></p>
          <p>This link expires in one hour. If you did not request this, you can ignore this email.</p>
        `,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch (err: any) {
    console.warn("Password reset email failed:", err?.message || err);
    return false;
  }
}
