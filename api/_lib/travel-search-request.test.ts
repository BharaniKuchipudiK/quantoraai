import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTravelSearchRequest } from './travel-search-request.js';
import { deriveTravelBrief } from '../../src/lib/travel-board-brief.js';

/*
 * Fixture dates move with the clock. A literal future date is valid the day it
 * is written and INVALID_ARGUMENT the morning after it passes — a red suite no
 * diff caused. That happened on 2026-09-03 and again, still armed, on 09-07.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number): string =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const DEPARTURE_DATE = isoDaysFromNow(30);
const RETURN_DATE = isoDaysFromNow(38);

test('the trip board cannot ask the booking tools', () => {
  assert.equal(parseTravelSearchRequest({ kind: 'book' }).ok, false);
});

test('flight search needs airport codes and a date', () => {
  const parsed = parseTravelSearchRequest({
    kind: 'flights',
    origin: 'sin',
    destination: 'dps',
    departureDate: DEPARTURE_DATE,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.tool, 'search_flights');
    assert.equal(parsed.args.origin, 'SIN');
  }
});

/*
 * The trip board's chips and this parser are two halves of one contract. If the
 * board can enable a chip whose payload this parser rejects, the user taps a
 * live-search button and gets a 400 — a dead control on the desk that is
 * supposed to be Travel's honest path to real results. These tests bind the two
 * together so neither side can drift alone.
 */
test('every search the board enables is accepted by this parser', () => {
  const board = deriveTravelBrief({
    messages: [{ sender: 'user', text: `SIN to DPS on ${DEPARTURE_DATE}, returning ${RETURN_DATE}` }],
  });
  assert.equal(board.canSearchFlights, true);
  assert.equal(board.canSearchHotels, false, 'airport codes alone are not a city');

  const flights = parseTravelSearchRequest({
    kind: 'flights',
    origin: board.origin,
    destination: board.destination,
    departureDate: board.departureDate,
    returnDate: board.returnDate,
  });
  assert.equal(flights.ok, true);

  const stays = deriveTravelBrief({
    messages: [{ sender: 'user', text: 'I am going to Singapore' }],
  });
  assert.equal(stays.canSearchHotels, true);
  assert.equal(
    parseTravelSearchRequest({ kind: 'hotels', location: stays.destinationLabel }).ok,
    true,
  );
});

test('a chip the board leaves disabled is one this parser would reject', () => {
  const board = deriveTravelBrief({ messages: [{ sender: 'user', text: 'SIN to DPS' }] });
  assert.equal(board.canSearchFlights, false, 'no departure date yet');
  assert.equal(
    parseTravelSearchRequest({
      kind: 'flights',
      origin: board.origin,
      destination: board.destination,
      departureDate: board.departureDate,
    }).ok,
    false,
  );
});
