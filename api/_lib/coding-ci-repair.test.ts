import test from 'node:test';
import assert from 'node:assert/strict';
import { repairCodingCandidateFromCi } from './coding-ci-repair.js';
import type { QirServerModelRunner } from './qir-server-model.js';

const baseline = {
  'package.json': JSON.stringify({ scripts: { test: 'node --test test.js' } }, null, 2),
  'app.js': 'export function total(a, b) { return a - b; }\n',
  'test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { total } from './app.js';\ntest('adds', () => assert.equal(total(2, 3), 5));\n",
};

function runner(text: string): QirServerModelRunner {
  return async () => ({ status: 'success', provider: 'gemini', modelId: 'test-model', text });
}

test('repairs implementation from CI evidence and preserves the independent judge', async () => {
  const result = await repairCodingCandidateFromCi({
    vfs: baseline,
    objective: 'Fix total()',
    ciDetail: 'test.js: expected 5, received -1',
    attempt: 1,
  }, {
    modelRunner: runner('```js filepath="app.js"\nexport function total(a, b) { return a + b; }\n```'),
  });
  assert.equal(result.status, 'repaired');
  if (result.status !== 'repaired') return;
  assert.match(result.vfs['app.js'], /a \+ b/);
  assert.equal(result.vfs['test.js'], baseline['test.js']);
  assert.equal(result.vfs['package.json'], baseline['package.json']);
});

test('rejects a repair that changes an existing independent test', async () => {
  const result = await repairCodingCandidateFromCi({
    vfs: baseline,
    objective: 'Fix total()',
    ciDetail: 'test failed',
    attempt: 1,
  }, {
    modelRunner: runner('```js filepath="test.js"\n// weakened judge\n```'),
  });
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /protected independent verification file/i);
});

test('rejects a repair that changes the required package verification command', async () => {
  const result = await repairCodingCandidateFromCi({
    vfs: baseline,
    objective: 'Fix total()',
    ciDetail: 'npm test failed',
    attempt: 1,
  }, {
    modelRunner: runner('```json filepath="package.json"\n{"scripts":{"test":"echo pass"}}\n```'),
  });
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /protected package verification script/i);
});

test('refuses blind repair without CI evidence', async () => {
  let called = false;
  const result = await repairCodingCandidateFromCi({
    vfs: baseline,
    objective: 'Fix total()',
    ciDetail: '',
    attempt: 1,
  }, {
    modelRunner: async () => {
      called = true;
      throw new Error('must not call model');
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(called, false);
  assert.match(result.detail, /concrete evidence/i);
});

test('refuses a no-op model response', async () => {
  const result = await repairCodingCandidateFromCi({
    vfs: baseline,
    objective: 'Fix total()',
    ciDetail: 'test failed',
    attempt: 1,
  }, {
    modelRunner: runner('No changes required.'),
  });
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /no material workspace change/i);
});
