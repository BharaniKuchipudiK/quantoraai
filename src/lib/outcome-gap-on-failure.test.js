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
import { detectOutcomeGaps } from './outcome-gap-detection.js';

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

test('[was-red] every chip surface refuses to render on a failed turn', () => {
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
