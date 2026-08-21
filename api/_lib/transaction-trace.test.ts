import assert from 'node:assert/strict';
import test from 'node:test';
import {
  correlationIdForRequest,
  isGoldenCanaryRequest,
  normalizeBoundaryEvent,
  normalizeCorrelationId,
} from './transaction-trace.js';

test('correlation IDs accept bounded opaque values and reject injected text', () => {
  assert.equal(normalizeCorrelationId('golden-calculator-12345678'), 'golden-calculator-12345678');
  assert.equal(normalizeCorrelationId('bad id\nconsole.log(secret)'), null);
});

test('request correlation prefers the incoming header and otherwise creates an id', () => {
  assert.equal(correlationIdForRequest({ headers: { 'x-quantora-correlation-id': 'browser-12345678' } }), 'browser-12345678');
  assert.match(correlationIdForRequest({ headers: {} }), /^[0-9a-f-]{36}$/);
});

test('boundary events allow operational metadata but reject prompt-like detail', () => {
  const event = normalizeBoundaryEvent({
    correlationId: 'browser-12345678',
    boundary: 'artifact.vfs',
    state: 'parsed',
    fileCount: 4,
    detailCode: 'contract-valid',
  });
  assert.equal(event?.fileCount, 4);
  assert.equal(normalizeBoundaryEvent({
    correlationId: 'browser-12345678',
    boundary: 'artifact.vfs',
    state: 'parsed',
    detailCode: 'user said: build my private app',
  })?.detailCode, null);
});

test('golden canary authentication fails closed and uses a server secret', () => {
  const previous = process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
  process.env.QUANTORA_GOLDEN_CANARY_TOKEN = 'server-secret-123';
  try {
    assert.equal(isGoldenCanaryRequest({ headers: { 'x-quantora-golden-canary': 'server-secret-123' } }), true);
    assert.equal(isGoldenCanaryRequest({ headers: { 'x-quantora-golden-canary': 'wrong' } }), false);
  } finally {
    if (previous === undefined) delete process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
    else process.env.QUANTORA_GOLDEN_CANARY_TOKEN = previous;
  }
});
