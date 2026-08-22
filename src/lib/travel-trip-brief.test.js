import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTravelTripBrief } from './travel-trip-brief.js';

test('empty Travel has a first question, not a fake itinerary', () => {
  const brief = deriveTravelTripBrief({ messages: [] });
  assert.equal(brief.canSearchFlights, false);
  assert.match(brief.next, /where/i);
});

test('a SIN to DPS hop with a date can search live flights', () => {
  const brief = deriveTravelTripBrief({
    messages: [{ sender: 'user', text: 'Flights SIN to DPS on 2026-09-12 coming back 2026-09-18' }],
  });
  assert.equal(brief.origin, 'SIN');
  assert.equal(brief.destination, 'DPS');
  assert.equal(brief.departureDate, '2026-09-12');
  assert.equal(brief.returnDate, '2026-09-18');
  assert.equal(brief.canSearchFlights, true);
});
