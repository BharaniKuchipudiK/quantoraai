import { isSessionConfigured } from "./session.js";
import { isAuthMailConfigured } from "./mail.js";

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** GitHub OAuth App client ids look like Iv… or Ov… — not a normal env var name. */
export function isGithubOAuthAppIdKey(key: string): boolean {
  return /^(Iv|Ov)[a-zA-Z0-9]{10,}$/.test(String(key || "").trim());
}

function misnamedGithubOAuthEntry(): { clientId: string; clientSecret: string } | null {
  for (const key of Object.keys(process.env)) {
    if (!isGithubOAuthAppIdKey(key)) continue;
    const clientId = key.trim();
    const clientSecret = process.env[key]?.trim() || "";
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  return null;
}

/** Public Google OAuth client id — safe to expose to the browser. */
export function resolveGoogleClientId(): string {
  return firstEnv("VITE_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
}

/** GitHub OAuth app client id (accepts common misnamed Vercel vars). */
export function resolveGithubOAuthClientId(): string {
  const direct = firstEnv(
    "GITHUB_CLIENT_ID",
    "VITE_GITHUB_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_APP_CLIENT_ID",
  );
  if (direct) return direct;
  return misnamedGithubOAuthEntry()?.clientId || "";
}

export function resolveGithubOAuthClientSecret(): string {
  const direct = firstEnv(
    "GITHUB_CLIENT_SECRET",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "GITHUB_APP_CLIENT_SECRET",
  );
  if (direct) return direct;
  return misnamedGithubOAuthEntry()?.clientSecret || "";
}

export function authProvidersStatus() {
  const googleClientId = resolveGoogleClientId();
  const githubClientId = resolveGithubOAuthClientId();
  const githubSecret = resolveGithubOAuthClientSecret();
  return {
    google: Boolean(googleClientId),
    github: Boolean(githubClientId && githubSecret),
    email: isSessionConfigured(),
    passwordReset: isSessionConfigured() && isAuthMailConfigured(),
    googleClientId: googleClientId || null,
  };
}
