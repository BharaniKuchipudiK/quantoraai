import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordBrowserInitializationFailure } from './submission.js';
import { isValidQirRunSnapshot } from '../../api/_lib/qir-run-store.js';
import { readQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

const env = {
  QIR_BROWSER_PILOT_ENABLED: 'true',
  QIR_BROWSER_PILOT_USER_SUB: 'pilot-user',
  QIR_BROWSER_PILOT_SESSION_ID: 'pilot-desk',
  QIR_BROWSER_PILOT_RUN_ID: 'pilot-init-failure',
};
const input = {
  userSub: 'pilot-user',
  sessionId: 'pilot-desk',
  runId: 'pilot-init-failure',
  goal: 'Build a responsive website',
  workspaceHash: hashVfsContent({ 'index.html': '<html>Saved</html>' }),
};

function configure(t: any) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value as string;
    }
  });
}

test('exhausted browser initialization becomes a durable visible terminal run', async (t) => {
  configure(t);
  let saved: any = null;
  const run = await recordBrowserInitializationFailure(
    input,
    'Saved workspace remained unavailable after bounded initialization retries.',
    {
      read: async () => saved,
      create: async (_userSub: string, candidate: any) => {
        saved = { run: candidate, storageVersion: 1, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt };
        return { status: 'created' as const, record: saved };
      },
    },
  );

  assert.equal(run.status, 'FAILED_TERMINAL');
  assert.equal(run.steps[0]?.status, 'rejected');
  assert.equal(run.observations[0]?.error?.retryable, false);
  assert.equal(run.observations[0]?.error?.recoveryExhausted, true);
  assert.equal(run.observations[0]?.evidence[0]?.kind, 'runtime.initialization_retries_exhausted');
  assert.equal(readQirWorkingContext(run)?.projectState?.sessionId, 'pilot-desk');
  assert.equal(isValidQirRunSnapshot(run), true);
});

test('final workflow initialization retry records the terminal result instead of vanishing', () => {
  const source = readFileSync(new URL('./workflow.ts', import.meta.url), 'utf8');
  assert.match(source, /getStepMetadata/);
  assert.match(source, /INITIALIZE_MAX_RETRIES\s*=\s*3/);
  assert.match(source, /attempt\s*>=\s*INITIALIZE_MAX_RETRIES\s*\+\s*1/);
  assert.match(source, /recordBrowserInitializationFailure\(input, error\.message\)/);
  assert.match(source, /initialize\.maxRetries\s*=\s*INITIALIZE_MAX_RETRIES/);
});
