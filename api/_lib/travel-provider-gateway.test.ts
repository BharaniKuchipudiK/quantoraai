import assert from 'node:assert/strict';
import test from 'node:test';
import type { TravelProvider, TravelProviderName } from './travel-contracts.js';
import {
  canonicalTravelLocationQuery,
  searchAttractions,
  searchFlights,
  searchHotels,
  travelProviderHealth,
} from './travel-provider-gateway.js';
import { TravelProviderError } from './travel-provider-errors.js';

function fakeProvider(
  name: TravelProviderName,
  overrides: Partial<TravelProvider> = {},
): TravelProvider {
  return {
    name,
    isConfigured: () => true,
    resolvePlace: async (query: string) => ({
      provider: name,
      name: query,
      iataCode: query.toLowerCase().includes('singapore') ? 'SIN' : 'DPS',
      type: 'city',
      latitude: 1.3,
      longitude: 103.8,
    }),
    searchFlights: async () => [],
    searchHotels: async () => [],
    searchAttractions: async () => [],
    ...overrides,
  };
}

test('canonicalizes Bali to DPS before any travel provider call', () => {
  assert.equal(canonicalTravelLocationQuery('Bali'), 'DPS');
  assert.equal(canonicalTravelLocationQuery('Bali, Indonesia'), 'DPS');
  assert.equal(canonicalTravelLocationQuery('Singapore'), 'Singapore');
});

test('flight search uses Duffel first and sends canonical DPS instead of fuzzy Bali', async () => {
  let amadeusCalls = 0;
  const resolvedQueries: string[] = [];
  const duffel = fakeProvider('duffel', {
    resolvePlace: async (query: string) => {
      resolvedQueries.push(query);
      return {
        provider: 'duffel',
        name: query === 'DPS' ? 'Ngurah Rai' : 'Singapore',
        iataCode: query === 'DPS' ? 'DPS' : 'SIN',
        type: 'airport',
        countryCode: query === 'DPS' ? 'ID' : 'SG',
        latitude: query === 'DPS' ? -8.748 : 1.364,
        longitude: query === 'DPS' ? 115.167 : 103.991,
      };
    },
    searchFlights: async () => [{
      id: 'off_duffel',
      provider: 'duffel',
      totalAmount: 220,
      currency: 'SGD',
      direct: true,
      duration: 'PT2H40M',
      segments: [],
    }],
  });
  const amadeus = fakeProvider('amadeus', {
    searchFlights: async () => {
      amadeusCalls += 1;
      return [];
    },
  });

  const result = await searchFlights({
    origin: 'Singapore',
    destination: 'Bali',
    departureDate: '2099-08-31',
    adults: 1,
  }, { duffel, amadeus });

  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.deepEqual(resolvedQueries, ['Singapore', 'DPS']);
  assert.equal(result.destination.iataCode, 'DPS');
  assert.equal(result.provider, 'duffel');
  assert.equal(result.offers[0].id, 'off_duffel');
  assert.equal(amadeusCalls, 0);
});

test('flight search fails over from Duffel timeout to Amadeus', async () => {
  const duffel = fakeProvider('duffel', {
    searchFlights: async () => {
      throw new TravelProviderError('duffel', 'timeout', 'Duffel timed out');
    },
  });
  const amadeus = fakeProvider('amadeus', {
    searchFlights: async () => [{
      id: 'off_amadeus',
      provider: 'amadeus',
      totalAmount: 245,
      currency: 'SGD',
      direct: false,
      duration: 'PT4H',
      segments: [],
    }],
  });

  const result = await searchFlights({
    origin: 'Singapore',
    destination: 'Bali',
    departureDate: '2099-08-31',
    adults: 1,
  }, { duffel, amadeus });

  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.provider, 'amadeus');
  assert.ok(result.attempts.some((attempt) => attempt.provider === 'duffel' && attempt.outcome === 'timeout'));
  assert.ok(result.attempts.some((attempt) => attempt.provider === 'amadeus' && attempt.outcome === 'success'));
});

test('past flight dates fail before any provider call', async () => {
  let calls = 0;
  const duffel = fakeProvider('duffel', {
    searchFlights: async () => {
      calls += 1;
      return [];
    },
  });
  const amadeus = fakeProvider('amadeus', { isConfigured: () => false });

  const result = await searchFlights({
    origin: 'SIN',
    destination: 'DPS',
    departureDate: '2025-08-31',
  }, { duffel, amadeus });

  assert.equal(result.status, 'invalid');
  assert.equal(calls, 0);
  assert.match(result.message, /past/i);
});

test('hotel search falls back to Amadeus when Duffel Stays is unavailable', async () => {
  const duffel = fakeProvider('duffel', {
    searchHotels: async () => {
      throw new TravelProviderError('duffel', 'unavailable', 'Stays access not enabled', 403);
    },
  });
  const amadeus = fakeProvider('amadeus', {
    searchHotels: async () => [{
      id: 'hotel_1',
      provider: 'amadeus',
      name: 'Beach Hotel',
      totalAmount: 600,
      currency: 'SGD',
    }],
  });

  const result = await searchHotels({
    location: 'Bali',
    checkInDate: '2099-08-31',
    checkOutDate: '2099-09-03',
    adults: 2,
    rooms: 1,
  }, { duffel, amadeus });

  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.provider, 'amadeus');
  assert.equal(result.hotels[0].name, 'Beach Hotel');
});

test('attraction discovery uses Amadeus and never requires Google', async () => {
  const duffel = fakeProvider('duffel', { searchAttractions: undefined });
  const amadeus = fakeProvider('amadeus', {
    searchAttractions: async () => [{
      id: 'act_1',
      provider: 'amadeus',
      name: 'Uluwatu Sunset Tour',
      bookingLink: 'https://example.test/activity',
    }],
  });

  const result = await searchAttractions({ location: 'Bali' }, { duffel, amadeus });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.provider, 'amadeus');
  assert.equal(result.attractions[0].name, 'Uluwatu Sunset Tour');
  assert.equal(travelProviderHealth({ duffel, amadeus }).googleRequired, false);
});

test('no configured providers returns unavailable without fabricated data', async () => {
  const duffel = fakeProvider('duffel', { isConfigured: () => false });
  const amadeus = fakeProvider('amadeus', { isConfigured: () => false });
  const result = await searchFlights({
    origin: 'Singapore',
    destination: 'Bali',
    departureDate: '2099-08-31',
  }, { duffel, amadeus });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.executed, false);
  assert.equal('offers' in result, false);
});
