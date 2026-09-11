/**
 * The one door between an HTTP request and a GitHub action.
 *
 * Kept out of `api/pipeline.ts` for two reasons. The obvious one is that
 * pipeline.ts is already long. The load-bearing one is that authorization is
 * easier to audit when every GitHub stage enters through a single function that
 * resolves the principal before dispatching, rather than seven route blocks
 * that each have to remember to.
 *
 * The stages are deliberately read-first: listing and reading a pull request is
 * where nearly all the value is, and it is the half that cannot damage anything.
 */

import { requireActiveSession } from "./authz.js";
import { isRateLimited } from "./rate-limit.js";
import { parseGithubRepositoryUrl } from "./repository-preview.js";
import { readGithubConnectionSummary, readGithubPrincipal, deleteGithubConnection, readGithubAutoPrEnabled, setGithubAutoPrEnabled } from "./github-connection-store.js";
import { listBranches, listIssues, listPullRequests, readPullRequest, renderPullRequestBrief } from "./github-intelligence.js";
import {
  commentOnPullRequest,
  createPullRequest,
  createRepository,
  mergePullRequest,
} from "./github-actions.js";
import { pushFilesToRepositoryFromBase } from './github-push-from-base.js';
import { checkoutRepository, describeCheckoutOmissions } from "./github-checkout.js";
import { assertRepositoryWithinDeploymentBoundary, type GithubPrincipal } from "./github-principal.js";

export const GITHUB_STAGES = Object.freeze([
  "github-connection",
  "github-disconnect",
  "github-auto-pr",
  "github-list-prs",
  "github-read-pr",
  "github-list-issues",
  "github-comment",
  "github-create-pr",
  "github-merge-pr",
  "github-push",
  "github-create-repo",
  "github-list-repos",
  "github-list-branches",
  "github-checkout",
]);

/** Stages that change something on GitHub. Reads are not in this set. */
export const GITHUB_WRITE_STAGES = Object.freeze([
  "github-comment",
  "github-create-pr",
  "github-merge-pr",
  "github-push",
  "github-create-repo",
]);

/**
 * Creating a repository is the one write with no repository to name, so it
 * cannot go through the repoUrl parse every other stage depends on.
 */
export function isRepositorylessGithubStage(stage: unknown): boolean {
  return stage === "github-create-repo" || stage === "github-list-repos";
}

export function isGithubWriteStage(stage: unknown): boolean {
  return typeof stage === "string" && GITHUB_WRITE_STAGES.includes(stage);
}

export function isGithubStage(stage: unknown): boolean {
  return typeof stage === "string" && GITHUB_STAGES.includes(stage);
}

/** Map a `?github=` query alias onto its stage, for the vercel.json rewrites. */
export function githubStageForRouteAlias(alias: unknown): string | null {
  const value = String(alias || "").trim();
  if (!value) return null;
  if (value === "preview" || value === "fetch-repo") return "repository-preview";
  const stage = `github-${value}`;
  return isGithubStage(stage) ? stage : null;
}

const NOT_CONNECTED = "Connect your GitHub account to Quantora first. Quantora acts as you on GitHub and never uses a shared platform credential for writes.";

export async function handleGithubStage(stage: string, req: any, res: any): Promise<void> {
  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const sessionUser = auth.value.sessionUser!;

  // GitHub's own rate limit is per token; this one protects Quantora from being
  // the thing that burns a user's hourly budget in ten seconds.
  if (isRateLimited(`github:${sessionUser.sub}`, 60, 60_000)) {
    res.status(429).json({ error: "Too many GitHub requests. Wait a minute and try again." });
    return;
  }

  if (stage === "github-connection") {
    const summary = await readGithubConnectionSummary(sessionUser.sub);
    res.status(200).json(summary);
    return;
  }

  if (stage === "github-disconnect") {
    const removed = await deleteGithubConnection(sessionUser.sub);
    res.status(removed ? 200 : 503).json(
      removed
        ? { connected: false, disconnected: true, note: "Quantora deleted its copy of your GitHub authorization. Revoke the app in GitHub settings to invalidate the token itself." }
        : { error: "Could not remove the stored GitHub connection. Nothing was changed." },
    );
    return;
  }

  const principal = await readGithubPrincipal(sessionUser.sub);
  if (!principal) {
    res.status(412).json({ error: NOT_CONNECTED, needsGithubConnection: true });
    return;
  }

  if (stage === "github-auto-pr") {
    if (req.body && typeof req.body.enabled === "boolean") {
      const saved = await setGithubAutoPrEnabled(sessionUser.sub, req.body.enabled);
      if (!saved) {
        res.status(503).json({ error: "Could not save this setting. Nothing was changed." });
        return;
      }
      res.status(200).json({ autoPrEnabled: req.body.enabled });
      return;
    }
    const autoPrEnabled = await readGithubAutoPrEnabled(sessionUser.sub);
    res.status(200).json({ autoPrEnabled });
    return;
  }

  if (stage === "github-list-repos") {
    try {
      const repositories = await listRepositories({ principal, limit: Number(req.body?.limit) || 50 });
      res.status(200).json({ repositories, actedAs: principal.login });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Could not list your repositories." });
    }
    return;
  }

  if (isRepositorylessGithubStage(stage)) {
    try {
      const owner = String(req.body?.owner || principal.login);
      const name = String(req.body?.name || "");
      // A deployment narrowed to specific repositories must not be able to
      // create its way out of that boundary.
      assertRepositoryWithinDeploymentBoundary(owner, name);
      const created = await createRepository({ principal }, {
        owner,
        name,
        description: String(req.body?.description || ""),
        isPrivate: req.body?.isPrivate !== false,
      });
      res.status(201).json({ ...created, actedAs: principal.login });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "The repository was not created." });
    }
    return;
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGithubRepositoryUrl(String(req.body?.repoUrl || "")));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Enter a GitHub repository URL." });
    return;
  }

  try {
    // Reads are bounded by the user's own GitHub permissions and need no
    // deployment allowlist. Writes may additionally be narrowed by one.
    if (isGithubWriteStage(stage)) assertRepositoryWithinDeploymentBoundary(owner, repo);
    await dispatch({ stage, req, res, principal, owner, repo });
  } catch (error: any) {
    // A refusal is not an outage. Everything thrown below this line is either
    // GitHub declining or Quantora declining on GitHub's behalf, and both are
    // 400-class answers the user can act on.
    res.status(400).json({ error: error?.message || "The GitHub action did not complete.", repository: `${owner}/${repo}` });
  }
}

async function dispatch(input: {
  stage: string;
  req: any;
  res: any;
  principal: GithubPrincipal;
  owner: string;
  repo: string;
}): Promise<void> {
  const { stage, req, res, principal, owner, repo } = input;
  const context = { principal, owner, repo };

  if (stage === "github-list-prs") {
    const pullRequests = await listPullRequests({
      principal,
      owner,
      repo,
      state: req.body?.state === "closed" || req.body?.state === "all" ? req.body.state : "open",
      limit: Number(req.body?.limit) || 20,
    });
    res.status(200).json({ repository: `${owner}/${repo}`, pullRequests });
    return;
  }

  if (stage === "github-list-issues") {
    const issues = await listIssues({ principal, owner, repo, limit: Number(req.body?.limit) || 20 });
    res.status(200).json({ repository: `${owner}/${repo}`, issues });
    return;
  }

  if (stage === "github-checkout") {
    const checkout = await checkoutRepository({
      principal,
      owner,
      repo,
      branch: String(req.body?.branch || ""),
    });
    res.status(200).json({
      ...checkout,
      // The caller must be able to say what is missing without recomputing it.
      notice: describeCheckoutOmissions(checkout),
    });
    return;
  }

  if (stage === "github-list-branches") {
    const branches = await listBranches({
      principal,
      owner,
      repo,
      defaultBranch: String(req.body?.defaultBranch || ""),
    });
    res.status(200).json({ repository: `${owner}/${repo}`, branches });
    return;
  }

  if (stage === "github-read-pr") {
    const number = Number(req.body?.number);
    if (!Number.isInteger(number) || number <= 0) {
      res.status(400).json({ error: "A pull request number is required." });
      return;
    }
    const brief = await readPullRequest({ principal, owner, repo, number });
    res.status(200).json({ ...brief, context: renderPullRequestBrief(brief) });
    return;
  }

  if (stage === "github-comment") {
    const result = await commentOnPullRequest(context, {
      number: Number(req.body?.number),
      body: String(req.body?.body || ""),
    });
    res.status(201).json({ posted: true, url: result.url, actedAs: principal.login, access: result.permission.level });
    return;
  }

  if (stage === "github-create-pr") {
    const result = await createPullRequest(context, {
      title: String(req.body?.title || ""),
      head: String(req.body?.head || ""),
      base: String(req.body?.base || ""),
      body: String(req.body?.body || ""),
      draft: req.body?.draft !== false,
    });
    res.status(201).json({ ...result.pullRequest, actedAs: principal.login, access: result.permission.level });
    return;
  }

  if (stage === "github-push") {
    const result = await pushFilesToRepositoryFromBase(context, {
      files: req.body?.files,
      message: String(req.body?.message || ""),
      branch: String(req.body?.branch || ""),
      baseBranch: String(req.body?.baseBranch || ""),
    });
    res.status(201).json({
      pushed: true,
      ...result,
      access: result.permission.level,
      actedAs: principal.login,
      repository: `${owner}/${repo}`,
    });
    return;
  }

  if (stage === "github-merge-pr") {
    const result = await mergePullRequest(context, {
      number: Number(req.body?.number),
      expectedHeadSha: String(req.body?.expectedHeadSha || ""),
      mergeMethod: req.body?.mergeMethod,
    });
    res.status(200).json({ ...result, actedAs: principal.login, access: result.permission.level });
    return;
  }

  res.status(400).json({ error: `Unknown GitHub stage "${stage}".` });
}
