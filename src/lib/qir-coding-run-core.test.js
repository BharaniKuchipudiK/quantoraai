import assert from 'node:assert/strict';
import test from 'node:test';
import { qirCodingRunCanStart } from './qir-coding-run-core.js';

const run = (status = 'QUEUED', extras = {}) => ({
  runId: 'coding-run-1',
  status,
  cursor: { stepId: null, actionId: null, attempt: 0 },
  artifacts: [],
  ...extras,
});

test('a durable queued Coding Run exists before an artifact can start execution', () => {
  assert.equal(qirCodingRunCanStart(run(), '', ''), false);
  assert.equal(qirCodingRunCanStart(run(), null, null), false);
});

test('the queued Run starts only after candidate artifact bytes exist', () => {
  assert.equal(qirCodingRunCanStart(run(), 'coding-desk://session/assembly/abc', '<html>ok</html>'), true);
});

test('a QIR-owned model attempt may attach its first artifact without creating a second action', () => {
  const executing = run('EXECUTING', {
    cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
  });
  assert.equal(qirCodingRunCanStart(
    executing,
    'coding-desk://session/assembly/abc',
    '<html>ok</html>',
  ), true);
});

test('an already-artifacted or terminal Run cannot be started again by a late artifact callback', () => {
  const artifact = {
    artifactId: 'coding-desk-vfs',
    generation: 1,
    ref: 'coding-desk://session/assembly/abc#sha256=x',
    state: 'candidate',
    createdByActionId: 'coding-model-action-1',
  };
  assert.equal(qirCodingRunCanStart(run('EXECUTING', {
    cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
    artifacts: [artifact],
  }), 'coding-desk://session/assembly/late', '<html>late</html>'), false);

  for (const status of ['VERIFYING', 'REPAIRING', 'COMPLETE']) {
    assert.equal(qirCodingRunCanStart(run(status), 'coding-desk://session/assembly/abc', '<html>ok</html>'), false);
  }
});

/*
 * ONE OBSERVATION, ONE EVIDENCE ENTRY PER ENGINE THAT ACTUALLY RAN.
 *
 * A chat turn is one attempt from the browser and up to four from the server:
 * api/_lib/chat-handler.ts plans an inference ladder and works down its own
 * rungs behind a single request. Measured against the real modules, recording
 * only the browser's primary produced this:
 *
 *     the server actually burned      : gemini-flash-latest, nemotron-3-super
 *     the durable Run records         : gemini-flash-latest
 *     so turn 2 reroutes to           : nemotron-3-super
 *     RED: turn 2 is sent to an engine the server already burned on this mission.
 *
 * Driven through the REAL client with a stubbed transport, and read back with
 * the REAL reader, because the two halves passing separately is how the last
 * two regressions in this repo shipped.
 */
import { createQirCodingRunClient } from './qir-coding-run-core.js';
import { missionEngineFailures } from './mission-continuation.js';

const EXECUTING_RUN = {
  runId: 'coding-run-1',
  status: 'EXECUTING',
  cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
  artifacts: [],
  observations: [],
};

/** Captures what the client POSTs, and answers with a durable-looking snapshot. */
function stubTransport() {
  const posted = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if (init?.body) posted.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ run: EXECUTING_RUN }) };
  };
  return { posted, restore: () => { globalThis.fetch = original; } };
}

test('[was-red] a failure records every engine the turn actually burned', async () => {
  const transport = stubTransport();
  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'Build a boutique storefront' }),
    });
    // Seed the client's view of the Run so the failure is action-bound.
    await client.sync();
    await client.reportModelFailure({
      kind: 'timeout',
      message: '110s primary rung, then a 55s fallback rung',
      modelIds: ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
    });

    const observed = transport.posted.filter((body) => body.action === 'coding.observe').at(-1);
    assert.ok(observed, `no observation was posted. Sent: ${JSON.stringify(transport.posted).slice(0, 200)}`);
    assert.deepEqual(
      observed.observation.evidence.map((entry) => entry.ref),
      ['model:gemini-flash-latest', 'model:nvidia/nemotron-3-super-120b-a12b:free'],
      'a rung the server burned is just as spent as one the browser chose',
    );
    assert.equal(
      new Set(observed.observation.evidence.map((entry) => entry.evidenceId)).size,
      2,
      'evidence ids must stay unique, or the second entry is not a separate fact',
    );

    // Read it back with the real reader: the round trip is the claim.
    const burned = missionEngineFailures({ observations: [observed.observation] });
    assert.deepEqual(
      [...burned.keys()],
      ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
      'both engines must come back burned, or the next turn is routed into one of them',
    );
  } finally {
    transport.restore();
  }
});

test('an unattributed failure still records the failure, claiming no engine', async () => {
  const transport = stubTransport();
  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'goal' }),
    });
    await client.sync();
    await client.reportModelFailure({ kind: 'transport', message: 'no healthy AI route' });

    const observed = transport.posted.filter((body) => body.action === 'coding.observe').at(-1);
    assert.equal(observed.observation.evidence.length, 1, 'the failure is still evidence, engine or not');
    assert.equal(observed.observation.evidence[0].ref, null, 'no engine known, no engine named');
    assert.equal(
      missionEngineFailures({ observations: [observed.observation] }).size,
      0,
      'and nothing may be burned on a guess',
    );
  } finally {
    transport.restore();
  }
});
