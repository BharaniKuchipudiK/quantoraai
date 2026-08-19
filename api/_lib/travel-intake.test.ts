import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFlightSearchDraft,
  buildHotelSearchDraft,
  detectDirectTravelIntent,
  parseTravelDate,
} from './travel-intake.js';

const NOW = new Date('2026-08-19T11:00:00Z');

test('recognizes the exact Bali live-flight request as deterministic flight search', () => {
  const body = {
    studioDomain: 'travel',
    message: 'Help me book flights to Bali from Singapore on 31 August',
    history: [],
  };
  assert.equal(detectDirectTravelIntent(body), 'flight_search');
  const draft = buildFlightSearchDraft(body, NOW);
  assert.equal(draft.input, undefined);
  assert.match(draft.question || '', /one-way or return/i);
});

test('builds a complete flight search from destination, origin, departure date and nights', () => {
  const draft = buildFlightSearchDraft({
    message: 'Help me book flights to Bali from Singapore on 31 August for 3 nights',
    history: [],
  }, NOW);
  assert.deepEqual(draft.input, {
    origin: 'Singapore',
    destination: 'Bali',
    departureDate: '2026-08-31',
    returnDate: '2026-09-03',
    adults: 1,
    cabinClass: 'economy',
  });
});

test('keeps the live flight intent across a short clarification answer', () => {
  const body = {
    message: 'Return 3 September',
    history: [
      { sender: 'user', text: 'Help me book flights to Bali from Singapore on 31 August' },
      { sender: 'ai', text: 'Is this a one-way or return trip?' },
    ],
  };
  assert.equal(detectDirectTravelIntent(body), 'flight_search');
  const draft = buildFlightSearchDraft(body, NOW);
  assert.equal(draft.input?.origin, 'Singapore');
  assert.equal(draft.input?.destination, 'Bali');
  assert.equal(draft.input?.departureDate, '2026-08-31');
  assert.equal(draft.input?.returnDate, '2026-09-03');
});

test('uses only user history to complete a multi-turn flight intake', () => {
  const draft = buildFlightSearchDraft({
    message: 'return on 3 September',
    history: [
      { sender: 'user', text: 'Help me book flights to Bali from Singapore' },
      { sender: 'ai', text: 'I think Tokyo is better and you should fly from Kuala Lumpur.' },
      { sender: 'user', text: 'depart on 31 August' },
    ],
  }, NOW);
  assert.equal(draft.input?.origin, 'Singapore');
  assert.equal(draft.input?.destination, 'Bali');
  assert.equal(draft.input?.departureDate, '2026-08-31');
  assert.equal(draft.input?.returnDate, '2026-09-03');
});

test('parses month/day travel dates without silently using a past year', () => {
  assert.equal(parseTravelDate('31 August', NOW), '2026-08-31');
  assert.equal(parseTravelDate('1 January', NOW), '2027-01-01');
});

test('hotel intake derives checkout date from number of nights', () => {
  const draft = buildHotelSearchDraft({
    message: 'Find hotels in Bali on 31 August for 3 nights for 2 adults',
    history: [],
  }, NOW);
  assert.deepEqual(draft.input, {
    location: 'Bali',
    checkInDate: '2026-08-31',
    checkOutDate: '2026-09-03',
    adults: 2,
    rooms: 1,
  });
});
