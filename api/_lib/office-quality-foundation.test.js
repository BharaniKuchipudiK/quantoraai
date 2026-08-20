import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESENTATION_TRANSPORT_JSON_SCHEMA } from './presentation-transport.js';
import { inspectProviderSchema, runProviderFailover } from './office-provider-contract.js';
import { runOfficeSemanticLoop } from './office-semantic-loop.js';

test('Office structured-output contracts are compatible with all configured provider adapters', () => {
  for (const provider of ['anthropic', 'gemini', 'openrouter']) {
    for (const format of ['powerpoint', 'word', 'excel']) {
      const result = inspectProviderSchema(provider, format);
      assert.equal(result.valid, true, `${provider}/${format}: ${result.issues.join(' ')}`);
    }
  }

  const gemini = inspectProviderSchema('gemini', 'powerpoint', PRESENTATION_TRANSPORT_JSON_SCHEMA);
  assert.equal(gemini.valid, true, gemini.issues.join(' '));
});

test('Office provider failover reaches the next provider and total outage fails closed', async () => {
  const calls = [];
  const result = await runProviderFailover({
    providers: ['anthropic', 'gemini', 'openrouter'],
    invoke: async (provider) => {
      calls.push(provider);
      if (provider !== 'openrouter') throw new Error(`${provider} unavailable`);
      return 'openrouter-success';
    },
  });
  assert.equal(result, 'openrouter-success');
  assert.deepEqual(calls, ['anthropic', 'gemini', 'openrouter']);

  await assert.rejects(() => runProviderFailover({
    providers: ['anthropic', 'gemini', 'openrouter'],
    invoke: async (provider) => { throw new Error(`${provider} unavailable`); },
  }), /openrouter unavailable/);
});

test('Office semantic repair preserves the failed PowerPoint candidate instead of restarting', async () => {
  const initial = { version: 2, title: 'Initial candidate', slides: [{ title: 'Weak slide' }] };
  const repaired = { version: 2, title: 'Initial candidate', slides: [{ title: 'Assertion-led executive conclusion' }] };
  let repairSeen = false;

  const run = await runOfficeSemanticLoop({
    format: 'powerpoint',
    maxAttempts: 2,
    requestCandidate: async ({ repairCandidate }) => {
      if (!repairCandidate) return JSON.stringify(initial);
      repairSeen = true;
      assert.deepEqual(repairCandidate, initial);
      return JSON.stringify(repaired);
    },
    validateCandidate: (candidate) => candidate.slides?.[0]?.title === repaired.slides[0].title
      ? { valid: true, spec: candidate, issues: [], warnings: [] }
      : { valid: false, spec: candidate, issues: ['Executive headline is too weak.'], warnings: [] },
  });

  assert.equal(repairSeen, true);
  assert.equal(run.repaired, true);
  assert.equal(run.lastStage, 'success');
  assert.deepEqual(run.validJson, repaired);
});
