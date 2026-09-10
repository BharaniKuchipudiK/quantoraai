import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { qirCodingRunCanStart } from './qir-coding-run-core.js';
import { previewAssemblyFingerprint } from './studio-preview-helpers.js';

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

test('[was-red] real preview assemblies fit the API reference limit on start and recovery', async () => {
  const originalFetch = globalThis.fetch;
  const source = readFileSync(new URL('../../api/qir-runs.ts', import.meta.url), 'utf8');
  const limits = [...source.matchAll(/safeText\(req\.body\?\.artifactRef, (\d+)\)/g)].map((match) => Number(match[1]));
  assert.equal(limits.length, 2, 'exercise both server artifact boundaries');
  const maxRef = Math.min(...limits);
  const code = `<html><body>${'real page content '.repeat(300)}</body></html>`;
  const rawRef = `coding-desk://session/assembly/${previewAssemblyFingerprint({ 'index.html': code })}`;
  assert.ok(rawRef.length > maxRef, 'fixture must reproduce the deployed failure');
  const refs = [];
  try {
    for (const mode of ['start', 'recover', 'healed']) {
      const errors = [];
      const posted = [];
      let snapshot = mode === 'start' ? run() : run('REPAIRING', { artifacts: [{ artifactId: 'coding-desk-vfs', ref: 'old-candidate' }] });
      globalThis.fetch = async (_url, init) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (body.action === 'coding.start' || body.action === 'coding.recover') {
          posted.push(body);
          if (!body.artifactRef || body.artifactRef.length > maxRef) {
            return { ok: false, status: 400, json: async () => ({ error: 'A durable Coding artifact is required.' }) };
          }
          snapshot = { ...snapshot, artifacts: [{ artifactId: 'coding-desk-vfs', ref: `${body.artifactRef}#sha256=server-digest` }] };
        }
        return { ok: true, json: async () => ({ run: snapshot }) };
      };
      const options = { enabled: true, sessionId: 's1', goal: 'build', artifactRef: mode === 'healed' ? '' : rawRef, code };
      const client = createQirCodingRunClient({ onRun: () => {}, onError: (error) => errors.push(error), readOptions: () => options });
      await client.sync();
      if (mode === 'healed') await client.reportHealedArtifact(rawRef, code);
      assert.deepEqual(errors, [], `${mode} must not be rejected by the server reference limit`);
      assert.equal(posted.length, 1);
      assert.equal(posted[0].code, code, 'compact the reference, never truncate the artifact bytes');
      assert.ok(posted[0].artifactRef.length <= maxRef);
      assert.ok(!posted[0].artifactRef.includes('real page content'), 'the locator must not carry source');
      refs.push(posted[0].artifactRef);
      if (mode === 'recover') {
        await client.sync();
        assert.equal(posted.length, 1, 'the same compact candidate must not repeatedly trigger recovery');
        options.artifactRef = `${rawRef}changed-at-the-end`;
        await client.sync();
        assert.equal(posted.length, 2);
        assert.notEqual(posted[1].artifactRef, posted[0].artifactRef, 'hash the entire assembly, not a truncated prefix');
        options.artifactRef += ' ';
        await client.sync();
        assert.equal(posted.length, 3, 'trailing source whitespace can be meaningful');
        assert.notEqual(posted[2].artifactRef, posted[1].artifactRef);
      }
    }
    assert.equal(new Set(refs).size, 1, 'all write paths must derive the same identity');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    await new Promise((resolve) => { setTimeout(resolve, 0); });

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
    await new Promise((resolve) => { setTimeout(resolve, 0); });

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
    await new Promise((resolve) => { setTimeout(resolve, 0); });
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
});

// Exercise the real client at every compaction branch. Counting call sites
// rejects legitimate new recovery paths without proving that any path works.
for (const scenario of [
  { name: 'runtime success', report: { kind: 'runtime', status: 'clean' }, expectedStatus: 'VERIFYING', expectedCalls: ['runtime:success', 'compact'] },
  { name: 'runtime failure', report: { kind: 'runtime', status: 'failed' }, expectedStatus: 'REPAIRING', expectedCalls: ['runtime:failure', 'compact'] },
  { name: 'quality promotion', report: { kind: 'quality', passed: true, score: 95 }, expectedStatus: 'COMPLETE', expectedCalls: ['runtime:success', 'promote', 'compact'] },
  { name: 'missing requested deliverables', report: { kind: 'quality', passed: true, score: 95 }, missing: true, expectedStatus: 'REPAIRING', expectedCalls: ['runtime:success', 'verification:failure', 'compact'] },
]) {
  test(`compaction follows ${scenario.name} without blocking or overwriting the Run`, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    const published = [];
    const errors = [];
    const code = '<html><body>SENTINEL_PRIVATE_FILE_BYTES</body></html>';
    const vfs = scenario.missing ? { 'index.html': code } : {
      'index.html': code, 'parser.py': 'import csv', 'cleaner.py': 'import json', 'README.md': '# Utility',
    };
    const originalVfs = { ...vfs };
    const artifact = { artifactId: 'coding-desk-vfs', generation: 1, ref: 'coding-desk://candidate#sha256=abc' };
    let snapshot = { ...EXECUTING_RUN, artifacts: [artifact] };
    let releaseContext;
    const heldContext = new Promise((resolve) => { releaseContext = resolve; });
    let pendingReport;
    globalThis.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (String(url) === '/api/qir-context') {
        calls.push({ label: 'compact', body, committedStatus: snapshot.status });
        await heldContext;
        // A late bookkeeping response must never replace the newer Run.
        return { ok: true, status: 200, json: async () => ({ run: EXECUTING_RUN }) };
      }
      assert.ok(String(url).startsWith('/api/qir-runs'), 'no unrelated route may be called');
      if (body?.action === 'coding.observe') {
        const observation = body.observation;
        calls.push({ label: `${observation.kind}:${observation.status}`, body });
        assert.equal(observation.actionId, EXECUTING_RUN.cursor.actionId);
        assert.equal(observation.artifactId, artifact.artifactId);
        assert.equal(observation.artifactGeneration, artifact.generation);
        snapshot = { ...snapshot, status: observation.status === 'failure' ? 'REPAIRING' : 'VERIFYING' };
      } else if (body?.action === 'coding.promote') {
        calls.push({ label: 'promote', body });
        assert.equal(snapshot.status, 'VERIFYING', 'observation must precede promotion');
        snapshot = { ...snapshot, status: 'COMPLETE' };
      } else {
        assert.ok(!body?.action, 'the fixture must not silently accept an unexpected action');
      }
      return { ok: true, json: async () => ({ run: snapshot }) };
    };
    try {
      const client = createQirCodingRunClient({
        onRun: (next) => published.push(next),
        onError: (error) => errors.push(error),
        readOptions: () => ({
          enabled: true, sessionId: `compaction-${scenario.name}`,
          goal: 'Build a 3-file utility (parser.py, cleaner.py and README.md). No UI, no website.',
          code, vfs, job: { title: 'Python utility' },
        }),
      });
      assert.equal(client.compactWorkingContext, undefined, 'compaction is automatic, not a caller responsibility');
      await client.sync();
      pendingReport = client.reportPreviewStatus(scenario.report);
      const blocked = Symbol('waiting for compaction');
      const settled = await Promise.race([
        pendingReport,
        new Promise((resolve) => { setImmediate(() => resolve(blocked)); }),
      ]);
      assert.notEqual(settled, blocked, 'an unresolved compaction request must not block the result');
      assert.deepEqual(errors, []);
      assert.equal(settled?.status, scenario.expectedStatus);
      assert.deepEqual(calls.map((call) => call.label), scenario.expectedCalls);
      const compaction = calls.at(-1);
      assert.equal(compaction.committedStatus, scenario.expectedStatus, 'compact only after the transition commits');
      assert.equal(compaction.body.runId, EXECUTING_RUN.runId);
      assert.deepEqual(compaction.body.projectState.files, Object.keys(vfs).sort());
      assert.doesNotMatch(JSON.stringify(compaction.body), /SENTINEL_PRIVATE_FILE_BYTES/);
      assert.deepEqual(vfs, originalVfs, 'verification must preserve the generated files');
      if (scenario.missing) {
        const failure = calls.find((call) => call.label === 'verification:failure').body.observation;
        assert.equal(failure.error.code, 'VERIFICATION_FAILURE');
        assert.equal(failure.error.retryable, true);
        assert.equal(failure.evidence[0].kind, 'artifact.requested_deliverables_missing');
        for (const path of ['parser.py', 'cleaner.py', 'README.md']) assert.ok(failure.error.message.includes(path));
      }
      const repeated = await client.reportPreviewStatus(scenario.report);
      assert.equal(repeated.status, scenario.expectedStatus);
      assert.deepEqual(calls.map((call) => call.label), scenario.expectedCalls, 'a late duplicate callback must not write again');
      const publicationCount = published.length;
      releaseContext();
      await new Promise((resolve) => { setImmediate(resolve); });
      assert.equal(published.length, publicationCount, 'late compaction must not publish a stale snapshot');
      assert.equal(published.at(-1).status, scenario.expectedStatus);
      assert.deepEqual(errors, []);
    } finally {
      releaseContext();
      try {
        await pendingReport;
        await new Promise((resolve) => { setImmediate(resolve); });
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });
}

test('[was-red] compaction is never on the path the user is waiting for', async () => {
  /*
   * THE REGRESSION THIS PINS. The first version awaited compaction inside
   * reportPreviewStatus. The desktop app runs with no durable storage, so every
   * preview status bought a doomed network round trip on the critical path —
   * and the desktop smoke gate went red on "Cmd/Ctrl+S wrote the edit to disk"
   * with a console 503 beside it. It passed on the commit before.
   *
   * Compaction is an optimisation for a worker that may never arrive. The
   * caller must return without it, however slow the route is.
   */
  const original = globalThis.fetch;
  let released;
  const hold = new Promise((resolve) => { released = resolve; });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('/api/qir-context')) {
      await hold;                       // a route that never answers in time
      return { ok: true, json: async () => ({}) };
    }
    if (init?.body) JSON.parse(init.body);
    return { ok: true, json: async () => ({ run: EXECUTING_RUN }) };
  };
  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'g', vfs: {}, job: {} }),
    });
    await client.sync();
    const settled = await Promise.race([
      client.reportPreviewStatus({ kind: 'runtime', status: 'clean' }).then(() => 'returned'),
      new Promise((resolve) => { setTimeout(() => resolve('blocked'), 250); }),
    ]);
    assert.equal(settled, 'returned', 'the caller must not wait on compaction');
  } finally {
    released();
    globalThis.fetch = original;
  }
});

test('[was-red] it stops asking once the deployment says storage is unconfigured', async () => {
  /*
   * Repeating a request that has been definitively refused is how a console
   * fills with 503s that mask a real one — which is what the desktop gate
   * surfaced.
   */
  let contextCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('/api/qir-context')) {
      contextCalls += 1;
      return { ok: false, status: 503, json: async () => ({ reason: 'storage-unconfigured' }) };
    }
    return { ok: true, json: async () => ({ run: EXECUTING_RUN }) };
  };
  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 's1', goal: 'g', vfs: {}, job: {} }),
    });
    await client.sync();
    for (let i = 0; i < 4; i += 1) {
      await client.reportPreviewStatus({ kind: 'runtime', status: 'clean' });
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    assert.equal(contextCalls, 1, `asked ${contextCalls} times; a refused deployment must be asked once`);
  } finally { globalThis.fetch = original; }
});

test('[was-red] compaction never overwrites the live Run with its own reply', async () => {
  /*
   * Accepting the returned Run would let a late compaction land out of order
   * with a newer transition and replace runNow with a staler snapshot. The
   * compacted context is durable the moment the route commits it; taking it
   * back is a data race for nothing.
   */
  const source = readFileSync(new URL('./qir-coding-run-core.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const compactWorkingContext'), source.indexOf('const requestPremiumEscalation'));
  assert.doesNotMatch(body, /accept\(/, 'compaction must not feed its response back into the client state');
});

/*
 * ---------------------------------------------------------------------------
 * TOOL ACCOUNTING IS WIRED, NOT MERELY BUILT.
 *
 * This repository keeps deleting subsystems that were written, tested and
 * called by nothing: the cost meter, the Context Manager, the Resource
 * Governor. Tool accounting has three parts on three sides of the app — the
 * server announces a completed tool over SSE, the stream hook forwards it, the
 * Run charges for it — so the seams are asserted, not just the arithmetic.
 * ---------------------------------------------------------------------------
 */
const readSource = (relative) => readFileSync(path.join(import.meta.dirname, relative), 'utf8');

test('the chat stream forwards a completed tool call to the Run', () => {
  const stream = readSource('../hooks/useChatStream.js');
  assert.match(
    stream,
    /parsed\.status\.phase === 'tool' && parsed\.status\.state === 'completed'/,
    'the server already announces each completed tool; the stream must forward it',
  );
  assert.match(stream, /onToolInvokedRef\.current\?\./, 'read through a ref, or a stale callback stops accounting mid-turn');
});

test('the desk hands the Run its tool reporter', () => {
  // Two halves that lived on opposite sides of AiStudio and were never joined.
  assert.match(readSource('../components/AiStudio.jsx'), /onToolInvoked: qirCoding\.reportToolUse/);
  assert.match(readSource('../hooks/useQirCodingRun.js'), /client\.reportToolUse\(tool, units\)/);
});

test('the Run route can actually charge for a tool', () => {
  const route = readFileSync(path.join(import.meta.dirname, '..', '..', 'api', 'qir-runs.ts'), 'utf8');
  assert.match(route, /action === "coding\.tool"/, 'a reporter with no route to call is not accounting');
  assert.match(route, /spendOrdinaryUnits\(record\.run\.budget, units\)/);
  assert.match(route, /eventType: "coding\.tool_invoked"/, 'the journal names the tool, or model and tool spend cannot be told apart');
  /*
   * The client counts events it received, so a confused or hostile caller must
   * not be able to drain a Run's budget in one request.
   */
  assert.match(route, /Math\.min\(10, Math\.max\(1, Number\(req\.body\?\.units\) \|\| 1\)\)/);
});

test('accounting never refuses a build, and never outlives the Run', () => {
  const core = readSource('./qir-coding-run-core.js');
  // #516: a build stopped by an uncalibrated allowance is stopped for a reason
  // no user can act on. The route debits; it must not gate.
  const route = readFileSync(path.join(import.meta.dirname, '..', '..', 'api', 'qir-runs.ts'), 'utf8');
  const toolBlock = route.slice(route.indexOf('action === "coding.tool"'), route.indexOf('THE STOP BUTTON'));
  assert.doesNotMatch(toolBlock, /WAITING_FOR_CAPACITY/, 'tool accounting debits, it does not refuse');
  assert.match(toolBlock, /qirRunHasStopped\(record\.run\)/, 'a finished Run cannot accrue new charges');
  assert.match(core, /\['COMPLETE', 'FAILED_TERMINAL'\]\.includes\(current\.status\)/);
});
