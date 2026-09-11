/**
 * A FAILED TURN HAS NO OUTCOME, SO IT CANNOT HAVE GAPS.
 *
 * THE INCIDENT (2026-09-08, reported from production). A boutique request was
 * refused at HTTP 429 — declined before any engine started, nothing built,
 * and the desk said so honestly: "Quantora paused this turn — a limit, not a
 * fault." Underneath that message it then offered three chips:
 *
 *     Add real product photos · Add a payment gateway · Domestic or international?
 *
 * Follow-ups to work that does not exist, on a build that was never made.
 *
 * The cause is that detectOutcomeGaps reads intent out of the USER'S PROMPT —
 * "boutique", "sarees", "selling" — and nothing told it whether the turn ran.
 * The message already carried `isError`; three call sites simply never read it.
 *
 * It is worse than incoherent copy. Every chip sends another turn: on a
 * provider failure they spend real budget refining an artifact that is not
 * there, and on a budget refusal they fail again. For a student on a daily
 * allowance those are the most expensive buttons on the screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codingFailureContinues, detectOutcomeGaps } from './outcome-gap-detection.js';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';

const studio = () => readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8')
  .replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

test('the detector really does fire on the refusal text — the guard is load-bearing', () => {
  /*
   * Establishes the defect rather than assuming it. Given the user's prompt and
   * the REFUSAL as the reply, the gap detector still produces shop chips. That
   * is why the fix has to live at the call sites: the detector is doing what it
   * was built to do, on a turn that should never have reached it.
   */
  const prompt = 'Help me build a boutique that is specialized in selling the authentic and traditional indian sarees';
  const refusal = 'Quantora paused this turn — a limit, not a fault. You have used your 60 AI turns for today.';
  const gaps = detectOutcomeGaps(prompt, refusal, { deskChecks: [], deskFacts: null });
  const labels = gaps.map((gap) => gap.label || gap.title || '').join(' | ');
  assert.ok(gaps.length > 0, 'the detector fires on a refused turn — hence the guard');
  assert.match(labels, /payment gateway|Domestic or international|product photos/i);
});

test('[was-red] every inferred-gap surface refuses a failed turn', () => {
  /*
   * Counted, not enumerated. There are three call sites today — the per-message
   * chips, the mission card's label, and the visible-chip set — and guarding
   * two of three would have put the chips back on screen by the third route.
   * Asserting the COUNT means a fourth surface added later without a guard
   * fails here rather than shipping.
   */
  const source = studio();
  const callSites = (source.match(/detectOutcomeGaps\(/g) || []).length;
  assert.equal(callSites, 3, `expected three chip surfaces, found ${callSites} — a new one needs the isError guard too`);

  const guards = (source.match(/!msg\.isError|!lastAiMessage\?\.isError|lastAiMessage\.isError\) return \[\]/g) || []).length;
  assert.equal(
    guards,
    callSites,
    `every chip surface must refuse a failed turn: ${callSites} surfaces, ${guards} guarded`,
  );
});

function failedMessage(kind = 'provider-dead') {
  return {
    id: 'failed-turn',
    ...resolveCodingTurnOutcome({
      kind,
      fallbackEngine: { id: 'synthetic-b', name: 'Synthetic B' },
    }),
  };
}

test('failed Coding turns retain only explicit recovery, including the actual model override', () => {
  const message = failedMessage();
  const recovery = message.continueSet.items[0];
  message.continueSet.items.push({ id: 'gap-photos', label: 'Add real product photos', value: 'Add photos' });
  const selected = codingFailureContinues({ message, latestAiId: message.id });
  assert.deepEqual(selected.items, [recovery]);
  assert.equal(selected.items[0], recovery);
  assert.equal(selected.items[0].modelOverrideId, 'synthetic-b');
  assert.equal(message.continueSet.items.length, 2, 'selection does not mutate the stored message');
});

test('existing smaller-build and rebuild actions remain available without inventing new actions', () => {
  for (const kind of ['timeout', 'no-preview']) {
    const message = failedMessage(kind);
    assert.deepEqual(codingFailureContinues({ message, latestAiId: message.id }), message.continueSet);
  }
});

test('recovery does not leak to old, dismissed, successful, stopped, advisor or Office turns', () => {
  const message = failedMessage();
  const base = { message, latestAiId: message.id };
  for (const overrides of [
    { latestAiId: 'new-turn' },
    { dismissedContinueId: message.id },
    { message: { ...message, isError: false } },
    { message: failedMessage('stopped') },
    ...['education', 'travel', 'finance', 'research'].map((studioDomain) => ({ studioDomain })),
    { officeKind: 'document' },
    { message: { ...message, continueSet: null } },
    { message: { ...message, continueSet: { items: [{ id: 'gap-photos', label: 'Add photos', value: 'Add photos' }] } } },
  ]) assert.equal(codingFailureContinues({ ...base, ...overrides }), null);
});

test('missing and malformed recovery actions are ignored', () => {
  assert.equal(codingFailureContinues(), null);
  const message = failedMessage();
  for (const items of [null, {}, [null], [{ id: 'outcome-retry-fallback', label: '', value: 'Retry' }], [{ id: 'outcome-retry-fallback', label: 'Retry' }]]) {
    assert.equal(codingFailureContinues({ message: { ...message, continueSet: { items } }, latestAiId: message.id }), null);
  }
});
