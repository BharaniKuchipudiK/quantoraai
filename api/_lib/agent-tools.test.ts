import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  executeToolCall,
  isTransactionalTravelTool,
  shouldEnableTravelTools,
  travelFunctionDeclarations,
} from './agent-tools.js';

const declaredNames = travelFunctionDeclarations.map((tool: any) => tool?.name);

/*
 * Travel dates must be relative to today, never hardcoded.
 *
 * These tests used a literal '2026-09-01'. validateTravelToolArgs rejects a
 * departure in the past and runs BEFORE the provider-configured check
 * (agent-tools.ts), so once that date aged out the tools returned
 * INVALID_ARGUMENT instead of the NOT_CONFIGURED these tests assert — and the
 * suite began failing for everyone, on a tree nobody had touched.
 *
 * It went red on 2026-09-03 rather than 2026-09-02 because the validator
 * allows one day of grace, which is exactly why it slipped through: CI was
 * green the evening the calendar was about to roll.
 *
 * A test whose result depends on the wall clock is not a test, so the class
 * closes here: these helpers make the fixtures move with the clock.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}
/** Far enough out that no grace window or timezone offset can make it past. */
const DEPARTURE_DATE = isoDaysFromNow(30);
const RETURN_DATE = isoDaysFromNow(32);

test('no travel date fixture in this file is a literal — the bomb cannot be re-armed', () => {
  /*
   * The instance fix for this class is to bump the literal to a date further
   * out, and that is what happened on main: 2026-09-01 became 2026-12-01 and
   * 2026-12-15, which re-arms the same failure for 2026-12-02. Bumping is the
   * intuitive repair, so the only thing that closes the class is a check that
   * rejects it (CLAUDE.md §7).
   *
   * Precise on purpose (§5): it fires only on a literal YYYY-MM-DD in a travel
   * date ARGUMENT, never on prose, comments, or dates used as data elsewhere —
   * an ambiguous version of this gets muted the first time it cries wolf.
   */
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const literalDateArgs = source.match(
    /(?:dates|departureDate|returnDate|checkInDate|checkOutDate):\s*'\d{4}-\d{2}-\d{2}'/g,
  );
  assert.equal(
    literalDateArgs,
    null,
    `Hardcoded travel dates will fail validateTravelToolArgs once they pass. `
    + `Use DEPARTURE_DATE / RETURN_DATE (or isoDaysFromNow) instead of: ${literalDateArgs?.join(', ')}`,
  );
});

test('travel tools are scoped only to the travel domain', () => {
  assert.equal(shouldEnableTravelTools('travel'), true);
  assert.equal(shouldEnableTravelTools('research'), false);
  assert.equal(shouldEnableTravelTools('finance'), false);
  assert.equal(shouldEnableTravelTools(null), false);
  assert.equal(shouldEnableTravelTools(undefined), false);
});

test('transactional travel tools are not exposed to the model', () => {
  for (const name of ['create_price_alert', 'make_reservation', 'book_attraction']) {
    assert.equal(isTransactionalTravelTool(name), true);
    assert.equal(declaredNames.includes(name), false, `${name} must not be in Gemini function declarations`);
  }
});

test('transactional travel calls fail closed and never fabricate success', async () => {
  const booking = await executeToolCall('make_reservation', {
    bookingType: 'flight',
    itemId: 'off_test',
    dates: DEPARTURE_DATE,
    price: 100,
  }, { duffelClient: null, googleMapsApiKey: null });

  assert.equal(booking.status, 'unavailable');
  assert.equal(booking.executed, false);
  assert.equal(booking.reason, 'TRANSACTION_DISABLED');
  assert.match(booking.message, /nothing was booked/i);
  assert.equal('confirmationCode' in booking, false);
  assert.equal('bookingReference' in booking, false);
  assert.equal('pnr' in booking, false);

  const alert = await executeToolCall('create_price_alert', {
    entityType: 'flight',
    destination: 'LHR',
    dates: DEPARTURE_DATE,
  }, { duffelClient: null, googleMapsApiKey: null });

  assert.equal(alert.status, 'unavailable');
  assert.equal(alert.executed, false);
  assert.equal('alertId' in alert, false);
  assert.match(alert.message, /nothing was .*monitored|not enabled/i);
});

test('unconnected read-only travel providers stop the agent instead of returning mock data or retrying', async () => {
  const flight = await executeToolCall('search_flights', {
    origin: 'SIN',
    destination: 'LHR',
    departureDate: DEPARTURE_DATE,
  }, { duffelClient: null, googleMapsApiKey: null });
  assert.equal(flight.status, 'unavailable');
  assert.equal(flight.executed, false);
  assert.equal(flight.action, 'PAUSE_AND_ASK');
  assert.equal(flight.reason, 'NOT_CONFIGURED');
  assert.equal(flight.retryable, false);
  assert.match(flight.message, /DUFFEL_API_KEY|not connected/i);
  assert.doesNotMatch(flight.message, /provider answers/i);
  assert.equal('flights' in flight, false, 'must not substitute mock flight results');

  const hotel = await executeToolCall('search_hotels', {
    location: 'London',
    checkInDate: DEPARTURE_DATE,
    checkOutDate: RETURN_DATE,
  }, { duffelClient: null, googleMapsApiKey: null });
  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.action, 'PAUSE_AND_ASK');
  assert.match(hotel.message, /London/i);
  assert.doesNotMatch(hotel.message, /if you have not/i);
  assert.match(hotel.message, /not connected|will not invent/i);
  assert.equal('hotels' in hotel, false, 'must not substitute hard-coded hotels');

  const vibeOnly = await executeToolCall('search_hotels', {
    location: "Beach resorts with kids' clubs",
  }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn: (async () => {
      throw new Error('Places must not be called until a city is named');
    }) as typeof fetch,
  });
  assert.equal(vibeOnly.action, 'PAUSE_AND_ASK');
  assert.equal(vibeOnly.executed, false);
  assert.match(vibeOnly.message, /city or area/i);
  assert.equal('hotels' in vibeOnly, false);

  const attraction = await executeToolCall('search_attractions', { location: 'London' }, {
    duffelClient: null,
    googleMapsApiKey: null,
  });
  assert.equal(attraction.status, 'unavailable');
  assert.equal(attraction.action, 'PAUSE_AND_ASK');
  assert.equal('attractions' in attraction, false, 'must not substitute hard-coded attractions');

  const namedCity = await executeToolCall('search_attractions', { location: '' }, {
    duffelClient: null,
    googleMapsApiKey: null,
    recentUserTexts: ['give me the list o attactions in Vizag and include the hotels to stay'],
  });
  assert.match(namedCity.message, /Vizag/i);
  assert.doesNotMatch(namedCity.message, /Name the city/i);

  const route = await executeToolCall('get_places_routing', {
    origin: 'London Heathrow Airport',
    destination: 'London Bridge',
  }, { googleMapsApiKey: null });
  assert.equal(route.status, 'unavailable');
  assert.equal(route.action, 'PAUSE_AND_ASK');
  assert.equal('route' in route, false, 'must not substitute hard-coded route results');
});

test('Google Places hotel discovery returns provider-backed facts without fake inventory or room rates', async () => {
  let capturedRequest: any = null;
  const fetchFn = (async (url: any, init: any) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({
      places: [
        {
          id: 'hotel-1',
          displayName: { text: 'Example Hotel' },
          formattedAddress: '1 Example Road, London, UK',
          location: { latitude: 51.5, longitude: -0.12 },
          rating: 4.6,
          userRatingCount: 1234,
          primaryType: 'hotel',
          types: ['hotel', 'lodging'],
          businessStatus: 'OPERATIONAL',
          websiteUri: 'https://example.test',
          googleMapsUri: 'https://maps.google.test/example',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await executeToolCall('search_hotels', {
    location: 'London',
    checkInDate: DEPARTURE_DATE,
    checkOutDate: RETURN_DATE,
    guests: 2,
    minStarRating: 4,
  }, {
    duffelClient: null,
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.source, 'Google Places API (New)');
  assert.equal(result.hotels.length, 1);
  assert.equal(result.hotels[0].name, 'Example Hotel');
  assert.equal(result.hotels[0].userRating, 4.6);
  assert.equal('price' in result.hotels[0], false);
  assert.equal('nightlyRate' in result.hotels[0], false);
  assert.equal('available' in result.hotels[0], false);
  assert.equal(result.searchContext.inventoryAndRatesAvailable, false);
  assert.match(result.mandatoryShortlist, /★ 4\.6\/5 \(1234\)/);
  assert.match(result.mandatoryShortlist, /https:\/\/example\.test/);

  assert.equal(capturedRequest.url, 'https://places.googleapis.com/v1/places:searchText');
  const requestBody = JSON.parse(capturedRequest.init.body);
  assert.equal(requestBody.includedType, 'lodging');
  assert.equal(requestBody.strictTypeFiltering, undefined);
  assert.match(requestBody.textQuery, /hotels in London/i);
  assert.equal(capturedRequest.init.headers['X-Goog-Api-Key'], 'test-google-key');
  assert.match(capturedRequest.init.headers['X-Goog-FieldMask'], /places\.rating/);
});

test('a hotel ratings request that hits routing is executed as Places hotel search', async () => {
  let capturedUrl = '';
  const fetchFn = (async (url: any) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({
      places: [{
        id: 'hotel-tokyo',
        displayName: { text: 'Live Tokyo Hotel' },
        rating: 4.4,
        userRatingCount: 88,
        websiteUri: 'https://live.example',
        googleMapsUri: 'https://maps.google.test/live',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await executeToolCall('get_places_routing', {
    query: 'hotels in Asakusa Tokyo',
  }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.hotels[0].name, 'Live Tokyo Hotel');
  assert.match(capturedUrl, /places\.googleapis\.com/);
  assert.doesNotMatch(capturedUrl, /routes\.googleapis\.com/);
});

test('Google Places powers attraction and generic destination discovery', async () => {
  const fetchFn = (async () => new Response(JSON.stringify({
    places: [
      {
        id: 'poi-1',
        displayName: { text: 'Example Museum' },
        formattedAddress: 'Museum Street',
        rating: 4.8,
        userRatingCount: 900,
        primaryType: 'museum',
        types: ['museum', 'tourist_attraction'],
      },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  const attraction = await executeToolCall('search_attractions', { location: 'London', category: 'museum' }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });
  assert.equal(attraction.status, 'success');
  assert.equal(attraction.attractions[0].name, 'Example Museum');
  assert.equal(attraction.ticketAvailabilityAvailable, false);

  const place = await executeToolCall('get_places_routing', { query: 'museums in London', placeType: 'museum' }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });
  assert.equal(place.status, 'success');
  assert.equal(place.places[0].primaryType, 'museum');
});

test('Google Routes returns real route metrics and uses a narrow field mask', async () => {
  let capturedRequest: any = null;
  const fetchFn = (async (url: any, init: any) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({
      routes: [
        {
          distanceMeters: 28100,
          duration: '1740s',
          polyline: { encodedPolyline: 'encoded-route' },
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await executeToolCall('get_places_routing', {
    origin: 'London Heathrow Airport',
    destination: 'London Bridge',
    travelMode: 'TRANSIT',
  }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.source, 'Google Routes API');
  assert.equal(result.route.distanceMeters, 28100);
  assert.equal(result.route.durationSeconds, 1740);
  assert.equal(result.route.travelMode, 'TRANSIT');
  assert.equal(capturedRequest.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(capturedRequest.init.headers['X-Goog-Api-Key'], 'test-google-key');
  assert.equal(
    capturedRequest.init.headers['X-Goog-FieldMask'],
    'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
  );
  const body = JSON.parse(capturedRequest.init.body);
  assert.deepEqual(body.origin, { address: 'London Heathrow Airport' });
  assert.deepEqual(body.destination, { address: 'London Bridge' });
  assert.equal(body.travelMode, 'TRANSIT');
  assert.equal('routingPreference' in body, false);
});

test('walking routes carry the Google beta-path warning', async () => {
  const fetchFn = (async () => new Response(JSON.stringify({
    routes: [{ distanceMeters: 900, duration: '720s' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  const result = await executeToolCall('get_places_routing', {
    origin: 'Marina Bay Sands',
    destination: 'Merlion Park',
    travelMode: 'WALK',
  }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
  });

  assert.equal(result.status, 'success');
  assert.match(result.route.warning, /beta/i);
});

test('Google provider errors fail closed and terminate the interactive agent step', async () => {
  const fetchFn = (async () => new Response(JSON.stringify({ error: { message: 'API not enabled' } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  const hotel = await executeToolCall('search_hotels', {
    location: 'Tokyo',
    checkInDate: DEPARTURE_DATE,
    checkOutDate: RETURN_DATE,
  }, {
    googleMapsApiKey: 'bad-key',
    fetchFn,
  });
  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.executed, false);
  // A 403 is a refusal, not an outage: Google answered, and it answered "no".
  assert.equal(hotel.reason, 'PROVIDER_REJECTED');
  assert.equal(hotel.action, 'PAUSE_AND_ASK');
  assert.match(hotel.providerMessage, /Google Places API \(New\)/i);
  assert.match(hotel.providerMessage, /rejected|unavailable|not enabled|billing|restriction/i);
  assert.equal('hotels' in hotel, false);

  const route = await executeToolCall('get_places_routing', {
    origin: 'Tokyo Station',
    destination: 'Haneda Airport',
  }, {
    googleMapsApiKey: 'bad-key',
    fetchFn,
  });
  assert.equal(route.status, 'unavailable');
  assert.equal(route.executed, false);
  assert.equal(route.reason, 'PROVIDER_REJECTED');
  assert.equal(route.action, 'PAUSE_AND_ASK');
  assert.equal('route' in route, false);
});

test('a one-word city in chat is used as the hotel location', async () => {
  let capturedBody = '';
  const fetchFn = (async (_url: any, init: any) => {
    capturedBody = String(init?.body || '');
    return new Response(JSON.stringify({
      places: [{
        id: 'sg-1',
        displayName: { text: 'Marina Bay Hotel' },
        rating: 4.5,
        userRatingCount: 10,
        websiteUri: 'https://marina.example',
        googleMapsUri: 'https://maps.google.test/marina',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await executeToolCall('search_hotels', {
    location: "Beach resorts with kids' clubs",
  }, {
    googleMapsApiKey: 'test-google-key',
    fetchFn,
    recentUserTexts: ['Find me hotels', 'Singapore'],
  });

  assert.equal(result.status, 'success');
  assert.match(capturedBody, /Singapore/i);
  assert.doesNotMatch(capturedBody, /Beach resorts/i);
});

test('clarification remains a non-transactional human-in-loop action', async () => {
  const result = await executeToolCall('ask_clarifying_question', { question: 'What is your travel budget?' }, {
    duffelClient: null,
    googleMapsApiKey: null,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.executed, false);
  assert.equal(result.action, 'PAUSE_AND_ASK');
  assert.equal(result.message, 'What is your travel budget?');
});

test('incomplete flight args ask for airports and dates instead of calling a provider', async () => {
  const incomplete = await executeToolCall('search_flights', {
    origin: 'SIN',
  }, {
    duffelClient: {
      offerRequests: {
        create: async () => {
          throw new Error('Duffel must not be called for incomplete flight args');
        },
      },
    } as any,
  });
  assert.equal(incomplete.action, 'PAUSE_AND_ASK');
  assert.equal(incomplete.reason, 'INVALID_ARGUMENT');
  assert.equal(incomplete.retryable, false);
  assert.match(incomplete.message, /destination/i);
  assert.match(incomplete.message, /departure date/i);
  assert.equal('flights' in incomplete, false);
});

test('flight provider failure retries on an alternate Duffel client when configured', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const primary = {
    offerRequests: {
      create: async () => {
        primaryCalls += 1;
        throw new Error('primary duffel down');
      },
    },
  };
  const fallback = {
    offerRequests: {
      create: async () => {
        fallbackCalls += 1;
        return {
          data: {
            offers: [{
              id: 'off_fallback',
              total_amount: '210.00',
              total_currency: 'USD',
              slices: [{
                duration: 'PT2H30M',
                segments: [{
                  departing_at: '2026-09-12T08:00:00Z',
                  arriving_at: '2026-09-12T10:30:00Z',
                  operating_carrier: { name: 'Fallback Air', iata_code: 'FA' },
                  operating_carrier_flight_number: '12',
                  marketing_carrier: { name: 'Fallback Air' },
                }],
              }],
            }],
          },
        };
      },
    },
  };

  const result = await executeToolCall('search_flights', {
    origin: 'SIN',
    destination: 'DPS',
    departureDate: DEPARTURE_DATE,
  }, {
    duffelClient: primary as any,
    duffelFallbackClient: fallback as any,
    providerPolicy: { maxAttempts: 1, timeoutMs: 2_000, baseDelayMs: 0 },
  });

  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.status, 'success');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.flights?.[0]?.id, 'off_fallback');
});

test('complete flight query provider errors stay retryable for turn self-heal', async () => {
  const failing = {
    offerRequests: {
      create: async () => {
        throw new Error('duffel timeout');
      },
    },
  };
  const first = await executeToolCall('search_flights', {
    origin: 'SIN',
    destination: 'DPS',
    departureDate: DEPARTURE_DATE,
  }, {
    duffelClient: failing as any,
    providerPolicy: { maxAttempts: 1, timeoutMs: 1_000, baseDelayMs: 0 },
    turnAttempt: 1,
  });
  assert.equal(first.action, 'PAUSE_AND_ASK');
  assert.equal(first.reason, 'PROVIDER_ERROR');
  assert.equal(first.retryable, true);
  assert.equal(first.autoRetryTurn, true);
  assert.doesNotMatch(first.message, /Retry flight search/);

  const second = await executeToolCall('search_flights', {
    origin: 'SIN',
    destination: 'DPS',
    departureDate: DEPARTURE_DATE,
  }, {
    duffelClient: failing as any,
    providerPolicy: { maxAttempts: 1, timeoutMs: 1_000, baseDelayMs: 0 },
    turnAttempt: 2,
  });
  assert.equal(second.retryable, true);
  assert.equal(second.autoRetryTurn, false);
  assert.match(second.message, /Retry flight search/);
  assert.match(second.message, /quantora-modal/);
});


/*
 * The Uluwatu turn, end to end.
 *
 * Places refused the request (a 403 from an unenabled API or a restricted key)
 * and the desk answered "Places did not return a list — I will not invent one.
 * Retry in a moment." Three things were wrong at once: it described a refusal
 * as an empty result, it blamed the destination for our configuration, and it
 * advised a retry that would reissue the identical request and be refused
 * identically. The last one is a dead control written as a sentence.
 */
test('a refused Places lookup never reaches the traveller as a retry', async () => {
  let calls = 0;
  const refusing = (async () => {
    calls += 1;
    return {
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: 'Places API (New) has not been used in this project before or it is disabled.' } }),
      json: async () => ({}),
    };
  }) as unknown as typeof fetch;

  const hotel: any = await executeToolCall('search_hotels', { location: 'Uluwatu, Bali' }, {
    duffelClient: null,
    googleMapsApiKey: 'test-google-key',
    fetchFn: refusing,
  });

  assert.equal(calls > 0, true, 'the call was actually attempted');
  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.reason, 'PROVIDER_REJECTED', 'a refusal is not a generic provider error');
  assert.equal(hotel.retryable, false, 'and nothing upstream should schedule another attempt');
  assert.equal(hotel.providerStatus, 403, 'the status survives for a diagnosis to name');

  assert.match(hotel.message, /Uluwatu, Bali/, 'the place is named, so nobody re-types it');
  assert.match(hotel.message, /refused/i);
  assert.doesNotMatch(hotel.message, /retry|try again|in a moment/i);
  assert.match(hotel.message, /not invent/i, 'the no-fabrication guarantee still holds');
  assert.equal('hotels' in hotel, false, 'and no substitute list appears');

  // The operator's diagnosis is kept, not replaced by the traveller's sentence.
  assert.match(hotel.providerMessage, /enabled|billing|restrictions/i);
});

test('a dropped connection stays retryable, because that one can succeed', async () => {
  const flaky = (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch;

  const hotel: any = await executeToolCall('search_hotels', { location: 'Uluwatu, Bali' }, {
    duffelClient: null,
    googleMapsApiKey: 'test-google-key',
    fetchFn: flaky,
  });

  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.retryable, true);
  assert.match(hotel.message, /retrying|retry/i);
  assert.doesNotMatch(hotel.message, /refused/i);
});
