import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAVEL_FLIGHT_PROVIDER_CODE,
  flightArgsComplete,
  flightIncompleteAsk,
  flightProviderFailureAsk,
  resolveFlightToolRecovery,
} from './travel-flight-resilience.js';

test('incomplete flight args are not treated as complete', () => {
  assert.equal(flightArgsComplete({ origin: 'SIN' }), false);
  assert.equal(flightArgsComplete({ origin: 'SIN', destination: 'DPS' }), false);
  assert.equal(flightArgsComplete({
    origin: 'SIN',
    destination: 'DPS',
    departureDate: '2026-09-12',
  }), true);
});

test('incomplete ask names what is still needed without inventing fares', () => {
  const ask = flightIncompleteAsk({ origin: 'Singapore' });
  assert.match(ask, /origin airport/i);
  assert.match(ask, /destination/i);
  assert.match(ask, /departure date/i);
  assert.match(ask, /Singapore/);
  assert.match(ask, /will not invent/i);
});

test('missing Duffel credentials are reported as config, not provider silence', () => {
  const ask = flightProviderFailureAsk({ origin: 'SIN', destination: 'DPS', departureDate: '2026-09-12' }, {
    configured: false,
  });
  assert.match(ask, /DUFFEL_API_KEY/i);
  assert.match(ask, /not connected/i);
  assert.doesNotMatch(ask, /provider answers/i);
  assert.doesNotMatch(ask, /Retry flight search/i);
});

test('provider failures stay honest and offer one-click retry when requested', () => {
  const ask = flightProviderFailureAsk({
    origin: 'SIN',
    destination: 'DPS',
    departureDate: '2026-09-12',
  }, { configured: true, includeRetry: true });
  assert.match(ask, /SIN → DPS on 2026-09-12/);
  assert.match(ask, /will not invent/i);
  assert.match(ask, /Retry flight search/);
  assert.match(ask, /quantora-modal/);
});

test('flight tool recovery auto-retries once, then surfaces a clickable retry', () => {
  assert.equal(TRAVEL_FLIGHT_PROVIDER_CODE, 'TRAVEL_FLIGHT_PROVIDER');
  assert.deepEqual(resolveFlightToolRecovery({ reason: 'NOT_CONFIGURED', configured: false }), {
    retryable: false,
    autoRetryTurn: false,
    includeRetry: false,
  });
  assert.deepEqual(resolveFlightToolRecovery({ reason: 'INVALID_ARGUMENT' }), {
    retryable: false,
    autoRetryTurn: false,
    includeRetry: false,
  });
  assert.deepEqual(resolveFlightToolRecovery({
    reason: 'PROVIDER_ERROR',
    configured: true,
    turnAttempt: 1,
  }), {
    retryable: true,
    autoRetryTurn: true,
    includeRetry: false,
  });
  assert.deepEqual(resolveFlightToolRecovery({
    reason: 'PROVIDER_ERROR',
    configured: true,
    turnAttempt: 2,
  }), {
    retryable: true,
    autoRetryTurn: false,
    includeRetry: true,
  });
});
