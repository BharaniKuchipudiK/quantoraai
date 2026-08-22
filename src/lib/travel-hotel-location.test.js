import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hotelCityAsk,
  hotelEmptyResultsAsk,
  hotelLocationNeedsCity,
  hotelProviderFailureAsk,
  inferStayLocation,
  resolveHotelSearchLocation,
} from './travel-hotel-location.js';

test('kids-club beach prompt is not a city', () => {
  assert.equal(hotelLocationNeedsCity("Beach resorts with kids' clubs"), true);
  assert.equal(hotelLocationNeedsCity('family hotels with a pool'), true);
  assert.match(hotelCityAsk("Beach resorts with kids' clubs"), /city or area/i);
});

test('named places can be searched', () => {
  assert.equal(hotelLocationNeedsCity('Phuket'), false);
  assert.equal(hotelLocationNeedsCity('Gold Coast'), false);
  assert.equal(hotelLocationNeedsCity('hotels in Bali'), false);
  assert.equal(hotelLocationNeedsCity('Seminyak, Bali'), false);
  assert.equal(hotelLocationNeedsCity('Singapore'), false);
});

test('Singapore as a one-word reply is the city, not a missing location', () => {
  assert.equal(inferStayLocation('Singapore'), 'Singapore');
  assert.equal(inferStayLocation('yes'), '');
  assert.equal(inferStayLocation('give me the list o attactions in Singapore and include the hotels to stay'), 'Singapore');
  assert.equal(inferStayLocation('give me the list o attactions in Vizag and include the hotels to stay'), 'Vizag');
  assert.equal(resolveHotelSearchLocation("Beach resorts with kids' clubs", ['Look up hotels', 'Singapore']), 'Singapore');
});

test('when Places fails and the city is known, do not ask for the city again', () => {
  assert.match(hotelProviderFailureAsk('Singapore'), /Singapore/);
  assert.doesNotMatch(hotelProviderFailureAsk('Singapore'), /if you have not/i);
  assert.match(hotelProviderFailureAsk('Singapore', { kind: 'attractions' }), /attractions in Singapore/);
  assert.doesNotMatch(hotelProviderFailureAsk('Singapore', { kind: 'attractions' }), /Name the city/i);
  assert.match(hotelProviderFailureAsk('Singapore', { configured: false }), /not connected/);
  assert.match(hotelProviderFailureAsk(''), /city or area/i);
});
