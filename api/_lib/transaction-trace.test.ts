import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeTraceLookup,
  chatSuccessEventFromSsePayload,
  correlationIdForRequest,
  isGoldenCanaryRequest,
  normalizeBoundaryEvent,
  normalizeCorrelationId,
  publicTraceEvents,
  traceBoundary,
  traceBoundarySettled,
  traceSseChatSuccessSettled,
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

test('[was-red] the terminal event is WAITED FOR, not fired into a freezing instance', async () => {
  /*
   * traceBoundary is fire-and-forget, which is right mid-turn: the function
   * keeps running for seconds and the write lands long before it ends. It is
   * exactly wrong for the last event of a turn -- a serverless instance is
   * frozen the moment the handler returns, so a POST started microseconds
   * earlier never completes.
   *
   * The event lost that way is the one that says what finally happened. Seen
   * in production 2026-09-08: an engine failure recorded at +114.7s and
   * nothing after it, on a turn whose catch writes an api.chat failed row on
   * ANY throw. The row was written. It was never delivered.
   */
  let settled = false;
  const slowSink = () => new Promise((resolve) => setTimeout(() => { settled = true; resolve(undefined); }, 20));

  /* The fire-and-forget path returns before the write finishes — by design. */
  traceBoundary({ correlationId: 'studio-fireforget', boundary: 'api.chat', state: 'failed' }, slowSink);
  assert.equal(settled, false, 'traceBoundary must stay non-blocking for mid-turn events');

  settled = false;
  const ok = await traceBoundarySettled({ correlationId: 'studio-settled', boundary: 'api.chat', state: 'failed' }, slowSink);
  assert.equal(ok, true);
  assert.equal(settled, true, 'the settled form must not resolve until the store has actually taken the row');
});

test('a store that refuses the terminal row still never fails the turn', async () => {
  /* Bookkeeping may not break a response. It may only stop disappearing. */
  const thrower = () => { throw new Error('store down'); };
  assert.equal(await traceBoundarySettled({ correlationId: 'studio-throws', boundary: 'api.chat', state: 'failed' }, thrower), true);

  const rejecter = () => Promise.reject(new Error('store unreachable'));
  assert.equal(await traceBoundarySettled({ correlationId: 'studio-rejects', boundary: 'api.chat', state: 'failed' }, rejecter), true);
});

test('[was-red] final SSE payload becomes a settled api.chat success row', async () => {
  const payload = {
    provider: 'OpenRouter (anthropic/claude-opus-5)',
    correlationId: 'studio-success-12345678',
    modelId: 'anthropic/claude-opus-5',
    latencyMs: 987,
    inferenceRoute: { gateway: 'openrouter' },
  };
  const normalized = chatSuccessEventFromSsePayload(payload);
  assert.deepEqual(normalized, {
    correlationId: 'studio-success-12345678',
    boundary: 'api.chat',
    state: 'succeeded',
    route: '/api/chat',
    modelId: 'anthropic/claude-opus-5',
    gateway: 'openrouter',
    durationMs: 987,
  });

  const kept: any[] = [];
  const original = console.log;
  console.log = () => {};
  try {
    const result = traceSseChatSuccessSettled(payload, async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      kept.push(event);
    });
    assert.ok(result instanceof Promise, 'a real success payload must produce a waitable durable write');
    assert.equal(await result, true);
  } finally {
    console.log = original;
  }
  assert.equal(kept.length, 1);
  assert.equal(kept[0].state, 'succeeded');
  assert.equal(kept[0].gateway, 'openrouter');
  assert.equal(traceSseChatSuccessSettled({ provider: 'Synthetic' }, () => {}), false,
    'non-chat done payloads stay synchronous and do not invent api.chat traces');
});

test('[was-red] SseWriter is the chat handler\'s only terminal success owner', async () => {
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  const directSuccessTrace = /boundary:\s*['"]api\.chat['"],\s*state:\s*['"]succeeded['"]/;
  assert.doesNotMatch(
    handler,
    directSuccessTrace,
    'the handler must not append a second success after SseWriter starts the settled terminal write',
  );
});

test('[was-red] every trace whose next statement ends the response is awaited', async () => {
  /*
   * Scoped to the four sites where the handler answers and returns: the two
   * rate-limit refusals, the budget refusal, and the terminal catch. A
   * fire-and-forget trace at any of them is a failed turn with no record that
   * it failed -- invisible to the failure digest, and to its own reference
   * lookup.
   *
   * Success is now settled by SseWriter before it closes the socket, so this
   * handler-source assertion remains focused on the four non-SSE terminal
   * refusal/failure exits it owns directly.
   */
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');

  assert.match(handler, /const traceFinal = \(input: Partial<TransactionBoundaryEvent>\) =>\s*\n\s*traceBoundarySettled\(/,
    'the handler needs a settled companion to trace');

  const awaited = handler.match(/await traceFinal\(\{/g) || [];
  assert.equal(awaited.length, 4,
    `expected 4 awaited terminal traces (two rate-limit refusals, the budget refusal, the catch), found ${awaited.length}`);

  /* The catch is the one that matters most: it fires on ANY throw. */
  assert.match(handler, /\} catch \(err: any\) \{\s*\n\s*console\.error\("Error in \/api\/chat:", err\);\s*\n\s*await traceFinal\(\{/,
    'the terminal catch must wait for its row — it is the record of every unhandled failure');

  /* And recordBoundaryEvent has to actually be waitable, or awaiting is theatre. */
  const store = readFileSync(new URL('./store.ts', import.meta.url), 'utf8');
  assert.match(store, /export function recordBoundaryEvent\(event: BoundaryEventRecord\): Promise<void> \{\s*\n\s*return request\(/,
    'the sink must return its write, or every await above resolves instantly on a void');
});
