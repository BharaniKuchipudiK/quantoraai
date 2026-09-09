import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_RELEASE_FLAG,
  buildReleaseFlagEntities,
  resolveClientReleaseFlags,
  type BooleanFlagEvaluator,
} from './release-flags.js';

test('signed-out release context exposes no user identity', () => {
  assert.deepEqual(buildReleaseFlagEntities(null), {
    session: { authenticated: false },
  });
});

test('signed-in targeting uses only stable sub and authenticated state', () => {
  const entities = buildReleaseFlagEntities({
    sub: 'user-stable-sub',
    email: 'private@example.com',
    name: 'Private Name',
    picture: 'https://example.com/private.png',
  });

  assert.deepEqual(entities, {
    session: { authenticated: true },
    user: { id: 'user-stable-sub' },
  });
  assert.equal(JSON.stringify(entities).includes('private@example.com'), false);
  assert.equal(JSON.stringify(entities).includes('Private Name'), false);
});

test('product telemetry release decision is allow-listed and boolean only', async () => {
  const seen: Array<{ flag: string; fallback: boolean; entities: unknown }> = [];
  const evaluate: BooleanFlagEvaluator = async (flag, fallback, entities) => {
    seen.push({ flag, fallback, entities });
    return { value: true, reason: 'rule-match', secretProviderMetadata: 'do-not-return' } as any;
  };

  const flags = await resolveClientReleaseFlags(null, evaluate);

  assert.deepEqual(flags, { productTelemetryV1: true });
  assert.deepEqual(seen, [{
    flag: CLIENT_RELEASE_FLAG.PRODUCT_TELEMETRY_V1,
    fallback: false,
    entities: { session: { authenticated: false } },
  }]);
  assert.deepEqual(Object.keys(flags), ['productTelemetryV1']);
});

test('release decisions fail closed on SDK failure or non-true values', async () => {
  const throws: BooleanFlagEvaluator = async () => {
    throw new Error('flags unavailable');
  };
  const malformed: BooleanFlagEvaluator = async () => ({ value: 'true' });

  assert.deepEqual(await resolveClientReleaseFlags(null, throws), {
    productTelemetryV1: false,
  });
  assert.deepEqual(await resolveClientReleaseFlags(null, malformed), {
    productTelemetryV1: false,
  });
});
