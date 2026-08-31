import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTravelBrief } from './travel-board-brief.js';

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
  assert.match(brief.next, /city or area/);
});

test('a named city enables stays and is never asked for again', () => {
  const brief = deriveTravelBrief(from('I am going to Singapore in December'));
  assert.equal(brief.destinationLabel, 'Singapore');
  assert.equal(brief.canSearchHotels, true);
  assert.doesNotMatch(brief.next, /city or area/);
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
  assert.match(brief.next, /city or area/);
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
  const brief = deriveTravelBrief(from('SIN to DPS on 2026-09-12'));
  assert.deepEqual(
    { origin: brief.origin, destination: brief.destination, departureDate: brief.departureDate },
    { origin: 'SIN', destination: 'DPS', departureDate: '2026-09-12' },
  );
  assert.equal(brief.canSearchFlights, true);
});

test('airports named across separate turns still make a route', () => {
  const brief = deriveTravelBrief(from('I fly from SIN', 'into DPS', 'dates 2026-09-12 to 2026-09-20'));
  assert.equal(brief.origin, 'SIN');
  assert.equal(brief.destination, 'DPS');
  assert.equal(brief.departureDate, '2026-09-12');
  assert.equal(brief.returnDate, '2026-09-20');
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
  assert.match(brief.next, /departure date/);
  assert.doesNotMatch(brief.next, /airport you fly/);
});

test('the newest dates replace an earlier answer', () => {
  const brief = deriveTravelBrief(from('SIN to DPS on 2026-09-12', 'actually 2026-10-01'));
  assert.equal(brief.departureDate, '2026-10-01');
});
