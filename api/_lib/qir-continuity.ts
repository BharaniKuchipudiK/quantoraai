import { deriveQirContinuation, type QirAgentRun } from './qir-contracts.js';

export const QIR_CONTINUITY_VERSION = 'qir-continuity-2026-09-13.1';

export type QirContinuityDecision =
  | { action: 'stopped'; reason: string; continuation: null; orphanedActionId: null }
  | { action: 'continue'; reason: string; continuation: NonNullable<ReturnType<typeof deriveQirContinuation>>; orphanedActionId: null }
  | { action: 'recover'; reason: string; continuation: NonNullable<ReturnType<typeof deriveQirContinuation>>; orphanedActionId: string };

/**
 * Decide whether durable work can continue under the current worker loop.
 *
 * The key invariant is ownership continuity. An active action persisted by a
 * previous worker must never be blindly replayed by a replacement worker after
 * lease reclaim: the side effect may already have happened even though its
 * observation was never committed. Only the worker loop that claimed the
 * action in this lease may execute it directly.
 */
export function assessQirContinuity(
  run: QirAgentRun,
  ownedActionId: string | null = null,
): QirContinuityDecision {
  const continuation = deriveQirContinuation(run);
  if (!continuation) {
    return { action: 'stopped', reason: `Run ${run.status} has no executable continuation.`, continuation: null, orphanedActionId: null };
  }

  const step = run.steps.find((candidate) => candidate.stepId === continuation.stepId) || null;
  const activeActionId = step?.status === 'active'
    && step.actionId
    && run.cursor.stepId === step.stepId
    && run.cursor.actionId === step.actionId
    ? step.actionId
    : null;

  if (activeActionId && ownedActionId !== activeActionId) {
    return {
      action: 'recover',
      reason: 'Durable state contains an active action not owned by this worker lease; recover before any replay.',
      continuation,
      orphanedActionId: activeActionId,
    };
  }

  return {
    action: 'continue',
    reason: activeActionId ? 'The active action is owned by this worker loop.' : 'Durable state is ready for the next claim.',
    continuation,
    orphanedActionId: null,
  };
}

/** Convert an orphaned in-flight action into a recoverable durable state. */
export function recoverOrphanedQirAction(run: QirAgentRun, now: string): QirAgentRun {
  const decision = assessQirContinuity(run, null);
  if (decision.action !== 'recover') return run;

  const steps = run.steps.map((step) => (
    step.stepId === decision.continuation.stepId
      ? { ...step, status: 'failed_recoverable' as const, actionId: null }
      : step
  ));

  return {
    ...run,
    status: 'REPLANNING',
    steps,
    cursor: {
      ...run.cursor,
      stepId: decision.continuation.stepId,
      actionId: null,
      attempt: run.cursor.attempt + 1,
    },
    updatedAt: now,
  };
}
