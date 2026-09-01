/**
 * The turn-heal contract — Detect → Diagnose → Verify → Apply, adjudicated.
 *
 * THE INCIDENT (2026-09-01). A boutique-website build turn failed twice with
 * BUILD_ARTIFACT_CONTRACT (the model answered in chat, no files). The retry
 * that ran re-sent the IDENTICAL prompt to the IDENTICAL model — so it failed
 * identically — and the terminal message then told the user:
 *
 *   "What we'll do: retry once on a fallback engine … not another silent
 *    retry loop."
 *
 * That sentence is rendered in exactly one state: after the retry budget is
 * spent and nothing more will run. The platform promised, in its terminal
 * state, the action it had just proved it would never take. Three separate
 * lies in one turn: the retry changed nothing (no memory), "fallback engine"
 * never happened (no engine switch), and the closing copy promised future
 * work in a state with no future.
 *
 * This gate closes the class with two contracts:
 *
 *   1. HONEST ESCALATION — a terminal outcome states what the loop already
 *      tried (attempts, engines) and hands the next move to the user via a
 *      chip. It never says "we'll retry": by the time this copy renders, the
 *      code that could retry has returned.
 *
 *   2. DIAGNOSIS-MATCHED REPAIR — a retry must differ from the attempt that
 *      failed. A contract failure (behavioral) retries with a strengthened
 *      brief that names the failure; a dead route (transport) retries on a
 *      different engine, and the notice claims a switch only when the caller
 *      proved one exists.
 *
 * Verified two-way per CLAUDE.md §2: these tests were run against the code
 * as it stood on 2026-09-01 and failed on every assertion marked [was-red]
 * before the fix landed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery } from './turn-recovery.js';

const TERMINAL_KINDS = ['provider-dead', 'stream-ended', 'no-preview', 'timeout'];

/* Matches "What we'll do: … retry …" with straight or curly apostrophes and
 * markdown bold. The phrase is only wrong as a FUTURE promise; a chip label
 * like "Retry with fallback" is the user's action and stays legal. */
const FUTURE_RETRY_PROMISE = /what we.{0,3}ll do[^]{0,160}?re(?:try|build)/i;

test('[was-red] terminal copy never promises a retry the loop will not run', () => {
  for (const kind of TERMINAL_KINDS) {
    const outcome = resolveCodingTurnOutcome({
      kind,
      errorMessage: 'The model answered in chat without files.',
      attemptsMade: MAX_TURN_ATTEMPTS,
      triedEngines: ['Nemotron 3 Super 120B'],
    });
    assert.doesNotMatch(
      outcome.text,
      FUTURE_RETRY_PROMISE,
      `${kind}: terminal copy promises an automatic retry/rebuild, but it renders only after the retry budget is spent`,
    );
    // Escalation still hands the person a move — a chip, never a dead end.
    assert.ok(
      outcome.continueSet?.items?.length >= 1,
      `${kind}: terminal outcome must offer at least one chip`,
    );
  }
});

test('[was-red] an exhausted turn reports what was actually tried, not a vague shrug', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'The model answered in chat without files.',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B', 'Gemini Flash'],
  });
  assert.match(outcome.text, /2 attempts/i, 'names the attempt count');
  assert.match(outcome.text, /Nemotron 3 Super 120B/, 'names the first engine tried');
  assert.match(outcome.text, /Gemini Flash/, 'names the fallback engine tried');
  const retryChip = outcome.continueSet.items.find((chip) => /retry/i.test(chip.label));
  assert.ok(retryChip, 'the retry stays available — as the user\'s move');
});

test('a single-attempt failure does not invent a history it never had', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 1,
    triedEngines: ['Gemini Flash'],
  });
  assert.doesNotMatch(outcome.text, /2 attempts/i);
  assert.doesNotMatch(outcome.text, FUTURE_RETRY_PROMISE);
});

test('[was-red] a contract failure retries with MEMORY: the brief names what failed last time', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'The model answered in chat without files.',
  });
  assert.equal(decision.retry, true);
  assert.ok(decision.retryBrief, 'a behavioral failure must strengthen the retried brief');
  assert.match(decision.retryBrief, /answered in chat without files/, 'carries the actual diagnosis, not a generic nudge');
  assert.match(decision.retryBrief, /code fence|complete file/i, 'tells the model the concrete contract to meet');
});

test('[was-red] a dead route retries on a DIFFERENT engine, and only claims a switch that is real', () => {
  const withFallback = resolveTurnRecovery({
    attempt: 1,
    retryable: true,
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(withFallback.retry, true);
  assert.equal(withFallback.switchModel, true);
  assert.match(withFallback.notice, /Gemini Flash/, 'the notice names the engine it will actually use');

  // No second engine available: retrying the same one is still worth one
  // attempt, but the notice must not claim a switch that will not happen —
  // that is the same class of lie as "Deployed golden transactions: success".
  const withoutFallback = resolveTurnRecovery({ attempt: 1, retryable: true });
  assert.equal(withoutFallback.retry, true);
  assert.doesNotMatch(withoutFallback.notice, /switch/i);
});

test('a contract failure keeps its engine — the fix is the brief, not the route', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'no code fences',
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(decision.retry, true);
  assert.notEqual(decision.switchModel, true, 'behavioral failures are repaired by instruction, not by rerouting');
});

test('the retry budget still bounds the loop whatever the diagnosis', () => {
  for (const input of [
    { code: 'BUILD_ARTIFACT_CONTRACT', failureDetail: 'x' },
    { retryable: true, fallbackEngineName: 'Gemini Flash' },
    { networkError: true },
  ]) {
    const decision = resolveTurnRecovery({ attempt: MAX_TURN_ATTEMPTS, ...input });
    assert.equal(decision.retry, false, `${JSON.stringify(input)} must stop at the budget`);
  }
});

/*
 * THE MANUAL-RETRY GAP (2026-09-01, second screenshot). The automatic loop
 * switches engines, but the "Retry with fallback" chip sent only prose —
 * "Retry this same job on the next available model" — which routing ignores.
 * Two consecutive manual turns both ran Nemotron 3 Super 120B; the second
 * burned the full 175s deadline re-proving what the first already proved.
 * The chip must carry the override, not a prayer to the router.
 */

test('[was-red] the retry chip pins the next untried engine, not a prayer to routing', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B'],
    fallbackEngine: { id: 'google/gemini-flash', name: 'Gemini Flash' },
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.ok(chip, 'the retry move survives');
  assert.equal(chip.modelOverrideId, 'google/gemini-flash', 'the tap re-runs on the named engine, not the one that failed');
  assert.match(chip.label, /Gemini Flash/, 'the label names the engine so the promise is checkable');
});

test('stream-ended offers the same pinned retry', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'stream-ended',
    errorMessage: 'the response stream ended unexpectedly',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B'],
    fallbackEngine: { id: 'google/gemini-flash', name: 'Gemini Flash' },
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.equal(chip?.modelOverrideId, 'google/gemini-flash');
});

test('with no untried engine left, the chip claims nothing it cannot do', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Engine A', 'Engine B'],
    fallbackEngine: null,
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.ok(chip, 'retry stays available even without an override');
  assert.equal(chip.modelOverrideId, undefined, 'no override is stamped when none exists');
  assert.doesNotMatch(chip.label, /retry on /i, 'the label never names an engine it will not use');
});
