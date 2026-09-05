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

test('the hero Try Quantora CTA opens auth, not a guest Building animation', () => {
  const landing = read('src/components/LandingPage.jsx');
  assert.match(landing, /landing-hero__submit[\s\S]*?data-quantora-login=\{user \? undefined : 'true'\}/);
  assert.match(landing, /landing-hero__submit[\s\S]*?onClick=\{\(\) => startBuild\(\)\}/);
  assert.doesNotMatch(landing, /setGuestRun\('running'\)/);
  assert.doesNotMatch(landing, /Building…/);
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

/*
 * The guided-intake transaction (2026-09-01). The two artifact transactions
 * never ran the platform's #1 real flow, so the intake contradiction shipped
 * unseen. The third transaction's invariant — intake question OR artifact,
 * never a dead turn — is anchored on the decision modal's durable hooks, and
 * the same hooks must keep being published by the component that renders it.
 */
test('the decision modal publishes durable hooks and the golden gate anchors on them', () => {
  const modal = read('src/components/StudioDecisionModal.jsx');
  assert.match(modal, /data-quantora-decision-modal="true"/);
  assert.match(modal, /data-quantora-decision-option=\{option\.id\}/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-decision-modal="true"\]/);
  assert.match(gate, /\[data-quantora-decision-option\]/);
});

/*
 * THE ROSTER (2026-09-05). Adding a fourth transaction, the run went green and
 * step 10 finished FASTER than the three-transaction runs before it — and
 * nothing in a passing log could settle whether the new transaction had run.
 * The only clue was the uploaded artifact growing, which is a guess wearing
 * evidence's clothes.
 *
 * So the golden declares what it covers, fails when a declared transaction did
 * not run, and prints the roster last on every run. This pins the declaration
 * to the transactions actually in the file: adding one without listing it, or
 * listing one that no longer exists, both stop the suite from meaning what it
 * says.
 */
test('the golden declares every transaction it runs, and runs every one it declares', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');

  const declared = (gate.match(/const EXPECTED_TRANSACTIONS = \[([^\]]*)\]/) || [])[1];
  assert.ok(declared, 'EXPECTED_TRANSACTIONS is gone — a skipped transaction would pass silently again');
  const roster = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  // markActiveTransaction(name, correlationId) — the first argument names the
  // transaction, and it is called again with the id once known, hence the set.
  const marked = new Set(
    [...gate.matchAll(/markActiveTransaction\('([^']+)'/g)].map((match) => match[1]),
  );
  assert.ok(marked.size > 0, 'no transactions found in the golden — this test is reading the wrong file');

  for (const name of marked) {
    assert.ok(roster.includes(name), `"${name}" runs but is not in EXPECTED_TRANSACTIONS, so skipping it would be silent`);
  }
  for (const name of roster) {
    assert.ok(marked.has(name), `"${name}" is declared but never runs — the roster would fail every run`);
  }

  assert.match(gate, /all \$\{ran\.length\} transactions passed/, 'a passing run must still say what it covered');
  assert.match(gate, /golden-verdict\.txt/, 'and write it where the workflow cats it, or nobody reads it');
});

/*
 * The other half of the same transaction (2026-09-04). When no modal renders,
 * the gate has to say WHY, and the only two answers are opposites: the desk
 * asked in prose, or the desk wrote a modal it could not parse. AiStudio held
 * that answer all along — readAssistantModal returns a failure — and threw it
 * away at the call site, so the verdict guessed. Both ends pinned here: the
 * desk publishes the hook, the snapshot the verdict reads still reads it.
 */
test('an unreadable decision modal is published as a hook and read by the snapshot', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /modalUnreadable = Boolean\(modal\.failure\)/, 'the desk must keep the parse failure');
  assert.match(studio, /data-quantora-modal-unreadable=\{modalUnreadable \? 'true' : undefined\}/);
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /\[data-quantora-modal-unreadable="true"\]/);
  assert.match(snapshot, /modalUnreadable:/, 'the snapshot must carry the field the verdict branches on');
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /snapshot\.modalUnreadable/, 'the verdict must branch on it, or the hook is decorative');
});

/*
 * And the REASON (2026-09-05). The boolean above shipped one night and was red
 * the next: it said the desk could not read the modal, which was the class, and
 * left the shape — a markdown fence, as it turned out — to be guessed at. The
 * parser knew all along. Three ends pinned so the answer keeps travelling.
 */
test('the parser reason reaches the verdict, not just the fact of failure', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /modalFailure = modal\.failure/, 'the desk must keep the reason, not only the boolean');
  assert.match(studio, /data-quantora-modal-failure=\{modalFailure \|\| undefined\}/);
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /data-quantora-modal-failure/, 'the snapshot must read it');
  assert.match(snapshot, /modalFailure:/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /snapshot\.modalFailure/, 'and the verdict must print it, or it is another silent hop');
});

/*
 * The canary handshake (2026-09-01). The chat golden failed 3/3 on PR
 * previews as a provider outage; the real cause was the canary token env
 * being scoped to Production, discovered only by reading three run logs.
 * Both ends of the one-second answer are pinned here: the health endpoint
 * must keep answering "would this deployment honor my canary?", and the
 * gate must keep asking BEFORE spending a model turn.
 */
/*
 * WHICH REPAIR (2026-09-05). The verdict told every unreadable modal to "repair
 * the reader", and for a TRUNCATED one that is the wrong file: completing a cut
 * off JSON string means inventing the rest of the user's question, which
 * assistant-modal refuses to do by design. Wrong advice in a blocking gate is
 * the §8 defect, and this is the third round this class has been guessed at.
 */
test('the verdict routes a truncated modal away from the reader', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const routed = (gate.match(/const truncated = ([^;]+);/) || [])[1];
  assert.ok(routed, 'the truncated/malformed split is gone — every unreadable modal blames the reader again');
  assert.notEqual(routed.trim(), 'false', 'the split is hardcoded off, which is the same bug wearing a variable');
  assert.match(routed, /unterminated/i, 'and it must route on what the parser actually says');
  assert.match(gate, /NOT a reader bug/, 'a truncated modal must say plainly that the reader is the wrong place');
  assert.match(gate, /IS the reader/, 'and a malformed-but-complete one must still point at it');
});

test('the health endpoint and the golden gate keep the canary handshake', () => {
  const handler = read('api/_lib/handlers/inference-health.ts');
  assert.match(handler, /goldenCanaryHonored:\s*isGoldenCanaryRequest\(req\)/);
  assert.match(handler, /goldenCanaryConfigured:\s*Boolean\(process\.env\.QUANTORA_GOLDEN_CANARY_TOKEN\)/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /goldenCanaryHonored !== true/);
  assert.match(gate, /QUANTORA_GOLDEN_CANARY_TOKEN/, 'the failure message names the env var to fix');
});
