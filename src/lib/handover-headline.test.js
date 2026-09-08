/*
 * A HANDOVER OPENS WITH THE WORK, NOT WITH A RECEIPT.
 *
 * On 2026-09-08 continuing a chat printed nineteen bullets, several of them
 * the same fact restated in different words — "Services: Blouse stitching,
 * Saree draping, Fall stitching, Mehndi" three times. The person who asked to
 * carry on was handed paperwork instead.
 *
 * Shortening it is safe for one specific reason, and this file exists to keep
 * that reason true: the model never reads this text. It reads
 * contract.summary, which stays whole. Only the human's view is trimmed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeFacts, describeSessionHandover, handoverHeadline } from './session-continuity.js';

/* The real contract from the incident, shortened only in count. */
const CONTRACT = {
  summary: {
    goal: 'Your bag is correctly updated to Zero (0)',
    understanding: 'Empty cart verified, 10 distinct photos active',
    facts: [
      'Services: Blouse stitching, Saree draping, Fall stitching, Mehndi',
      'Services: Blouse stitching, Draping, Fall stitching, Mehndi',
      'Services: Blouse stitching, Draping, Fall/Pico, Mehndi',
      'Cart defaults to 0 items',
      'Cart strictly starts at 0 with empty reset control',
      'Boutique weaves: Kanjivaram, Uppada, Gadwal, Jamdani, Paithani',
    ],
    recentIntents: ['Can you make the checkout empty'],
  },
};

test('[was-red] the same fact restated three ways is shown once', () => {
  const facts = dedupeFacts(CONTRACT.summary.facts);
  const services = facts.filter((line) => /^Services:/.test(line));
  assert.equal(services.length, 1, `three restatements of one fact must collapse, got ${services.length}`);
  assert.match(services[0], /Saree draping/, 'and the fullest wording is the one kept');

  /*
   * The two cart lines are NOT collapsed, and that is correct — the second
   * names an empty-reset control the first does not. This assertion originally
   * demanded they merge, which would have meant loosening the rule until it
   * dropped real detail. Over-collapsing is the worse failure: a wall of text
   * is annoying, a silently missing fact is a chat that forgets its own work.
   */
  const carts = facts.filter((line) => /^Cart/.test(line));
  assert.equal(carts.length, 2, 'a fact that adds detail is not a duplicate');
});

test('facts that merely share a subject are NOT collapsed', () => {
  /*
   * The failure this could cause. Over-eager collapsing silently drops real
   * context, which is worse than the wall of text it replaces — the person
   * would never know what went missing.
   */
  const kept = dedupeFacts([
    'Cart defaults to 0 items',
    'Cart must show a running total in rupees',
    'Boutique weaves: Kanjivaram, Uppada, Gadwal',
    'Boutique ships from Hyderabad',
  ]);
  assert.equal(kept.length, 4, `four distinct facts must survive, got ${kept.length}: ${kept.join(' | ')}`);
});

test('[was-red] the headline is short, and says how much it is not showing', () => {
  const head = handoverHeadline(CONTRACT);
  assert.equal(head.goal, 'Your bag is correctly updated to Zero (0)');
  assert.ok(head.shown.length <= 2, `at most two details on screen, got ${head.shown.length}`);
  assert.ok(head.hidden > 0, 'and the rest is counted rather than silently dropped');
  assert.ok(head.carried > head.shown.length, 'the carried total is larger than what is displayed');
});

test('[was-red] nothing is lost — the full set still travels for the model', () => {
  /*
   * The load-bearing property. If shortening the display ever shortened what
   * is carried, a continued chat would quietly forget the work it was
   * continuing, and that is far worse than a long note.
   */
  const full = describeSessionHandover(CONTRACT).lines;
  const head = handoverHeadline(CONTRACT);
  assert.ok(full.length > head.shown.length, 'the full description is unchanged and longer');
  assert.match(full.join('\n'), /Kanjivaram/, 'a fact hidden from the headline is still described');
  /* And the structured summary the model actually reads is untouched. */
  assert.equal(CONTRACT.summary.facts.length, 6);
});

test('an empty or malformed contract produces nothing rather than throwing', () => {
  for (const contract of [null, undefined, {}, { summary: {} }, { summary: { facts: 'not-an-array' } }]) {
    const head = handoverHeadline(contract);
    assert.equal(head.shown.length, 0);
    assert.equal(head.hidden, 0);
  }
});


test('[was-red] every carried detail is either shown or counted, never neither', () => {
  /*
   * The bug this file did not catch on its own, found by an older test: the
   * headline computed two details to show and the note rendered none of them,
   * so they vanished from the screen while the "N more carried quietly" count
   * still treated them as displayed. Silently dropped, and reported as shown.
   */
  const head = handoverHeadline(CONTRACT);
  const detail = dedupeFacts([...CONTRACT.summary.facts, ...CONTRACT.summary.recentIntents]);
  assert.equal(head.shown.length + head.hidden, detail.length,
    'shown + hidden must account for every deduped detail, with none unaccounted for');
});
