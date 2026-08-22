import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTravelSearchRequest } from './travel-search-request.js';

test('the trip board cannot ask the booking tools', () => {
  assert.equal(parseTravelSearchRequest({ kind: 'book' }).ok, false);
});

test('flight search needs airport codes and a date', () => {
  const parsed = parseTravelSearchRequest({
    kind: 'flights',
    origin: 'sin',
    destination: 'dps',
    departureDate: '2026-09-12',
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.tool, 'search_flights');
    assert.equal(parsed.args.origin, 'SIN');
  }
});
