import assert from 'node:assert/strict';
import test from 'node:test';

import { duffelEnvPublicHint, duffelKeyShape, isDuffelConfigured } from './duffel-key.js';

test('a token carries its own environment', () => {
  assert.equal(duffelKeyShape('duffel_live_abc123'), 'live');
  assert.equal(duffelKeyShape('duffel_test_abc123'), 'test');
  assert.equal(duffelKeyShape('sk-or-v1-nope'), 'other');
  assert.equal(duffelKeyShape(''), 'missing');
  assert.equal(duffelKeyShape('   '), 'missing');
  assert.equal(duffelKeyShape(undefined), 'missing');
});

test('a sandbox token is configured, not broken', () => {
  // It authenticates and returns offers. The mode is what needs saying, not
  // whether a key is present.
  assert.equal(isDuffelConfigured('duffel_test_abc123'), true);
  assert.equal(isDuffelConfigured('duffel_live_abc123'), true);
  assert.equal(isDuffelConfigured(''), false);
});

test('the hint names what the operator actually gets', () => {
  const live = duffelEnvPublicHint({ DUFFEL_API_KEY: 'duffel_live_abc' } as NodeJS.ProcessEnv);
  assert.equal(live.configured, true);
  assert.equal(live.shape, 'live');
  assert.match(live.hint || '', /bookable/i);

  const sandbox = duffelEnvPublicHint({ DUFFEL_API_KEY: 'duffel_test_abc' } as NodeJS.ProcessEnv);
  assert.equal(sandbox.shape, 'test');
  assert.match(sandbox.hint || '', /sandbox/i);
  assert.match(sandbox.hint || '', /not real availability|not bookable/i);
});

test('nothing configured reads as nothing, with no hint to chase', () => {
  const none = duffelEnvPublicHint({} as NodeJS.ProcessEnv);
  assert.equal(none.configured, false);
  assert.equal(none.shape, 'missing');
  assert.equal(none.hint, null);
  assert.equal(none.mixedModes, false);
});

/*
 * The fallback token is tried once after the primary fails. A live primary
 * with a sandbox fallback means a retry can answer with fares from the other
 * environment — and it only shows up when something else has already gone
 * wrong, which is the hardest moment to notice it.
 */
test('a live primary with a sandbox fallback is flagged', () => {
  const mixed = duffelEnvPublicHint({
    DUFFEL_API_KEY: 'duffel_live_abc',
    DUFFEL_FALLBACK_API_KEY: 'duffel_test_xyz',
  } as NodeJS.ProcessEnv);
  assert.equal(mixed.shape, 'live');
  assert.equal(mixed.fallbackShape, 'test');
  assert.equal(mixed.mixedModes, true);
});

test('a matched pair is not flagged', () => {
  for (const mode of ['live', 'test']) {
    const matched = duffelEnvPublicHint({
      DUFFEL_API_KEY: `duffel_${mode}_abc`,
      DUFFEL_FALLBACK_API_KEY: `duffel_${mode}_xyz`,
    } as NodeJS.ProcessEnv);
    assert.equal(matched.mixedModes, false, `${mode} primary + ${mode} fallback is consistent`);
  }

  const soloLive = duffelEnvPublicHint({ DUFFEL_API_KEY: 'duffel_live_abc' } as NodeJS.ProcessEnv);
  assert.equal(soloLive.mixedModes, false, 'no fallback is not a mismatch');
});

test('the public report never carries key material', () => {
  // This endpoint is public — only its ?probe= variants are admin-gated.
  const secret = 'duffel_live_SUPERSECRETTOKENVALUE';
  const report = duffelEnvPublicHint({
    DUFFEL_API_KEY: secret,
    DUFFEL_FALLBACK_API_KEY: 'duffel_test_ANOTHERSECRET',
  } as NodeJS.ProcessEnv);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /SUPERSECRET/);
  assert.doesNotMatch(serialized, /ANOTHERSECRET/);
});

test('an unrecognised token says so rather than guessing', () => {
  const odd = duffelEnvPublicHint({ DUFFEL_API_KEY: 'pk_live_stripe_maybe' } as NodeJS.ProcessEnv);
  assert.equal(odd.shape, 'other');
  assert.equal(odd.configured, true, 'it will still be handed to the SDK, so say it is set');
  assert.match(odd.hint || '', /unexpected/i);
  assert.doesNotMatch(JSON.stringify(odd), /stripe_maybe/, 'never echo an unknown secret');
});
