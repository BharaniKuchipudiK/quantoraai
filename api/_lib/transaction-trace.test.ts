import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeTraceLookup,
  correlationIdForRequest,
  isGoldenCanaryRequest,
  normalizeBoundaryEvent,
  normalizeCorrelationId,
  publicTraceEvents,
  traceBoundary,
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
    budgetMs: 65_000,
    detailCode: 'contract-valid',
  });
  assert.equal(event?.fileCount, 4);
  assert.equal(event?.budgetMs, 65_000);
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

/*
 * A REFERENCE RESOLVES (2026-09-05). "This turn ended without a reply … Reference:
 * studio-719887e2-…" was a handle to nothing: the boundary events behind it were
 * stdout lines of a serverless instance that no longer existed. Every event is
 * now handed to the durable store under the signed-in owner, and the lookup is
 * scoped to that owner.
 */
test('[was-red] a boundary event is kept, under its owner, and the owner never reaches the log line', () => {
  const kept: any[] = [];
  const logged: string[] = [];
  const original = console.log;
  console.log = (line: string) => { logged.push(String(line)); };
  try {
    const recorded = traceBoundary({
      correlationId: 'studio-719887e2-b5a4-4de5-b84a-f474192befa2',
      boundary: 'inference.provider',
      state: 'attempting',
      modelId: 'anthropic/claude-opus-5',
      gateway: 'openrouter',
      userSub: '104858279901234567890',
    }, (event) => { kept.push(event); });
    assert.equal(recorded, true);
  } finally {
    console.log = original;
  }
  assert.equal(kept.length, 1, 'the event reached the store');
  assert.equal(kept[0].userSub, '104858279901234567890');
  assert.equal(kept[0].boundary, 'inference.provider');
  assert.equal(kept[0].state, 'attempting');
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /104858279901234567890|userSub/, 'the log line stays operational data only');
  assert.match(logged[0], /"type":"quantora\.transaction\.boundary"/);
});

test('a store that throws never fails the boundary it was recording', () => {
  const original = console.log;
  console.log = () => {};
  try {
    assert.equal(traceBoundary({ correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started' }, () => { throw new Error('store down'); }), true);
  } finally {
    console.log = original;
  }
});

test('an unusable owner is dropped rather than stored', () => {
  assert.equal(normalizeBoundaryEvent({ correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started', userSub: 'sub\nwith newline' })?.userSub, null);
  assert.equal(normalizeBoundaryEvent({ correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started', userSub: 'user@example.com' })?.userSub, 'user@example.com');
});

test('a lookup is the owner\'s or an admin\'s; anyone else gets exactly what an unknown reference gets', () => {
  const events = [
    { correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started', userSub: 'owner-1' },
    { correlationId: 'studio-12345678', boundary: 'inference.provider', state: 'attempting', userSub: null },
  ] as any[];
  assert.equal(authorizeTraceLookup(events, { sub: 'owner-1' })?.length, 2, 'the owner reads every event, including ones recorded without an owner');
  assert.equal(authorizeTraceLookup(events, { sub: 'someone-else' }), null);
  assert.equal(authorizeTraceLookup(events, { sub: 'admin-9', isAdmin: true })?.length, 2);
  assert.equal(authorizeTraceLookup(events, null), null, 'no session, no lookup');
  assert.deepEqual(authorizeTraceLookup([], { sub: 'owner-1' }), [], 'an empty record for a signed-in user is the honest empty list');
  assert.equal(authorizeTraceLookup([{ correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started', userSub: null }] as any[], { sub: 'owner-1' }), null,
    'events recorded without any owner (a canary run) are nobody\'s but an admin\'s');
});

test('the lookup response never carries the owner', () => {
  const out = publicTraceEvents([{ correlationId: 'studio-12345678', boundary: 'api.chat', state: 'started', userSub: 'owner-1' }] as any[]);
  assert.equal('userSub' in out[0], false);
  assert.equal(out[0].boundary, 'api.chat');
});
