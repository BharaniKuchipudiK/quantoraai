import assert from 'node:assert/strict';
import test from 'node:test';
import type { TravelProvider, TravelProviderName } from './travel-contracts.js';
import { searchAttractions, searchFlights, searchHotels, travelProviderHealth } from './travel-provider-gateway.js';
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

test('flight search uses Duffel first and does not call Amadeus when Duffel succeeds', async () => {
  let amadeusCalls = 0;
  const duffel = fakeProvider('duffel', {
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
