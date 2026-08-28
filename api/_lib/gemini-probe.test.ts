import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeKeyShape,
  generateGeminiOnce,
  listGeminiModels,
  pickProbeModel,
  probeGemini,
  verdictFor,
} from './gemini-probe.js';

/*
 * These run with no network and no credential, which is the point: the thing
 * being diagnosed is unreachable from a laptop, so the diagnostic itself has to
 * be provable somewhere else.
 */

function jsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

/** A minimal SSE body, chunked mid-line to prove the buffering is real. */
function sseResponse(status: number, events: any[], { split = 3 } = {}) {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const bytes = new TextEncoder().encode(payload);
  const size = Math.max(1, Math.ceil(bytes.length / split));
  let offset = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => payload,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const slice = bytes.slice(offset, offset + size);
          offset += size;
          return { done: false, value: slice };
        },
      }),
    },
  } as any;
}

const candidate = (text: string, finishReason: string | null = null) => ({
  candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
});

test('a key is described, never disclosed', () => {
  const shape = describeKeyShape('AIzaSyABCDEFGHIJKLMNOP1234', 'env');
  assert.equal(shape.present, true);
  assert.equal(shape.last4, '1234');
  assert.equal(shape.looksLikeGoogleKey, true);
  assert.equal(shape.looksRedacted, false);
  // Nothing in the report may carry the value itself.
  assert.ok(!JSON.stringify(shape).includes('SyABCDEFGHIJKLMNOP'));
});

test("Vercel's redaction placeholder is named as such, not tried as a key", () => {
  const shape = describeKeyShape('[REDACTED - SENSITIVE]', 'env');
  assert.equal(shape.looksRedacted, true);
  assert.match(verdictFor(shape, { attempted: false, ok: false, status: null, models: [], totalListed: 0, error: null, ms: 0 }, { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, blockReason: null, error: null, ms: 0 }), /placeholder/i);
});

test('a redaction placeholder is never sent to Google', async () => {
  let called = 0;
  const report = await probeGemini({
    key: '[REDACTED - SENSITIVE]',
    fetchFn: (async () => { called += 1; return jsonResponse(200, {}); }) as any,
  });
  assert.equal(called, 0, 'a placeholder must not produce a request');
  assert.equal(report.list.attempted, false);
});

test('listing reports the models the key can see', async () => {
  const result = await listGeminiModels('AIzaKEY', {
    fetchFn: (async () => jsonResponse(200, {
      models: [
        { name: 'models/gemini-3.7-flash' },
        { name: 'models/gemini-2.5-flash' },
        { name: 'models/text-embedding-004' },
      ],
    })) as any,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ['gemini-2.5-flash', 'gemini-3.7-flash']);
  assert.equal(result.totalListed, 3);
});

test('a listing rejection is reported with its status and message, not swallowed', async () => {
  // fetchGeminiCatalog returns null here, which is why "no key", "wrong
  // project" and "network down" have been one indistinguishable answer.
  const result = await listGeminiModels('AIzaKEY', {
    fetchFn: (async () => jsonResponse(403, {
      error: { message: 'Generative Language API has not been used in project 12345 before or it is disabled.' },
    })) as any,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error || '', /has not been used in project/);
});

test('the key never leaks into an error string', async () => {
  const result = await listGeminiModels('AIzaSECRETVALUE123', {
    fetchFn: (async () => jsonResponse(400, {
      error: { message: 'API key not valid: key=AIzaSECRETVALUE123 at models?key=AIzaSECRETVALUE123' },
    })) as any,
  });
  assert.ok(!(result.error || '').includes('AIzaSECRETVALUE123'), result.error || '');
});

test('the model is chosen from what the key sees, not from a constant', () => {
  // Every hardcoded Gemini id in this repo has outlived the model it names.
  assert.equal(pickProbeModel(['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.7-pro']), 'gemini-3.7-flash');
  assert.equal(pickProbeModel(['gemini-3.7-pro', 'gemini-2.5-pro']), 'gemini-3.7-pro');
  assert.equal(pickProbeModel(['text-embedding-004']), null);
  assert.equal(pickProbeModel([]), null);
});

test('a batch id is never chosen to stream from', () => {
  // A batch endpoint accepts the call and answers asynchronously; streaming
  // from it hangs until the budget runs out and looks like a dead model.
  assert.equal(pickProbeModel(['gemini-3.7-flash:batch']), null);
});

test('a successful stream reports its text, chunk count and finish reason', async () => {
  const result = await generateGeminiOnce('AIzaKEY', 'gemini-3.7-flash', {
    fetchFn: (async () => sseResponse(200, [
      candidate('<html>'),
      candidate('<h1>ok</h1>'),
      candidate('</html>', 'STOP'),
    ])) as any,
  });
  assert.equal(result.ok, true);
  assert.equal(result.chars, '<html><h1>ok</h1></html>'.length);
  assert.equal(result.chunks, 3);
  assert.equal(result.finishReason, 'STOP');
});

test('INVARIANT: a truncated answer is not a success', async () => {
  // The platform reads finish_reason nowhere, for either provider. That is how
  // silently truncated builds were recorded as successes in the ledger the
  // router learns from, teaching it to prefer the models that cut off.
  const result = await generateGeminiOnce('AIzaKEY', 'gemini-3.7-flash', {
    fetchFn: (async () => sseResponse(200, [candidate('<html>partial'), candidate('', 'MAX_TOKENS')])) as any,
  });
  assert.equal(result.finishReason, 'MAX_TOKENS');
  assert.equal(result.ok, false, 'MAX_TOKENS is a cut-off answer, never a completed one');
});

test('a mid-stream provider failure is not read as an empty answer', async () => {
  // HTTP 200 followed by an error event: quota, safety, an upstream outage.
  const result = await generateGeminiOnce('AIzaKEY', 'gemini-3.7-flash', {
    fetchFn: (async () => sseResponse(200, [
      candidate('<html>'),
      { error: { message: 'Resource has been exhausted (e.g. check quota).' } },
    ])) as any,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 200);
  assert.match(result.error || '', /exhausted/);
  assert.equal(result.chars, 6, 'what did arrive is still reported');
});

test('a safety block is reported as a block, not as a broken key', async () => {
  const result = await generateGeminiOnce('AIzaKEY', 'gemini-3.7-flash', {
    fetchFn: (async () => sseResponse(200, [{ promptFeedback: { blockReason: 'SAFETY' } }])) as any,
  });
  assert.equal(result.blockReason, 'SAFETY');
  assert.equal(result.ok, false);
  assert.match(
    verdictFor(describeKeyShape('AIzaSyREALKEY0001', 'env'), { attempted: true, ok: true, status: 200, models: ['gemini-3.7-flash'], totalListed: 1, error: null, ms: 1 }, result),
    /safety filter/i,
  );
});

test('the end-to-end report ends in a sentence a person can act on', async () => {
  const fetchFn = (async (url: string) => (
    String(url).includes(':streamGenerateContent')
      ? sseResponse(200, [candidate('<html><h1>Gemini is reachable</h1></html>', 'STOP')])
      : jsonResponse(200, { models: [{ name: 'models/gemini-3.7-flash' }] })
  )) as any;

  const report = await probeGemini({ key: 'AIzaSyREALKEY0001', fetchFn });
  assert.equal(report.generate.model, 'gemini-3.7-flash');
  assert.match(report.verdict, /Gemini works from here/);
  assert.match(report.verdict, /finish_reason STOP/);
});

test('a project with no Gemini models says so, rather than blaming the key', async () => {
  const report = await probeGemini({
    key: 'AIzaSyREALKEY0001',
    fetchFn: (async () => jsonResponse(200, { models: [] })) as any,
  });
  assert.match(report.verdict, /Generative Language API/);
  assert.equal(report.generate.attempted, false);
});

test('generate: false spends nothing and still answers the credential question', async () => {
  let generateCalls = 0;
  const report = await probeGemini({
    key: 'AIzaSyREALKEY0001',
    generate: false,
    fetchFn: (async (url: string) => {
      if (String(url).includes('generateContent')) generateCalls += 1;
      return jsonResponse(200, { models: [{ name: 'models/gemini-3.7-flash' }] });
    }) as any,
  });
  assert.equal(generateCalls, 0);
  assert.equal(report.list.ok, true);
  assert.match(report.verdict, /sees 1 Gemini models/);
});
