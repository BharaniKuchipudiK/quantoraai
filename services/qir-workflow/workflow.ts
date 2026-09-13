import { initializeBrowserSubmission } from './submission.js';
import type { BrowserPilotSubmission } from '../../api/_lib/qir-browser-pilot.js';
import { FatalError, RetryableError, sleep } from 'workflow';
import { runPilotTransition } from './transition.js';
import { executeCodingDelivery, type CodingDeliveryWorkflowInput } from './delivery.js';

export async function codingPilotWorkflow(userSub: string, runId: string) {
  'use workflow';
  // A finite pilot, not a polling service. Each transition is durably scheduled.
  for (let i = 0; i < 12; i++) {
    const result = await advance(userSub, runId);
    if (result !== 'advanced') return { status: result, runId };
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
  return executeCodingDelivery(input);
}
deliver.maxRetries = 0;
