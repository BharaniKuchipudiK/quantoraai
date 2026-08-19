import test from 'node:test';
import assert from 'node:assert/strict';
import type { TravelProvider, TravelProviderName } from './travel-contracts.js';
import {
  executeToolCall,
  isTransactionalTravelTool,
  shouldEnableTravelTools,
  travelFunctionDeclarations,
} from './agent-tools.js';

function provider(name: TravelProviderName): TravelProvider {
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
    searchFlights: async () => [{
      id: `${name}_flight`,
      provider: name,
      totalAmount: 200,
      currency: 'SGD',
      direct: true,
      duration: 'PT2H40M',
      segments: [],
    }],
    searchHotels: async () => [{
      id: `${name}_hotel`,
      provider: name,
      name: 'Beach Hotel',
      totalAmount: 500,
      currency: 'SGD',
    }],
    searchAttractions: async () => [{
      id: `${name}_activity`,
      provider: name,
      name: 'Sunset Tour',
    }],
  };
}

const providers = {
  duffel: provider('duffel'),
  amadeus: provider('amadeus'),
};

test('travel provider tools are not exposed to any language model', () => {
  assert.equal(shouldEnableTravelTools('travel'), false);
  assert.equal(shouldEnableTravelTools('research'), false);
  assert.deepEqual(travelFunctionDeclarations, []);
});

test('transactional travel tools remain disabled and fail closed', async () => {
  for (const name of ['create_price_alert', 'make_reservation', 'book_attraction']) {
    assert.equal(isTransactionalTravelTool(name), true);
  }

  const booking = await executeToolCall('make_reservation', {
    bookingType: 'flight',
    itemId: 'off_test',
    dates: '2099-09-01',
    price: 100,
  }, { providers });

  assert.equal(booking.status, 'unavailable');
  assert.equal(booking.executed, false);
  assert.equal(booking.reason, 'TRANSACTION_DISABLED');
  assert.match(booking.message, /nothing was booked/i);
  assert.equal('confirmationCode' in booking, false);
  assert.equal('bookingReference' in booking, false);
  assert.equal('pnr' in booking, false);
});

test('server-owned compatibility flight search delegates to provider gateway', async () => {
  const result = await executeToolCall('search_flights', {
    origin: 'Singapore',
    destination: 'Bali',
    departureDate: '2099-09-01',
    returnDate: '2099-09-04',
  }, { providers });

  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'duffel');
  assert.equal(result.offers[0].id, 'duffel_flight');
});

test('server-owned hotel and attraction search delegate to provider gateway', async () => {
  const hotel = await executeToolCall('search_hotels', {
    location: 'Bali',
    checkInDate: '2099-09-01',
    checkOutDate: '2099-09-04',
  }, { providers });
  assert.equal(hotel.status, 'success');
  assert.equal(hotel.hotels[0].name, 'Beach Hotel');

  const attraction = await executeToolCall('search_attractions', { location: 'Bali' }, { providers });
  assert.equal(attraction.status, 'success');
  assert.equal(attraction.attractions[0].name, 'Sunset Tour');
});

test('clarification remains non-transactional', async () => {
  const result = await executeToolCall('ask_clarifying_question', { question: 'What is your return date?' }, { providers });
  assert.equal(result.status, 'success');
  assert.equal(result.executed, false);
  assert.equal(result.action, 'PAUSE_AND_ASK');
  assert.equal(result.message, 'What is your return date?');
});
