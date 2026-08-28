import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkOpenRouterKey,
  describeKeyShape,
  generateOpenRouterOnce,
  probeOpenRouter,
  verdictFor,
} from './openrouter-probe.js';

/*
 * `openRouterConfigured: true` meant "this string has the right shape". A
 * revoked key, a key with no credit, a key from a deleted account and a key
 * that works all reported it identically — so a health check said everything
 * was fine while every turn failed. These tests hold the difference between
 * a key that looks right and a key that works.
 */

const json = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
}) as any;

function sse(status: number, events: any[]) {
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(payload);
  let offset = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => payload,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const slice = bytes.slice(offset, offset + 12);
          offset += 12;
          return { done: false, value: slice };
        },
      }),
    },
  } as any;
}

const chunk = (content: string, finish: string | null = null) => ({
  choices: [{ delta: { content }, ...(finish ? { finish_reason: finish } : {}) }],
});

test('a key is described, never disclosed', () => {
  const shape = describeKeyShape('sk-or-v1-abcdefghijklmnop1234', 'env');
  assert.equal(shape.last4, '1234');
  assert.equal(shape.matchesKnownKeyFormat, true);
  assert.ok(!JSON.stringify(shape).includes('abcdefghijklmnop'));
});

test('INVARIANT: a working key is never called wrongly-shaped', () => {
  // The lesson the Gemini probe learned expensively: the provider decides
  // whether a key is valid, and a pattern may not overrule a live proof.
  const odd = describeKeyShape('some-other-format-that-still-works', 'env');
  const auth = { attempted: true, ok: true, status: 200, label: 'k', usage: 1, limit: 10, remaining: 9, isFreeTier: false, error: null, ms: 5 };
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, error: null, ms: 0 };
  const verdict = verdictFor(odd, auth, none);
  assert.match(verdict, /key works/);
  assert.doesNotMatch(verdict, /shape|format|wrong secret/i);
});

test('the credential question is answered by /auth/key, not by the catalogue', async () => {
  // The /models catalogue is PUBLIC. Reading it says nothing about a key, which
  // is how an audit reported healthy while every turn failed.
  let called = '';
  await checkOpenRouterKey('sk-or-v1-key', {
    fetchFn: (async (url: string) => { called = String(url); return json(200, { data: { usage: 2, limit: 10 } }); }) as any,
  });
  assert.match(called, /\/auth\/key$/);
});

test('an exhausted balance is reported as a fact, not inferred from failures', async () => {
  const auth = await checkOpenRouterKey('sk-or-v1-key', {
    fetchFn: (async () => json(200, { data: { label: 'main', usage: 10, limit: 10, is_free_tier: false } })) as any,
  });
  assert.equal(auth.ok, true, 'the key itself is valid');
  assert.equal(auth.remaining, 0);
  const shape = describeKeyShape('sk-or-v1-abcdefghijklmnop1234', 'env');
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, error: null, ms: 0 };
  assert.match(verdictFor(shape, auth, none), /spent its whole limit/);
});

test('an account with no limit set is not mistaken for an empty one', async () => {
  const auth = await checkOpenRouterKey('sk-or-v1-key', {
    fetchFn: (async () => json(200, { data: { usage: 4.2, limit: null } })) as any,
  });
  assert.equal(auth.remaining, null, 'unlimited is not zero remaining');
  const shape = describeKeyShape('sk-or-v1-abcdefghijklmnop1234', 'env');
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, error: null, ms: 0 };
  assert.match(verdictFor(shape, auth, none), /no limit set/);
});

test('each rejection says which kind it is, and whether money is the cause', async () => {
  const cases: Array<[number, any, RegExp]> = [
    [401, { error: { message: 'No auth credentials found' } }, /rejected the key outright/],
    [402, { error: { message: 'Insufficient credits' } }, /no credit left/],
    [429, { error: { message: 'Rate limit exceeded' } }, /rate limiting this key/],
  ];
  const shape = describeKeyShape('sk-or-v1-abcdefghijklmnop1234', 'env');
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, error: null, ms: 0 };
  for (const [status, body, expected] of cases) {
    const auth = await checkOpenRouterKey('sk-or-v1-key', { fetchFn: (async () => json(status, body)) as any });
    assert.equal(auth.ok, false);
    assert.match(verdictFor(shape, auth, none), expected, `HTTP ${status}`);
  }
});

test('the key never leaks into an error string', async () => {
  const auth = await checkOpenRouterKey('sk-or-v1-SECRETVALUE0001', {
    fetchFn: (async () => json(401, { error: { message: 'bad key sk-or-v1-SECRETVALUE0001' } })) as any,
  });
  assert.ok(!(auth.error || '').includes('SECRETVALUE'), auth.error || '');
});

test('generation is opt-in, so the free answer costs nothing', async () => {
  let generateCalls = 0;
  const report = await probeOpenRouter({
    key: 'sk-or-v1-abcdefghijklmnop1234',
    fetchFn: (async (url: string) => {
      if (String(url).includes('completions')) generateCalls += 1;
      return json(200, { data: { usage: 1, limit: 10 } });
    }) as any,
  });
  assert.equal(generateCalls, 0);
  assert.match(report.verdict, /No generation was requested/);
});

test('a completed generation reports its finish reason', async () => {
  const result = await generateOpenRouterOnce('sk-or-v1-key', 'openai/gpt-5.6-luna', {
    fetchFn: (async () => sse(200, [chunk('OpenRouter is '), chunk('reachable.', 'stop')])) as any,
  });
  assert.equal(result.ok, true);
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.chars, 'OpenRouter is reachable.'.length);
});

test('INVARIANT: a stream that ends with no finish reason is not a success', async () => {
  const result = await generateOpenRouterOnce('sk-or-v1-key', 'm', {
    fetchFn: (async () => sse(200, [chunk('half an answer')])) as any,
  });
  assert.equal(result.ok, false);
  assert.match(result.error || '', /no terminal finish reason/);
});

test('a mid-stream failure is not read as an empty answer', async () => {
  const result = await generateOpenRouterOnce('sk-or-v1-key', 'm', {
    fetchFn: (async () => sse(200, [chunk('start'), { error: { message: 'Insufficient credits' } }])) as any,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 200, 'accepted, then abandoned upstream');
  assert.match(result.error || '', /Insufficient credits/);
});

test('a stale model id is named as stale, not as a broken key', async () => {
  const shape = describeKeyShape('sk-or-v1-abcdefghijklmnop1234', 'env');
  const auth = { attempted: true, ok: true, status: 200, label: 'k', usage: 1, limit: 10, remaining: 9, isFreeTier: false, error: null, ms: 5 };
  const result = await generateOpenRouterOnce('sk-or-v1-key', 'openai/gpt-4o-mini', {
    fetchFn: (async () => json(404, { error: { message: 'No endpoints found' } })) as any,
  });
  assert.match(verdictFor(shape, auth, result), /model id is not served/);
});

test('a redaction placeholder is never sent', async () => {
  let called = 0;
  const report = await probeOpenRouter({
    key: '[REDACTED - SENSITIVE]',
    fetchFn: (async () => { called += 1; return json(200, {}); }) as any,
  });
  assert.equal(called, 0);
  assert.match(report.verdict, /placeholder/);
});
