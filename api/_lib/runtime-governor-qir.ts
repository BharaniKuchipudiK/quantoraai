import type { QirRunStatus } from './qir-contracts.js';
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
}, sink?: RuntimeGovernorSink) {
  const state = runtimeStateForQir(input.status);
  return observeRuntimeLifecycle({
    correlationId: input.runId,
    runId: input.runId,
    userSub: input.userSub,
    source: 'qir',
    state,
    terminal: state === 'completed' || state === 'failed',
    verified: state === 'completed',
    reason: input.reason || input.status.toLowerCase(),
    evidenceRef: input.evidenceRef || input.runId,
  }, sink);
}
