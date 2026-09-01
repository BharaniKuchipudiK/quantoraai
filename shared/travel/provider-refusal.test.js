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

import { flightProviderFailureAsk } from './flight-resilience.js';

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

/*
 * The directive half of this rule lives in api/_lib/travel-dates.test.ts:
 * studio-domains is TypeScript, and this file runs under plain `node --test`.
 */
