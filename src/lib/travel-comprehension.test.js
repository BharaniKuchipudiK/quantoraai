/**
 * The comprehension gate.
 *
 * Every other gate in this repo asks whether something is REACHABLE — is the
 * control wired, is the /api/ path served, is the advertised capability
 * answerable. None of them asks whether the desk understood the person using
 * it, so a parser that was confidently wrong passed all of them, shipped, and
 * was found by a screenshot.
 *
 * This one measures two numbers and refuses to let either slip.
 *
 *   PRECISION must be 100%. A place we report that was never said is an
 *   invented destination, one tap from a live provider search. There is no
 *   acceptable non-zero rate for this and the floor is not negotiable.
 *
 *   RECALL has a floor that may only ever be raised. It measures how often the
 *   desk hears someone who has just told it where they are going; at the time
 *   this gate was written it was 51%, which is what "the board asks Where are
 *   you heading directly under a reply naming the place" looks like as a
 *   number.
 *
 * The two pull against each other on purpose. Recall bought by loosening the
 * parser shows up immediately as an invention here, which is exactly the trade
 * that has to stay visible — the first attempt at this took recall to 100% and
 * would have offered hotels in "Sarah".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTravelBrief } from './travel-board-brief.js';
import {
  NAMES_A_PLACE, NAMES_NO_PLACE, REAL_ROUTES, NOT_PLACES, HOLDOUT_PLACES,
} from './travel-comprehension-corpus.js';

/** Recall may rise, never fall. Raise this when the parser genuinely improves. */
const RECALL_FLOOR = 85;

const brief = (text) => deriveTravelBrief({ messages: [{ sender: 'user', text }] });
const norm = (value) => String(value || '').trim().toLowerCase();
const reported = (b) => b.destinationLabel || b.destination || b.originLabel || b.origin || '';

test('PRECISION: a sentence that names no place yields no place', () => {
  const invented = NAMES_NO_PLACE
    .map((c) => [c.text, reported(brief(c.text))])
    .filter(([, got]) => got);
  assert.deepEqual(invented, [], `invented a place from a sentence with none: ${JSON.stringify(invented)}`);
});

test('PRECISION: a capitalised word is not a place — names, airlines, brands, employers', () => {
  const invented = NOT_PLACES
    .map((text) => [text, reported(brief(text))])
    .filter(([, got]) => got);
  assert.deepEqual(invented, [], `read a non-place proper noun as a place: ${JSON.stringify(invented)}`);
});

test('PRECISION: every place reported was really named', () => {
  const wrong = [...NAMES_A_PLACE, ...REAL_ROUTES, ...HOLDOUT_PLACES]
    .filter((c) => c.dest)
    .map((c) => [c.text, norm(brief(c.text).destinationLabel || brief(c.text).destination), norm(c.dest)])
    .filter(([, got, want]) => got && got !== want);
  assert.deepEqual(wrong, [], `reported a different place than the one named: ${JSON.stringify(wrong)}`);
});

test(`RECALL: the desk hears at least ${RECALL_FLOOR}% of stated destinations`, () => {
  const named = [...NAMES_A_PLACE, ...REAL_ROUTES].filter((c) => c.dest);
  const heard = named.filter((c) => {
    const b = brief(c.text);
    return norm(b.destinationLabel || b.destination) === norm(c.dest);
  });
  const recall = (heard.length / named.length) * 100;
  const deaf = named.filter((c) => !norm(brief(c.text).destinationLabel || brief(c.text).destination))
    .map((c) => c.text);
  assert.ok(
    recall >= RECALL_FLOOR,
    `recall ${recall.toFixed(1)}% is below the ${RECALL_FLOOR}% floor. Deaf to: ${JSON.stringify(deaf, null, 2)}`,
  );
});

test('RECALL generalises: places phrased in ways the fix was not built against', () => {
  const missed = HOLDOUT_PLACES
    .map((c) => [c.text, norm(brief(c.text).destinationLabel || brief(c.text).destination), norm(c.dest)])
    .filter(([, got, want]) => got !== want);
  // A holdout miss is a recall gap, not an invention, so this asserts a budget
  // rather than perfection — the parser is allowed not to understand a
  // phrasing, and is never allowed to guess at one.
  assert.ok(missed.length <= 1, `holdout recall regressed: ${JSON.stringify(missed, null, 2)}`);
});

test('ORIGIN: a stated origin is heard, and never invented from a date range', () => {
  assert.equal(brief('help me book tickets to Bali from Singapore').originLabel, 'Singapore');
  assert.equal(brief('I can travel from Monday to Friday').originLabel || '', '');
  assert.equal(brief('I am available from May to August').originLabel || '', '');
});
