import assert from 'node:assert/strict';
import test from 'node:test';

import {
  minutesToIsoDuration,
  normalizeLocalTime,
  normalizeSerpApiFlights,
  searchSerpApiFlights,
} from './serpapi-flights.js';

/*
 * A real SIN→DPS response, trimmed to two offers. Written from live output
 * rather than invented, because every trap in this mapper came from the shape
 * the provider actually sends — not from the shape it was assumed to send.
 */
const LIVE_SAMPLE = {
  search_parameters: {
    engine: 'google_flights',
    type: '2',
    departure_id: 'SIN',
    arrival_id: 'DPS',
    outbound_date: '2026-09-15',
    currency: 'SGD',
  },
  best_flights: [
    {
      flights: [
        {
          departure_airport: { name: 'Singapore Changi Airport', id: 'SIN', time: '2026-09-15 19:25' },
          arrival_airport: { name: 'I Gusti Ngurah Rai International Airport', id: 'DPS', time: '2026-09-15 22:20' },
          duration: 175,
          airline: 'Jetstar',
          travel_class: 'Economy',
          flight_number: 'JQ 89',
        },
      ],
      total_duration: 175,
      price: 175,
      type: 'One way',
      booking_token: 'WyJDalJJVTNaRFVIcDBTRmhSV1VGQlRqVkZiMmRDUnkwdCJd',
    },
    {
      flights: [
        {
          departure_airport: { name: 'Singapore Changi Airport', id: 'SIN', time: '2026-09-15 14:15' },
          arrival_airport: { name: 'I Gusti Ngurah Rai International Airport', id: 'DPS', time: '2026-09-15 17:00' },
          duration: 165,
          airline: 'TransNusa',
          travel_class: 'Economy',
          flight_number: '8B 554',
        },
      ],
      total_duration: 165,
      price: 190,
      type: 'One way',
      booking_token: 'WyJDalJJVTNaRFVIcDBTRmhSV1VGQlRqVkZiMmRDUnkwdSJd',
    },
  ],
};

test('a live response maps onto the shape the board already renders', () => {
  const [first, second] = normalizeSerpApiFlights(LIVE_SAMPLE);

  assert.equal(first.airline, 'Jetstar');
  assert.equal(first.flightNumber, 'JQ 89');
  assert.equal(first.price, 175);
  assert.equal(first.direct, true);
  assert.equal(second.airline, 'TransNusa');
  assert.equal(second.price, 190);
});

/*
 * THE TRAP THAT MATTERS MOST.
 *
 * SerpApi puts currency on search_parameters, not on the offer. Reading it per
 * offer yields null, and the board renders `{currency} {price}` — so the user
 * sees a bare "175". A number with no unit is worse than no price at all.
 */
test('currency comes from the search, not the offer', () => {
  for (const flight of normalizeSerpApiFlights(LIVE_SAMPLE)) {
    assert.equal(flight.currency, 'SGD', 'every offer carries the searched currency');
  }
});

test('a response with no currency says so rather than guessing one', () => {
  const [flight] = normalizeSerpApiFlights({
    ...LIVE_SAMPLE,
    search_parameters: { engine: 'google_flights' },
  });
  assert.equal(flight.currency, null, 'a missing unit is null, never a default');
});

/*
 * Duffel's `duration` is an ISO 8601 string; SerpApi's total_duration is
 * minutes. One field carrying two types across providers is a contract break
 * that only surfaces when something finally formats it.
 */
test('duration matches the type Duffel established', () => {
  assert.equal(normalizeSerpApiFlights(LIVE_SAMPLE)[0].duration, 'PT2H55M');
  assert.equal(minutesToIsoDuration(175), 'PT2H55M');
  assert.equal(minutesToIsoDuration(60), 'PT1H');
  assert.equal(minutesToIsoDuration(45), 'PT45M');
  assert.equal(minutesToIsoDuration(0), null);
  assert.equal(minutesToIsoDuration(undefined), null);
});

test('local airport times parse, without a timezone being invented', () => {
  assert.equal(normalizeLocalTime('2026-09-15 19:25'), '2026-09-15T19:25');
  assert.doesNotMatch(normalizeLocalTime('2026-09-15 19:25') || '', /Z|[+-]\d\d:\d\d$/,
    'no offset was sent, so none may be implied');
  assert.equal(normalizeLocalTime(''), null);
  assert.equal(normalizeLocalTime(undefined), null);
});

test('a connecting itinerary is not called direct', () => {
  const connecting = normalizeSerpApiFlights({
    search_parameters: { currency: 'SGD' },
    best_flights: [{
      total_duration: 400,
      price: 260,
      flights: [
        { airline: 'Scoot', flight_number: 'TR 1', departure_airport: { time: '2026-09-15 08:00' }, arrival_airport: { time: '2026-09-15 10:00' } },
        { airline: 'Scoot', flight_number: 'TR 2', departure_airport: { time: '2026-09-15 12:00' }, arrival_airport: { time: '2026-09-15 14:40' } },
      ],
    }],
  });
  assert.equal(connecting[0].direct, false);
  assert.equal(connecting[0].departure, '2026-09-15T08:00', 'first leg departs');
  assert.equal(connecting[0].arrival, '2026-09-15T14:40', 'last leg arrives');
});

test('best_flights lead, because that is the ranking the source gave', () => {
  const ranked = normalizeSerpApiFlights({
    search_parameters: { currency: 'SGD' },
    best_flights: [{ total_duration: 100, price: 1, flights: [{ airline: 'Best', flight_number: 'B 1' }] }],
    other_flights: [{ total_duration: 100, price: 2, flights: [{ airline: 'Other', flight_number: 'O 1' }] }],
  });
  assert.deepEqual(ranked.map((flight) => flight.airline), ['Best', 'Other']);
});

test('an empty or malformed payload yields nothing, never a placeholder', () => {
  assert.deepEqual(normalizeSerpApiFlights({}), []);
  assert.deepEqual(normalizeSerpApiFlights(null), []);
  assert.deepEqual(normalizeSerpApiFlights({ best_flights: [{ flights: [] }] }), [],
    'an offer with no segments is not a flight');
});

test('the list is capped the way the Duffel path caps it', () => {
  const many = {
    search_parameters: { currency: 'SGD' },
    best_flights: Array.from({ length: 9 }, (unused, index) => ({
      total_duration: 100,
      price: index,
      flights: [{ airline: `Air ${index}`, flight_number: `X ${index}` }],
    })),
  };
  assert.equal(normalizeSerpApiFlights(many).length, 5);
});

test('the booking token is kept, so a booking link stays possible later', () => {
  const [flight] = normalizeSerpApiFlights(LIVE_SAMPLE);
  assert.equal(flight.bookingToken, 'WyJDalJJVTNaRFVIcDBTRmhSV1VGQlRqVkZiMmRDUnkwdCJd');
  assert.equal(flight.id, flight.bookingToken, 'and doubles as a stable list key');
});

/*
 * The live call. A provider that does not answer must produce a failure, never
 * a fare — the same rule the Duffel path holds, checked here because this is a
 * second way into the same board.
 */
const okResponse = (body: any) => ({ ok: true, json: async () => body }) as any;

test('a real answer is labelled with where the numbers came from', async () => {
  const result = await searchSerpApiFlights('key', (async () => okResponse(LIVE_SAMPLE)) as any, {
    origin: 'SIN', destination: 'DPS', departureDate: '2026-09-15', currency: 'SGD',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.source, 'Google Flights', 'not a house brand — the real origin');
  assert.equal(result.flights.length, 2);
  assert.equal(result.flights[0].currency, 'SGD');
});

test('no key is said plainly, and invents nothing', async () => {
  const result = await searchSerpApiFlights('', (async () => okResponse(LIVE_SAMPLE)) as any, {});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'NOT_CONFIGURED');
  assert.match(result.message, /SERPAPI_API_KEY/);
  assert.equal(result.flights, undefined, 'a failure carries no fares');
});

/*
 * SerpApi reports its own failures inside a 200 body. Trusting the status code
 * alone would turn an error into an empty-but-successful search.
 */
test('an error inside a 200 body is still a failure', async () => {
  const result = await searchSerpApiFlights('key', (async () => okResponse({ error: 'Invalid API key' })) as any, {});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'PROVIDER_ERROR');
  assert.equal(result.flights, undefined);
});

test('an empty result is reported, not padded', async () => {
  const result = await searchSerpApiFlights('key', (async () => okResponse({ search_parameters: {} })) as any, {});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'NO_RESULTS');
});

test('a thrown request fails honestly', async () => {
  const result = await searchSerpApiFlights('key', (async () => { throw new Error('network'); }) as any, {});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'PROVIDER_ERROR');
});

test('a return date makes it a round trip, and is sent', async () => {
  let called = '';
  await searchSerpApiFlights('key', (async (url: string) => { called = url; return okResponse(LIVE_SAMPLE); }) as any, {
    origin: 'SIN', destination: 'DPS', departureDate: '2026-09-15', returnDate: '2026-09-20', currency: 'SGD',
  });
  assert.match(called, /type=1/, 'one way is 2; a return date is a round trip');
  assert.match(called, /return_date=2026-09-20/);

  let oneWay = '';
  await searchSerpApiFlights('key', (async (url: string) => { oneWay = url; return okResponse(LIVE_SAMPLE); }) as any, {
    origin: 'SIN', destination: 'DPS', departureDate: '2026-09-15',
  });
  assert.match(oneWay, /type=2/);
  assert.doesNotMatch(oneWay, /return_date/);
});
