import { FatalError, RetryableError } from 'workflow';
import { browserSubmissionRun, validBrowserSubmission, type BrowserPilotSubmission } from '../../api/_lib/qir-browser-pilot.js';
import { createQirRun, readQirRun } from '../../api/_lib/qir-run-store.js';
import { readQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import { loadQirDeskWorkspace } from '../../api/_lib/qir-desk-workspace.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

export async function initializeBrowserSubmission(input: BrowserPilotSubmission,
  ports = { create: createQirRun, read: readQirRun, load: loadQirDeskWorkspace }) {
  if (!validBrowserSubmission(input)) throw new FatalError('Browser pilot is disabled or outside its scope.');
  const existing = await ports.read(input.userSub, input.runId);
  const matches = (run: ReturnType<typeof browserSubmissionRun>) => {
    const context = readQirWorkingContext(run)?.projectState;
    return run.goal.statement === input.goal && context?.sessionId === input.sessionId
      && context?.executionOwner === 'server' && context?.submissionHash === input.workspaceHash;
  };
  if (existing) {
    if (!matches(existing.run)) throw new FatalError('This pilot run already belongs to another submission.');
    return;
  }
  let run = browserSubmissionRun(input);
  const workspace = await ports.load(input.userSub, run);
  if (workspace.status !== 'loaded') throw new RetryableError('Saved workspace is temporarily unavailable.');
  if (hashVfsContent(workspace.vfs) !== input.workspaceHash) {
    // Record a visible terminal result, rather than leaving a scheduled row missing forever.
    run = { ...run, status: 'FAILED_TERMINAL', observations: [{
      observationId: 'browser-pilot-source-changed', runId: run.runId, actionId: run.cursor.actionId,
      kind: 'runtime', status: 'failure', observedAt: new Date().toISOString(), evidence: [],
      error: { code: 'INTERNAL_INVARIANT', message: 'The saved workspace changed after submission. Submit the current version in a new run.', retryable: false, recoveryExhausted: true },
    }] };
  }
  const created = await ports.create(input.userSub, run);
  if (created.status !== 'created') throw new RetryableError('Unable to persist the scheduled run.');
  if (!matches(created.record.run)) throw new FatalError('Another submission owns this pilot run.');
}
