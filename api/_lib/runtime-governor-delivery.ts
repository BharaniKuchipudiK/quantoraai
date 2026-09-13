import type { CodingDeliveryResult, CodingDeliveryStage } from './coding-delivery-orchestrator.js';
import { observeRuntimeLifecycle, type RuntimeGovernorSink, type RuntimeLifecycleState } from './runtime-governor.js';

export function runtimeStateForDeliveryStage(stage: CodingDeliveryStage, ok: boolean): RuntimeLifecycleState {
  if (stage === 'FAILED') return 'failed';
  if (stage === 'PRODUCTION_VERIFIED') return ok ? 'completed' : 'failed';
  if (stage === 'VERIFY' || stage === 'CI' || stage === 'DEPLOY') return ok ? 'validating' : 'recovering';
  return 'executing';
}

export async function observeCodingDeliveryResult(input: {
  userSub: string;
  runId: string;
  result: CodingDeliveryResult;
}, sink?: RuntimeGovernorSink): Promise<void> {
  const correlationId = `delivery:${input.runId}`;
  let recoveryCount = 0;
  for (const evidence of input.result.evidence) {
    if (!evidence.ok && evidence.stage !== 'FAILED') recoveryCount += 1;
    if (evidence.stage === 'FAILED' || evidence.stage === 'PRODUCTION_VERIFIED') continue;
    const state = runtimeStateForDeliveryStage(evidence.stage, evidence.ok);
    await observeRuntimeLifecycle({
      correlationId,
      runId: input.runId,
      userSub: input.userSub,
      source: 'delivery',
      state,
      recoveryCount,
      terminal: false,
      verified: false,
      reason: `${evidence.stage.toLowerCase()}:${evidence.ok ? 'passed' : 'failed'}`,
      evidenceRef: evidence.ref || input.runId,
    }, sink);
  }

  await observeRuntimeLifecycle({
    correlationId,
    runId: input.runId,
    userSub: input.userSub,
    source: 'delivery',
    state: input.result.ok ? 'completed' : 'failed',
    terminal: true,
    verified: input.result.ok && input.result.stage === 'PRODUCTION_VERIFIED',
    recoveryCount: input.result.repairs,
    reason: input.result.ok ? 'production-verified' : `delivery-stopped:${input.result.stage.toLowerCase()}`,
    evidenceRef: input.result.deploymentRef || input.result.mergeSha || input.result.headSha || input.runId,
  }, sink);
}
