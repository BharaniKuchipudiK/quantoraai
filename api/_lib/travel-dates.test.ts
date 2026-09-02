import assert from 'node:assert/strict';
import test from 'node:test';

import { earliestSearchableIso, latestSearchableIso, todayIso, validateTravelToolArgs } from './ai-contracts.js';
import { buildDomainDirective, buildTodayDirective } from './studio-domains.js';
import { flightInvalidArgsAsk, resolveFlightToolRecovery } from '../../shared/travel/flight-resilience.js';

/**
 * THE 2025-05-08 TURN.
 *
 * A traveller said "Next 2-4 weeks". The desk answered:
 *
 *   "I could not look up live flights for SIN -> DPS on 2025-05-08 just now.
 *    I will not invent fares. Tap Retry to run the same search again."
 *
 * That date was sixteen months in the PAST. Nothing leaked it: the model is
 * never told what day it is, so it resolved a relative date from its own
 * training era. Nothing then caught it, because no layer of the travel path
 * had ever compared a date to today — isoDate only asked "is this a real
 * calendar date", and 2025-05-08 is real.
 *
 * So a search that could not succeed was sent to a provider, and the failure
 * was offered back with a Retry that would reissue the identical past date.
 * Two dead controls from one missing fact.
 */

const PAST = '2025-05-08';

test('the screenshot case is refused before any provider is called', () => {
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: PAST,
  });
  assert.equal(result.status, 'invalid', 'a past departure never reaches a provider');
});

test('a real future date still searches', () => {
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: soon,
  });
  assert.equal(result.status, 'ok');
});

test('today itself is searchable — the boundary is not off by one', () => {
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: todayIso(),
  });
  assert.equal(result.status, 'ok', 'a flight leaving today is a real flight');
});

test('a past check-in is refused too', () => {
  const result = validateTravelToolArgs('search_hotels', { location: 'Seminyak', checkInDate: PAST });
  assert.equal(result.status, 'invalid');
});

/*
 * The refusal has to name the date. The generic wording sent the traveller to
 * check their passenger count for a problem they did not cause and could not
 * see.
 */
test('the refusal names the past date and today, not the passenger count', () => {
  const ask = flightInvalidArgsAsk(
    { origin: 'SIN', destination: 'DPS', departureDate: PAST },
    ['departureDate:custom'],
    { now: new Date('2026-08-31T00:00:00.000Z') },
  );
  assert.match(ask, /2025-05-08/);
  assert.match(ask, /in the past/i);
  assert.match(ask, /2026-08-31/, 'and says what today actually is');
  assert.doesNotMatch(ask, /passengers/i);
  /*
   * The no-fabrication guarantee survives, and is now wider than when this
   * assertion was written. It used to read /not invent/, which the refusal
   * satisfied with "I will not invent fares." — a promise about one field, in
   * the exact moment a model is most tempted to be helpful with recalled
   * schedules instead. It must cover the answer.
   */
  assert.match(ask, /will not fill the gap with flight details from memory/i);
  for (const field of ['fares', 'carriers', 'schedules', 'durations']) {
    assert.ok(ask.includes(field), `the past-date refusal must name ${field}`);
  }
});

/* The Retry chip must not be offered for something a retry cannot change. */
test('a rejected date is never offered a retry', () => {
  const recovery = resolveFlightToolRecovery({ reason: 'INVALID_ARGUMENT', configured: true });
  assert.equal(recovery.includeRetry, false);
  assert.equal(recovery.retryable, false);
  assert.equal(recovery.autoRetryTurn, false);
});

/*
 * The root cause, not just the symptom: the model must be told the date. A
 * guard that rejects bad dates without this turns every relative date into a
 * refusal instead of an answer.
 */
test('the model is told today, and told to resolve relative dates from it', () => {
  const directive = buildTodayDirective(new Date('2026-08-31T12:00:00.000Z'));
  assert.match(directive, /Today is 2026-08-31/);
  assert.match(directive, /next month|2-4 weeks/i, 'relative phrasings are named');
  assert.match(directive, /never.*earlier than 2026-08-31/i);
  assert.match(directive, /ask rather than guess/i);
});

/*
 * Codex, on review: a bare UTC "today" refuses same-day travel for everyone
 * west of UTC. At 2026-09-01T00:30Z it is still 31 August across the Americas,
 * so a traveller in New York booking their own today was rejected as past —
 * a working booking refused for up to half of every day, which is the worse
 * failure of the two this guard sits between.
 */
test('a traveller west of UTC can still book their own today', () => {
  const yesterdayUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'JFK', destination: 'LAX', departureDate: yesterdayUtc,
  });
  assert.equal(result.status, 'ok');
});

test('the boundary is exactly one day of slack, which covers every offset', () => {
  const now = new Date('2026-09-01T00:30:00.000Z');
  assert.equal(todayIso(now), '2026-09-01');
  // UTC-12 is the westernmost offset, so a local date is never more than one
  // day behind the UTC one. One day is exact, not a guess.
  assert.equal(earliestSearchableIso(now), '2026-08-31');
});

test('slack does not let a genuinely old date through', () => {
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: '2025-05-08',
  });
  assert.equal(result.status, 'invalid', 'sixteen months is not a timezone');
});

/*
 * The guard above only ever looked backwards. A wrong YEAR is the same bug in
 * both directions, and after the prompt started stating today's date, the far
 * side became the likelier one: a mis-resolved "next week" now lands a year
 * ahead rather than a year behind.
 */

test('a departure a year later than intended is refused, not searched', () => {
  const nextYear = new Date();
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: nextYear.toISOString().slice(0, 10),
  });
  assert.equal(result.status, 'invalid', '"next week" resolved to next year is a typo, not a booking');
});

test('an absurd future date is refused', () => {
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: '2099-01-01',
  });
  assert.equal(result.status, 'invalid');
});

test('a booking inside the airline schedule window still runs', () => {
  const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: soon,
  });
  assert.equal(result.status, 'ok', 'two months out is an ordinary trip');
});

test('the far boundary is eleven months, matching when airlines open schedules', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  assert.equal(latestSearchableIso(now), '2027-08-01');
});

test('a wrong year in the RETURN leg is refused too', () => {
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: soon, returnDate: '2099-01-01',
  });
  assert.equal(result.status, 'invalid', 'the return leg reaches the provider exactly as the outbound does');
});

test('an ordinary round trip still runs', () => {
  const out = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const back = new Date(Date.now() + 44 * 86_400_000).toISOString().slice(0, 10);
  const result = validateTravelToolArgs('search_flights', {
    origin: 'SIN', destination: 'DPS', departureDate: out, returnDate: back,
  });
  assert.equal(result.status, 'ok');
});

/*
 * The directive half of the provider-substitution rule. The copy half lives in
 * shared/travel/provider-refusal.test.js; this side asserts the instruction the
 * model actually receives, because the incident was the model obeying a promise
 * that named only one forbidden field.
 */

test('the travel directive forbids answering from memory, not just inventing prices', () => {
  const directive = buildDomainDirective('travel');

  // The hotel rule already said "never list hotels from memory". Flights had no
  // equivalent, and that asymmetry is what let a provider outage turn into a
  // recalled list of carriers, departure patterns and durations.
  assert.match(directive, /Never list flights, carriers, routes, schedules or durations from memory/i);
  assert.match(
    directive,
    /provider outage is not permission to answer from recall/i,
    'the outage case is the one that actually happened',
  );
  assert.match(
    directive,
    /If a provider did not return it this turn, it does not go in the reply/i,
    'the rule has to generalise, or the next unnamed field is the next hole',
  );
});

/*
 * THE INCIDENT (photos)
 *
 * A traveller asked "Can you include some pics of the restaurants". The desk
 * returned Google Maps links — fine — and then described each gallery:
 * "What you'll see in the gallery: Tandoor ovens, royal dining interiors,
 * fresh paneer platters, and authentic Indian spreads." and "Signature
 * pastel-pink cafe decor, custom smoothie bowls, plant-based pizzas, and waffle
 * platters."
 *
 * No photo was ever fetched. search_attractions serves restaurants and did not
 * request photos, so the desk had seen nothing at all — and wrote a confident
 * first-hand account of the contents of images it did not have.
 *
 * The rule beside it permitted the link and said nothing about describing what
 * the link contains, which is the same one-field-wide shape as
 * "I will not invent fares."
 */
test('the travel directive forbids describing images it has not seen', () => {
  const directive = buildDomainDirective('travel');

  assert.match(
    directive,
    /Never describe what a photo or gallery CONTAINS unless the provider returned that image to you this turn/i,
  );
  assert.match(
    directive,
    /Give the link and say nothing about its contents/i,
    'the remedy has to be stated, or the rule is only a scolding',
  );
  // The generalisation from the flight incident must still be present: this is
  // one more provider-backed field, not a special case that replaces the rule.
  assert.match(directive, /If a provider did not return it this turn, it does not go in the reply/i);
});
