import assert from 'node:assert/strict';
import test from 'node:test';
import { correlationHeaders, createCorrelationId, normalizeClientCorrelationId } from './transaction-trace.js';

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
