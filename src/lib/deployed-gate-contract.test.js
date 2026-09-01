import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * The deployed golden gate drives the real deployment through the landing page.
 * It used to find that page by the CTA's words; the copy changed to "Try
 * Quantora" and the gate went permanently red, was labelled flaky, and was
 * muted — which is how a production ESM outage stayed invisible.
 *
 * These tests keep the two ends of that contract tied together, so the failure
 * mode cannot recur silently: the landing page must keep publishing the hook,
 * and the gate must keep anchoring on it rather than on prose.
 */
test('the landing page publishes the durable Studio entry hook', () => {
  const landing = read('src/components/LandingPage.jsx');
  assert.match(landing, /data-quantora-enter-studio="true"/);
});

test('the deployed golden gate anchors on that hook, never on button copy', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-enter-studio="true"\]/);
  // Strip comments first: the fix documents the old locator in prose, and the
  // ban is on executing it, not on explaining why it was wrong.
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /getByRole\([^)]*Studio\$/);
});

test('the desk publishes a durable hook for a terminally failed turn', () => {
  const studio = read('src/components/AiStudio.jsx');
  /*
   * The desk always knew the last turn had failed, but kept it to itself, so
   * the golden gate waited out its full 150s timeout on a turn that died in
   * seconds and then reported only that the artifact "never reached the
   * preview". That message fits a dozen causes and named none of them.
   */
  assert.match(studio, /data-quantora-last-turn-failed=/);
});

test('the failed-turn hook excludes error turns that still land an artifact', () => {
  const studio = read('src/components/AiStudio.jsx');
  /*
   * A stream can die after emitting complete fenced files; the workspace-apply
   * path deliberately lands those, so such a turn can still render and pass.
   * Publishing the bare isError would make the deployed gate abort a
   * transaction that was about to succeed. Found in review of #430.
   */
  const bound = studio.match(/data-quantora-last-turn-failed=\{([^}]*)\}/);
  assert.ok(bound, 'the shell must publish the failed-turn hook');
  const expression = bound[1];
  assert.doesNotMatch(
    expression,
    /^\s*lastTurnFailed\s*\?/,
    'the hook must not be the bare isError fact — it must exclude turns that still produce an artifact',
  );
  // The narrowing has to use the same predicate the apply path uses, or the
  // hook and the behaviour it describes can drift apart.
  assert.match(studio, /lastTurnFailedWithoutArtifact\s*=\s*lastTurnFailed\s*\n?\s*&&\s*!messageHasExtractableWorkspaceCode\(/);
});

test('the golden gate fails fast on that hook rather than on the failure copy', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-last-turn-failed="true"\]/);
  // Anchoring on the words of the failure message would repeat the exact
  // mistake that made this gate permanently red: copy changes, hooks do not.
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /no healthy AI route|died before Preview/);
});

test('the deterministic readiness gate stays free of browser and model calls', () => {
  const gate = read('scripts/deployed-readiness-gate.mjs');
  // Its whole value is being unambiguous: no browser, no provider spend, so a
  // failure always means the deployment is broken and is never worth muting.
  assert.doesNotMatch(gate, /playwright|chromium/i);
  assert.match(gate, /\/api\/inference-health/);
  assert.match(gate, /FUNCTION_INVOCATION_FAILED/);
});

test('every runtime-import-gate failure is a structured, actionable object', () => {
  const gate = read('scripts/runtime-import-gate.mjs');
  // The reporter prints failure.file/.line/.specifier/.why, so a failure pushed
  // as a bare string renders "undefined:undefined 'undefined'". The gate still
  // fails, but tells nobody what to fix — and an unactionable gate is one
  // someone mutes. Found by review after the default-export rule shipped
  // exactly that bug, so the shape is pinned here.
  const pushes = gate.match(/failures\.push\(\s*\{/g) || [];
  const allPushes = gate.match(/failures\.push\(/g) || [];
  assert.ok(allPushes.length >= 3, `expected several failure kinds, saw ${allPushes.length}`);
  assert.equal(pushes.length, allPushes.length, 'every failures.push must pass an object literal, never a string');
});
