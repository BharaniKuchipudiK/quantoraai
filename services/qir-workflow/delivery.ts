import { readQirRun } from '../../api/_lib/qir-run-store.js';
import { loadQirCodingWorkspace } from '../../api/_lib/qir-desk-workspace.js';
import { vfsFileText } from '../../src/lib/desk-checkpoints.js';
import { verifyQirRepositoryRuntime } from '../../api/_lib/qir-repository-runtime.js';
import { readGithubPrincipal } from '../../api/_lib/github-connection-store.js';
import { pushFilesToRepositoryFromBase } from '../../api/_lib/github-push-from-base.js';
import { createPullRequest, mergePullRequest, type GithubWriteContext } from '../../api/_lib/github-actions.js';
import { readPullRequest } from '../../api/_lib/github-intelligence.js';
import { resolveVercelToken, listDeployments, getDeployment } from '../../api/_lib/vercel-deployments.js';
import { deliverCodingChange } from '../../api/_lib/coding-delivery-orchestrator.js';

export type CodingDeliveryWorkflowInput = {
  userSub: string;
  runId: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  title: string;
  body?: string;
  vercelProject: string;
  vercelTeamId?: string;
};

const CI_WAIT_MS = 4 * 60_000;
const DEPLOY_WAIT_MS = 4 * 60_000;
const POLL_MS = 5_000;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function validCodingDeliveryInput(value: unknown): value is CodingDeliveryWorkflowInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as CodingDeliveryWorkflowInput;
  return Boolean(
    text(input.userSub)
    && text(input.runId)
    && text(input.owner)
    && text(input.repo)
    && text(input.branch)
    && text(input.title)
    && text(input.vercelProject),
  );
}

function normalizeWorkspaceVfs(input: Record<string, unknown>): Record<string, string> {
  const vfs: Record<string, string> = {};
  for (const [path, value] of Object.entries(input || {})) {
    const file = vfsFileText(value);
    if (file !== null) vfs[path] = file;
  }
  return vfs;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCi(input: {
  principal: NonNullable<Awaited<ReturnType<typeof readGithubPrincipal>>>;
  owner: string;
  repo: string;
  number: number;
  expectedHeadSha: string;
}) {
  const deadline = Date.now() + CI_WAIT_MS;
  while (true) {
    const brief = await readPullRequest({
      principal: input.principal,
      owner: input.owner,
      repo: input.repo,
      number: input.number,
    });
    const headSha = brief.summary.headSha;
    if (headSha !== input.expectedHeadSha) {
      return {
        status: 'failed' as const,
        headSha,
        detail: `PR #${input.number} moved to ${headSha.slice(0, 12)} while waiting for CI.`,
      };
    }
    if (brief.checks.state === 'failing') {
      const failures = brief.checks.failing.map(item => `${item.name}: ${item.conclusion}`).join('; ');
      return { status: 'failed' as const, headSha, detail: failures || 'One or more required checks failed.' };
    }
    if (brief.checks.state === 'passed') {
      return {
        status: 'passed' as const,
        headSha,
        detail: `${brief.checks.total} GitHub check(s) completed with none failing on the exact head.`,
      };
    }
    if (brief.checks.state === 'none') {
      return { status: 'failed' as const, headSha, detail: 'No GitHub CI checks ran on this head; absence of checks is not a pass.' };
    }
    if (Date.now() >= deadline) {
      return { status: 'failed' as const, headSha, detail: 'GitHub CI did not finish inside the bounded delivery window.' };
    }
    await sleep(POLL_MS);
  }
}

async function waitForProductionDeployment(input: {
  token: string;
  project: string;
  teamId?: string;
  mergeSha: string;
}) {
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  let lastState = 'not-found';
  while (true) {
    const recent = await listDeployments({
      token: input.token,
      project: input.project,
      teamId: input.teamId,
      target: 'production',
      limit: 12,
    });
    for (const item of recent) {
      const detail = await getDeployment({
        token: input.token,
        deploymentId: item.id,
        teamId: input.teamId,
      });
      if (detail.gitCommitSha !== input.mergeSha) continue;
      lastState = detail.state;
      if (detail.state === 'READY') {
        return {
          ready: true,
          mergeSha: input.mergeSha,
          deploymentRef: detail.id,
          detail: `Vercel production deployment ${detail.id} is READY for merge ${input.mergeSha.slice(0, 12)}.`,
          url: detail.url,
        };
      }
      if (detail.state === 'ERROR' || detail.state === 'CANCELED') {
        return {
          ready: false,
          mergeSha: input.mergeSha,
          deploymentRef: detail.id,
          detail: `Vercel production deployment ${detail.id} ended in ${detail.state}.`,
          url: detail.url,
        };
      }
    }
    if (Date.now() >= deadline) {
      return {
        ready: false,
        mergeSha: input.mergeSha,
        detail: `No READY Vercel production deployment for merge ${input.mergeSha.slice(0, 12)} appeared in time (last state: ${lastState}).`,
        url: '',
      };
    }
    await sleep(POLL_MS);
  }
}

/**
 * Runs one complete straight-through delivery from the durable Coding workspace.
 * It is called from a Workflow step, so browser closure cannot own its lifetime.
 * CI repair is intentionally not invented here: a failing CI run stops with
 * evidence and the existing Coding repair loop can produce a new candidate.
 */
export async function executeCodingDelivery(input: CodingDeliveryWorkflowInput) {
  if (!validCodingDeliveryInput(input)) throw new Error('Invalid coding delivery input.');

  const persisted = await readQirRun(input.userSub, input.runId);
  if (!persisted) throw new Error('The durable Coding run could not be loaded.');
  const workspace = await loadQirCodingWorkspace(input.userSub, persisted.run);
  if (workspace.status !== 'loaded') throw new Error('The durable Coding workspace could not be loaded.');
  const vfs = normalizeWorkspaceVfs(workspace.vfs);
  if (!Object.keys(vfs).length) throw new Error('The durable Coding workspace has no files to deliver.');

  const principal = await readGithubPrincipal(input.userSub);
  if (!principal) throw new Error('GitHub is not connected for this user.');
  const vercelToken = await resolveVercelToken();
  if (!vercelToken) throw new Error('Vercel deployment diagnostics are not configured.');
  const github: GithubWriteContext = {
    principal,
    owner: input.owner,
    repo: input.repo,
  };

  let productionUrl = '';
  const result = await deliverCodingChange({
    async verifyWorkspace() {
      const runtime = await verifyQirRepositoryRuntime({ vfs });
      if (runtime.status !== 'passed') {
        return {
          ok: false,
          detail: runtime.status === 'failed'
            ? runtime.reason
            : `Repository verification did not run: ${runtime.reason}`,
        };
      }
      return {
        ok: true,
        detail: `Real repository verification passed: ${runtime.commands.join(' -> ')}`,
      };
    },
    async pushBranch() {
      const pushed = await pushFilesToRepositoryFromBase(github, {
        files: Object.entries(vfs).map(([path, content]) => ({ path, content })),
        message: input.title,
        branch: input.branch,
        baseBranch: input.baseBranch,
      });
      return {
        branch: pushed.branch,
        headSha: pushed.commitSha,
        detail: `Pushed ${pushed.fileCount} file(s) to ${pushed.branch} at ${pushed.commitSha.slice(0, 12)}.`,
      };
    },
    async createPullRequest({ branch, headSha }) {
      const created = await createPullRequest(github, {
        title: input.title,
        head: branch,
        base: input.baseBranch,
        body: input.body,
        draft: false,
      });
      const observed = created.pullRequest.headSha;
      return {
        number: created.pullRequest.number,
        headSha: observed || headSha,
        detail: `Opened PR #${created.pullRequest.number} on ${branch}.`,
      };
    },
    async waitForCi({ pullRequestNumber, expectedHeadSha }) {
      return waitForCi({
        principal,
        owner: input.owner,
        repo: input.repo,
        number: pullRequestNumber,
        expectedHeadSha,
      });
    },
    async mergePullRequest({ pullRequestNumber, expectedHeadSha }) {
      const merged = await mergePullRequest(github, {
        number: pullRequestNumber,
        expectedHeadSha,
        mergeMethod: 'squash',
      });
      return {
        merged: merged.merged,
        mergeSha: merged.sha,
        detail: merged.message,
      };
    },
    async waitForProductionDeployment({ mergeSha }) {
      const deployment = await waitForProductionDeployment({
        token: vercelToken,
        project: input.vercelProject,
        teamId: input.vercelTeamId,
        mergeSha,
      });
      productionUrl = deployment.url;
      return deployment;
    },
    async verifyProduction() {
      if (!productionUrl) return { ok: false, detail: 'Vercel did not return a production URL to verify.' };
      try {
        const response = await fetch(productionUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        });
        return response.ok
          ? { ok: true, detail: `Production smoke returned HTTP ${response.status} from ${productionUrl}.` }
          : { ok: false, detail: `Production smoke returned HTTP ${response.status} from ${productionUrl}.` };
      } catch (error) {
        return {
          ok: false,
          detail: `Production smoke could not reach ${productionUrl}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  }, {
    autonomousMergeApproved: true,
    maxCiRepairs: 0,
  });

  return result;
}
