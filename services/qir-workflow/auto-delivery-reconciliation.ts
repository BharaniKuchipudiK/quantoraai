import { readGithubPrincipal } from '../../api/_lib/github-connection-store.js';
import { listPullRequests, readPullRequest } from '../../api/_lib/github-intelligence.js';
import { githubRequest, type GithubPrincipal } from '../../api/_lib/github-principal.js';
import { resolveVercelToken, listDeployments, getDeployment } from '../../api/_lib/vercel-deployments.js';
import type { CodingDeliveryWorkflowInput } from './delivery.js';

export type AutoDeliveryReconciliation = {
  status: 'nothing-observed' | 'in-progress' | 'failed' | 'production-verified' | 'observation-failed';
  stage: 'PR' | 'CI' | 'MERGE' | 'DEPLOY' | 'PRODUCTION_VERIFIED' | 'UNKNOWN';
  detail: string;
  pullRequestNumber?: number;
  headSha?: string;
  mergeSha?: string;
  deploymentRef?: string;
};

type Ports = {
  readGithubPrincipal: typeof readGithubPrincipal;
  listPullRequests: typeof listPullRequests;
  readPullRequest: typeof readPullRequest;
  readMergeSha: (input: { principal: GithubPrincipal; owner: string; repo: string; number: number }) => Promise<string>;
  resolveVercelToken: typeof resolveVercelToken;
  listDeployments: typeof listDeployments;
  getDeployment: typeof getDeployment;
  fetch: typeof fetch;
};

const defaultPorts: Ports = {
  readGithubPrincipal,
  listPullRequests,
  readPullRequest,
  async readMergeSha(input) {
    const result = await githubRequest(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.number}`,
      { token: input.principal.token },
    );
    if (!result.ok) throw new Error(`GitHub could not inspect merged PR #${input.number} (HTTP ${result.status}).`);
    return String(result.data?.merge_commit_sha || '').trim();
  },
  resolveVercelToken,
  listDeployments,
  getDeployment,
  fetch,
};

/**
 * Read-only reconciliation for a delivery whose durable claim was persisted but
 * whose workflow did not durably record its final result.
 *
 * Critical invariant: this function NEVER pushes, opens a PR, merges, deploys,
 * or repairs. It observes the deterministic branch/PR/deployment identity first
 * so a replacement worker cannot blindly replay an external side effect.
 */
export async function reconcileClaimedAutoDelivery(
  input: CodingDeliveryWorkflowInput,
  ports: Ports = defaultPorts,
): Promise<AutoDeliveryReconciliation> {
  try {
    const principal = await ports.readGithubPrincipal(input.userSub);
    if (!principal) {
      return { status: 'observation-failed', stage: 'UNKNOWN', detail: 'GitHub is no longer connected, so claimed delivery state cannot be reconciled safely.' };
    }

    const pullRequests = await ports.listPullRequests({
      principal,
      owner: input.owner,
      repo: input.repo,
      state: 'all',
      limit: 50,
    });
    const pr = pullRequests.find((candidate) => candidate.headRef === input.branch && candidate.baseRef === (input.baseBranch || 'main'));
    if (!pr) {
      return {
        status: 'nothing-observed',
        stage: 'PR',
        detail: `No pull request currently exists for claimed delivery branch ${input.branch}; Quantora will not replay the earlier push/PR side effects without a separate recovery decision.`,
      };
    }

    if (pr.state === 'open') {
      const brief = await ports.readPullRequest({ principal, owner: input.owner, repo: input.repo, number: pr.number });
      const checks = brief.checks.state;
      if (checks === 'failing') {
        return {
          status: 'failed', stage: 'CI', pullRequestNumber: pr.number, headSha: pr.headSha,
          detail: `Observed PR #${pr.number} at ${pr.headSha.slice(0, 12)} with failing CI after the delivery workflow was interrupted.`,
        };
      }
      return {
        status: 'in-progress', stage: checks === 'passing' ? 'MERGE' : 'CI', pullRequestNumber: pr.number, headSha: pr.headSha,
        detail: checks === 'passing'
          ? `Observed PR #${pr.number} with passing CI on exact head ${pr.headSha.slice(0, 12)}; merge has not been reissued.`
          : `Observed PR #${pr.number}; CI state is ${checks}. No external side effect was replayed.`,
      };
    }

    if (pr.state !== 'merged') {
      return {
        status: 'failed', stage: 'PR', pullRequestNumber: pr.number, headSha: pr.headSha,
        detail: `Observed PR #${pr.number} closed without merge after the delivery workflow was interrupted.`,
      };
    }

    const mergeSha = await ports.readMergeSha({ principal, owner: input.owner, repo: input.repo, number: pr.number });
    if (!mergeSha) {
      return {
        status: 'observation-failed', stage: 'MERGE', pullRequestNumber: pr.number, headSha: pr.headSha,
        detail: `GitHub reports PR #${pr.number} merged but did not provide a merge commit SHA.`,
      };
    }

    const vercelToken = await ports.resolveVercelToken();
    if (!vercelToken) {
      return {
        status: 'observation-failed', stage: 'DEPLOY', pullRequestNumber: pr.number, headSha: pr.headSha, mergeSha,
        detail: 'Vercel is not connected, so the merged delivery cannot be reconciled to production safely.',
      };
    }
    const recent = await ports.listDeployments({
      token: vercelToken,
      project: input.vercelProject,
      teamId: input.vercelTeamId,
      target: 'production',
      limit: 20,
    });

    let exact = null as Awaited<ReturnType<typeof getDeployment>> | null;
    for (const item of recent) {
      const detail = await ports.getDeployment({ token: vercelToken, deploymentId: item.id, teamId: input.vercelTeamId });
      if (detail.gitCommitSha === mergeSha) { exact = detail; break; }
    }
    if (!exact) {
      return {
        status: 'in-progress', stage: 'DEPLOY', pullRequestNumber: pr.number, headSha: pr.headSha, mergeSha,
        detail: `PR #${pr.number} merged as ${mergeSha.slice(0, 12)}, but no exact production deployment is observable yet.`,
      };
    }
    if (exact.state === 'ERROR' || exact.state === 'CANCELED') {
      return {
        status: 'failed', stage: 'DEPLOY', pullRequestNumber: pr.number, headSha: pr.headSha, mergeSha, deploymentRef: exact.id,
        detail: `Exact production deployment ${exact.id} ended in ${exact.state}.`,
      };
    }
    if (exact.state !== 'READY') {
      return {
        status: 'in-progress', stage: 'DEPLOY', pullRequestNumber: pr.number, headSha: pr.headSha, mergeSha, deploymentRef: exact.id,
        detail: `Exact production deployment ${exact.id} is ${exact.state}; no deployment action was replayed.`,
      };
    }

    try {
      const response = await ports.fetch(exact.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        return {
          status: 'failed', stage: 'PRODUCTION_VERIFIED', pullRequestNumber: pr.number, headSha: pr.headSha,
          mergeSha, deploymentRef: exact.id,
          detail: `Exact deployment ${exact.id} is READY but production smoke returned HTTP ${response.status}.`,
        };
      }
      return {
        status: 'production-verified', stage: 'PRODUCTION_VERIFIED', pullRequestNumber: pr.number, headSha: pr.headSha,
        mergeSha, deploymentRef: exact.id,
        detail: `Reconciled interrupted delivery: PR #${pr.number} is merged as ${mergeSha.slice(0, 12)}, exact deployment ${exact.id} is READY, and production smoke returned HTTP ${response.status}.`,
      };
    } catch (error) {
      return {
        status: 'observation-failed', stage: 'PRODUCTION_VERIFIED', pullRequestNumber: pr.number, headSha: pr.headSha,
        mergeSha, deploymentRef: exact.id,
        detail: `Exact deployment ${exact.id} is READY but production smoke could not be observed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } catch (error) {
    return {
      status: 'observation-failed', stage: 'UNKNOWN',
      detail: `Claimed delivery reconciliation failed closed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
