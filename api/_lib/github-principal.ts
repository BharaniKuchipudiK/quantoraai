/**
 * A GitHub principal is a USER, not a platform credential.
 *
 * THE INCIDENT THIS EXISTS FOR (#452)
 *
 * The previous write path authorized a GitHub mutation on three facts:
 *   1. the caller held an active Quantora session;
 *   2. the server held a shared GITHUB_TOKEN;
 *   3. the target repository was on GITHUB_ALLOWED_REPOS.
 *
 * That is identity plus a resource boundary. It is not authorization: nothing
 * asked whether *this particular person* may write to *that particular
 * repository*. Any signed-in user could have driven Quantora's shared
 * credential against every allowlisted repo. The adapter was therefore made
 * unconditionally fail-closed, and `docs/GITHUB.md` recorded the permanent fix
 * as "a user/repository-bound GitHub App or OAuth installation".
 *
 * This module is that fix. Quantora now acts AS THE USER:
 *
 *   - the user completes a separate OAuth connect flow and Quantora stores
 *     *their* token, encrypted, bound to their session subject;
 *   - before any mutation, GitHub itself is asked what that user may do on that
 *     repository (`GET /repos/{owner}/{repo}` → `permissions`);
 *   - the mutation runs with the user's token, so GitHub enforces the same
 *     answer a second time, independently of anything Quantora believes.
 *
 * The shared platform token keeps exactly one job it was ever entitled to:
 * READ-ONLY repository context import. It can no longer write at all.
 *
 * WHY PERMISSIONS ARE READ FROM GITHUB AND NEVER CACHED AS TRUTH
 *
 * Access is revoked out of band — a collaborator is removed, a repo goes
 * private, a token is revoked in GitHub settings. A permission Quantora
 * remembers is a permission that outlives its revocation. Every write re-asks.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_TIMEOUT_MS = 12_000;

/**
 * Scopes requested by the CONNECT flow — deliberately not the sign-in flow.
 *
 * Sign-in asks for `read:user user:email` and always will: making everyone who
 * signs in with GitHub hand over repository write access, on the chance they
 * might later open a pull request, is exactly the over-broad grant this module
 * exists to avoid. Connecting is a second, explicit, revocable decision.
 */
export const GITHUB_CONNECT_SCOPES = ["repo", "read:user"] as const;
export const GITHUB_CONNECT_SCOPE_PARAM = GITHUB_CONNECT_SCOPES.join(" ");

export type GithubPermissionNeed = "read" | "write" | "admin";

export type GithubPrincipal = {
  /** Quantora session subject the token is bound to. */
  userSub: string;
  /** GitHub login the token belongs to, recorded at connect time. */
  login: string;
  token: string;
  scopes: string[];
  connectedAt: string;
};

export type RepositoryPermission = {
  owner: string;
  repo: string;
  /** What GitHub says this principal may do, highest first. */
  level: "admin" | "maintain" | "write" | "triage" | "read" | "none";
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  private: boolean;
  defaultBranch: string;
  archived: boolean;
};

/* ------------------------------------------------------------------ *
 * Token sealing
 * ------------------------------------------------------------------ */

/**
 * A user's GitHub token is a bearer credential for someone else's account. It
 * is sealed with AES-256-GCM before it reaches the database, so a leaked
 * database dump is not a leaked set of GitHub accounts.
 *
 * The key is its OWN secret, not SESSION_SECRET. Reusing the session-signing
 * secret would mean one rotation either breaks every login or leaves every
 * stored token readable under the retired key; separate secrets rotate
 * separately.
 */
export function resolveGithubSealSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.GITHUB_CONNECTION_SECRET;
  if (!secret || typeof secret !== "string") return null;
  const trimmed = secret.trim();
  // 32 bytes of entropy minimum. A short key is a cheap key.
  return trimmed.length >= 32 ? trimmed : null;
}

function sealKey(secret: string): Buffer {
  // Derive a fixed 32-byte key from an arbitrary-length secret.
  return createHmac("sha256", "quantora-github-connection-v1").update(secret).digest();
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function sealGithubToken(token: string, secret: string): string {
  const plain = String(token || "").trim();
  if (!plain) throw new Error("Refusing to seal an empty GitHub token.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ciphertext)}`;
}

export function openGithubToken(sealed: string, secret: string): string | null {
  const parts = String(sealed || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(secret), fromB64url(parts[1]));
    decipher.setAuthTag(fromB64url(parts[2]));
    const plain = Buffer.concat([decipher.update(fromB64url(parts[3])), decipher.final()]).toString("utf8");
    return plain || null;
  } catch {
    // A wrong key or a tampered payload is indistinguishable here, and should
    // be: both mean "there is no usable token", never "carry on unauthorized".
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * OAuth connect state — bound to the session subject
 * ------------------------------------------------------------------ */

/**
 * The connect callback attaches a GitHub token to a Quantora account. If the
 * state parameter only proved "some Quantora tab started a connect", an
 * attacker could complete their own GitHub authorization inside the victim's
 * session and graft their token onto the victim's account (or, with the
 * redirect reversed, the victim's token onto theirs). The state therefore
 * carries an HMAC over the subject it was minted for, and the callback refuses
 * unless the signed-in subject is that same subject.
 */
export function mintConnectState(userSub: string, secret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret).update(`${nonce}:${userSub}`).digest("hex").slice(0, 32);
  return `${nonce}.${signature}`;
}

export function connectStateMatches(state: string, userSub: string, secret: string): boolean {
  const parts = String(state || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = createHmac("sha256", secret).update(`${parts[0]}:${userSub}`).digest("hex").slice(0, 32);
  const presented = Buffer.from(parts[1]);
  const computed = Buffer.from(expected);
  if (presented.length !== computed.length) return false;
  return timingSafeEqual(presented, computed);
}

/* ------------------------------------------------------------------ *
 * Repository permission — the decision, isolated from the network
 * ------------------------------------------------------------------ */

/**
 * Read GitHub's own answer out of a repository payload.
 *
 * Fail-closed by construction: an absent or unrecognised `permissions` object
 * yields "none", never a default of read or write. The one shape that could
 * turn a GitHub API change into a silent authorization bypass is a truthy
 * default, so there isn't one.
 */
export function repositoryPermissionFromPayload(payload: any): RepositoryPermission {
  const permissions = payload && typeof payload === "object" ? payload.permissions : null;
  const admin = permissions?.admin === true;
  const maintain = permissions?.maintain === true;
  const push = permissions?.push === true;
  const triage = permissions?.triage === true;
  const pull = permissions?.pull === true;

  const level: RepositoryPermission["level"] = admin
    ? "admin"
    : maintain
      ? "maintain"
      : push
        ? "write"
        : triage
          ? "triage"
          : pull
            ? "read"
            : "none";

  return {
    owner: String(payload?.owner?.login || "").trim(),
    repo: String(payload?.name || "").trim(),
    level,
    canRead: pull || triage || push || maintain || admin,
    canWrite: push || maintain || admin,
    canAdmin: admin,
    private: payload?.private === true,
    defaultBranch: String(payload?.default_branch || "main").trim() || "main",
    archived: payload?.archived === true,
  };
}

export function permissionSatisfies(permission: RepositoryPermission, need: GithubPermissionNeed): boolean {
  if (need === "admin") return permission.canAdmin;
  if (need === "write") return permission.canWrite && !permission.archived;
  return permission.canRead;
}

export function permissionRefusalMessage(
  owner: string,
  repo: string,
  permission: RepositoryPermission,
  need: GithubPermissionNeed,
): string {
  if (need === "write" && permission.canWrite && permission.archived) {
    return `${owner}/${repo} is archived on GitHub, so no one can write to it — including you.`;
  }
  if (permission.level === "none") {
    return `Your connected GitHub account cannot see ${owner}/${repo}. Check that the repository exists and that your GitHub authorization covers it.`;
  }
  const verb = need === "admin" ? "administer" : need === "write" ? "write to" : "read";
  return `Your connected GitHub account has ${permission.level} access to ${owner}/${repo}, which is not enough to ${verb} it. Quantora acts as you on GitHub and cannot exceed your own permissions.`;
}

export function githubAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "Quantora-GitHub-Principal",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export type FetchLike = (url: string, init?: any) => Promise<any>;

export async function githubRequest(
  path: string,
  options: { token: string; method?: string; body?: unknown; fetchImpl?: FetchLike },
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const fetchImpl: FetchLike = options.fetchImpl || (globalThis.fetch as FetchLike);
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    headers: {
      ...githubAuthHeaders(options.token),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });

  const raw = typeof response.text === "function" ? await response.text() : "";
  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  return { ok: Boolean(response.ok), status: Number(response.status) || 0, data, raw };
}

/**
 * Ask GitHub what this principal may do here, right now.
 *
 * Throws on refusal rather than returning a flag: a caller that forgets to read
 * a boolean writes anyway, and this is the one call site where forgetting is
 * unacceptable.
 */
export async function assertRepositoryPermission(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  need: GithubPermissionNeed;
  fetchImpl?: FetchLike;
}): Promise<RepositoryPermission> {
  const { principal, owner, repo, need } = input;
  if (!principal?.token) {
    throw new Error("Connect your GitHub account in Quantora before running repository actions.");
  }

  const result = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    token: principal.token,
    fetchImpl: input.fetchImpl,
  });

  if (result.status === 401) {
    throw new Error("GitHub rejected your connected token. Reconnect your GitHub account in Quantora.");
  }
  if (result.status === 404) {
    // GitHub returns 404 rather than 403 for repositories a token cannot see.
    // Reporting it as "not found" would be misleading for a private repo the
    // user owns but did not authorize, so name both possibilities.
    throw new Error(`${owner}/${repo} is not visible to your connected GitHub account. It may not exist, or your authorization may not cover it.`);
  }
  if (!result.ok) {
    throw new Error(`GitHub could not confirm your access to ${owner}/${repo} (HTTP ${result.status}). No action was taken.`);
  }

  const permission = repositoryPermissionFromPayload(result.data);
  if (!permissionSatisfies(permission, need)) {
    throw new Error(permissionRefusalMessage(owner, repo, permission, need));
  }
  return permission;
}

export type RepositoryCreationTarget = {
  owner: string;
  /** Personal accounts and organizations use different creation endpoints. */
  isOrganization: boolean;
};

/**
 * Ask GitHub whether this principal may create a repository under `owner`.
 *
 * WHY THIS IS A SEPARATE CHECK, NOT A MISSING ONE
 *
 * `assertRepositoryPermission` asks what a user may do to a repository that
 * exists. Creation has no repository to ask about yet, so that call cannot
 * apply — but "cannot apply" must not become "unauthorized". The equivalent
 * question is *may this principal create a repository in this account*, and
 * GitHub can answer it before anything is written.
 *
 * Answering it up front rather than letting the POST fail is what keeps the
 * refusal legible: a 403 from the create endpoint says only "Resource not
 * accessible", which is indistinguishable from a revoked token, an org that
 * forbids member repository creation, and a typo in the owner name.
 *
 * Fails closed on anything it cannot positively confirm, matching
 * `repositoryPermissionFromPayload`: an org whose settings cannot be read is
 * refused rather than attempted.
 */
export async function assertRepositoryCreationAllowed(input: {
  principal: GithubPrincipal;
  owner: string;
  fetchImpl?: FetchLike;
}): Promise<RepositoryCreationTarget> {
  const { principal } = input;
  const owner = String(input.owner || "").trim();
  if (!principal?.token) {
    throw new Error("Connect your GitHub account in Quantora before creating a repository.");
  }
  if (!owner) {
    throw new Error("A repository needs an owner — your GitHub account or an organization you belong to.");
  }

  const viewer = await githubRequest("/user", { token: principal.token, fetchImpl: input.fetchImpl });
  if (viewer.status === 401) {
    throw new Error("GitHub rejected your connected token. Reconnect your GitHub account in Quantora.");
  }
  if (!viewer.ok || typeof viewer.data?.login !== "string") {
    throw new Error(`GitHub could not confirm who your connected account is (HTTP ${viewer.status}). No repository was created.`);
  }

  const login = String(viewer.data.login);
  if (login.toLowerCase() === owner.toLowerCase()) {
    // A user may always create repositories in their own account; the `repo`
    // scope this connection requests is what GitHub checks, and a token lacking
    // it fails the /user call above.
    return { owner: login, isOrganization: false };
  }

  const membership = await githubRequest(`/user/memberships/orgs/${encodeURIComponent(owner)}`, {
    token: principal.token,
    fetchImpl: input.fetchImpl,
  });
  if (membership.status === 404) {
    throw new Error(`Your connected GitHub account is not a member of "${owner}", and it is not your username. No repository was created.`);
  }
  if (!membership.ok || membership.data?.state !== "active") {
    throw new Error(`GitHub could not confirm active membership of "${owner}" for your account. No repository was created.`);
  }

  const role = String(membership.data?.role || "");
  if (role === "admin") return { owner, isOrganization: true };

  const organization = await githubRequest(`/orgs/${encodeURIComponent(owner)}`, {
    token: principal.token,
    fetchImpl: input.fetchImpl,
  });
  if (!organization.ok || typeof organization.data?.members_can_create_repositories !== "boolean") {
    throw new Error(`GitHub did not report whether members of "${owner}" may create repositories, so Quantora did not try. An organization owner can create it, or grant that permission.`);
  }
  if (!organization.data.members_can_create_repositories) {
    throw new Error(`"${owner}" does not allow members to create repositories. Ask an organization owner to create it, or choose your own account.`);
  }

  return { owner, isOrganization: true };
}

/* ------------------------------------------------------------------ *
 * Optional deployment boundary
 * ------------------------------------------------------------------ */

/**
 * `GITHUB_ALLOWED_REPOS` used to be load-bearing security: it was the only
 * thing stopping Quantora's shared platform token from writing to arbitrary
 * repositories on any signed-in user's say-so. That containment is gone because
 * the shared token no longer writes at all — every mutation now runs on the
 * acting user's own credential, under their own GitHub permissions.
 *
 * So the variable changes meaning, and the change is a deliberate loosening:
 * unset now means "no deployment-level restriction" rather than "deny
 * everything". Denying everything by default made sense when the alternative
 * was a confused deputy; it makes no sense as a default when the alternative is
 * a user acting on their own repositories with their own token, which they can
 * do on github.com regardless.
 *
 * Set it when a deployment wants a narrower blast radius than its users' own
 * permissions — a demo instance, or a tenant that should only ever touch one
 * repository. It is a resource boundary, and it was never subject
 * authorization; that job belongs to `assertRepositoryPermission`.
 */
export function assertRepositoryWithinDeploymentBoundary(
  owner: string,
  repo: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const allow = String(env.GITHUB_ALLOWED_REPOS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return;
  if (!allow.includes(`${owner}/${repo}`.toLowerCase())) {
    throw new Error(`This Quantora deployment is restricted to specific repositories, and ${owner}/${repo} is not one of them (GITHUB_ALLOWED_REPOS).`);
  }
}
