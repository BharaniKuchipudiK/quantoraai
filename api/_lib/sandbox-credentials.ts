/**
 * Credentials for Vercel Sandbox — a REAL, ephemeral Linux microVM the model
 * can clone a repository into, install dependencies, and run the repository's
 * own test/build command, before anything is pushed to GitHub.
 *
 * WHY THIS EXISTS, AND WHY IT IS A SEPARATE CREDENTIAL FROM `deploy:vercel`
 *
 * `vercel-deployments.ts` reads `deploy:vercel` (VERCEL_ACCESS_TOKEN) to read
 * deployment state and build logs — a single account-scoped bearer token.
 * Vercel Sandbox's own SDK (`@vercel/sandbox`) needs the SAME kind of token
 * PLUS a team ID and a project ID, because a sandbox is billed and scoped to
 * one project the way a deployment read is not. Reusing `deploy:vercel` alone
 * would silently do nothing — `Sandbox.create` would reject a token with no
 * team/project context — so this is deliberately its own resolver rather than
 * a second reader of the same credential.
 *
 * WHAT HAPPENS WHEN THIS IS NOT CONFIGURED
 *
 * All three of VERCEL_SANDBOX_TOKEN (falls back to VERCEL_ACCESS_TOKEN),
 * VERCEL_TEAM_ID and VERCEL_PROJECT_ID must be present. Until an operator sets
 * VERCEL_TEAM_ID and VERCEL_PROJECT_ID, this resolves to null and the sandbox
 * tool is not offered — the same fail-closed shape every other optional tool
 * in this file's family already has. This was true in the environment this
 * module was written in: no live sandbox could be created here, so the
 * executor below is exercised only against a fake Sandbox factory in tests,
 * never a real one. That is a real, stated limitation, not an oversight.
 */
export interface SandboxCredentials {
  token: string;
  teamId: string;
  projectId: string;
}

export function resolveSandboxCredentials(): SandboxCredentials | null {
  const token = String(process.env.VERCEL_SANDBOX_TOKEN || process.env.VERCEL_ACCESS_TOKEN || "").trim();
  const teamId = String(process.env.VERCEL_TEAM_ID || "").trim();
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  if (!token || !teamId || !projectId) return null;
  return { token, teamId, projectId };
}
