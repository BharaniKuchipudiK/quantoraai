import { isSessionConfigured } from "./session.js";

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** Public Google OAuth client id — safe to expose to the browser. */
export function resolveGoogleClientId(): string {
  return firstEnv("VITE_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
}

/** GitHub OAuth app client id (accepts common misnamed Vercel vars). */
export function resolveGithubOAuthClientId(): string {
  return firstEnv(
    "GITHUB_CLIENT_ID",
    "VITE_GITHUB_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_APP_CLIENT_ID",
  );
}

export function resolveGithubOAuthClientSecret(): string {
  return firstEnv(
    "GITHUB_CLIENT_SECRET",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "GITHUB_APP_CLIENT_SECRET",
  );
}

export function authProvidersStatus() {
  const googleClientId = resolveGoogleClientId();
  const githubClientId = resolveGithubOAuthClientId();
  const githubSecret = resolveGithubOAuthClientSecret();
  return {
    google: Boolean(googleClientId),
    github: Boolean(githubClientId && githubSecret),
    email: isSessionConfigured(),
    googleClientId: googleClientId || null,
  };
}
