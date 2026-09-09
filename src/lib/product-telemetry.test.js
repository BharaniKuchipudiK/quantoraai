import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_TELEMETRY_STORAGE,
  authStateFromSession,
  buildFirstWorkspaceEventData,
  buildVisitEventData,
  claimFirstWorkspaceOpen,
  claimPageTelemetry,
  classifyVisit,
  productTelemetrySurface,
  shouldCollectProductTelemetry,
} from './product-telemetry.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(map.entries());
    },
  };
}

test('product telemetry is suppressed on local development hosts', () => {
  assert.equal(shouldCollectProductTelemetry({ hostname: 'localhost' }), false);
  assert.equal(shouldCollectProductTelemetry({ hostname: '127.0.0.1' }), false);
  assert.equal(shouldCollectProductTelemetry({ hostname: '::1' }), false);
  assert.equal(shouldCollectProductTelemetry({ hostname: 'quantoraai.app' }), true);
});

test('visit classification distinguishes first seen, same-day and later-day browser returns', () => {
  const storage = memoryStorage();
  const dayOneMorning = new Date(2026, 8, 9, 9, 0, 0).getTime();
  const dayOneEvening = new Date(2026, 8, 9, 18, 0, 0).getTime();
  const dayTwo = new Date(2026, 8, 10, 8, 0, 0).getTime();

  assert.equal(classifyVisit(storage, dayOneMorning), 'first_seen');
  assert.equal(classifyVisit(storage, dayOneEvening), 'same_day');
  assert.equal(classifyVisit(storage, dayTwo), 'returning');
  assert.ok(storage.snapshot()[PRODUCT_TELEMETRY_STORAGE.LAST_VISIT_DAY]);
});

test('page and first-workspace claims are one-shot', () => {
  const session = memoryStorage();
  const local = memoryStorage();

  assert.equal(claimPageTelemetry(session), true);
  assert.equal(claimPageTelemetry(session), false);
  assert.equal(claimFirstWorkspaceOpen(local), true);
  assert.equal(claimFirstWorkspaceOpen(local), false);
});

test('session state and workspace surface fail closed to bounded aggregate labels', () => {
  assert.equal(authStateFromSession({ user: { email: 'private@example.com' } }), 'signed_in');
  assert.equal(authStateFromSession({ user: null }), 'signed_out');
  assert.equal(authStateFromSession(null), 'unknown');
  assert.equal(productTelemetrySurface('/studio'), 'studio');
  assert.equal(productTelemetrySurface('/studio/project/123'), 'studio');
  assert.equal(productTelemetrySurface('/'), 'app');
});

test('event builders cannot leak identity or free-form user data', () => {
  const visit = buildVisitEventData({
    authState: 'signed_in',
    visitType: 'returning',
    surface: 'studio',
    email: 'private@example.com',
    name: 'Private Name',
    prompt: 'secret prompt',
  });
  assert.deepEqual(visit, {
    auth_state: 'signed_in',
    visit_type: 'returning',
    surface: 'studio',
  });
  assert.deepEqual(Object.keys(visit).sort(), ['auth_state', 'surface', 'visit_type']);

  assert.deepEqual(buildVisitEventData({ authState: 'anything', visitType: 'anything', surface: '/private' }), {
    auth_state: 'unknown',
    visit_type: 'unknown',
    surface: 'app',
  });
  assert.deepEqual(buildFirstWorkspaceEventData('studio'), { surface: 'studio' });
});
