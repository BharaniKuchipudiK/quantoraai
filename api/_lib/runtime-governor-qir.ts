import type { QirRunStatus } from './qir-contracts.js';
import {
  evaluateRuntimeOutcome,
  type OutcomeCriterion,
  type OutcomeExecutionEvidence,
} from './runtime-outcome-evaluator.js';
import { observeRuntimeLifecycle, type RuntimeLifecycleState, type RuntimeGovernorSink } from './runtime-governor.js';

export function runtimeStateForQir(status: QirRunStatus): RuntimeLifecycleState {
  switch (status) {
    case 'QUEUED': return 'received';
    case 'UNDERSTANDING':
    case 'PLANNING': return 'planned';
    case 'VERIFYING':
    case 'OBSERVING': return 'validating';
    case 'REPAIRING':
    case 'REPLANNING': return 'recovering';
    case 'COMPLETE': return 'completed';
    case 'FAILED_TERMINAL': return 'failed';
    default: return 'executing';
  }
}

export async function observeQirRunStatus(input: {
  userSub: string;
  runId: string;
  status: QirRunStatus;
  reason?: string | null;
  evidenceRef?: string | null;
  outcome?: {
    originalIntent: string | null;
    criteria: OutcomeCriterion[];
    evidence: OutcomeExecutionEvidence[];
  } | null;
}, sink?: RuntimeGovernorSink) {
  const evaluation = input.outcome ? evaluateRuntimeOutcome(input.outcome) : null;
  let state = runtimeStateForQir(input.status);

  // A claimed QIR completion is only projected as completed when the outcome
  // evaluator can prove it. Concrete failure becomes failed; missing proof
  // remains validating rather than being promoted to a terminal success.
  if (input.status === 'COMPLETE' && evaluation) {
    if (evaluation.status === 'failed') state = 'failed';
    else if (evaluation.status === 'indeterminate') state = 'validating';
  }

  const evaluatedReason = evaluation
    ? `outcome:${evaluation.status}${evaluation.modelJudgeRequired ? ':model-judge-required' : ''}`
    : null;
  const evaluatedEvidenceRef = evaluation?.evidenceRefs[0] || null;

  return observeRuntimeLifecycle({
    correlationId: input.runId,
    runId: input.runId,
    userSub: input.userSub,
    source: 'qir',
    state,
    terminal: state === 'completed' || state === 'failed',
    verified: state === 'completed' && (!evaluation || evaluation.status === 'satisfied'),
    reason: input.reason || evaluatedReason || input.status.toLowerCase(),
    evidenceRef: input.evidenceRef || evaluatedEvidenceRef || input.runId,
  }, sink);
}
