import { parseGithubRepositoryUrl } from "./repository-preview.js";

const GITHUB_TIMEOUT_MS = 12_000;

export type CreatePullRequestInput = {
  repoUrl: string;
  title: string;
  head: string;
  base?: string;
  body?: string;
};

export type CreatePullRequestResult = {
  number: number;
  url: string;
  title: string;
  state: string;
  draft: boolean;
  htmlUrl: string;
};

export function resolveGithubToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GH_TOKEN;
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed || null;
}

export function githubWriteAuthMessage(): string {
  return "Creating or merging pull requests requires GITHUB_TOKEN (or GITHUB_PAT) in Vercel with repo scope, plus GITHUB_ALLOWED_REPOS (comma-separated owner/repo). Desk git still cannot push branches; push the head branch from your machine or a CI job first, then create the PR.";
}

/**
 * Prevent confused-deputy writes: the shared deployment token may only touch
 * repositories explicitly allowlisted in GITHUB_ALLOWED_REPOS.
 */
export function assertGithubWriteAllowed(repoUrl: string, env: NodeJS.ProcessEnv = process.env): { owner: string; repo: string } {
  const { owner, repo } = parseGithubRepositoryUrl(repoUrl);
  const allow = String(env.GITHUB_ALLOWED_REPOS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) {
    throw new Error(
      "GitHub write operations are disabled until GITHUB_ALLOWED_REPOS is set in Vercel (comma-separated owner/repo allowlist). " +
        githubWriteAuthMessage(),
    );
  }
  const key = `${owner}/${repo}`.toLowerCase();
  if (!allow.includes(key)) {
    throw new Error(`Repository ${owner}/${repo} is not on the GITHUB_ALLOWED_REPOS allowlist.`);
  }
  return { owner, repo };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "Quantora-GitHub-PR",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeCreatePullRequestInput(raw: any): CreatePullRequestInput {
  const repoUrl = clean(raw?.repoUrl, 500);
  const title = clean(raw?.title, 240);
  const head = clean(raw?.head, 200);
  const base = clean(raw?.base, 200) || "main";
  const body = clean(raw?.body, 8_000);
  if (!repoUrl) throw new Error("Enter the GitHub repository URL for this pull request.");
  if (!title) throw new Error("Enter a pull-request title.");
  if (!head) throw new Error("Enter the head branch that already exists on GitHub.");
  parseGithubRepositoryUrl(repoUrl);
  return { repoUrl, title, head, base, body };
}

export async function createGithubPullRequest(
  input: CreatePullRequestInput,
  token = resolveGithubToken(),
): Promise<CreatePullRequestResult> {
  if (!token) {
    throw new Error(githubWriteAuthMessage());
  }

  const normalized = normalizeCreatePullRequestInput(input);
  assertGithubWriteAllowed(normalized.repoUrl);
  const { owner, repo } = parseGithubRepositoryUrl(normalized.repoUrl);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: normalized.title,
      head: normalized.head,
      base: normalized.base || "main",
      body: normalized.body || "Opened from Quantora Studio.",
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`GitHub returned a non-JSON response while creating the pull request (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `GitHub could not create the pull request (${response.status}).`;
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${message} ${githubWriteAuthMessage()}`);
    }
    if (response.status === 422) {
      throw new Error(`${message} Confirm the head branch exists on GitHub (desk git does not push).`);
    }
    throw new Error(message);
  }

  const number = Number(data?.number);
  const htmlUrl = clean(data?.html_url, 500);
  if (!Number.isInteger(number) || number <= 0 || !htmlUrl) {
    throw new Error("GitHub created a pull request but returned an unexpected payload.");
  }

  return {
    number,
    url: htmlUrl,
    htmlUrl,
    title: clean(data?.title, 240) || normalized.title,
    state: clean(data?.state, 40) || "open",
    draft: Boolean(data?.draft),
  };
}

export async function mergeGithubPullRequest(input: {
  repoUrl: string;
  number: number;
  mergeMethod?: "merge" | "squash" | "rebase";
}, token = resolveGithubToken()): Promise<{ merged: boolean; message: string; sha?: string }> {
  if (!token) {
    throw new Error(`Merging pull requests is disabled until credentials exist. ${githubWriteAuthMessage()}`);
  }

  const repoUrl = clean(input?.repoUrl, 500);
  const number = Number(input?.number);
  if (!repoUrl || !Number.isInteger(number) || number <= 0) {
    throw new Error("A repository URL and pull-request number are required to merge.");
  }

  assertGithubWriteAllowed(repoUrl);
  const { owner, repo } = parseGithubRepositoryUrl(repoUrl);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merge_method: input.mergeMethod || "squash",
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`GitHub returned a non-JSON response while merging (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `GitHub could not merge the pull request (${response.status}).`;
    throw new Error(message);
  }

  return {
    merged: Boolean(data?.merged),
    message: clean(data?.message, 500) || "Pull request merged.",
    sha: clean(data?.sha, 80) || undefined,
  };
}
