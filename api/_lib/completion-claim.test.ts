import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { claimsCompletion } from './completion-claim.js';

/**
 * ---------------------------------------------------------------------------
 * QIR PHASE 5 — THE OUTCOME CONTRACT BINDS THE CLAIM.
 *
 * The desk may build whatever it likes. It may not tell the user the work is
 * finished unless a verifier says so. conversation-engine has enforced that on
 * every turn — the missing piece was that its DETECTOR was one prose regex.
 *
 * Measured 2026-09-05, before this file existed:
 *
 *   RECALL     4/15 = 27%    PRECISION  4/7 = 57%
 *
 * This is a CORRECTNESS gate, not a reachability one, so it is built like
 * travel-comprehension.test.js: two numbers that pull against each other, an
 * adversarial corpus held apart, and deliberate losses named rather than
 * absorbed into a budget.
 *
 * WHICH NUMBER IS THE HARDER FLOOR, AND WHY IT IS PRECISION
 *
 * A miss lets an unbacked "your app is ready" reach the user as fact — bad.
 * A false positive prints "That reply said the work is done — nothing has
 * verified it" under a reply that never claimed it — worse. That is the
 * platform contradicting a correct model in front of the user, which is the
 * shape that cost three separate incidents in one night. And per §5, a gate
 * that fires on ambiguous evidence is the one the next person mutes, after
 * which it protects nothing.
 * ---------------------------------------------------------------------------
 */

/** Replies that DO claim the work is finished. Every one must be caught. */
const CLAIMS = [
  'Your app is ready.',
  'I have completed the dashboard.',
  "I've finished the landing page.",
  'The website is done.',
  'All set — your CRM is live and working.',
  'Done! Your storefront is up.',
  'Finished. Everything is wired.',
  'That is everything working end to end.',
  'Your site is now fully built and functional.',
  'I built it and it works.',
  'Shipped.',
  'Here is your finished CRM.',
  'The build succeeded and the preview is running.',
  'Everything you asked for is in place.',
  'I have implemented all five features.',
  'I have now implemented the UI action button to initiate connection to Google Drive directly into the interface.',
  'Your site is ready to use.',
  'The deck is ready to go.',
  'I added the bench utilisation matrix and wired up the pipeline totals.',
  /*
   * Found by conversation-engine.test.ts, NOT by this corpus — the first draft
   * let one hedged word ("ready for") veto a sentence that independently said
   * "is complete", and an older gate caught what the new one missed. Kept here
   * because a corpus that only holds the cases which motivated the fix reads
   * 100% for a detector that has quietly got worse.
   */
  'The presentation is complete and ready for you to use.',
];

/**
 * THE ADVERSARIAL SET — held apart on purpose.
 *
 * A corpus containing only the cases that motivated the fix reads 100% for a
 * detector that has become far more dangerous. These are ordinary replies that
 * contain completion VOCABULARY without making a completion CLAIM, and several
 * are about the subject of the artifact rather than the artifact — a coffee
 * shop that is ready to open is not a build that is finished, the same way
 * "Sarah" was never a place.
 */
const NOT_CLAIMS = [
  'Should the catalogue lead with sarees or services?',
  'Is this ready for you to review, or shall I keep going?',
  'When it is done I will show you a preview.',
  'The coffee shop is ready to open at 7am on weekdays.',
  'This project is complete guesswork without your pricing.',
  'I could not finish — the build failed on a missing import.',
  'Your request is clear, let me start.',
  'The deck is ready to be filled in once you send the numbers.',
  'I have finished reading the file you shared.',
  'The consultant is ready to start on Monday.',
  'Your kitchen is ready to serve by 8am.',
  'The candidate is ready to interview next week.',
  'Once the pipeline is complete I will add the margin engine.',
  'I am going to build the SOW intake next.',
  'I will now implement the UI action button to initiate connection to Google Drive directly into the interface.',
  'The client is done with the discovery phase.',
];

/**
 * DELIBERATE LOSSES — named, with the reason, never absorbed into a budget.
 *
 * Each of these arguably claims completion and is NOT caught. They are all
 * hedged or contentless, and catching them costs precision on the adversarial
 * set above. Recorded so that a future change to this file is a decision
 * somebody makes, rather than a number quietly moving.
 */
const KNOWN_UNHEARD = [
  { text: 'That should do it.', why: 'hedged — "should" is a prediction, and catching it also catches "that should work once you add pricing"' },
  { text: 'There you go!', why: 'carries no completion vocabulary at all; catching it means catching every cheerful handover including a partial one' },
  { text: '🎉', why: 'no text to read; a claim gate cannot bind an emoji without binding every emoji' },
  { text: 'Take a look — I think that covers it.', why: '"I think" is explicitly hedged, and the platform correcting a hedge reads as pedantry' },
];

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

test('precision is 100% — the platform never contradicts a reply that made no claim', () => {
  const wrong = NOT_CLAIMS.filter((text) => claimsCompletion(text));
  assert.deepEqual(
    wrong,
    [],
    'these replies never said the work was done, and the user would be shown a correction under them:\n  '
    + wrong.join('\n  '),
  );
});

test('recall floor — and it may only ever rise', () => {
  const heard = CLAIMS.filter((text) => claimsCompletion(text));
  const recall = pct(heard.length, CLAIMS.length);
  const missed = CLAIMS.filter((text) => !claimsCompletion(text));

  // Measured at 100% on 2026-09-05, up from 27%. Lower this and you are
  // choosing to let unbacked "your app is ready" reach the user again; do it
  // deliberately, in a commit that says why, or not at all.
  const FLOOR = 100;
  assert.ok(
    recall >= FLOOR,
    `recall fell to ${recall}% (floor ${FLOOR}%). Unheard claims reach the user as fact:\n  ${missed.join('\n  ')}`,
  );
});

test('the deliberate losses are still losses, and still deliberate', () => {
  /*
   * If one of these starts being caught, that is not automatically good news —
   * it usually means the detector loosened, and the adversarial test above is
   * the one to trust. Either way it should be a decision, so the entry moves to
   * CLAIMS with a reason rather than KNOWN_UNHEARD silently going stale.
   */
  for (const { text, why } of KNOWN_UNHEARD) {
    assert.equal(
      claimsCompletion(text),
      false,
      `"${text}" is now caught. If that is intended, move it to CLAIMS; the recorded reason was: ${why}`,
    );
  }
});

test('a claim in one sentence is not muted by a hedge in another', () => {
  // Clause scoping, both directions: a hedge must not launder a real claim,
  // and two unrelated halves must not be assembled into one.
  assert.equal(claimsCompletion('I will add pricing next. Your site is done.'), true);
  assert.equal(claimsCompletion('Your site is done. I will add pricing next.'), true);
  assert.equal(claimsCompletion('When the copy is ready I will build it. Shall I start?'), false);
});

test('the engine actually uses this, rather than keeping its own regex', () => {
  /*
   * The §4 half. A detector nobody calls is the defect this file exists to
   * remove, and the inline regex it replaced would go on being the real
   * behaviour while this suite reported a clean run over nothing.
   */
  return readFile(new URL('./conversation-engine.ts', import.meta.url), 'utf8').then((engine) => {
    assert.match(engine, /claimsCompletion\(/, 'conversation-engine must call the measured detector');
    assert.doesNotMatch(
      engine,
      /const claimsOutcomeDone = \/\(\?:/,
      'the inline prose regex is back — it measured 27% recall and 57% precision',
    );
  });
});
