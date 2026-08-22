import assert from 'node:assert/strict';
import test from 'node:test';
import { hotelCityAsk, hotelLocationNeedsCity } from './travel-hotel-location.js';

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
});
