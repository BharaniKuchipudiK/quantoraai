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

/*
 * The Uluwatu turn. A traveller asked for stays and was told "Places did not
 * return a list — I will not invent one. Retry in a moment." Places had in fact
 * refused the request; the retry it advised was byte-identical to the call that
 * had just been refused, so it could only fail again. The sentence also read as
 * a claim about Uluwatu — that there was nothing there — when the fault was
 * entirely ours.
 */
test('a refusal is never dressed up as a retryable outage', () => {
  const refused = hotelProviderFailureAsk('Uluwatu, Bali', { reason: 'PROVIDER_REJECTED' });

  assert.match(refused, /Uluwatu, Bali/, 'the place is still named, so nobody re-types it');
  assert.match(refused, /refused/i, 'and the refusal is named as a refusal');
  assert.doesNotMatch(refused, /retry|try again|in a moment/i, 'never advise a retry that cannot change the answer');
  assert.match(refused, /our side/i, 'the fault is ours, not a gap in the destination');
  assert.match(refused, /not invent/i, 'the no-fabrication guarantee survives the rewrite');
});

test('a genuine outage still offers the retry that can actually work', () => {
  const transient = hotelProviderFailureAsk('Uluwatu, Bali', { reason: 'PROVIDER_ERROR' });

  assert.match(transient, /retry/i, 'a dropped connection is worth trying again');
  assert.doesNotMatch(transient, /refused/i);
  assert.match(transient, /not invent/i);
});

test('not-configured is a refusal too, so it never advises a retry either', () => {
  const missing = hotelProviderFailureAsk('Uluwatu, Bali', { reason: 'NOT_CONFIGURED', configured: false });
  assert.match(missing, /not connected/);
  assert.doesNotMatch(missing, /retry|in a moment/i);
});

/*
 * Places returns fewer results as a query narrows, so a neighbourhood that came
 * back empty cannot be rescued by naming a smaller one. The old copy advised
 * exactly that.
 */
test('an empty result set advises widening, never narrowing', () => {
  const empty = hotelEmptyResultsAsk('Uluwatu, Bali');
  assert.match(empty, /wider|nearby/i);
  assert.doesNotMatch(empty, /neighbourhood/i);
  assert.doesNotMatch(empty, /retry/i);
});
