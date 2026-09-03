/**
 * A real working copy of a repository, in the desk.
 *
 * WHAT THIS REPLACES, AND WHY IT IS A DIFFERENT THING
 *
 * `repository-preview.ts` reads ten files, ranked by how well their names match
 * the user's sentence, and hands them to the model as an attachment. That is a
 * reading sample, and it was honest about being one. It is not a codebase you
 * can work in: the model cannot open the file it needs next, because the file
 * was never fetched, and it has no way to know that. The sample is kept for the
 * cases it suits — a question about a repository nobody intends to change.
 *
 * This module answers the other question: give me the project. Every source
 * file up to a stated budget, at a named commit, so the desk holds a tree that
 * corresponds to something real on GitHub.
 *
 * THE COMMIT SHA IS THE POINT
 *
 * A checkout without a base commit is a pile of files. With one it is a working
 * copy: the desk knows what it started from, a diff means something, and a push
 * can refuse when the branch has moved underneath it. Everything in phase four
 * depends on this field existing, so it is resolved first and the checkout fails
 * rather than returning files it cannot anchor.
 *
 * TRUNCATION IS REPORTED, NEVER SILENT
 *
 * A partial tree that looks complete is worse than a refusal: the model reasons
 * about a codebase with holes in it and cannot tell. When the budget is spent,
 * `omitted` says how many files were left out and why, in words meant for a
 * person, and the caller is expected to show it.
 */

import {
  githubRequest,
  type FetchLike,
  type GithubPrincipal,
} from "./github-principal.js";

/** Bounds sized so one checkout fits inside a serverless invocation. */
export const CHECKOUT_MAX_FILES = 400;
export const CHECKOUT_MAX_TOTAL_BYTES = 6 * 1024 * 1024;
export const CHECKOUT_MAX_FILE_BYTES = 512 * 1024;
const BLOB_CONCURRENCY = 8;

export type CheckoutFile = { path: string; content: string };

export type CheckoutOmission = { reason: string; count: number };

export type RepositoryCheckout = {
  owner: string;
  repo: string;
  branch: string;
  /** The commit this working copy is of. Never empty on success. */
  commitSha: string;
  files: CheckoutFile[];
  /** Total blobs in the tree, before any filtering. */
  treeFileCount: number;
  omitted: CheckoutOmission[];
  /** True when the tree itself was cut short by GitHub, not by us. */
  treeTruncated: boolean;
};

/*
 * Directories whose contents are reproducible from the files that ARE taken.
 * Spending the budget on node_modules would mean dropping the source it was
 * installed for.
 */
const SKIP_DIRECTORY = /(^|\/)(node_modules|\.git|dist|build|out|coverage|vendor|__pycache__|\.next|\.turbo|\.venv)(\/|$)/;

/*
 * Lockfiles are deliberately excluded and deliberately reported. They are
 * routinely larger than every source file combined, and a checkout that spends
 * its budget on one arrives without the code. `npm install` regenerates one;
 * nothing regenerates the source that was dropped to make room.
 */
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock)$/;

/** Text this desk can edit. Anything else is a blob the browser cannot show. */
const TEXT_FILE = /(?:^|\/)(?:[^/]+\.(?:[cm]?[jt]sx?|css|scss|sass|less|html?|vue|svelte|astro|py|rb|go|rs|java|kt|kts|swift|php|sql|sh|bash|zsh|md|mdx|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|env|xml|svg|graphql|gql|prisma|proto|lua|r|jl|ex|exs|erl|hs|clj|scala|dart|c|h|cpp|hpp|cc|cs|m|mm)|Dockerfile|Makefile|Procfile|Justfile|Rakefile|Gemfile|\.gitignore|\.dockerignore|\.editorconfig|LICENSE|README|CHANGELOG)$/i;

type TreeEntry = { path: string; type: string; size?: number; sha: string };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Run `tasks` with bounded concurrency; a serverless function has one CPU. */
async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Decide what comes across, and record what does not.
 *
 * Separated from the fetching so the decision is testable without a network:
 * which files a checkout includes is a product decision with real consequences,
 * and it should not only be observable by watching HTTP traffic.
 */
export function selectCheckoutFiles(tree: TreeEntry[]): {
  take: TreeEntry[];
  omitted: CheckoutOmission[];
  treeFileCount: number;
} {
  const blobs = tree.filter((entry) => entry?.type === "blob" && typeof entry.path === "string");

  let skippedDirectory = 0;
  let skippedLockfile = 0;
  let skippedBinary = 0;
  let skippedTooBig = 0;
  let skippedOverBudget = 0;

  const take: TreeEntry[] = [];
  let total = 0;

  for (const entry of blobs) {
    if (SKIP_DIRECTORY.test(entry.path)) { skippedDirectory += 1; continue; }
    if (LOCKFILE.test(entry.path)) { skippedLockfile += 1; continue; }
    if (!TEXT_FILE.test(entry.path)) { skippedBinary += 1; continue; }

    const size = Number(entry.size) || 0;
    if (size > CHECKOUT_MAX_FILE_BYTES) { skippedTooBig += 1; continue; }

    if (take.length >= CHECKOUT_MAX_FILES || total + size > CHECKOUT_MAX_TOTAL_BYTES) {
      skippedOverBudget += 1;
      continue;
    }

    total += size;
    take.push(entry);
  }

  const omitted: CheckoutOmission[] = [];
  const note = (count: number, reason: string) => { if (count > 0) omitted.push({ count, reason }); };

  note(skippedDirectory, "in node_modules, dist or another generated directory");
  note(skippedLockfile, "lockfiles — large, and regenerated by installing dependencies");
  note(skippedBinary, "not text this desk can edit (images, fonts, archives)");
  note(skippedTooBig, `larger than ${CHECKOUT_MAX_FILE_BYTES / 1024}KB each`);
  note(skippedOverBudget, `beyond this checkout's budget of ${CHECKOUT_MAX_FILES} files and ${CHECKOUT_MAX_TOTAL_BYTES / (1024 * 1024)}MB`);

  return { take, omitted, treeFileCount: blobs.length };
}

/** One sentence a person can act on, or '' when the whole project came across. */
export function describeCheckoutOmissions(checkout: { files: CheckoutFile[]; omitted: CheckoutOmission[]; treeTruncated: boolean }): string {
  if (checkout.treeTruncated) {
    return `This repository is too large for GitHub to list in one request, so this is a partial checkout of ${checkout.files.length} file(s). Treat anything you cannot see as present but unloaded.`;
  }
  const budget = checkout.omitted.find((entry) => entry.reason.startsWith("beyond this checkout's budget"));
  if (budget) {
    return `${checkout.files.length} file(s) loaded. ${budget.count} more were left out because they are ${budget.reason} — this desk does not have the whole project.`;
  }
  return "";
}

export async function checkoutRepository(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  branch?: string;
  fetchImpl?: FetchLike;
}): Promise<RepositoryCheckout> {
  const { principal, owner, repo } = input;
  const token = principal.token;
  const fetchImpl = input.fetchImpl;
  const ownerPath = encodeURIComponent(owner);
  const repoPath = encodeURIComponent(repo);

  const requestedBranch = String(input.branch || "").trim();
  let branch = requestedBranch;

  if (!branch) {
    const meta = await githubRequest(`/repos/${ownerPath}/${repoPath}`, { token, fetchImpl });
    if (meta.status === 404) {
      throw new Error(`${owner}/${repo} is not visible to your connected GitHub account. It may not exist, or your authorization may not cover it.`);
    }
    if (!meta.ok) throw new Error(`GitHub could not open ${owner}/${repo} (HTTP ${meta.status}).`);
    branch = text(meta.data?.default_branch, 200) || "main";
  }

  // The commit first. A checkout that cannot name what it is a copy of is a
  // pile of files, and everything downstream (diff, push safety) needs this.
  const ref = await githubRequest(`/repos/${ownerPath}/${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`, {
    token,
    fetchImpl,
  });
  if (ref.status === 404) {
    throw new Error(`Branch "${branch}" does not exist in ${owner}/${repo}, or the repository has no commits yet.`);
  }
  if (!ref.ok) throw new Error(`GitHub could not resolve "${branch}" in ${owner}/${repo} (HTTP ${ref.status}).`);
  const commitSha = text(ref.data?.object?.sha, 80);
  if (!commitSha) throw new Error(`GitHub did not report which commit "${branch}" points at, so this checkout has no base.`);

  const tree = await githubRequest(`/repos/${ownerPath}/${repoPath}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`, {
    token,
    fetchImpl,
  });
  if (!tree.ok) throw new Error(`GitHub could not read the file list for ${owner}/${repo} (HTTP ${tree.status}).`);

  const entries: TreeEntry[] = Array.isArray(tree.data?.tree) ? tree.data.tree : [];
  const { take, omitted, treeFileCount } = selectCheckoutFiles(entries);

  if (take.length === 0) {
    throw new Error(`No editable text files were found in ${owner}/${repo} at ${branch}.`);
  }

  const fetched = await mapLimit(take, BLOB_CONCURRENCY, async (entry) => {
    const blob = await githubRequest(`/repos/${ownerPath}/${repoPath}/git/blobs/${encodeURIComponent(entry.sha)}`, {
      token,
      fetchImpl,
    });
    if (!blob.ok) return null;
    const encoding = text(blob.data?.encoding, 20);
    const raw = typeof blob.data?.content === "string" ? blob.data.content : "";
    const content = encoding === "base64" ? Buffer.from(raw, "base64").toString("utf8") : raw;
    return { path: entry.path, content } as CheckoutFile;
  });

  const files = fetched.filter((file): file is CheckoutFile => Boolean(file));
  const unreadable = take.length - files.length;
  if (unreadable > 0) omitted.push({ count: unreadable, reason: "could not be read back from GitHub" });

  return {
    owner,
    repo,
    branch,
    commitSha,
    files,
    treeFileCount,
    omitted,
    treeTruncated: tree.data?.truncated === true,
  };
}
