/*
 * openrouter-probe — ask OpenRouter whether the key works, instead of assuming.
 *
 * WHY THIS EXISTS
 *
 * /api/inference-health reports `openRouterConfigured: true`, and that has
 * never meant what anybody reading it thinks. It is produced by
 * resolveOpenRouterEnvKey, which returns the key when `isOpenRouterApiKey(raw)`
 * passes — a check on the SHAPE OF A STRING. A revoked key, a key with no
 * credit, a key from a deleted account and a key that works all report
 * `configured: true` identically.
 *
 * The same defect was found and fixed for Gemini earlier the same day, where a
 * shape assumption overruled two live proofs from Google. Fixing it for one
 * provider and leaving the other is how a lesson stays local, so this is the
 * other half.
 *
 * `/auth/key` is the right question to ask: it authenticates, costs nothing,
 * consumes no tokens, and returns the account's usage and limit — which makes
 * an exhausted balance visible as a fact rather than inferred from a wall of
 * failed turns. A generation probe is separate and opt-in, because that one
 * does spend money.
 */

const AUTH_URL = 'https://openrouter.ai/api/v1/auth/key';
const COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const AUTH_TIMEOUT_MS = 8_000;
const GENERATE_TIMEOUT_MS = 25_000;

const REDACTION_PLACEHOLDER = /redacted|sensitive|^\[.*\]$|^\*+$|^x{6,}$/i;

export type OpenRouterKeyShape = {
  present: boolean;
  source: string | null;
  length: number;
  last4: string;
  matchesKnownKeyFormat: boolean;
  looksRedacted: boolean;
};

export type OpenRouterAuthResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  label: string | null;
  usage: number | null;
  limit: number | null;
  remaining: number | null;
  isFreeTier: boolean | null;
  error: string | null;
  ms: number;
};

export type OpenRouterGenerateResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  model: string | null;
  chars: number;
  chunks: number;
  finishReason: string | null;
  error: string | null;
  ms: number;
};

export type OpenRouterProbeReport = {
  key: OpenRouterKeyShape;
  auth: OpenRouterAuthResult;
  generate: OpenRouterGenerateResult;
  verdict: string;
};

/** Describe a key without disclosing it. Last four only, as everywhere else. */
export function describeKeyShape(key: string | null | undefined, source: string | null): OpenRouterKeyShape {
  const value = typeof key === 'string' ? key.trim() : '';
  return {
    present: value.length > 0,
    source: value ? source : null,
    length: value.length,
    last4: value.length >= 4 ? value.slice(-4) : '',
    /*
     * A FORMAT HINT, never a verdict — the lesson the Gemini probe learned the
     * expensive way. OpenRouter decides whether this key is valid, and a
     * pattern written from an assumption may not overrule it.
     */
    matchesKnownKeyFormat: /^sk-or-v1-[\w-]{16,}$/.test(value),
    looksRedacted: value.length > 0 && REDACTION_PLACEHOLDER.test(value),
  };
}

function scrub(text: string, key: string): string {
  const out = key ? text.split(key).join('[key]') : text;
  return out.replace(/sk-or-v1-[\w-]+/gi, 'sk-or-v1-[key]').slice(0, 600);
}

async function readErrorDetail(response: any, key: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message;
    if (message) return scrub(String(message), key);
  } catch { /* not JSON; the raw body is still the best we have */ }
  return scrub(raw, key);
}

const toNumber = (value: unknown): number | null =>
  (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Authenticate the key and read the account's standing.
 *
 * Free, and the only call here that proves the credential. The catalogue at
 * /models is PUBLIC — reading it successfully says nothing at all about a key,
 * which is why an audit that used it as a credential check reported healthy
 * while every turn failed.
 */
export async function checkOpenRouterKey(
  key: string,
  { fetchFn = fetch, timeoutMs = AUTH_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<OpenRouterAuthResult> {
  const started = Date.now();
  const base: OpenRouterAuthResult = {
    attempted: true, ok: false, status: null, label: null, usage: null,
    limit: null, remaining: null, isFreeTier: null, error: null, ms: 0,
  };
  const finish = (patch: Partial<OpenRouterAuthResult>): OpenRouterAuthResult => ({
    ...base, ...patch, ms: Date.now() - started,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(AUTH_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    } as any);
    if (!response.ok) {
      return finish({ status: response.status, error: await readErrorDetail(response, key) });
    }
    const body: any = await response.json();
    const data = body?.data || {};
    const usage = toNumber(data.usage);
    const limit = toNumber(data.limit);
    return finish({
      ok: true,
      status: response.status,
      label: typeof data.label === 'string' ? data.label : null,
      usage,
      limit,
      // A null limit means unlimited on this account, not zero remaining.
      remaining: limit === null || usage === null ? null : Number((limit - usage).toFixed(4)),
      isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
    });
  } catch (error: any) {
    const aborted = controller.signal.aborted;
    return finish({ error: aborted ? `timed out after ${timeoutMs}ms` : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One real streaming completion — the transport the Coding Desk uses.
 *
 * Reads `finish_reason` and mid-stream `error` events for the same reasons the
 * Gemini probe does: a truncated answer is not a success, and a provider can
 * accept with HTTP 200 and then fail upstream.
 */
export async function generateOpenRouterOnce(
  key: string,
  model: string,
  {
    prompt = 'Reply with exactly: OpenRouter is reachable.',
    maxTokens = 64,
    fetchFn = fetch,
    timeoutMs = GENERATE_TIMEOUT_MS,
  }: { prompt?: string; maxTokens?: number; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<OpenRouterGenerateResult> {
  const started = Date.now();
  const base: OpenRouterGenerateResult = {
    attempted: true, ok: false, status: null, model, chars: 0, chunks: 0,
    finishReason: null, error: null, ms: 0,
  };
  const finish = (patch: Partial<OpenRouterGenerateResult>): OpenRouterGenerateResult => ({
    ...base, ...patch, ms: Date.now() - started,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(COMPLETIONS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    } as any);

    if (!response.ok) {
      return finish({ status: response.status, error: await readErrorDetail(response, key) });
    }
    if (!response.body) return finish({ status: response.status, error: 'the response carried no body to stream' });

    let text = '';
    let chunks = 0;
    let finishReason: string | null = null;
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
        if (event?.error) {
          streamError = scrub(String(event.error.message || JSON.stringify(event.error)), key);
          break;
        }
        const choice = event?.choices?.[0];
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const piece = choice?.delta?.content;
        if (piece) { text += piece; chunks += 1; }
      }
      if (streamError) break;
    }

    if (streamError) {
      return finish({ status: response.status, chars: text.length, chunks, finishReason, error: streamError });
    }
    /*
     * `stop` is the only finish reason that means the model chose to end, and a
     * MISSING one means the connection closed early. Both are the same lesson
     * the Gemini probe had to be corrected on: an answer that merely stopped
     * arriving is not an answer that finished. `length` is expected here, since
     * this asks for a one-line reply under a small cap.
     */
    const complete = finishReason === 'stop' || finishReason === 'length';
    return finish({
      ok: text.length > 0 && complete,
      status: response.status,
      chars: text.length,
      chunks,
      finishReason,
      error: text.length
        ? (complete ? null : 'the stream ended with no terminal finish reason — the connection closed early')
        : 'the stream completed but carried no text',
    });
  } catch (error: any) {
    const aborted = controller.signal.aborted;
    return finish({ error: aborted ? `timed out after ${timeoutMs}ms` : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

/** The verdict — one sentence naming what is wrong and what to do about it. */
export function verdictFor(
  key: OpenRouterKeyShape,
  auth: OpenRouterAuthResult,
  generate: OpenRouterGenerateResult,
): string {
  if (!key.present) {
    return 'No OpenRouter key is present in this environment, so every model served through OpenRouter is unreachable.';
  }
  if (key.looksRedacted) {
    return `The OpenRouter key here is a redaction placeholder, not a key (${key.length} chars ending ${key.last4}). Nothing was ever sent.`;
  }
  if (!auth.ok) {
    const shapeHint = key.matchesKnownKeyFormat
      ? ''
      : ` The key also does not match the sk-or-v1-… format (${key.length} chars ending ${key.last4}), so the wrong secret in the right variable is worth ruling out — a hint, not proof.`;
    if (auth.status === 401 || auth.status === 403) {
      return `OpenRouter rejected the key outright (HTTP ${auth.status}: ${auth.error}). Authenticating costs nothing, so this is the credential — not billing and not the code.${shapeHint}`;
    }
    if (auth.status === 402) {
      return 'OpenRouter says this account has no credit left (HTTP 402). Every paid model will fail until it is topped up; free models may still answer.';
    }
    if (auth.status === 429) {
      return 'OpenRouter is rate limiting this key at the auth call, before any generation. The account is over its request quota.';
    }
    return `Could not reach OpenRouter to check the key: ${auth.error || 'unknown failure'}. Nothing downstream can be trusted until this resolves.`;
  }
  if (auth.remaining !== null && auth.remaining <= 0) {
    return `The key authenticates, but this account has spent its whole limit ($${auth.usage} of $${auth.limit}). Paid models will fail with 402 until it is topped up — and a health check that only looks at the key's shape will keep reporting everything as configured.`;
  }
  if (!generate.attempted) {
    const balance = auth.limit === null
      ? `usage $${auth.usage ?? 0}, no limit set`
      : `$${auth.remaining} of $${auth.limit} left`;
    return `The OpenRouter key works (${balance}${auth.isFreeTier ? ', free tier' : ''}). No generation was requested, so nothing is proven about output yet.`;
  }
  if (!generate.ok) {
    if (generate.status === 402) {
      return `The key authenticates but ${generate.model} returned 402 — that model is paid and this account is out of credit.`;
    }
    if (generate.status === 404) {
      return `The key works, but ${generate.model} returned 404 — that model id is not served. The hardcoded ids in the model menu are the suspects.`;
    }
    if (generate.status === 429) {
      return `The key works, but ${generate.model} is rate limited (HTTP 429). Free-tier models hit this first and hardest.`;
    }
    return `The key authenticates but generation failed on ${generate.model}: ${generate.error || `HTTP ${generate.status}`}.`;
  }
  return `OpenRouter works from here. ${generate.model} streamed ${generate.chars} chars in ${generate.chunks} chunks, finish_reason ${generate.finishReason}, in ${generate.ms}ms. If the Coding Desk still fails on OpenRouter, the fault is ours.`;
}

const NOT_ATTEMPTED_AUTH: OpenRouterAuthResult = {
  attempted: false, ok: false, status: null, label: null, usage: null,
  limit: null, remaining: null, isFreeTier: null, error: null, ms: 0,
};
const NOT_ATTEMPTED_GENERATE: OpenRouterGenerateResult = {
  attempted: false, ok: false, status: null, model: null, chars: 0, chunks: 0,
  finishReason: null, error: null, ms: 0,
};

/**
 * Run the ladder and report. `generate: false` keeps it to the free call, which
 * is enough to answer the credential and credit questions without spending a
 * token — and those are the two that explain most failures.
 */
export async function probeOpenRouter({
  key,
  source = 'env',
  model = null,
  generate = false,
  fetchFn = fetch,
}: {
  key: string | null | undefined;
  source?: string | null;
  model?: string | null;
  generate?: boolean;
  fetchFn?: typeof fetch;
}): Promise<OpenRouterProbeReport> {
  const shape = describeKeyShape(key, source);
  if (!shape.present || shape.looksRedacted) {
    return {
      key: shape,
      auth: NOT_ATTEMPTED_AUTH,
      generate: NOT_ATTEMPTED_GENERATE,
      verdict: verdictFor(shape, NOT_ATTEMPTED_AUTH, NOT_ATTEMPTED_GENERATE),
    };
  }

  const trimmed = String(key).trim();
  const auth = await checkOpenRouterKey(trimmed, { fetchFn });
  if (!auth.ok || !generate || !model) {
    return { key: shape, auth, generate: NOT_ATTEMPTED_GENERATE, verdict: verdictFor(shape, auth, NOT_ATTEMPTED_GENERATE) };
  }

  const result = await generateOpenRouterOnce(trimmed, model, { fetchFn });
  return { key: shape, auth, generate: result, verdict: verdictFor(shape, auth, result) };
}
