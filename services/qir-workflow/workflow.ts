import { initializeBrowserSubmission } from './submission.js';
import type { BrowserPilotSubmission } from '../../api/_lib/qir-browser-pilot.js';
import { FatalError, RetryableError, sleep } from 'workflow';
import { runPilotTransition } from './transition.js';
import { executeCodingDelivery, type CodingDeliveryWorkflowInput } from './delivery.js';
import { codingDeliveryPilotAllows } from './delivery-policy.js';
import { AUTO_DELIVERY_CONTEXT_KEY, deriveAutoDeliveryInput } from './auto-delivery-invocation.js';
import { observeCodingDeliveryResult } from '../../api/_lib/runtime-governor-delivery.js';
import { readGithubAutoDeliverEnabled } from '../../api/_lib/github-connection-store.js';
import { commitQirRunEvent, readQirRun } from '../../api/_lib/qir-run-store.js';
import { attachQirWorkingContext, compactQirWorkingContext, readQirWorkingContext } from '../../api/_lib/qir-context-state.js';

export async function codingPilotWorkflow(userSub: string, runId: string) {
  'use workflow';
  // A finite pilot, not a polling service. Each transition is durably scheduled.
  for (let i = 0; i < 12; i++) {
    const result = await advance(userSub, runId);
    if (result !== 'advanced') {
      if (result === 'COMPLETE') {
        const autoDelivery = await invokeAutoDelivery(userSub, runId);
        return { status: result, runId, autoDelivery };
      }
      return { status: result, runId };
    }
    await sleep('2s');
  }
  return { status: 'transition-limit', runId };
}

async function advance(userSub: string, runId: string) {
  'use step';
  const result = await runPilotTransition(userSub, runId);
  if (result === 'disabled') throw new FatalError('Pilot is disabled or run is not allowed.');
  if (result === 'retry') throw new RetryableError('Run temporarily unavailable.', { retryAfter: '35s' });
  return result;
}
advance.maxRetries = 2;

/**
 * Auto Deliver enters the governed loop only after QIR is durably COMPLETE and
 * independently verified. Before any GitHub/Vercel side effect, we persist a
 * scheduling marker with compare-and-swap. That marker is the idempotency
 * boundary: a later workflow may observe COMPLETE again, but cannot schedule
 * the same delivery twice.
 *
 * This entire step is non-retrying. Ambiguous GitHub/Vercel writes must never
 * be replayed by the Workflow engine; the delivery controller owns its own
 * bounded CI repair and evidence checks.
 */
async function invokeAutoDelivery(userSub: string, runId: string) {
  'use step';
  const record = await readQirRun(userSub, runId);
  if (!record) return { status: 'not-invoked', reason: 'run-not-found' } as const;

  const input = deriveAutoDeliveryInput(userSub, record.run);
  if (!input) return { status: 'not-invoked', reason: 'not-a-verified-delivery-candidate' } as const;

  const autoDeliverEnabled = await readGithubAutoDeliverEnabled(userSub);
  if (!codingDeliveryPilotAllows(input, autoDeliverEnabled)) {
    return { status: 'not-invoked', reason: 'consent-or-target-policy-denied' } as const;
  }

  const context = readQirWorkingContext(record.run);
  if (!context) return { status: 'not-invoked', reason: 'working-context-unavailable' } as const;

  const scheduledAt = new Date().toISOString();
  const markedRun = attachQirWorkingContext(record.run, compactQirWorkingContext({
    run: record.run,
    projectState: {
      ...context.projectState,
      [AUTO_DELIVERY_CONTEXT_KEY]: {
        state: 'scheduled',
        scheduledAt,
        target: `${input.owner}/${input.repo}`,
        vercelProject: input.vercelProject,
        branch: input.branch,
      },
    },
    recentInteractions: context.recentInteractionResidue,
    compactedAt: scheduledAt,
  }));

  const marked = await commitQirRunEvent({
    userSub,
    runId,
    expectedVersion: record.storageVersion,
    eventId: `auto-delivery-scheduled-${runId}`,
    eventType: 'delivery.auto_scheduled',
    run: markedRun,
    payload: {
      target: `${input.owner}/${input.repo}`,
      vercelProject: input.vercelProject,
      branch: input.branch,
    },
  });
  if (marked.status !== 'committed') {
    return { status: 'not-invoked', reason: marked.status === 'conflict' ? 'already-moved' : 'schedule-marker-not-persisted' } as const;
  }

  const result = await executeCodingDelivery(input);
  await observeCodingDeliveryResult({ userSub, runId, result });
  return { status: 'invoked', result } as const;
}
invokeAutoDelivery.maxRetries = 0;

export async function browserPilotWorkflow(input: BrowserPilotSubmission) {
  'use workflow';
  await initialize(input);
  return await codingPilotWorkflow(input.userSub, input.runId);
}
async function initialize(input: BrowserPilotSubmission) {
  'use step';
  await initializeBrowserSubmission(input);
}
initialize.maxRetries = 3;

/**
 * Durable end-to-end Coding delivery.
 *
 * The whole side-effectful delivery is deliberately one non-retrying Workflow
 * step. GitHub push/PR/merge and production deployment are not operations the
 * Workflow engine may replay blindly after a transport ambiguity. The delivery
 * controller itself owns exact-head and evidence checks and returns a terminal
 * stage when one cannot be proven.
 */
export async function codingDeliveryWorkflow(input: CodingDeliveryWorkflowInput) {
  'use workflow';
  return deliver(input);
}

async function deliver(input: CodingDeliveryWorkflowInput) {
  'use step';
  const result = await executeCodingDelivery(input);
  await observeCodingDeliveryResult({ userSub: input.userSub, runId: input.runId, result });
  return result;
}
deliver.maxRetries = 0;
