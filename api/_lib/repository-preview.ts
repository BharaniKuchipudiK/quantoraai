const MAX_TREE_FILES = 5_000;
const MAX_CANDIDATE_FILES = 24;
const MAX_RELEVANT_FILES = 10;
const MAX_FILE_SIZE = 180_000;
const MAX_FILE_CHARS = 24_000;
const MAX_CONTEXT_CHARS = 120_000;
const GITHUB_TIMEOUT_MS = 8_000;

/** Default task when Studio Import Repository only sends a repo URL (context load, not a change plan). */
export const DEFAULT_REPOSITORY_IMPORT_TASK =
  "Load key source files as coding context for AI Studio. Prefer README, package manifests, and primary application entrypoints.";

export function resolveGithubToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GH_TOKEN;
  if (!token || typeof token !== "string") return undefined;
  const trimmed = token.trim();
  return trimmed || undefined;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "been", "before", "build", "can", "change",
  "could", "does", "file", "for", "from", "have", "into", "just", "keep", "make", "need", "only",
  "page", "please", "repository", "should", "that", "the", "their", "this", "user", "want",
  "what", "when", "where", "which", "with", "without", "would", "your",
]);

const IGNORED_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)(dist|build|coverage|vendor|__pycache__)\//,
  /\.(?:jpg|jpeg|png|gif|ico|svg|mp4|webm|mp3|wav|pdf|zip|gz|woff2?|ttf|eot|lock)$/i,
];

const SOURCE_FILE = /(?:^|\/)(?:[^/]+\.(?:[cm]?[jt]sx?|css|scss|html|py|rb|go|rs|java|kt|swift|php|sql|md|json|ya?ml|toml)|Dockerfile|Makefile)$/i;

type GitHubTreeFile = { path: string; type: string; size?: number };

export type RepositoryPreview = {
  name: string;
  branch: string;
  request: string;
  risk: "low" | "medium" | "high";
  relevantFiles: string[];
  content: string;
};

export function parseGithubRepositoryUrl(repoUrl: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    throw new Error("Enter a complete GitHub repository URL, such as https://github.com/owner/repository.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only HTTPS github.com repository URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Enter the repository URL only, without a file, branch, issue, or pull-request path.");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("The GitHub owner or repository name contains unsupported characters.");
  }

  return { owner, repo };
}

function taskTerms(task: string): string[] {
  return [...new Set(
    task.toLowerCase().match(/[a-z0-9_-]{3,}/g)?.filter(term => !STOP_WORDS.has(term)) || [],
  )].slice(0, 30);
}

function pathScore(path: string, terms: string[]): number {
  const lower = path.toLowerCase();
  const basename = lower.split("/").pop() || lower;
  let score = 0;

  for (const term of terms) {
    if (basename.includes(term)) score += 12;
    else if (lower.includes(term)) score += 6;
  }

  if (/^(src\/)?(app|index|main)\.[cm]?[jt]sx?$/i.test(path)) score += 4;
  if (/(package\.json|readme\.md|vite\.config|next\.config|vercel\.json)$/i.test(path)) score += 2;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(path)) score -= 2;
  return score;
}

export function selectCandidateFiles(tree: GitHubTreeFile[], task: string, limit = MAX_CANDIDATE_FILES): GitHubTreeFile[] {
  const terms = taskTerms(task);

  return tree
    .filter(file => file?.type === "blob" && typeof file.path === "string")
    .filter(file => !file.size || file.size <= MAX_FILE_SIZE)
    .filter(file => SOURCE_FILE.test(file.path))
    .filter(file => !IGNORED_PATHS.some(pattern => pattern.test(file.path)))
    .slice(0, MAX_TREE_FILES)
    .map((file, index) => ({ file, index, score: pathScore(file.path, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(item => item.file);
}

function contentScore(path: string, content: string, task: string): number {
  const terms = taskTerms(task);
  const lowerPath = path.toLowerCase();
  const basename = lowerPath.split("/").pop() || lowerPath;
  const lowerContent = content.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (basename.includes(term)) score += 36;
    else if (lowerPath.includes(term)) score += 18;
    const occurrences = lowerContent.split(term).length - 1;
    score += Math.min(occurrences, 8);
  }

  return score;
}

export function assessChangeRisk(paths: string[], task: string): "low" | "medium" | "high" {
  const signal = `${paths.join(" ")} ${task}`.toLowerCase();
  if (/(auth|oauth|payment|billing|stripe|secret|security|permission|migration|database|schema|delete|production|deploy)/.test(signal)) {
    return "high";
  }
  if (/(api|server|config|package\.json|dependency|environment|supabase|backend)/.test(signal)) {
    return "medium";
  }
  return "low";
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Quantora-Safe-Change-Preview",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubFetch(url: string, init: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) });
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function buildRepositoryPreview(
  repoUrl: string,
  task: string = DEFAULT_REPOSITORY_IMPORT_TASK,
  githubToken: string | undefined = resolveGithubToken(),
): Promise<RepositoryPreview> {
  const effectiveTask = typeof task === "string" && task.trim()
    ? task.trim()
    : DEFAULT_REPOSITORY_IMPORT_TASK;
  if (effectiveTask.length > 2_000) throw new Error("The change request is too long. Keep it under 2,000 characters.");

  const { owner, repo } = parseGithubRepositoryUrl(repoUrl);
  const headers = githubHeaders(githubToken);
  const repoResponse = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoResponse.ok) {
    if (repoResponse.status === 404) throw new Error("Repository not found. Private repositories require a configured GitHub token.");
    if (repoResponse.status === 403) throw new Error("GitHub's request limit was reached. Try again later.");
    throw new Error(`GitHub could not open this repository (${repoResponse.status}).`);
  }

  const metadata = await repoResponse.json();
  const branch = metadata.default_branch || "main";
  const treeResponse = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok) throw new Error("GitHub could not read the repository file list.");

  const treeData = await treeResponse.json();
  const candidates = selectCandidateFiles(Array.isArray(treeData.tree) ? treeData.tree : [], effectiveTask);
  if (candidates.length === 0) throw new Error("No readable source files were found in this repository.");

  const rankedFiles = (await Promise.all(candidates.map(async file => {
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath(file.path)}`;
    const response = await githubFetch(rawUrl, {
      headers: githubToken ? { Authorization: `Bearer ${githubToken}` } : undefined,
    });
    if (!response.ok) return null;
    const content = (await response.text()).slice(0, MAX_FILE_CHARS);
    return { path: file.path, content, score: contentScore(file.path, content, effectiveTask) };
  })))
    .filter((file): file is { path: string; content: string; score: number } => Boolean(file))
    .sort((a, b) => b.score - a.score);

  // Do not pad a confident match with unrelated files merely to reach a fixed
  // count. If the task has no textual match at all, retain a small foundation
  // set so the model can still explain that it needs better direction.
  const matchedFiles = rankedFiles.filter(file => file.score > 0);
  const files = (matchedFiles.length > 0 ? matchedFiles : rankedFiles.slice(0, 4))
    .slice(0, MAX_RELEVANT_FILES);

  if (files.length === 0) throw new Error("GitHub returned the file list, but the relevant source files could not be read.");

  const relevantFiles = files.map(file => file.path);
  const risk = assessChangeRisk(relevantFiles, effectiveTask);
  const fileContext = files.map(file => `\n--- ${file.path} ---\n${file.content}`).join("\n");
  const content = `[QUANTORA REPOSITORY CONTEXT — READ ONLY]
Repository: ${owner}/${repo}
Default branch: ${branch}
User request: ${effectiveTask}
Initial risk level: ${risk}
Likely relevant files: ${relevantFiles.join(", ")}

This attachment is read-only GitHub context for AI Studio (not a full clone and not a write-back). Use it to answer questions and propose changes. Do not claim that files were edited on GitHub.

RELEVANT REPOSITORY CONTEXT
${fileContext}`.slice(0, MAX_CONTEXT_CHARS);

  return { name: `${owner}/${repo}`, branch, request: effectiveTask, risk, relevantFiles, content };
}
