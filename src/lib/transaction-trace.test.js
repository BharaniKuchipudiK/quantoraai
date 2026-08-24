import assert from 'node:assert/strict';
import test from 'node:test';
import { correlationHeaders, createCorrelationId, normalizeClientCorrelationId, previewMessageMatchesCompile } from './transaction-trace.js';

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
