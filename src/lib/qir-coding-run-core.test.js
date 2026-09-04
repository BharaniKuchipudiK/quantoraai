import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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

/**
 * THE CONTEXT MANAGER MUST ACTUALLY BE CALLED BY A USER'S ACTION.
 *
 * /api/qir-context, compactQirWorkingContext and the whole bounded-context
 * contract shipped complete on 2026-09-02 — typed, tested, deployed, and called
 * by NOTHING. It was the last QIR entry in the served-route baseline, and the
 * twin of the Resource Governor that #523 found the same way.
 *
 * These cases drive the REAL client, because "the module is complete and its
 * tests pass" is exactly the definition of done that produced two unreachable
 * subsystems.
 */

/** Like stubTransport, but records the URL as well as the body. */
function stubRoutedTransport(contextResponder) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).startsWith('/api/qir-context')) return contextResponder();
    return { ok: true, json: async () => ({ run: EXECUTING_RUN }) };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const CONTEXT_OK = () => ({ ok: true, json: async () => ({ run: EXECUTING_RUN, context: { hash: 'h1' } }) });

test('[was-red] the working context is compacted when the Run advances', async () => {
  const transport = stubRoutedTransport(CONTEXT_OK);
  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({
        enabled: true, sessionId: 's1', goal: 'Build a boutique storefront',
        vfs: { 'index.html': '<h1>hi</h1>', 'app.js': 'console.log(1)' },
        job: { title: 'A shop website' },
      }),
    });
    await client.sync();
    await client.reportPreviewStatus({ kind: 'runtime', status: 'clean' });

    const compaction = transport.calls.find((call) => call.url.startsWith('/api/qir-context'));
    assert.ok(compaction, `nothing called /api/qir-context. Called: ${transport.calls.map((c) => c.url).join(', ')}`);
    assert.equal(compaction.body.runId, EXECUTING_RUN.runId, 'compaction must name the Run it belongs to');
    assert.match(compaction.body.projectState.goal, /boutique storefront/);
  } finally { transport.restore(); }
});

test('compaction sends file NAMES, never file contents', async () => {
  /*
   * A VFS holds megabytes. This crosses the wire on every preview status, and
   * the file inventory is the only thing the durable Run does not already know
   * — the server compacts goal, cursor, blockers and artifacts out of the Run
   * itself.
   */
  const transport = stubRoutedTransport(CONTEXT_OK);
  try {
    const secret = 'SENTINELFILECONTENTZZQ';
    const vfs = {};
    for (let i = 0; i < 250; i += 1) vfs[`file-${i}.js`] = `const x = "${secret}";`;
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'g', vfs, job: { title: 'j' } }),
    });
    await client.sync();
    await client.reportPreviewStatus({ kind: 'runtime', status: 'clean' });

    const compaction = transport.calls.find((call) => call.url.startsWith('/api/qir-context'));
    assert.ok(compaction);
    assert.doesNotMatch(JSON.stringify(compaction.body), new RegExp(secret), 'file contents must never be sent');
    assert.equal(compaction.body.projectState.files.length, 100, 'the inventory must stay bounded');
    assert.equal(compaction.body.projectState.fileCount, 250, 'while still reporting the true total');
  } finally { transport.restore(); }
});

test('[was-red] a build never fails because the context could not be compacted', async () => {
  /*
   * Compaction is an optimisation for a worker that may never arrive. Every
   * failure mode must resolve to silence — the fail-open rule the governor
   * follows, and the invariant #516 added when unreadable bookkeeping sealed
   * whole missions.
   */
  const modes = [
    ['the route is unreachable', () => { throw new Error('ECONNRESET'); }],
    ['storage is unconfigured', () => ({ ok: false, status: 503, json: async () => ({ reason: 'storage-unconfigured' }) })],
    ['the write was refused', () => ({ ok: false, status: 503, json: async () => ({ reason: 'persist-failed' }) })],
    ['a version conflict', () => ({ ok: false, status: 409, json: async () => ({ conflict: true }) })],
    ['the body is unreadable', () => ({ ok: true, json: async () => { throw new Error('bad json'); } })],
  ];
  for (const [why, responder] of modes) {
    const transport = stubRoutedTransport(responder);
    const errors = [];
    try {
      const client = createQirCodingRunClient({
        onRun: () => {}, onError: (e) => errors.push(e),
        readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'g', vfs: {}, job: {} }),
      });
      await client.sync();
      const settled = await client.reportPreviewStatus({ kind: 'runtime', status: 'clean' });
      assert.ok(settled, `${why}: the caller must still get its Run back`);
      assert.equal(errors.length, 0, `${why}: compaction must not surface an error to the desk`);
    } finally { transport.restore(); }
  }
});

test('[was-red] compaction is automatic, not a method someone must remember to call', async () => {
  /*
   * THE DESIGN DECISION, pinned because it is the whole point.
   *
   * Exposing compactWorkingContext() on the client and trusting a caller to
   * invoke it is how BOTH the Governor and the Context Manager came to be
   * unwired: a method nobody calls is indistinguishable from one nobody has
   * called yet, and the served-route gate would report /api/qir-context as
   * reachable while no user action ever reached it — a false clean, of exactly
   * the kind that gate exists to prevent.
   */
  const source = readFileSync(new URL('./qir-coding-run-core.js', import.meta.url), 'utf8');
  const returned = source.slice(source.lastIndexOf('  return {'));
  assert.doesNotMatch(returned, /compactWorkingContext/, 'it must NOT be exported for someone to remember');
  assert.equal(
    (source.match(/await compactWorkingContext\(/g) || []).length,
    2,
    'both paths where the Run advances — promotion and runtime observation — must compact',
  );
});
