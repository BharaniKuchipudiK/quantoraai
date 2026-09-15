import { FatalError, RetryableError } from 'workflow';
import { browserSubmissionRun, validBrowserSubmission, type BrowserPilotSubmission } from '../../api/_lib/qir-browser-pilot.js';
import { createQirRun, readQirRun } from '../../api/_lib/qir-run-store.js';
import { readQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import { loadQirDeskWorkspace } from '../../api/_lib/qir-desk-workspace.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

function matchesBrowserSubmission(run: ReturnType<typeof browserSubmissionRun>, input: BrowserPilotSubmission) {
  const context = readQirWorkingContext(run)?.projectState;
  return run.goal.statement === input.goal && context?.sessionId === input.sessionId
    && context?.executionOwner === 'server' && context?.submissionHash === input.workspaceHash;
}

export async function initializeBrowserSubmission(input: BrowserPilotSubmission,
  ports = { create: createQirRun, read: readQirRun, load: loadQirDeskWorkspace }) {
  if (!validBrowserSubmission(input)) throw new FatalError('Browser pilot is disabled or outside its scope.');
  const existing = await ports.read(input.userSub, input.runId);
  if (existing) {
    if (!matchesBrowserSubmission(existing.run, input)) throw new FatalError('This pilot run already belongs to another submission.');
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
  if (!matchesBrowserSubmission(created.record.run, input)) throw new FatalError('Another submission owns this pilot run.');
}

/**
 * Workflow retries happen before a normal browser-pilot row exists. If all
 * bounded initialization attempts are exhausted, persist a terminal QIR row so
 * a closed/reopened browser sees an evidence-backed failure instead of an
 * eternal "scheduled" placeholder.
 *
 * This is deliberately create-only. If another worker won the race and created
 * the real run, that winning run remains authoritative and is never overwritten.
 */
export async function recordBrowserInitializationFailure(
  input: BrowserPilotSubmission,
  detail = 'Saved workspace remained unavailable after bounded initialization retries.',
  ports = { create: createQirRun, read: readQirRun },
) {
  if (!validBrowserSubmission(input)) throw new FatalError('Browser pilot is disabled or outside its scope.');
  const existing = await ports.read(input.userSub, input.runId);
  if (existing) {
    if (!matchesBrowserSubmission(existing.run, input)) throw new FatalError('This pilot run already belongs to another submission.');
    return existing.run;
  }

  const now = new Date().toISOString();
  const base = browserSubmissionRun(input);
  const actionId = base.cursor.actionId || 'browser-pilot-initialize';
  const run = {
    ...base,
    status: 'FAILED_TERMINAL' as const,
    steps: base.steps.map((step) => ({ ...step, status: 'rejected' as const })),
    observations: [{
      observationId: 'browser-pilot-initialization-exhausted',
      runId: base.runId,
      actionId,
      kind: 'runtime' as const,
      status: 'failure' as const,
      observedAt: now,
      evidence: [{
        evidenceId: 'browser-pilot-initialization-exhausted-evidence',
        source: 'runtime' as const,
        kind: 'runtime.initialization_retries_exhausted',
        actionId,
        ref: `desk:${input.sessionId}`,
        observedAt: now,
      }],
      error: {
        code: 'INTERNAL_INVARIANT' as const,
        message: String(detail || 'Background initialization failed.').slice(0, 500),
        retryable: false,
        recoveryExhausted: true,
      },
    }],
    updatedAt: now,
  };

  const created = await ports.create(input.userSub, run);
  if (created.status === 'created') return created.record.run;

  // A create conflict may mean another worker completed initialization between
  // our final read and write. Re-read and preserve that winner if it is ours.
  const winner = await ports.read(input.userSub, input.runId);
  if (winner && matchesBrowserSubmission(winner.run, input)) return winner.run;
  throw new RetryableError('Unable to persist the exhausted initialization result.');
}
