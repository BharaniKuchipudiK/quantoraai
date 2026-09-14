import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_ACTIVITY_TRACE_STORAGE_KEY,
  correlationHeaders,
  createCorrelationId,
  normalizeClientCorrelationId,
  previewMessageMatchesCompile,
  publishLiveActivityTrace,
  readLiveActivityTrace,
} from './transaction-trace.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('browser correlation IDs are opaque, bounded, and propagated by header', () => {
  const id = createCorrelationId('golden-calculator');
  assert.equal(normalizeClientCorrelationId(id), id);
  assert.equal(correlationHeaders(id)['X-Quantora-Correlation-Id'], id);
  assert.ok(id.length <= 96);
});

test('invalid browser correlation IDs are not transmitted', () => {
  assert.equal(normalizeClientCorrelationId('bad id'), null);
  assert.equal(correlationHeaders('bad id')['X-Quantora-Correlation-Id'], undefined);
});

test('active Studio turn traces are bounded session state, not invented progress', () => {
  const storage = memoryStorage();
  const id = 'studio-12345678';
  assert.equal(publishLiveActivityTrace(id, { storage, eventTarget: null, now: 1_000 }), true);
  assert.equal(readLiveActivityTrace({ storage, now: 1_500 }), id);
  assert.equal(readLiveActivityTrace({ storage, now: 1_000 + 10 * 60 * 1000 + 1 }), null, 'stale turn ids do not revive old progress');
  assert.equal(publishLiveActivityTrace('preview-12345678', { storage, eventTarget: null, now: 2_000 }), false, 'only Studio chat turns own this activity surface');
});

test('building Studio chat headers activates the same durable trace id for UI polling', () => {
  const storage = memoryStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    const id = 'studio-87654321';
    assert.equal(correlationHeaders(id)['X-Quantora-Correlation-Id'], id);
    const persisted = JSON.parse(storage.getItem(LIVE_ACTIVITY_TRACE_STORAGE_KEY));
    assert.equal(persisted.correlationId, id);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
  }
});

test('preview messages must carry the id the compiler baked in', () => {
  assert.equal(previewMessageMatchesCompile({
    requestId: 'browser-desk-1',
    compiledId: 'browser-desk-1',
    eventId: 'browser-desk-1',
  }), true);
  assert.equal(previewMessageMatchesCompile({
    requestId: 'browser-desk-1',
    compiledId: 'compiler-minted-99',
    eventId: 'compiler-minted-99',
  }), true, 'production may mint a new id when the request arrives without one');
  assert.equal(previewMessageMatchesCompile({
    requestId: 'browser-desk-1',
    compiledId: null,
    eventId: null,
  }), false, 'a mock that drops the id is not proof of the running page');
  assert.equal(previewMessageMatchesCompile({
    requestId: 'browser-desk-1',
    compiledId: 'browser-desk-1',
    eventId: 'other-desk-2',
  }), false);
});
