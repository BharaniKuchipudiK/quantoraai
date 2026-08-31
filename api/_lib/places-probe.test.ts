import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describePlacesKey,
  probePlaces,
  resolvePlacesKey,
  searchPlacesOnce,
  verdictForPlaces,
} from './places-probe.js';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
}) as any;

test('the key that actually serves is the one named', () => {
  assert.deepEqual(resolvePlacesKey({ GOOGLE_MAPS_API_KEY: 'a' } as any), { key: 'a', source: 'GOOGLE_MAPS_API_KEY' });
  assert.deepEqual(resolvePlacesKey({ GOOGLE_PLACES_API_KEY: 'b' } as any), { key: 'b', source: 'GOOGLE_PLACES_API_KEY' });
  // Maps wins when both are set, matching searchGooglePlaces' own precedence.
  assert.equal(resolvePlacesKey({ GOOGLE_MAPS_API_KEY: 'a', GOOGLE_PLACES_API_KEY: 'b' } as any).source, 'GOOGLE_MAPS_API_KEY');
  assert.deepEqual(resolvePlacesKey({} as any), { key: null, source: null });
});

test('a key is described, never disclosed', () => {
  const shape = describePlacesKey('AIzaSyEXAMPLEKEY1234', 'GOOGLE_MAPS_API_KEY');
  assert.equal(shape.present, true);
  assert.equal(shape.last4, '1234');
  assert.equal(shape.length, 20);
  assert.equal(shape.looksRedacted, false);
  assert.equal(JSON.stringify(shape).includes('AIzaSyEXAMPLEKEY'), false);
});

/*
 * The failure that started this. `placesConfigured: true` and every travel
 * lookup refused — a 403 from an unenabled API or a restricted key. The verdict
 * has to say the one thing the old traveller-facing sentence got wrong: no
 * retry can help.
 */
test('a 403 is diagnosed as settled configuration, not an outage', async () => {
  const search = await searchPlacesOnce('AIzaSyEXAMPLEKEY1234', {
    fetchFn: (async () => jsonResponse(403, { error: { message: 'Places API (New) has not been used in project 123 before or it is disabled.' } })) as any,
  });
  assert.equal(search.ok, false);
  assert.equal(search.status, 403);

  const verdict = verdictForPlaces(describePlacesKey('AIzaSyEXAMPLEKEY1234', 'GOOGLE_MAPS_API_KEY'), search);
  assert.match(verdict, /403/);
  assert.match(verdict, /not enabled|restrictions/i);
  assert.match(verdict, /no retry can help/i);
});

test('a 400 points at our request, not at the key', () => {
  const shape = describePlacesKey('AIzaSyEXAMPLEKEY1234', 'GOOGLE_MAPS_API_KEY');
  const verdict = verdictForPlaces(shape, {
    attempted: true, ok: false, status: 400, places: 0, query: 'hotels in Singapore',
    error: 'Invalid field mask', ms: 12,
  });
  assert.match(verdict, /ours to fix/i);
  assert.doesNotMatch(verdict, /not a valid key/i);
});

test('a 429 is the one refusal that does clear on its own', () => {
  const shape = describePlacesKey('AIzaSyEXAMPLEKEY1234', 'GOOGLE_MAPS_API_KEY');
  const verdict = verdictForPlaces(shape, {
    attempted: true, ok: false, status: 429, places: 0, query: 'hotels in Singapore',
    error: 'Quota exceeded', ms: 12,
  });
  assert.match(verdict, /rate limit|quota/i);
  assert.match(verdict, /unlike a 403/i);
});

/*
 * A 200 with no places is a working credential. Conflating it with a broken one
 * is how the desk would start blaming its setup for a genuinely empty query.
 */
test('an empty answer still proves the key works', async () => {
  const report = await probePlaces({
    key: 'AIzaSyEXAMPLEKEY1234',
    source: 'GOOGLE_MAPS_API_KEY',
    fetchFn: (async () => jsonResponse(200, {})) as any,
  });
  assert.equal(report.search.ok, true);
  assert.equal(report.search.places, 0);
  assert.match(report.verdict, /credential is fine/i);
});

test('a working key says so, and says whose fault a failure would then be', async () => {
  const report = await probePlaces({
    key: 'AIzaSyEXAMPLEKEY1234',
    source: 'GOOGLE_MAPS_API_KEY',
    fetchFn: (async () => jsonResponse(200, { places: [{ id: 'x', displayName: { text: 'A Hotel' } }] })) as any,
  });
  assert.equal(report.search.places, 1);
  assert.match(report.verdict, /works from here/i);
  assert.match(report.verdict, /the fault is ours/i);
});

test('a missing or placeholder key is never sent anywhere', async () => {
  let called = false;
  const fetchFn = (async () => { called = true; return jsonResponse(200, {}); }) as any;

  const absent = await probePlaces({ key: null, source: null, fetchFn });
  assert.equal(absent.search.attempted, false);
  assert.match(absent.verdict, /No Google Places key/i);

  const redacted = await probePlaces({ key: '[REDACTED]', source: 'GOOGLE_MAPS_API_KEY', fetchFn });
  assert.equal(redacted.search.attempted, false);
  assert.match(redacted.verdict, /placeholder/i);

  assert.equal(called, false, 'nothing was sent for a key that is not a key');
});

test('a network failure is reported as retryable, unlike a refusal', async () => {
  const report = await probePlaces({
    key: 'AIzaSyEXAMPLEKEY1234',
    source: 'GOOGLE_MAPS_API_KEY',
    fetchFn: (async () => { throw new Error('socket hang up'); }) as any,
  });
  assert.equal(report.search.ok, false);
  assert.equal(report.search.status, null);
  assert.match(report.verdict, /worth retrying/i);
});
