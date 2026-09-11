import {
  authorizeWrite,
  normalizeBranchName,
  pushFilesToRepository,
  type GithubWriteContext,
  type PushFilesRequest,
  type PushFilesResult,
} from './github-actions.js';
import { githubRequest } from './github-principal.js';

/**
 * Push desk files to a work branch that is anchored to the branch the user
 * checked out.
 *
 * `pushFilesToRepository` can create a missing branch, but a missing branch has
 * no parent and therefore becomes a new root commit. That is correct for the
 * first push into an empty repository and wrong for a pull-request branch in an
 * existing repository: GitHub then sees unrelated history rather than a change
 * from `main`/the selected base.
 *
 * This seam creates the work branch at the selected base commit first. The
 * existing atomic push then writes the desk as one normal child commit. If the
 * target branch already exists nothing is created and the push keeps its normal
 * fast-forward protection.
 */
export async function pushFilesToRepositoryFromBase(
  context: GithubWriteContext,
  request: PushFilesRequest & { baseBranch?: string },
): Promise<PushFilesResult> {
  const permission = await authorizeWrite(context, 'write');
  const defaultBranch = permission.defaultBranch || 'main';
  const targetBranch = normalizeBranchName(request?.branch, defaultBranch);
  const baseBranch = normalizeBranchName(request?.baseBranch, defaultBranch);

  const owner = encodeURIComponent(context.owner);
  const repo = encodeURIComponent(context.repo);
  const token = context.principal.token;
  const fetchImpl = context.fetchImpl;

  const targetRef = await githubRequest(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
    { token, fetchImpl },
  );

  if (!targetRef.ok && targetRef.status !== 404) {
    throw new Error(`GitHub could not read the target branch "${targetBranch}" (HTTP ${targetRef.status}). Nothing was pushed.`);
  }

  // Existing branch: the atomic push owns concurrency/fast-forward safety.
  if (targetRef.ok) return pushFilesToRepository(context, request);

  // Empty repository first push (normally main -> main): preserve the existing
  // root-commit behavior. There is no base commit to branch from yet.
  if (targetBranch === baseBranch) return pushFilesToRepository(context, request);

  const baseRef = await githubRequest(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    { token, fetchImpl },
  );
  if (baseRef.status === 404) {
    throw new Error(`Base branch "${baseBranch}" does not exist in ${context.owner}/${context.repo}. Pull the repository again and choose an existing base branch before pushing.`);
  }
  if (!baseRef.ok) {
    throw new Error(`GitHub could not read base branch "${baseBranch}" (HTTP ${baseRef.status}). Nothing was pushed.`);
  }

  const baseSha = String(baseRef.data?.object?.sha || '').trim();
  if (!baseSha) throw new Error(`GitHub did not report the commit for base branch "${baseBranch}". Nothing was pushed.`);

  const created = await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    token,
    method: 'POST',
    fetchImpl,
    body: { ref: `refs/heads/${targetBranch}`, sha: baseSha },
  });
  if (created.status === 422) {
    // A race can create the branch between our GET and POST. Re-read it; if it
    // now exists, continue through the normal fast-forward guarded push.
    const raced = await githubRequest(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      { token, fetchImpl },
    );
    if (!raced.ok) {
      throw new Error(`GitHub refused to create work branch "${targetBranch}" from "${baseBranch}". Nothing was pushed.`);
    }
  } else if (!created.ok) {
    throw new Error(`GitHub could not create work branch "${targetBranch}" from "${baseBranch}" (HTTP ${created.status}). Nothing was pushed.`);
  }

  return pushFilesToRepository(context, request);
}
