import assert from 'node:assert/strict';
import test from 'node:test';
import { createQirCodingRunClient } from './qir-coding-run-core.js';

const GOAL = "Act as a Data Engineer and write a modular 3-file Python utility (parser.py, cleaner.py and README.md). Package all three files into a single Git tree.";

function harness(vfs, goal = GOAL) {
  const originalFetch = globalThis.fetch;
  const posted = [];
  let run = null;

  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('/api/qir-context')) {
      return { ok: true, status: 200, json: async () => ({ run, context: { hash: 'h' } }) };
    }
    const body = init?.body ? JSON.parse(init.body) : null;
    if (body) posted.push(body);

    if (body?.run) {
      run = body.run;
      return { ok: true, status: 200, json: async () => ({ run }) };
    }
    if (body?.action === 'coding.start') {
      run = {
        ...run,
        status: 'EXECUTING',
        cursor: { stepId: 'step-1', actionId: 'action-1', attempt: 1 },
        artifacts: [{
          artifactId: 'coding-desk-vfs', generation: 1,
          ref: `${body.artifactRef}#sha256=test`, createdByActionId: 'action-1', state: 'candidate',
        }],
      };
      return { ok: true, status: 200, json: async () => ({ run }) };
    }
    if (body?.action === 'coding.observe') {
      run = { ...run, status: body.observation.status === 'success' ? 'VERIFYING' : 'REPAIRING' };
      return { ok: true, status: 200, json: async () => ({ run }) };
    }
    if (body?.action === 'coding.promote') {
      run = { ...run, status: 'COMPLETE' };
      return { ok: true, status: 200, json: async () => ({ run }) };
    }
    return { ok: true, status: 200, json: async () => ({ run }) };
  };

  const options = {
    enabled: true,
    sessionId: 'deliverables-session',
    goal,
    artifactRef: 'coding-desk://deliverables/test',
    code: vfs['index.html']?.content || '<html><body>file project</body></html>',
    vfs,
    job: null,
  };
  const errors = [];
  const client = createQirCodingRunClient({ onRun: () => {}, onError: (error) => errors.push(error), readOptions: () => options });
  return { client, posted, errors, restore: () => { globalThis.fetch = originalFetch; } };
}

async function reachQualityGate(client) {
  await client.sync();
  await client.reportPreviewStatus({ kind: 'runtime', status: 'clean' });
  return client.reportPreviewStatus({ kind: 'quality', passed: true, score: 100 });
}

test('[was-red] a pretty HTML viewer cannot complete a Run that owes three real files', async () => {
  const testHarness = harness({
    'index.html': { content: '<html><body><pre>parser.py cleaner.py README.md</pre></body></html>' },
  });
  try {
    const finalRun = await reachQualityGate(testHarness.client);
    assert.deepEqual(testHarness.errors, []);
    assert.notEqual(finalRun?.status, 'COMPLETE');
    assert.equal(testHarness.posted.some((body) => body.action === 'coding.promote'), false, 'Preview quality must not promote missing deliverables');
    const refusal = testHarness.posted.filter((body) => body.action === 'coding.observe').at(-1)?.observation;
    assert.equal(refusal?.kind, 'verification');
    assert.equal(refusal?.status, 'failure');
    assert.equal(refusal?.error?.code, 'REQUESTED_DELIVERABLES_MISSING');
    assert.match(refusal?.error?.message || '', /parser\.py/);
    assert.match(refusal?.error?.message || '', /cleaner\.py/);
    assert.match(refusal?.error?.message || '', /README\.md/);
  } finally {
    testHarness.restore();
  }
});

test('quality can promote when every explicitly requested file exists', async () => {
  const testHarness = harness({
    'parser.py': { content: 'class Parser: pass' },
    'cleaner.py': { content: 'class Cleaner: pass' },
    'README.md': { content: '# Pipeline' },
    'index.html': { content: '<html><body>Optional preview</body></html>' },
  });
  try {
    const finalRun = await reachQualityGate(testHarness.client);
    assert.deepEqual(testHarness.errors, []);
    assert.equal(finalRun?.status, 'COMPLETE');
    assert.equal(testHarness.posted.filter((body) => body.action === 'coding.promote').length, 1);
  } finally {
    testHarness.restore();
  }
});

test('ordinary web work is not blocked merely because its prose mentions source filenames', async () => {
  const testHarness = harness(
    { 'index.html': { content: '<html><body>Explain parser.py and README.md</body></html>' } },
    'Build a small code-reading website that explains parser.py and README.md.',
  );
  try {
    const finalRun = await reachQualityGate(testHarness.client);
    assert.equal(finalRun?.status, 'COMPLETE');
  } finally {
    testHarness.restore();
  }
});
