export type CodingDeliveryStage =
  | 'BUILD'
  | 'VERIFY'
  | 'PR'
  | 'CI'
  | 'MERGE'
  | 'DEPLOY'
  | 'PRODUCTION_VERIFIED'
  | 'FAILED';

export type CodingDeliveryEvidence = {
  stage: CodingDeliveryStage;
  ok: boolean;
  detail: string;
  ref?: string;
};

export type CodingDeliveryResult = {
  ok: boolean;
  stage: CodingDeliveryStage;
  pullRequestNumber?: number;
  headSha?: string;
  mergeSha?: string;
  deploymentRef?: string;
  repairs: number;
  evidence: CodingDeliveryEvidence[];
  summary: string;
};

type VerifyResult = {
  ok: boolean;
  detail: string;
};

type PushResult = {
  branch: string;
  headSha: string;
  detail?: string;
};

type PullRequestResult = {
  number: number;
  headSha: string;
  detail?: string;
};

type CiResult = {
  status: 'passed' | 'failed';
  headSha: string;
  detail: string;
};

type MergeResult = {
  merged: boolean;
  mergeSha: string;
  detail?: string;
};

type DeploymentResult = {
  ready: boolean;
  mergeSha: string;
  deploymentRef?: string;
  detail: string;
};

export type CodingDeliveryAdapters = {
  verifyWorkspace: () => Promise<VerifyResult>;
  pushBranch: () => Promise<PushResult>;
  createPullRequest: (input: { branch: string; headSha: string }) => Promise<PullRequestResult>;
  waitForCi: (input: { pullRequestNumber: number; expectedHeadSha: string }) => Promise<CiResult>;
  repairAfterCiFailure?: (input: {
    pullRequestNumber: number;
    failedHeadSha: string;
    ciDetail: string;
    attempt: number;
  }) => Promise<{ repaired: boolean; detail: string }>;
  mergePullRequest: (input: {
    pullRequestNumber: number;
    expectedHeadSha: string;
  }) => Promise<MergeResult>;
  waitForProductionDeployment: (input: { mergeSha: string }) => Promise<DeploymentResult>;
  verifyProduction: (input: { mergeSha: string; deploymentRef?: string }) => Promise<VerifyResult>;
};

export type CodingDeliveryOptions = {
  /**
   * This must come from an explicit product-level opt-in / approval boundary.
   * The controller will never infer permission to merge from model confidence.
   */
  autonomousMergeApproved: boolean;
  maxCiRepairs?: number;
};

function shortSha(value: string | undefined): string {
  return String(value || '').slice(0, 12);
}

function failed(
  stage: CodingDeliveryStage,
  repairs: number,
  evidence: CodingDeliveryEvidence[],
  detail: string,
  partial: Partial<CodingDeliveryResult> = {},
): CodingDeliveryResult {
  evidence.push({ stage: 'FAILED', ok: false, detail });
  return {
    ok: false,
    stage,
    repairs,
    evidence,
    summary: `Delivery stopped at ${stage}: ${detail}`,
    ...partial,
  };
}

/**
 * Evidence-gated autonomous delivery for Coding Desk.
 *
 * This controller intentionally does not contain GitHub/Vercel HTTP calls. It
 * composes the existing principal-bound GitHub writes, repository verifier and
 * deployment observers behind one fail-closed state machine. Every irreversible
 * step is reached only after objective evidence from the prior step.
 *
 * Invariants:
 * - repository verification must pass before anything is pushed;
 * - CI must be green on the exact head SHA that is merged;
 * - a moved head fails closed instead of silently merging new code;
 * - retries are bounded;
 * - deployment must correspond to the merge SHA;
 * - production smoke/readiness must pass before completion is claimed.
 */
export async function deliverCodingChange(
  adapters: CodingDeliveryAdapters,
  options: CodingDeliveryOptions,
): Promise<CodingDeliveryResult> {
  const evidence: CodingDeliveryEvidence[] = [];
  const maxCiRepairs = Math.max(0, Math.min(3, options.maxCiRepairs ?? 1));
  let repairs = 0;

  const verification = await adapters.verifyWorkspace();
  evidence.push({ stage: 'VERIFY', ok: verification.ok, detail: verification.detail });
  if (!verification.ok) {
    return failed('VERIFY', repairs, evidence, verification.detail);
  }

  let pushed = await adapters.pushBranch();
  evidence.push({
    stage: 'BUILD',
    ok: true,
    detail: pushed.detail || `Pushed ${shortSha(pushed.headSha)} to ${pushed.branch}.`,
    ref: pushed.headSha,
  });

  let pullRequest = await adapters.createPullRequest({ branch: pushed.branch, headSha: pushed.headSha });
  if (pullRequest.headSha !== pushed.headSha) {
    return failed(
      'PR',
      repairs,
      evidence,
      `Pull request head ${shortSha(pullRequest.headSha)} did not match pushed head ${shortSha(pushed.headSha)}.`,
      { pullRequestNumber: pullRequest.number, headSha: pushed.headSha },
    );
  }
  evidence.push({
    stage: 'PR',
    ok: true,
    detail: pullRequest.detail || `Opened PR #${pullRequest.number} at ${shortSha(pullRequest.headSha)}.`,
    ref: String(pullRequest.number),
  });

  while (true) {
    const ci = await adapters.waitForCi({
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pushed.headSha,
    });

    if (ci.headSha !== pushed.headSha) {
      return failed(
        'CI',
        repairs,
        evidence,
        `PR #${pullRequest.number} moved from ${shortSha(pushed.headSha)} to ${shortSha(ci.headSha)} while CI was running.`,
        { pullRequestNumber: pullRequest.number, headSha: pushed.headSha },
      );
    }

    evidence.push({ stage: 'CI', ok: ci.status === 'passed', detail: ci.detail, ref: ci.headSha });
    if (ci.status === 'passed') break;

    if (!adapters.repairAfterCiFailure || repairs >= maxCiRepairs) {
      return failed('CI', repairs, evidence, ci.detail, {
        pullRequestNumber: pullRequest.number,
        headSha: pushed.headSha,
      });
    }

    repairs += 1;
    const repair = await adapters.repairAfterCiFailure({
      pullRequestNumber: pullRequest.number,
      failedHeadSha: pushed.headSha,
      ciDetail: ci.detail,
      attempt: repairs,
    });
    if (!repair.repaired) {
      return failed('CI', repairs, evidence, repair.detail, {
        pullRequestNumber: pullRequest.number,
        headSha: pushed.headSha,
      });
    }

    const repairedVerification = await adapters.verifyWorkspace();
    evidence.push({ stage: 'VERIFY', ok: repairedVerification.ok, detail: repairedVerification.detail });
    if (!repairedVerification.ok) {
      return failed('VERIFY', repairs, evidence, repairedVerification.detail, {
        pullRequestNumber: pullRequest.number,
        headSha: pushed.headSha,
      });
    }

    const nextPush = await adapters.pushBranch();
    if (nextPush.branch !== pushed.branch) {
      return failed(
        'BUILD',
        repairs,
        evidence,
        `Repair changed delivery branch from ${pushed.branch} to ${nextPush.branch}; refusing to continue the existing PR.`,
        { pullRequestNumber: pullRequest.number, headSha: pushed.headSha },
      );
    }
    pushed = nextPush;
    evidence.push({
      stage: 'BUILD',
      ok: true,
      detail: nextPush.detail || `Pushed repair ${shortSha(nextPush.headSha)} to ${nextPush.branch}.`,
      ref: nextPush.headSha,
    });
  }

  if (!options.autonomousMergeApproved) {
    return failed(
      'MERGE',
      repairs,
      evidence,
      `PR #${pullRequest.number} is verified, but autonomous merge was not approved for this delivery.`,
      { pullRequestNumber: pullRequest.number, headSha: pushed.headSha },
    );
  }

  const merge = await adapters.mergePullRequest({
    pullRequestNumber: pullRequest.number,
    expectedHeadSha: pushed.headSha,
  });
  if (!merge.merged || !merge.mergeSha) {
    return failed('MERGE', repairs, evidence, merge.detail || 'GitHub did not confirm the pull request was merged.', {
      pullRequestNumber: pullRequest.number,
      headSha: pushed.headSha,
    });
  }
  evidence.push({
    stage: 'MERGE',
    ok: true,
    detail: merge.detail || `Merged PR #${pullRequest.number} as ${shortSha(merge.mergeSha)}.`,
    ref: merge.mergeSha,
  });

  const deployment = await adapters.waitForProductionDeployment({ mergeSha: merge.mergeSha });
  if (deployment.mergeSha !== merge.mergeSha) {
    return failed(
      'DEPLOY',
      repairs,
      evidence,
      `Production deployment points at ${shortSha(deployment.mergeSha)}, expected merge ${shortSha(merge.mergeSha)}.`,
      {
        pullRequestNumber: pullRequest.number,
        headSha: pushed.headSha,
        mergeSha: merge.mergeSha,
        deploymentRef: deployment.deploymentRef,
      },
    );
  }
  evidence.push({
    stage: 'DEPLOY',
    ok: deployment.ready,
    detail: deployment.detail,
    ref: deployment.deploymentRef,
  });
  if (!deployment.ready) {
    return failed('DEPLOY', repairs, evidence, deployment.detail, {
      pullRequestNumber: pullRequest.number,
      headSha: pushed.headSha,
      mergeSha: merge.mergeSha,
      deploymentRef: deployment.deploymentRef,
    });
  }

  const production = await adapters.verifyProduction({
    mergeSha: merge.mergeSha,
    deploymentRef: deployment.deploymentRef,
  });
  evidence.push({ stage: 'PRODUCTION_VERIFIED', ok: production.ok, detail: production.detail });
  if (!production.ok) {
    return failed('PRODUCTION_VERIFIED', repairs, evidence, production.detail, {
      pullRequestNumber: pullRequest.number,
      headSha: pushed.headSha,
      mergeSha: merge.mergeSha,
      deploymentRef: deployment.deploymentRef,
    });
  }

  const repairWords = repairs === 0 ? 'CI passed' : `CI failed ${repairs === 1 ? 'once' : `${repairs} times`}, I repaired it, CI passed`;
  return {
    ok: true,
    stage: 'PRODUCTION_VERIFIED',
    pullRequestNumber: pullRequest.number,
    headSha: pushed.headSha,
    mergeSha: merge.mergeSha,
    deploymentRef: deployment.deploymentRef,
    repairs,
    evidence,
    summary: `I made the change, tested it, opened PR #${pullRequest.number}, ${repairWords}, I merged exact SHA ${shortSha(pushed.headSha)}, Vercel deployed merge ${shortSha(merge.mergeSha)}, and production is healthy.`,
  };
}
