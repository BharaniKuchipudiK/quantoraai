import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTravelBrief } from './travel-board-brief.js';

/**
 * THE PHRASING CORPUS — a gate for the class of bug nothing else was watching.
 *
 * WHY THIS FILE EXISTS
 *
 * Every gate in this repo checks REACHABILITY: is this control wired
 * (wiring-gate), is this /api/ path served (dead-control gate), is this
 * advertised capability answerable (claims gate). Not one of them checks
 * COMPREHENSION — whether the desk understands a sentence a traveller would
 * actually type. So comprehension defects shipped clean every time and were
 * found by a human staring at a screenshot.
 *
 * That is also why "self-healing" never fired on any of them. Retries, circuit
 * breakers and provider fallback all trigger on an ERROR. These produce no
 * error: the parser runs, returns, and is confidently wrong. There is nothing
 * to catch.
 *
 * Two real failures, both from production:
 *
 *   "help me book tickets to Bali from Singapore"
 *      -> destinationLabel: ""   The board asked "Where are you heading?"
 *         directly under a reply that said "your trip to Bali".
 *
 *   "tickets to Bali"
 *      -> destinationLabel: "tickets", canSearchHotels: true
 *         An invented place, with the Stays chip lit, one tap from asking
 *         Google Places for hotels in "tickets".
 *
 * The second is the one that matters: a desk whose whole promise is "never
 * invent" invented a destination. So this corpus carries two duties, and the
 * second outranks the first — when we cannot understand a sentence, returning
 * nothing is correct and guessing at its head is not.
 */

const say = (...texts) => ({ messages: texts.map((text) => ({ sender: 'user', text })) });
const brief = (text) => deriveTravelBrief(say(text));

/** How people actually open a travel chat. Destination must be understood. */
const UNDERSTOOD = [
  ['help me book tickets to Bali from Singapore', 'Bali', 'Singapore'],
  ['book tickets to Bali', 'Bali', ''],
  ['tickets to Bali', 'Bali', ''],
  ['book me a ticket to Bali', 'Bali', ''],
  ['need tickets to Bali', 'Bali', ''],
  ['get me to Bali', 'Bali', ''],
  ['take me to Lisbon', 'Lisbon', ''],
  ['book me a flight from Kuala Lumpur to Tokyo', 'Tokyo', 'Kuala Lumpur'],
  ['flights to Bali from Singapore', 'Bali', 'Singapore'],
  ['I want to go to Bali from Singapore', 'Bali', 'Singapore'],
  ['trip to Bali', 'Bali', ''],
  ['travelling to New York City', 'New York City', ''],
  ['heading for Lisbon', 'Lisbon', ''],
  ['hotels in Seminyak', 'Seminyak', ''],
  ['visiting Gold Coast', 'Gold Coast', ''],
];

for (const [text, destination, origin] of UNDERSTOOD) {
  test(`understands: ${text}`, () => {
    const b = brief(text);
    assert.equal(b.destinationLabel, destination, 'destination');
    assert.equal(b.originLabel, origin, 'origin');
    if (destination) {
      assert.equal(b.missing.includes('place'), false, 'never re-asks for a place it was given');
      assert.doesNotMatch(b.next, /Where are you heading/i);
    }
  });
}

/**
 * Sentences we do NOT understand. The only correct answer is silence — a
 * fragment reported as a destination is a fabrication, and the Stays chip
 * would carry it straight to a live provider.
 */
const MUST_NOT_INVENT = [
  'I am flying from there',
  'somewhere warm',
  'beach resorts with kids clubs',
  'take me home',
  'anywhere cheap',
  'I need a holiday',
  'what can you do',
  'convert 2000 USD to SGD',
  'find me a nice hotel',
  'flying out of the airport',
];

for (const text of MUST_NOT_INVENT) {
  test(`invents nothing for: ${text}`, () => {
    const b = brief(text);
    assert.equal(b.destinationLabel, '', `invented a destination: ${b.destinationLabel}`);
    assert.equal(b.originLabel, '', `invented an origin: ${b.originLabel}`);
    assert.equal(b.canSearchHotels, false, 'and never lights a chip it cannot serve');
  });
}

/**
 * The property behind all of it: a place we report must be a real span of what
 * the traveller wrote, not a fragment left over from a phrase we failed to
 * parse. "tickets" passed a substring check — it IS in the sentence — so the
 * test is stronger: the label must not be immediately followed by a preposition
 * that shows we cut the phrase in half.
 */
test('a reported place is never the severed head of a phrase', () => {
  const severing = [
    'tickets to Bali', 'flights to Tokyo', 'seats to Lisbon',
    'a hotel in Seminyak', 'the way to Rome',
  ];
  for (const text of severing) {
    const { destinationLabel } = brief(text);
    if (!destinationLabel) continue;
    const after = text.slice(text.indexOf(destinationLabel) + destinationLabel.length).trim();
    assert.doesNotMatch(
      after,
      /^(?:to|in|from|for)\b/i,
      `"${destinationLabel}" is the head of "${text}", not its destination`,
    );
  }
});

/** A city is not an airport: naming one must never enable a flight search. */
test('an origin city never unlocks a flight search on its own', () => {
  const b = brief('book tickets to Bali from Singapore');
  assert.equal(b.originLabel, 'Singapore');
  assert.equal(b.origin, '', 'origin stays the IATA field');
  assert.equal(b.canSearchFlights, false);
  assert.equal(b.missing.includes('origin'), true, 'the airport code is still owed');
});
