/**
 * A refusal that names one forbidden field licenses everything beside it.
 *
 * THE INCIDENT
 *
 * A traveller retried SIN → DPS. The provider was unreachable. The desk said
 * "I could not look up live flights just now. I will not invent fares." — and
 * then listed Singapore Airlines, Garuda, Batik, Scoot, Jetstar and AirAsia
 * with daily departure patterns and "~2 hours 45 minutes across all carriers".
 *
 * No provider returned any of that. The desk kept the letter of its promise
 * perfectly, because the promise covered exactly one field: fares. Carriers,
 * schedules and durations were never mentioned, so they were never forbidden.
 *
 * The domain directive had the same shape of hole. It said "never invent
 * fares, availability, ratings, bookings, confirmation codes, tickets, alerts,
 * or provider results" — a long list that omitted schedules — while the hotel
 * rule right beside it said plainly "never list hotels from memory". Flights
 * had no equivalent.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT
 *
 * The failure mode is not a crash. Nothing errored, nothing retried, and the
 * answer looked more helpful than the honest one. The only durable defence is
 * to assert the SHAPE of the promise: it must cover the answer, not a field.
 *
 * These assertions are deliberately about wording, because wording is the
 * mechanism. Narrowing the copy back to a single field is exactly how this
 * returns, and it would otherwise be a silent one-line regression.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as flightResilience from './flight-resilience.js';

const { flightProviderFailureAsk } = flightResilience;

const ARGS = { origin: 'SIN', destination: 'DPS', departureDate: '2026-10-01' };

/** The fields a traveller would act on, all provider-backed. */
const PROVIDER_FIELDS = ['fares', 'carriers', 'schedules', 'durations'];

test('THE INCIDENT: the refusal does not scope its promise to fares alone', () => {
  for (const configured of [true, false]) {
    for (const includeRetry of [true, false]) {
      const copy = flightProviderFailureAsk(ARGS, { configured, includeRetry });
      assert.ok(
        !/I will not invent fares\./.test(copy),
        `configured=${configured} retry=${includeRetry}: naming one forbidden field licenses the rest`,
      );
      for (const field of PROVIDER_FIELDS) {
        assert.ok(
          copy.includes(field),
          `configured=${configured} retry=${includeRetry}: the promise must name ${field}`,
        );
      }
    }
  }
});

test('the refusal still says what failed and offers the retry', () => {
  const copy = flightProviderFailureAsk(ARGS, { configured: true, includeRetry: true });
  // Widening the promise must not cost the traveller the diagnosis or the way out.
  assert.match(copy, /SIN → DPS/, 'the route the traveller asked about');
  assert.match(copy, /Retry/, 'the way forward');
  assert.match(copy, /memory/, 'names the thing it is refusing to do');
});

test('an unconfigured provider makes the same whole-answer promise', () => {
  const copy = flightProviderFailureAsk(ARGS, { configured: false });
  assert.match(copy, /DUFFEL_API_KEY/, 'says which setup is missing');
  // Not connected and could-not-reach are different causes with the same duty:
  // neither is permission to answer from recall.
  for (const field of PROVIDER_FIELDS) assert.ok(copy.includes(field));
});

/**
 * EVERY refusal, including ones written after this test.
 *
 * The first pass at this fix changed only flightProviderFailureAsk, because
 * that is the function the screenshot caught. Three siblings in the same file
 * still ended "I will not invent fares." — and they are the refusals a model is
 * most tempted to soften, because the desk has just declined to do what was
 * asked for a reason the traveller may find pedantic, and recalled detail is
 * the obvious way to seem useful anyway.
 *
 * Enumerating the three by hand would have closed the instance and left the
 * class open: a fourth refusal added next month would carry whatever wording
 * its author typed, and nothing would notice. So this sweeps the module's own
 * exports — a function whose name ends in `Ask` IS a refusal, and its existence
 * IS its registration, the same principle that makes a test file on disk run.
 */
const REFUSAL_ARGS = [
  {},                                                                   // nothing known yet
  { origin: 'SIN' },                                                    // partly known
  { origin: 'SIN', destination: 'DPS', departureDate: '2026-10-01' },   // complete, future
  { origin: 'SIN', destination: 'DPS', departureDate: '2020-01-01' },   // complete, past
];

test('every refusal this module exports makes the whole-answer promise', () => {
  const refusals = Object.entries(flightResilience)
    .filter(([name, value]) => name.endsWith('Ask') && typeof value === 'function');

  // A sweep that finds nothing passes vacuously, which is the one thing a gate
  // must never do (CLAUDE.md §4). Three exist today.
  assert.ok(refusals.length >= 3, `expected the module's *Ask refusals, found ${refusals.length}`);

  for (const [name, refusal] of refusals) {
    for (const args of REFUSAL_ARGS) {
      const copy = refusal(args);
      assert.ok(
        !/I will not invent fares\./.test(copy),
        `${name}(${JSON.stringify(args)}) still scopes its promise to one field`,
      );
      for (const field of PROVIDER_FIELDS) {
        assert.ok(
          copy.includes(field),
          `${name}(${JSON.stringify(args)}) must name ${field}: ${copy}`,
        );
      }
    }
  }
});

/*
 * The directive half of this rule lives in api/_lib/travel-dates.test.ts:
 * studio-domains is TypeScript, and this file runs under plain `node --test`.
 */
