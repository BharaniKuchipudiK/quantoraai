/*
 * gemini-probe — find out what the Google key can actually do, from where it lives.
 *
 * WHY THIS EXISTS
 *
 * Gemini has been failing for weeks and every diagnosis was a guess, because
 * nothing here could be tested from a laptop: the key is Production-only and
 * Vercel hands out `[REDACTED - SENSITIVE]` to `vercel env pull`, so a local
 * run sends a placeholder to Google, gets API_KEY_INVALID, and blames a key
 * that was never tried. Meanwhile the Google Cloud console showed ZERO Gemini
 * requests in 24 hours — not errors, no requests at all — which no local test
 * can explain either.
 *
 * The catalogue reader we already had (`fetchGeminiCatalog`) cannot help: it
 * swallows every failure and returns null, so "no key", "wrong project",
 * "quota exhausted" and "network down" are one indistinguishable answer.
 *
 * This module answers three questions with facts instead:
 *   1. Is a key present where the request actually runs, and what SHAPE is it?
 *      (Not the value. Length, prefix and last four — enough to tell a real
 *      key from a redaction placeholder, never enough to use.)
 *   2. Which Gemini models does that key actually see? Listing is free and
 *      needs no quota, so a failure here is credential or project, not billing.
 *   3. Does one real streaming generate call succeed — and with what
 *      finish_reason? That is the fact the platform never surfaced anywhere,
 *      and it is the difference between "the model cannot do this" and "we cut
 *      it off".
 *
 * Everything takes an injected `fetchFn` so the whole thing is testable with
 * no network and no credential.
 */

const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GENERATE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const LIST_TIMEOUT_MS = 8_000;
const GENERATE_TIMEOUT_MS = 25_000;

/*
 * Vercel replaces the value of a variable marked Sensitive with a placeholder
 * when it is pulled. Sending that placeholder to Google returns API_KEY_INVALID
 * — a real error about a fake key, which reads exactly like a broken real key.
 * That single confusion cost an evening, so the shape check names it directly.
 */
const REDACTION_PLACEHOLDER = /redacted|sensitive|^\[.*\]$|^\*+$|^x{6,}$/i;

export type GeminiKeyShape = {
  present: boolean;
  source: string | null;
  length: number;
  last4: string;
  matchesKnownKeyFormat: boolean;
  looksRedacted: boolean;
};

export type GeminiListResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  models: string[];
  totalListed: number;
  error: string | null;
  ms: number;
};

export type GeminiGenerateResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  model: string | null;
  chars: number;
  chunks: number;
  finishReason: string | null;
  blockReason: string | null;
  error: string | null;
  ms: number;
};

export type GeminiProbeReport = {
  key: GeminiKeyShape;
  list: GeminiListResult;
  generate: GeminiGenerateResult;
  verdict: string;
};

/**
 * Describe a key without disclosing it. Last four only — the same rule used
 * everywhere else in this codebase — plus the two facts that distinguish a
 * usable key from a placeholder.
 */
export function describeKeyShape(key: string | null | undefined, source: string | null): GeminiKeyShape {
  const value = typeof key === 'string' ? key.trim() : '';
  return {
    present: value.length > 0,
    source: value ? source : null,
    length: value.length,
    last4: value.length >= 4 ? value.slice(-4) : '',
    /*
     * A FORMAT HINT, never a verdict. Google issues keys in more than one
     * shape and adds new ones without announcement: a key that fails this test
     * listed 53 models and streamed a complete answer. Whether a key works is
     * decided by Google, and only ever by Google.
     */
    matchesKnownKeyFormat: /^AIza[\w-]{10,}$/.test(value),
    looksRedacted: value.length > 0 && REDACTION_PLACEHOLDER.test(value),
  };
}

/*
 * Never let a key reach a response body or a log, even inside an error string.
 * Google echoes the request URL in some failures, and the key travels in the
 * query string.
 */
function scrub(text: string, key: string): string {
  const out = key ? text.split(key).join('[key]') : text;
  return out.replace(/key=[\w-]+/gi, 'key=[key]').slice(0, 600);
}

async function readErrorDetail(response: any, key: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.error?.status;
    if (message) return scrub(String(message), key);
  } catch {
    // Not JSON. The raw body is still the most informative thing we have.
  }
  return scrub(raw, key);
}

/**
 * List the models this key can see. Listing costs nothing and consumes no
 * quota, so it separates "the credential is wrong" from "the credential is
 * fine and something else is failing" — which is the first fork in the tree
 * and the one we have never been able to take.
 */
export async function listGeminiModels(
  key: string,
  { fetchFn = fetch, timeoutMs = LIST_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<GeminiListResult> {
  const started = Date.now();
  const base: GeminiListResult = {
    attempted: true, ok: false, status: null, models: [], totalListed: 0, error: null, ms: 0,
  };
  const finish = (patch: Partial<GeminiListResult>): GeminiListResult => ({
    ...base, ...patch, ms: Date.now() - started,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(LIST_URL);
    url.searchParams.set('key', key);
    url.searchParams.set('pageSize', '200');
    const response = await fetchFn(url.toString(), { signal: controller.signal } as any);
    if (!response.ok) {
      return finish({ status: response.status, error: await readErrorDetail(response, key) });
    }
    const body: any = await response.json();
    const rows: any[] = Array.isArray(body?.models) ? body.models : [];
    const models = rows
      .map((model) => String(model?.name || '').replace(/^models\//, ''))
      .filter((id) => id.startsWith('gemini'))
      .filter((id, index, all) => all.indexOf(id) === index)
      .sort();
    return finish({ ok: true, status: response.status, models, totalListed: rows.length });
  } catch (error: any) {
    const aborted = controller.signal.aborted;
    return finish({ error: aborted ? `timed out after ${timeoutMs}ms` : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Choose what to generate with, from what the key actually sees rather than
 * from a constant. Three hardcoded Gemini ids elsewhere in this repo have all
 * outlived the models they name; a retired id 404s and the failure looks like
 * a broken key instead of a stale string.
 */
export function pickProbeModel(models: string[]): string | null {
  const usable = models.filter((id) => !/embedding|aqa|tts|image|audio|native|live|batch/i.test(id));
  if (!usable.length) return null;
  const version = (id: string) => {
    const match = id.match(/gemini-(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  };
  const rank = (id: string) => {
    // Flash first: it is what the platform routes to, so it is what we should
    // be proving. Plain ids beat -preview/-exp/-latest variants, which come
    // and go and are not what production would pick.
    let score = 0;
    if (/flash/.test(id)) score += 100;
    if (!/preview|exp|thinking|latest|\d{3,}/.test(id)) score += 50;
    return score + version(id) * 2;
  };
  return [...usable].sort((a, b) => rank(b) - rank(a) || b.localeCompare(a))[0];
}

/**
 * One real streaming generate call — the same transport the Coding Desk uses,
 * because a non-streaming success would prove nothing about the path that is
 * actually failing.
 *
 * `finishReason` and `blockReason` are read and returned. The platform reads
 * neither, anywhere, for either provider, which is why a truncated build and a
 * complete one have been indistinguishable to it — and why truncated builds
 * were recorded as successes in the ledger the router learns from.
 */
export async function generateGeminiOnce(
  key: string,
  model: string,
  {
    prompt = 'Reply with a single HTML document: a page with an <h1> that says Gemini is reachable. No prose, no fences.',
    maxOutputTokens = 800,
    fetchFn = fetch,
    timeoutMs = GENERATE_TIMEOUT_MS,
  }: { prompt?: string; maxOutputTokens?: number; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<GeminiGenerateResult> {
  const started = Date.now();
  const base: GeminiGenerateResult = {
    attempted: true, ok: false, status: null, model, chars: 0, chunks: 0,
    finishReason: null, blockReason: null, error: null, ms: 0,
  };
  const finish = (patch: Partial<GeminiGenerateResult>): GeminiGenerateResult => ({
    ...base, ...patch, ms: Date.now() - started,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`${GENERATE_BASE}/${encodeURIComponent(model)}:streamGenerateContent`);
    url.searchParams.set('alt', 'sse');
    url.searchParams.set('key', key);
    const response = await fetchFn(url.toString(), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature: 0.2 },
      }),
    } as any);

    if (!response.ok) {
      return finish({ status: response.status, error: await readErrorDetail(response, key) });
    }
    if (!response.body) {
      return finish({ status: response.status, error: 'the response carried no body to stream' });
    }

    let text = '';
    let chunks = 0;
    let finishReason: string | null = null;
    let blockReason: string | null = null;
    let streamError: string | null = null;

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let event: any;
        try { event = JSON.parse(payload); } catch { continue; }
        /*
         * A 200 does not mean success. Google can accept the request and then
         * fail INSIDE the stream — quota, safety, an upstream outage — by
         * emitting an `error` member instead of candidates. Reading only the
         * candidates makes that look like an empty answer from a working key,
         * which is the precise opposite of the truth.
         */
        if (event?.error) {
          streamError = scrub(String(event.error.message || JSON.stringify(event.error)), key);
          break;
        }
        if (event?.promptFeedback?.blockReason) blockReason = String(event.promptFeedback.blockReason);
        const candidate = event?.candidates?.[0];
        if (candidate?.finishReason) finishReason = String(candidate.finishReason);
        const parts: any[] = candidate?.content?.parts || [];
        for (const part of parts) {
          if (typeof part?.text === 'string' && part.text) {
            text += part.text;
            chunks += 1;
          }
        }
      }
      if (streamError) break;
    }

    if (streamError) {
      return finish({ status: response.status, chars: text.length, chunks, finishReason, blockReason, error: streamError });
    }
    /*
     * STOP is the only finish reason that means the model chose to end.
     *
     * MAX_TOKENS, SAFETY and RECITATION all produce output that looks
     * plausible and is cut off, and calling that a success is exactly how the
     * ledger got poisoned. A MISSING finish reason is the same failure wearing
     * a different hat: the HTTP stream closed - a proxy hung up, the upstream
     * connection ended - before any terminal candidate arrived. Treating that
     * absence as consent would let this file commit the defect it exists to
     * catch, on the one path where nothing is left to notice it.
     */
    const incomplete = !text.length
      ? 'the stream completed but carried no text'
      : finishReason === 'STOP'
        ? null
        : finishReason
          ? `the model stopped early: finish_reason ${finishReason}`
          : 'the stream ended with no terminal finish reason — the connection closed before the model finished';

    return finish({
      ok: incomplete === null,
      status: response.status,
      chars: text.length,
      chunks,
      finishReason,
      blockReason,
      error: incomplete,
    });
  } catch (error: any) {
    const aborted = controller.signal.aborted;
    return finish({ error: aborted ? `timed out after ${timeoutMs}ms` : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The verdict — one sentence naming what is wrong and what to do about it.
 *
 * This is the whole point of the file. A report of six fields is a puzzle; a
 * sentence is an answer, and it stops the next diagnosis from being a guess.
 */
export function verdictFor(key: GeminiKeyShape, list: GeminiListResult, generate: GeminiGenerateResult): string {
  if (!key.present) {
    return 'No Gemini key is present in this environment. The platform cannot be calling Gemini at all, which is why Google logs zero requests.';
  }
  if (key.looksRedacted) {
    return `The Gemini key here is a redaction placeholder, not a key (${key.length} chars ending ${key.last4}). Nothing was ever sent to Google.`;
  }
  /*
   * EVIDENCE OUTRANKS THE HEURISTIC, ALWAYS.
   *
   * The shape check used to sit HERE, above the results, and it returned "this
   * is not a Google API key" over a report showing 53 models listed and a
   * complete streamed answer beside it. The heuristic was stale — Google issues
   * key formats this pattern has never seen — and because it ran first, it
   * overrode two live proofs from Google itself.
   *
   * That is the same defect as reporting a truncated stream as a success, only
   * inverted: a rule about what an answer OUGHT to look like, placed above the
   * answer. The format may now only ever explain a failure, never declare one.
   */
  if (!list.ok) {
    const shapeHint = key.matchesKnownKeyFormat
      ? ''
      : ` The key also does not match any Google key format this probe knows (${key.length} chars ending ${key.last4}), so the wrong secret in the right variable is worth ruling out — though that pattern is a hint, not proof.`;
    /*
     * A spend cap is billing, whatever the status code says. On 2026-09-06 the
     * list call answered "HTTP 403: Spend cap breached for project: projects/…"
     * and the sentence below called it "not billing", sending the operator to
     * the key page while the balance sat at $0 against the cap. Google named
     * the project, so the key is recognised; the remedy is the billing page.
     */
    if (/\bspend cap (?:breached|exceeded|reached)\b/i.test(String(list.error || ''))) {
      return `Google refused this project's spend cap at the model list (HTTP ${list.status}: ${list.error}). The key is recognised — Google named the project — so this is the project's billing cap, not the credential and not the code. Raise the cap or add credit on the Gemini API billing page; the same key then works.`;
    }
    if (list.status === 400 || list.status === 403) {
      return `Google rejected the key when merely listing models (HTTP ${list.status}: ${list.error}). Listing consumes no quota, so this is the credential or the project — not billing and not the code.${shapeHint}`;
    }
    if (list.status === 429) {
      return 'Google is rate limiting this key at the listing call, before any generation. The project is over quota.';
    }
    return `Could not reach the Gemini model list: ${list.error || 'unknown failure'}. Nothing downstream can be trusted until this resolves.`;
  }
  if (!list.models.length) {
    return 'The key authenticates but this project exposes no Gemini models. The Generative Language API is almost certainly not enabled on the project the key belongs to.';
  }
  if (!generate.attempted) {
    return `The key works and sees ${list.models.length} Gemini models. No generation was requested, so nothing is proven about output yet.`;
  }
  if (!generate.ok) {
    if (generate.blockReason) {
      return `Generation was blocked by Google's safety filter (${generate.blockReason}) on ${generate.model}. The key and project are fine.`;
    }
    if (generate.finishReason === 'MAX_TOKENS') {
      return `${generate.model} generated ${generate.chars} chars and was cut off by the token limit, not by an error. The key and project are fine; the limit is ours to raise.`;
    }
    if (generate.chars > 0 && !generate.finishReason) {
      return `${generate.model} streamed ${generate.chars} chars and then the connection closed with no terminal finish reason. The answer is incomplete however complete it looks, and the break is in transport — a proxy or the upstream link — not in the model.`;
    }
    if (generate.status === 404) {
      return `The key works, but ${generate.model} returned 404 — that model id is not served to this project. The hardcoded ids in the codebase are the suspects.`;
    }
    return `The key lists ${list.models.length} models but generation failed on ${generate.model}: ${generate.error || `HTTP ${generate.status}`}.`;
  }
  return `Gemini works from here. ${generate.model} streamed ${generate.chars} chars in ${generate.chunks} chunks, finish_reason ${generate.finishReason}, in ${generate.ms}ms. If the Coding Desk still fails on Gemini, the fault is ours and not Google's.`;
}

const NOT_ATTEMPTED_LIST: GeminiListResult = {
  attempted: false, ok: false, status: null, models: [], totalListed: 0, error: null, ms: 0,
};
const NOT_ATTEMPTED_GENERATE: GeminiGenerateResult = {
  attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0,
  finishReason: null, blockReason: null, error: null, ms: 0,
};

/**
 * Run the whole ladder and report. `generate: false` keeps it to the free
 * calls — shape and listing — which is enough to answer the credential
 * question without spending a token.
 */
export async function probeGemini({
  key,
  source = 'env',
  model = null,
  generate = true,
  fetchFn = fetch,
}: {
  key: string | null | undefined;
  source?: string | null;
  model?: string | null;
  generate?: boolean;
  fetchFn?: typeof fetch;
}): Promise<GeminiProbeReport> {
  const shape = describeKeyShape(key, source);
  if (!shape.present || shape.looksRedacted) {
    return {
      key: shape,
      list: NOT_ATTEMPTED_LIST,
      generate: NOT_ATTEMPTED_GENERATE,
      verdict: verdictFor(shape, NOT_ATTEMPTED_LIST, NOT_ATTEMPTED_GENERATE),
    };
  }

  const trimmed = String(key).trim();
  const list = await listGeminiModels(trimmed, { fetchFn });
  if (!list.ok || !list.models.length || !generate) {
    return { key: shape, list, generate: NOT_ATTEMPTED_GENERATE, verdict: verdictFor(shape, list, NOT_ATTEMPTED_GENERATE) };
  }

  const chosen = model && list.models.includes(model) ? model : pickProbeModel(list.models);
  if (!chosen) {
    const missing = { ...NOT_ATTEMPTED_GENERATE, attempted: true, error: 'no listed model was usable for generation' };
    return { key: shape, list, generate: missing, verdict: verdictFor(shape, list, missing) };
  }

  const result = await generateGeminiOnce(trimmed, chosen, { fetchFn });
  return { key: shape, list, generate: result, verdict: verdictFor(shape, list, result) };
}
