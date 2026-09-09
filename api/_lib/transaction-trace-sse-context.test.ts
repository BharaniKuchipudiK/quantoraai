import assert from 'node:assert/strict';
import test from 'node:test';
import { traceBoundary, traceSseChatSuccessSettled } from './transaction-trace.js';

test('[was-red] settled SSE success keeps the owner and transaction from earlier server boundaries', async () => {
  const correlationId = 'studio-context-12345678';
  const original = console.log;
  console.log = () => {};
  try {
    traceBoundary({
      correlationId,
      boundary: 'api.chat',
      state: 'started',
      transaction: 'golden-calculator',
      route: '/api/chat',
      userSub: 'owner-123',
    }, () => {});

    const kept: any[] = [];
    const settled = traceSseChatSuccessSettled({
      provider: 'OpenRouter (anthropic/claude-opus-5)',
      correlationId,
      modelId: 'anthropic/claude-opus-5',
      latencyMs: 321,
      inferenceRoute: { gateway: 'openrouter' },
    }, async (event) => { kept.push(event); });

    assert.ok(settled instanceof Promise);
    assert.equal(await settled, true);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].transaction, 'golden-calculator', 'the durable terminal row must stay attached to the transaction');
    assert.equal(kept[0].userSub, 'owner-123', 'the durable terminal row must stay resolvable by the signed-in owner');
    assert.equal(kept[0].state, 'succeeded');
  } finally {
    console.log = original;
  }
});

test('terminal context is released so a deliberately reused correlation id cannot inherit the previous owner', async () => {
  const correlationId = 'studio-context-reuse-12345678';
  const original = console.log;
  console.log = () => {};
  try {
    traceBoundary({
      correlationId,
      boundary: 'api.chat',
      state: 'started',
      transaction: 'first-transaction',
      userSub: 'first-owner',
    }, () => {});
    const first = traceSseChatSuccessSettled({
      provider: 'Google Gemini',
      correlationId,
      modelId: 'gemini-flash-latest',
      latencyMs: 10,
      inferenceRoute: { gateway: 'gemini' },
    }, async () => {});
    assert.ok(first instanceof Promise);
    await first;

    traceBoundary({
      correlationId,
      boundary: 'api.chat',
      state: 'started',
      transaction: 'second-transaction',
      userSub: 'second-owner',
    }, () => {});
    const kept: any[] = [];
    const second = traceSseChatSuccessSettled({
      provider: 'Google Gemini',
      correlationId,
      modelId: 'gemini-flash-latest',
      latencyMs: 11,
      inferenceRoute: { gateway: 'gemini' },
    }, async (event) => { kept.push(event); });
    assert.ok(second instanceof Promise);
    await second;

    assert.equal(kept[0].transaction, 'second-transaction');
    assert.equal(kept[0].userSub, 'second-owner');
  } finally {
    console.log = original;
  }
});

test('[was-red] concurrent chat streams sharing a turn correlation retain context until both settle', async () => {
  const correlationId = 'studio-dual-arena-12345678';
  const original = console.log;
  console.log = () => {};
  try {
    for (const modelId of ['model-a', 'model-b']) {
      traceBoundary({
        correlationId,
        boundary: 'api.chat',
        state: 'started',
        transaction: 'dual-arena-turn',
        userSub: 'arena-owner',
        modelId,
      }, () => {});
    }

    const kept: any[] = [];
    for (const modelId of ['model-a', 'model-b']) {
      const settled = traceSseChatSuccessSettled({
        provider: `OpenRouter (${modelId})`,
        correlationId,
        modelId,
        latencyMs: 10,
        inferenceRoute: { gateway: 'openrouter' },
      }, async (event) => { kept.push(event); });
      assert.ok(settled instanceof Promise);
      await settled;
    }

    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map((event) => event.transaction), ['dual-arena-turn', 'dual-arena-turn']);
    assert.deepEqual(kept.map((event) => event.userSub), ['arena-owner', 'arena-owner']);
  } finally {
    console.log = original;
  }
});
