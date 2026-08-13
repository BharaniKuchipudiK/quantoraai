import { createHash } from "node:crypto";

const MAX_PROJECT_SLUG_LENGTH = 32;

export function normalizeRequestedProjectName(value: unknown): string {
  const slug = String(value || "quantora-app")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PROJECT_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "quantora-app";
}

/**
 * Vercel project names are account-global. Namespace them by the authenticated
 * user's stable Google subject so one user cannot select or overwrite another
 * user's project merely by guessing its friendly name.
 */
export function ownedProjectName(value: unknown, userSub: string): string {
  const namespace = createHash("sha256").update(userSub).digest("hex").slice(0, 10);
  return `q-${namespace}-${normalizeRequestedProjectName(value)}`.slice(0, 50).replace(/-+$/g, "");
}

export function normalizeDomainName(value: unknown): string | null {
  const name = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (name.length > 253 || name.includes("/") || name.includes(":")) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) {
    return null;
  }
  return name;
}
