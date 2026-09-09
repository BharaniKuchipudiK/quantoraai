import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeKeyShape,
  generateGeminiOnce,
  listGeminiModels,
  pickProbeModel,
  probeGemini,
  PRODUCTION_FIRST_GEMINI,
  verdictFor,
} from './gemini-probe.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  assert.equal(shape.matchesKnownKeyFormat, true);
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

test('INVARIANT: a stream that closes with no terminal finish reason is not a success', async () => {
  // A proxy hangs up, or the upstream link ends gracefully mid-answer. No
  // error event, no finishReason — just text that stops. It is the one failure
  // shape where nothing else is left to notice, so the absence of STOP has to
  // be read as the incompleteness it is.
  const result = await generateGeminiOnce('AIzaKEY', 'gemini-3.7-flash', {
    fetchFn: (async () => sseResponse(200, [candidate('<html><h1>looks finished</h1>')])) as any,
  });
  assert.equal(result.finishReason, null);
  assert.equal(result.ok, false, 'no terminal STOP means the answer is incomplete');
  assert.match(result.error || '', /no terminal finish reason/);
  assert.match(
    verdictFor(
      describeKeyShape('AIzaSyREALKEY0001', 'env'),
      { attempted: true, ok: true, status: 200, models: ['gemini-3.7-flash'], totalListed: 1, error: null, ms: 1 },
      result,
    ),
    /connection closed/,
  );
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

test('INVARIANT: a working key is never called wrongly-shaped', async () => {
  /*
   * This exact report came back from production: a 53-character key that does
   * not start "AIza", which listed 53 models and streamed a complete answer —
   * and the verdict said "does not have the shape of a Google API key". The
   * heuristic ran above the evidence and overrode two live proofs from Google.
   *
   * Google decides whether a key is valid. Nothing in this file may overrule it.
   */
  const unfamiliarKey = 'AQ.Ab8RN6Jexamplekeymaterialthatisfiftythreelong.WexQ';
  const fetchFn = (async (url: string) => (
    String(url).includes(':streamGenerateContent')
      ? sseResponse(200, [candidate('<html><h1>Gemini is reachable</h1></html>', 'STOP')])
      : jsonResponse(200, { models: [{ name: 'models/gemini-3.7-flash' }] })
  )) as any;

  const report = await probeGemini({ key: unfamiliarKey, fetchFn });
  assert.equal(report.key.matchesKnownKeyFormat, false, 'the fixture must be an unfamiliar format');
  assert.equal(report.generate.ok, true);
  assert.match(report.verdict, /Gemini works from here/);
  assert.doesNotMatch(report.verdict, /shape|format|wrong secret/i);
});

test('an unfamiliar format is offered as a hint only when Google actually refuses', () => {
  const odd = describeKeyShape('AQ.Ab8RN6Jexamplekeymaterialthatisfiftythreelong.WexQ', 'env');
  const refused = { attempted: true, ok: false, status: 400, models: [], totalListed: 0, error: 'API key not valid.', ms: 82 };
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, blockReason: null, error: null, ms: 0 };
  const verdict = verdictFor(odd, refused, none);
  assert.match(verdict, /Google rejected the key/);
  assert.match(verdict, /hint, not proof/);
});

test('a spend cap at the model list is named as billing, not as a rejected key (2026-09-06)', () => {
  const key = describeKeyShape('AIzaSyREALKEY0001', 'env');
  const capped = { attempted: true, ok: false, status: 403, models: [], totalListed: 0, error: 'Spend cap breached for project: projects/1053456406059 for service: generativelanguage.googleapis.com. Correlation id: 6', ms: 90 };
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, blockReason: null, error: null, ms: 0 };
  const verdict = verdictFor(key, capped, none);
  assert.match(verdict, /spend cap/i);
  assert.match(verdict, /billing/);
  assert.match(verdict, /named the project/);
  assert.doesNotMatch(verdict, /not billing|wrong secret|rejected the key/);
});

/*
 * Google's billing cap, in every sentence it has actually used, plus the
 * neighbour it must not be confused with.
 *
 * The 2026-09-06 test below this pair covered one wording. On 2026-09-09 the
 * deployed golden failed with the OTHER wording — "Your project has exceeded
 * its monthly spending cap" — which the verb-enumerating matcher missed, so
 * the probe would have called a billing cap a rate limit and sent the operator
 * to the wrong page. A corpus containing only the case that motivated the fix
 * reads 100% for a matcher that is still half blind, so the rate-limit row is
 * held here deliberately: it proves the widened matcher did not simply learn
 * to say "billing" about every 429.
 */
const SPEND_CAP_SENTENCES = [
  {
    when: '2026-09-06',
    status: 403,
    error: 'Spend cap breached for project: projects/1053456406059 for service: generativelanguage.googleapis.com. Correlation id: 6',
    namesProject: true,
  },
  {
    when: '2026-09-09',
    status: 429,
    error: 'Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend limit.',
    namesProject: false,
  },
];

for (const row of SPEND_CAP_SENTENCES) {
  test(`a billing cap is named as billing, in the ${row.when} wording (HTTP ${row.status})`, () => {
    const key = describeKeyShape('AIzaSyREALKEY0001', 'env');
    const capped = { attempted: true, ok: false, status: row.status, models: [], totalListed: 0, error: row.error, ms: 90 };
    const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, blockReason: null, error: null, ms: 0 };
    const verdict = verdictFor(key, capped, none);

    assert.match(verdict, /billing cap/i, 'the verdict must name the cap as billing');
    assert.match(verdict, /Raise the cap or add credit/, 'it must send the operator to the remedy that works');
    assert.doesNotMatch(verdict, /rate limiting|over quota/i, 'a billing cap is not a rate limit; that wording sends them to the wrong page');
    assert.doesNotMatch(verdict, /wrong secret|rejected the key/, 'the credential is fine');

    // Claim Google named the project only where Google actually named it.
    if (row.namesProject) assert.match(verdict, /named the project/);
    else assert.doesNotMatch(verdict, /named the project/, 'this wording does not name a project, so the verdict must not say it does');
  });
}

test('a genuine rate limit with no cap wording is still reported as a rate limit', () => {
  const key = describeKeyShape('AIzaSyREALKEY0001', 'env');
  const limited = { attempted: true, ok: false, status: 429, models: [], totalListed: 0, error: 'Resource has been exhausted (e.g. check quota).', ms: 90 };
  const none = { attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0, finishReason: null, blockReason: null, error: null, ms: 0 };
  const verdict = verdictFor(key, limited, none);

  assert.match(verdict, /rate limiting|over quota/i);
  assert.doesNotMatch(verdict, /billing cap|add credit/i, 'widening the cap matcher must not make every 429 read as billing');
});

/*
 * THE PROBE MUST PROVE THE MODEL PRODUCTION ACTUALLY CALLS.
 *
 * On 2026-09-09 at 01:07 this probe reported gemini=ok(gemini-3.8-flash
 * 1218ms) while a user's desk turn in the same minutes had gemini-flash-latest
 * answer HTTP 504 twice. Both statements were true. The probe was simply
 * answering about a model the platform never routes to, because its ranking
 * deranked "-latest" on the stated grounds that such variants "are not what
 * production would pick" — which was false for this repository.
 *
 * A watchdog that is green about the wrong model is worse than none: it is the
 * 2026-08-31 shape from CLAUDE.md §1, where a passing check stopped anyone
 * looking. So the two ends are tied here, read out of the source rather than
 * restated, and this test fails the moment production changes its first rung
 * without the probe following.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const readSource = (name: string) => readFileSync(join(HERE, name), 'utf8');

test('the probe proves the Gemini id production routes to first', () => {
  // chat-handler.ts: the first entry of FEATURED_SERVER_MODELS, "Rung 0".
  const featured = readSource('chat-handler.ts');
  const setBody = /const FEATURED_SERVER_MODELS = new Set\(\[([\s\S]*?)\]\)/.exec(featured);
  assert.ok(setBody, 'FEATURED_SERVER_MODELS moved or changed shape; this contract cannot read it any more');
  const firstRung = /"([^"]+)"/.exec(setBody[1]);
  assert.ok(firstRung, 'FEATURED_SERVER_MODELS lists no quoted model id');
  assert.equal(
    firstRung[1],
    PRODUCTION_FIRST_GEMINI,
    'production now tries a different model first; point PRODUCTION_FIRST_GEMINI at it, or the probe goes back to '
    + 'proving a model nobody calls',
  );

  // The same id is the platform's stable Gemini fallback in two more modules.
  for (const [file, name] of [
    ['inference-control-plane.ts', 'GEMINI_STABLE'],
    ['model-execution-policy.ts', 'GEMINI_STABLE_FALLBACK'],
  ] as const) {
    const found = new RegExp(`const ${name} = '([^']+)'`).exec(readSource(file));
    assert.ok(found, `${name} is gone from ${file}; this contract is reading a constant that no longer exists`);
    assert.equal(found[1], PRODUCTION_FIRST_GEMINI, `${file}'s ${name} and the probe disagree about Gemini`);
  }
});

test('pickProbeModel returns production first choice whenever the key can see it', () => {
  // Exactly the shape that misled the operator: a newer plain id present too.
  assert.equal(
    pickProbeModel(['gemini-3.8-flash', 'gemini-3.7-pro', PRODUCTION_FIRST_GEMINI]),
    PRODUCTION_FIRST_GEMINI,
  );
  // Falls back to the ranking only when this key cannot see it at all, because
  // a hardcoded id that has outlived its model 404s and reads as a broken key.
  assert.equal(pickProbeModel(['gemini-3.8-flash', 'gemini-3.7-pro']), 'gemini-3.8-flash');
  assert.equal(pickProbeModel(['text-embedding-004']), null);
});
