import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRuntimeOutcome } from './runtime-outcome-evaluator.js';

test('deterministic evidence can prove the original intent satisfied', () => {
  const result = evaluateRuntimeOutcome({
    originalIntent: 'Ship the Runtime Governor safely to production.',
    criteria: [
      { criterionId: 'ci', statement: 'Exact-head CI is green.' },
      { criterionId: 'prod', statement: 'Matching production deployment is healthy.' },
    ],
    evidence: [
      { evidenceId: 'ev-ci', criterionId: 'ci', verdict: 'passed', source: 'verifier', ref: 'run:2978' },
      { evidenceId: 'ev-prod', criterionId: 'prod', verdict: 'passed', source: 'runtime', ref: 'dpl_123' },
    ],
  });

  assert.equal(result.status, 'satisfied');
  assert.equal(result.deterministic, true);
  assert.equal(result.modelJudgeRequired, false);
  assert.deepEqual(result.failedCriteria, []);
  assert.deepEqual(result.unresolvedCriteria, []);
});

test('deterministic failure cannot be overridden by model judgment', () => {
  const result = evaluateRuntimeOutcome({
    originalIntent: 'Deploy a working production release.',
    criteria: [
      { criterionId: 'health', statement: 'Production health passes.', judgeableByModel: true },
    ],
    evidence: [
      { evidenceId: 'ev-health', criterionId: 'health', verdict: 'failed', source: 'runtime', ref: 'health:500' },
    ],
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.modelJudgeRequired, false);
  assert.deepEqual(result.failedCriteria, ['health']);
});

test('missing deterministic evidence stays indeterminate without asking a model', () => {
  const result = evaluateRuntimeOutcome({
    originalIntent: 'Merge only after CI is green.',
    criteria: [
      { criterionId: 'ci', statement: 'Required checks pass.' },
    ],
    evidence: [],
  });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.deterministic, true);
  assert.equal(result.modelJudgeRequired, false);
  assert.deepEqual(result.unresolvedCriteria, ['ci']);
  assert.match(result.blockers[0] || '', /Deterministic evidence is missing/);
});

test('model judge is requested only when every unresolved criterion is semantic', () => {
  const result = evaluateRuntimeOutcome({
    originalIntent: 'Produce a concise executive summary that answers the user question.',
    criteria: [
      { criterionId: 'artifact', statement: 'The summary artifact exists.' },
      { criterionId: 'intent-fit', statement: 'The summary directly satisfies the requested emphasis.', judgeableByModel: true },
    ],
    evidence: [
      { evidenceId: 'ev-artifact', criterionId: 'artifact', verdict: 'passed', source: 'tool', ref: 'artifact:summary' },
      { evidenceId: 'ev-fit', criterionId: 'intent-fit', verdict: 'unknown', source: 'verifier', ref: 'review:pending' },
    ],
  });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.deterministic, false);
  assert.equal(result.modelJudgeRequired, true);
  assert.deepEqual(result.unresolvedCriteria, ['intent-fit']);
});

test('a mixed unresolved set does not let a model substitute for missing deterministic proof', () => {
  const result = evaluateRuntimeOutcome({
    originalIntent: 'Publish a correct report.',
    criteria: [
      { criterionId: 'published', statement: 'The report was published.' },
      { criterionId: 'quality', statement: 'The report matches the requested tone.', judgeableByModel: true },
    ],
    evidence: [],
  });

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.modelJudgeRequired, false);
  assert.deepEqual(result.unresolvedCriteria, ['published', 'quality']);
});
