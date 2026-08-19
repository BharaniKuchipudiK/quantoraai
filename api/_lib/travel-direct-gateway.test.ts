import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFlightSearchResult, formatHotelSearchResult, formatAttractionSearchResult } from './travel-direct-gateway.js';

test('direct flight result never leaks internal tool execution language', () => {
  const text = formatFlightSearchResult({
    status: 'success',
    executed: true,
    provider: 'duffel',
    origin: { provider: 'duffel', name: 'Singapore', iataCode: 'SIN', type: 'city' },
    destination: { provider: 'duffel', name: 'Bali', iataCode: 'DPS', type: 'airport' },
    offers: [{
      id: 'offer_1',
      provider: 'duffel',
      totalAmount: 220,
      currency: 'SGD',
      direct: true,
      duration: 'PT2H40M',
      segments: [{
        origin: 'SIN',
        destination: 'DPS',
        departingAt: '2099-08-31T01:00:00Z',
        arrivingAt: '2099-08-31T03:40:00Z',
        carrierName: 'Example Air',
        carrierCode: 'EA',
        flightNumber: 'EA101',
      }],
    }],
    attempts: [],
  });

  assert.doesNotMatch(text, /Agent executing tool/i);
  assert.doesNotMatch(text, /search_flights/i);
  assert.match(text, /live flight options/i);
  assert.match(text, /Would you like me to compare/i);
});

test('provider failures stay transparent without fabricating travel inventory', () => {
  const flight = formatFlightSearchResult({
    status: 'unavailable',
    executed: false,
    reason: 'TRAVEL_PROVIDERS_UNAVAILABLE',
    message: 'Live flight search is temporarily unavailable across the connected travel providers. No fares were invented.',
    attempts: [],
  });
  const hotel = formatHotelSearchResult({
    status: 'unavailable',
    executed: false,
    reason: 'TRAVEL_PROVIDERS_UNAVAILABLE',
    message: 'Live hotel search is temporarily unavailable across the connected travel providers. No hotel availability was invented.',
    attempts: [],
  });
  const attraction = formatAttractionSearchResult({
    status: 'unavailable',
    executed: false,
    reason: 'TRAVEL_PROVIDERS_UNAVAILABLE',
    message: 'Live attraction discovery is temporarily unavailable. No attractions were invented.',
    attempts: [],
  });

  assert.match(flight, /No fares were invented/i);
  assert.match(hotel, /No hotel availability was invented/i);
  assert.match(attraction, /No attractions were invented/i);
});
