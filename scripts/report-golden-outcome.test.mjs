import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './report-golden-outcome.mjs';

/*
 * The reporter exists because a failure was invisible. So the thing under test
 * is not "does it produce markdown" but "with the bug present, does it SAY so,
 * and does it name the cause" (CLAUDE.md §8).
 */

const FAILING_EVIDENCE = {
  baseUrl: 'https://example-deployment.vercel.app',
  deploymentSha: '9fa1aa970b294836d9b5b1da9ca70c6c0b2a826e',
  error: 'The chat turn failed before any artifact was produced. What failed: no healthy AI route',
  inferenceHealth: {
    ready: true,
    goldenCanaryHonored: true,
    routeCount: 3,
    geminiConfigured: true,
    openRouterConfigured: true,
    spend: { paidRoutesAllowed: false, reason: 'the spend meter could not be read' },
  },
};

test('a failing golden is reported as FAILED and names the error', () => {
  const report = buildReport('failure', FAILING_EVIDENCE);
  assert.equal(report.passed, false);
  assert.match(report.markdown, /\*\*FAILED\*\*/);
  assert.match(report.markdown, /no healthy AI route/);
  assert.ok(report.warning, 'a failure must raise a warning annotation');
});

test('the failure report names the spend condition, not just the symptom', () => {
  // "no healthy AI route" is the symptom; paid routes being off because the
  // meter is unreadable is the condition that produced it. A report that shows
  // only the symptom sends the reader hunting for a provider outage.
  const report = buildReport('failure', FAILING_EVIDENCE);
  assert.match(report.markdown, /spend\.paidRoutesAllowed/);
  assert.match(report.markdown, /the spend meter could not be read/);
});

test('a failing golden with NO readable evidence still reports the failure', () => {
  // The case that decides whether this is a real report or a decorative one:
  // an unreadable evidence file must not degrade into an empty section that
  // reads like nothing happened (CLAUDE.md §4).
  const report = buildReport('failure', null);
  assert.equal(report.passed, false);
  assert.match(report.markdown, /\*\*FAILED\*\*/);
  assert.match(report.markdown, /No evidence file was readable/);
  assert.ok(report.warning, 'a failure with no evidence must still warn');
});

test('a passing golden is reported too, so silence never means green', () => {
  const report = buildReport('success', null);
  assert.equal(report.passed, true);
  assert.match(report.markdown, /\*\*PASSED\*\*/);
  assert.equal(report.warning, null, 'a pass must not raise a warning');
});

test('an unset outcome is treated as a failure, never as a pass', () => {
  // A step that never ran leaves the outcome empty. Reading that as success is
  // exactly how a red state becomes invisible.
  for (const outcome of ['', 'skipped', 'cancelled', undefined]) {
    const report = buildReport(outcome, null);
    assert.equal(report.passed, false, `outcome ${JSON.stringify(outcome)} must not read as a pass`);
  }
});
