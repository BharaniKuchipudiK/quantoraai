import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeToolCall,
  isTransactionalTravelTool,
  shouldEnableTravelTools,
  travelFunctionDeclarations,
} from './agent-tools.js';

const declaredNames = travelFunctionDeclarations.map((tool: any) => tool?.name);

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
    dates: '2026-09-01',
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
    dates: '2026-09-01',
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
    departureDate: '2026-09-01',
  }, { duffelClient: null, googleMapsApiKey: null });
  assert.equal(flight.status, 'unavailable');
  assert.equal(flight.executed, false);
  assert.equal(flight.action, 'PAUSE_AND_ASK');
  assert.equal('flights' in flight, false, 'must not substitute mock flight results');

  const hotel = await executeToolCall('search_hotels', {
    location: 'London',
    checkInDate: '2026-09-01',
    checkOutDate: '2026-09-03',
  }, { duffelClient: null, googleMapsApiKey: null });
  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.action, 'PAUSE_AND_ASK');
  assert.match(hotel.message, /stopped instead of retrying in a loop/i);
  assert.equal('hotels' in hotel, false, 'must not substitute hard-coded hotels');

  const attraction = await executeToolCall('search_attractions', { location: 'London' }, {
    duffelClient: null,
    googleMapsApiKey: null,
  });
  assert.equal(attraction.status, 'unavailable');
  assert.equal(attraction.action, 'PAUSE_AND_ASK');
  assert.equal('attractions' in attraction, false, 'must not substitute hard-coded attractions');

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
    checkInDate: '2026-09-01',
    checkOutDate: '2026-09-03',
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

  assert.equal(capturedRequest.url, 'https://places.googleapis.com/v1/places:searchText');
  const requestBody = JSON.parse(capturedRequest.init.body);
  assert.equal(requestBody.includedType, 'hotel');
  assert.equal(requestBody.strictTypeFiltering, true);
  assert.match(requestBody.textQuery, /hotels in London/i);
  assert.equal(capturedRequest.init.headers['X-Goog-Api-Key'], 'test-google-key');
  assert.match(capturedRequest.init.headers['X-Goog-FieldMask'], /places\.rating/);
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
    checkInDate: '2026-10-01',
    checkOutDate: '2026-10-03',
  }, {
    googleMapsApiKey: 'bad-key',
    fetchFn,
  });
  assert.equal(hotel.status, 'unavailable');
  assert.equal(hotel.executed, false);
  assert.equal(hotel.reason, 'PROVIDER_ERROR');
  assert.equal(hotel.action, 'PAUSE_AND_ASK');
  assert.match(hotel.providerMessage, /Google Places API \(New\) hotel search is unavailable/i);
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
  assert.equal(route.reason, 'PROVIDER_ERROR');
  assert.equal(route.action, 'PAUSE_AND_ASK');
  assert.equal('route' in route, false);
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
