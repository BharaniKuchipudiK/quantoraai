import { initializeBrowserSubmission } from './submission.js';
import type { BrowserPilotSubmission } from '../../api/_lib/qir-browser-pilot.js';
import { FatalError, RetryableError, sleep } from 'workflow';
import { runPilotTransition } from './transition.js';

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
