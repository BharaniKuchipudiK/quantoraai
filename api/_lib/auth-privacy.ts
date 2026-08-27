export const PASSWORD_RESET_GENERIC_MESSAGE =
  "If an account exists for that email, we sent a reset link.";

export type PasswordResetDelivery = "reset" | "provider-notice" | "none";

export function normalizeAuthEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function rowsMatchingAuthEmail<T extends { email?: string | null }>(
  rows: T[] | null | undefined,
  email: string,
): T[] {
  const normalized = normalizeAuthEmail(email);
  if (!normalized || !Array.isArray(rows)) return [];
  return rows.filter((row) => normalizeAuthEmail(row?.email || "") === normalized);
}

export function passwordResetDelivery(
  user: { password_hash?: string | null } | null | undefined,
): PasswordResetDelivery {
  if (!user) return "none";
  if (user.password_hash) return "reset";
  return "provider-notice";
}

export function providerLabel(authProvider: string | null | undefined): string {
  if (authProvider === "github") return "GitHub";
  if (authProvider === "email") return "email and password";
  return "Google";
}
