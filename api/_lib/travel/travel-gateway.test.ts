import test from 'node:test';
import assert from 'node:assert/strict';
import { GooglePlacesTravelProvider } from './google-places-provider.js';
import { TravelProviderGateway } from './travel-gateway.js';
import type { HotelSearchProvider, PlaceDiscoveryProvider } from './types.js';

const NOW = '2026-08-19T00:00:00.000Z';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Google Places adapter maps live provider payload into Quantora place contract', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (url: any, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return jsonResponse({
      places: [{
        id: 'place_tokyo',
        displayName: { text: 'Tokyo' },
        formattedAddress: 'Tokyo, Japan',
        location: { latitude: 35.6762, longitude: 139.6503 },
        rating: 4.7,
        userRatingCount: 12000,
        googleMapsUri: 'https://maps.google.com/example',
        types: ['locality'],
      }],
    });
  };

  const provider = new GooglePlacesTravelProvider('test-key', fakeFetch as typeof fetch);
  const result = await provider.resolveLocation('Tokyo');

  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'google_places');
  assert.equal(result.data?.name, 'Tokyo');
  assert.deepEqual(result.data?.coordinates, { latitude: 35.6762, longitude: 139.6503 });
  assert.equal(requests.length, 1);
  assert.equal((requests[0].init?.headers as Record<string, string>)['X-Goog-Api-Key'], 'test-key');
});

test('Google Places failure is surfaced as provider error and never fabricates attractions', async () => {
  const provider = new GooglePlacesTravelProvider('test-key', (async () => jsonResponse({ error: 'quota' }, 429)) as typeof fetch);
  const result = await provider.searchAttractions({ location: 'Tokyo' });

  assert.equal(result.status, 'error');
  assert.equal(result.executed, false);
  assert.equal(result.reason, 'HTTP_429');
  assert.equal(result.data, undefined);
});

test('hotel gateway resolves destination upstream before calling the stay provider', async () => {
  let receivedCoordinates: any = null;
  const places: PlaceDiscoveryProvider = {
    name: 'google_places',
    async resolveLocation() {
      return {
        status: 'success', executed: true, provider: 'google_places', fetchedAt: NOW,
        data: {
          id: 'tokyo', name: 'Tokyo', address: 'Tokyo, Japan',
          coordinates: { latitude: 35.6762, longitude: 139.6503 },
          rating: null, ratingCount: null, googleMapsUri: null, websiteUri: null, types: ['locality'],
        },
      };
    },
    async searchAttractions() {
      return { status: 'success', executed: true, provider: 'google_places', fetchedAt: NOW, data: [] };
    },
  };
  const hotels: HotelSearchProvider = {
    name: 'duffel',
    async searchHotels(input) {
      receivedCoordinates = input.coordinates;
      return { status: 'success', executed: true, provider: 'duffel', fetchedAt: NOW, data: [] };
    },
  };

  const gateway = new TravelProviderGateway({ hotels, places, flights: null });
  const result = await gateway.searchHotels({
    location: 'Tokyo',
    checkInDate: '2026-10-12',
    checkOutDate: '2026-10-19',
    guests: 2,
  });

  assert.equal(result.status, 'success');
  assert.deepEqual(receivedCoordinates, { latitude: 35.6762, longitude: 139.6503 });
  assert.match(result.warnings?.join(' ') || '', /Destination resolved as Tokyo/);
});

test('missing destination provider fails hotel search closed before the hotel API is called', async () => {
  let called = false;
  const hotels: HotelSearchProvider = {
    name: 'duffel',
    async searchHotels() {
      called = true;
      return { status: 'success', executed: true, provider: 'duffel', fetchedAt: NOW, data: [] };
    },
  };

  const gateway = new TravelProviderGateway({ hotels, places: null, flights: null });
  const result = await gateway.searchHotels({
    location: 'Tokyo',
    checkInDate: '2026-10-12',
    checkOutDate: '2026-10-19',
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'LOCATION_PROVIDER_UNAVAILABLE');
  assert.equal(called, false);
});
