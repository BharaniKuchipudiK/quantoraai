import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTravelBrief } from './travel-board-brief.js';

/*
 * Fixture dates move with the clock. A literal future date is valid the day it
 * is written and INVALID_ARGUMENT the morning after it passes — a red suite no
 * diff caused. That happened on 2026-09-03 and again, still armed, on 09-07.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days) =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const DEPARTURE_DATE = isoDaysFromNow(30);
const RETURN_DATE = isoDaysFromNow(38);

const from = (...texts) => ({ messages: texts.map((text) => ({ sender: 'user', text })) });

test('inactive until the traveller has spoken', () => {
  assert.equal(deriveTravelBrief({ messages: [] }).active, false);
  assert.equal(deriveTravelBrief({}).active, false);
  assert.equal(deriveTravelBrief({ messages: [{ sender: 'ai', text: 'Where to?' }] }).active, false);
});

test('active on the first user turn, with nothing invented', () => {
  const brief = deriveTravelBrief(from('I want to plan a trip'));
  assert.equal(brief.active, true);
  assert.equal(brief.canSearchFlights, false);
  assert.equal(brief.canSearchHotels, false);
  assert.equal(brief.destinationLabel, '');
  assert.deepEqual(brief.missing, ['place', 'origin', 'destination', 'departureDate']);
  assert.match(brief.next, /Where are you heading/i);
});

test('a named city enables stays and is never asked for again', () => {
  const brief = deriveTravelBrief(from('I am going to Singapore in December'));
  assert.equal(brief.destinationLabel, 'Singapore');
  assert.equal(brief.canSearchHotels, true);
  assert.equal(brief.missing.includes('place'), false, 'a city already given is never asked for again');
  assert.doesNotMatch(brief.next, /Where are you heading/i);
});

test('a bare city reply answers the question', () => {
  const brief = deriveTravelBrief({
    messages: [
      { sender: 'user', text: 'find me somewhere to stay' },
      { sender: 'ai', text: 'Which city?' },
      { sender: 'user', text: 'Singapore' },
    ],
  });
  assert.equal(brief.destinationLabel, 'Singapore');
  assert.equal(brief.canSearchHotels, true);
});

test('a preference is not a city, so stays stay disabled', () => {
  const brief = deriveTravelBrief(from('beach resorts with kids clubs'));
  assert.equal(brief.destinationLabel, '');
  assert.equal(brief.canSearchHotels, false);
  assert.equal(brief.missing.includes('place'), true);
});

test('multi-word places survive, trailing prose does not', () => {
  assert.equal(deriveTravelBrief(from('trip to New York City next month')).destinationLabel, 'New York City');
  assert.equal(deriveTravelBrief(from('flying to Gold Coast and then home')).destinationLabel, 'Gold Coast');
});

test('the newest destination wins over an earlier one', () => {
  const brief = deriveTravelBrief(from('going to Bali', 'actually going to Lisbon'));
  assert.equal(brief.destinationLabel, 'Lisbon');
});

test('a full route with a date enables live flights', () => {
  const brief = deriveTravelBrief(from(`SIN to DPS on ${DEPARTURE_DATE}`));
  assert.deepEqual(
    { origin: brief.origin, destination: brief.destination, departureDate: brief.departureDate },
    { origin: 'SIN', destination: 'DPS', departureDate: DEPARTURE_DATE },
  );
  assert.equal(brief.canSearchFlights, true);
});

test('airports named across separate turns still make a route', () => {
  const brief = deriveTravelBrief(from('I fly from SIN', 'into DPS', `dates ${DEPARTURE_DATE} to ${RETURN_DATE}`));
  assert.equal(brief.origin, 'SIN');
  assert.equal(brief.destination, 'DPS');
  assert.equal(brief.departureDate, DEPARTURE_DATE);
  assert.equal(brief.returnDate, RETURN_DATE);
  assert.equal(brief.canSearchFlights, true);
});

test('a currency conversion is not a flight route', () => {
  const brief = deriveTravelBrief(from('convert 2000 USD to SGD for this trip'));
  assert.equal(brief.origin, '');
  assert.equal(brief.destination, '');
  assert.equal(brief.canSearchFlights, false);
});

test('a lowercase place is never read as an airport code', () => {
  const brief = deriveTravelBrief(from('flying from bali next week'));
  assert.equal(brief.origin, '');
  assert.equal(brief.canSearchFlights, false);
});

test('an airport code is not offered to Places as a city', () => {
  const brief = deriveTravelBrief(from('flying to DPS'));
  assert.equal(brief.destinationLabel, '');
  assert.equal(brief.canSearchHotels, false);
});

test('a route without a date cannot search flights, and says what is missing', () => {
  const brief = deriveTravelBrief(from('SIN to DPS'));
  assert.equal(brief.canSearchFlights, false);
  assert.deepEqual(brief.missing, ['departureDate']);
  assert.match(brief.next, /date/i);
  assert.doesNotMatch(brief.next, /airport/i, 'both airports are known, so neither is asked for');
});

test('the newest dates replace an earlier answer', () => {
  const earlier = isoDaysFromNow(30);
  const later = isoDaysFromNow(45);
  const brief = deriveTravelBrief(from(`SIN to DPS on ${earlier}`, `actually ${later}`));
  assert.equal(brief.departureDate, later);
});

/*
 * The board's own real estate is part of its promise. "Your trip — one screen"
 * was spending two wrapped lines of prose on a sentence that re-stated the
 * chips directly underneath it. A complete trip has nothing left to ask for,
 * so it should ask for nothing.
 */
test('a complete trip says nothing, so the board shrinks', () => {
  const brief = deriveTravelBrief(from(`SIN to DPS on ${DEPARTURE_DATE}`, 'going to Bali'));
  assert.equal(brief.canSearchFlights, true);
  assert.equal(brief.canSearchHotels, true);
  assert.deepEqual(brief.missing, []);
  assert.equal(brief.next, '');
});

test('the next line stays short enough not to wrap the board', () => {
  const cases = [
    from('I want to plan a trip'),
    from('going to Bali'),
    from('SIN to DPS'),
    from('flying to Uluwatu, Bali'),
    from(`leaving ${DEPARTURE_DATE}`),
  ];
  for (const messages of cases) {
    const { next } = deriveTravelBrief(messages);
    assert.equal(next.length <= 80, true, `too long to sit on one line: ${next}`);
  }
});

test('stays already working is said as such, not as a blocked trip', () => {
  const brief = deriveTravelBrief(from('going to Bali'));
  assert.equal(brief.canSearchHotels, true);
  assert.match(brief.next, /^For flights:/);
  assert.deepEqual(brief.missing, ['origin', 'destination', 'departureDate']);
});
