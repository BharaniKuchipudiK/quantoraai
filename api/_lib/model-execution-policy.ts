export type ModelAttempt = {
  id: string;
  provider: 'gemini' | 'openrouter';
  reason: 'primary' | 'fallback';
};

const GEMINI_STABLE_FALLBACK = 'gemini-flash-latest';
const NEMOTRON_SUPER = 'nvidia/nemotron-3-super-120b-a12b:free';
const NEMOTRON_ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const LAGUNA_S = 'poolside/laguna-s-2.1:free';
const DEEPSEEK_CHAT = 'deepseek/deepseek-chat';
/* Kept in step with MAX_INFERENCE_ATTEMPTS in inference-control-plane.ts. */
const MAX_MODEL_ATTEMPTS = 4;

const QUALIFIED_OPENROUTER_FALLBACKS: Record<string, string> = {
  // Free OpenRouter endpoints share one account quota. The independent Gemini
  // gateway is ranked first; DeepSeek stays as same-account backup only when
  // Gemini is not configured.
  [NEMOTRON_SUPER]: DEEPSEEK_CHAT,
  [LAGUNA_S]: DEEPSEEK_CHAT,
  [NEMOTRON_ULTRA]: DEEPSEEK_CHAT,
  'qwen/qwen-2.5-coder-32b-instruct': DEEPSEEK_CHAT,
};

export type FallbackContext = {
  currentGateway?: 'gemini' | 'openrouter';
  nextGateway?: 'gemini' | 'openrouter';
};

function providerOf(modelId: string): 'gemini' | 'openrouter' {
  return modelId.startsWith('gemini') ? 'gemini' : 'openrouter';
}

/**
 * One turn gets at most two model attempts. Never enumerate every model a key
 * can see: quota exhaustion on one request must not become a provider-wide
 * retry storm. Normal Studio turns may use a low-cost emergency OpenRouter
 * fallback; Travel tool turns stay on Gemini because the current tool schema is
 * attached to Gemini and cross-provider fallback would silently remove tools.
 */
export function modelAttemptsForTurn(input: {
  primaryModelId: string;
  fallbackModelIds?: string[];
  travelToolsEnabled?: boolean;
}): ModelAttempt[] {
  const primary = String(input.primaryModelId || '').trim();
  if (!primary) return [];
  const primaryProvider = providerOf(primary);
  const attempts: ModelAttempt[] = [{ id: primary, provider: primaryProvider, reason: 'primary' }];

  const qualifiedFallback = QUALIFIED_OPENROUTER_FALLBACKS[primary];
  const rawCandidates = [
    GEMINI_STABLE_FALLBACK,
    ...(qualifiedFallback ? [qualifiedFallback] : []),
    ...(input.fallbackModelIds || []),
  ]
    .map((candidate) => String(candidate || '').trim())
    .filter(Boolean);

  const candidates = [
    ...rawCandidates.filter((candidate) => providerOf(candidate) !== primaryProvider),
    ...rawCandidates.filter((candidate) => providerOf(candidate) === primaryProvider),
  ];

  for (const candidate of candidates) {
    if (attempts.some((attempt) => attempt.id === candidate)) continue;
    const provider = providerOf(candidate);
    if (input.travelToolsEnabled && provider !== 'gemini') continue;
    attempts.push({ id: candidate, provider, reason: 'fallback' });
    if (attempts.length >= MAX_MODEL_ATTEMPTS) break;
  }

  return attempts;
}

/**
 * The provider REJECTED the credential (401/403) or refused it for billing (402).
 * This is not a transient condition: every retry fails identically until a human
 * changes the key. Telling the user to "retry in a moment" turned a one-line
 * configuration fault into days of diagnosis, so it is classified separately and
 * said out loud.
 */
export function isProviderCredentialRejection(error: unknown) {
  const status = Number((error as any)?.status || 0);
  if ([401, 402, 403].includes(status)) return true;
  const message = String((error as any)?.message || error || '');
  return /\b(invalid api key|no auth credentials|unauthorized|authentication fail|invalid_api_key|user not found)\b/i.test(message);
}

export function shouldFallbackBeforeStreaming(error: unknown, context?: FallbackContext) {
  const message = String((error as any)?.message || error || '');
  const status = Number((error as any)?.status || 0);
  const crossGateway = Boolean(context?.nextGateway && context.nextGateway !== context.currentGateway);
  // Auth and billing failures are fatal for this credential/quota domain, but
  // they must not strand the turn when a different gateway is still planned.
  if ([401, 402, 403].includes(status)) return crossGateway;
  if ([404, 408, 410, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /not found|no endpoints?|timeout|temporar|quota|rate.?limit|high demand|unavailable|network|fetch failed|payment required|credits?/i.test(message);
}

/*
 * A provider can accept the request with HTTP 200 and then fail INSIDE the
 * stream, emitting an event that carries `error` instead of `choices`.
 *
 * Both stream parsers read only `choices[0].delta.content`, so such an event
 * produced no token and was dropped, with two consequences:
 *
 *   - no tokens yet: the turn threw "returned an empty response", naming the
 *     gateway instead of the real cause (credits, quota, an upstream outage)
 *     that was sitting in the stream;
 *   - some tokens already: nothing threw at all. The turn finished as a
 *     success with a silently truncated build, and recordModelQualityEvent
 *     wrote outcome:"success" - teaching the outcome router that a model which
 *     had just failed is reliable.
 *
 * Returns an Error rather than throwing, because the callers parse inside a
 * try/catch that deliberately swallows malformed events; the caller throws it
 * once the try has been left.
 */
export function streamErrorFrom(parsed: any, gateway: string): Error | null {
  const raw = parsed?.error;
  if (!raw) return null;
  const message = typeof raw === 'string' ? raw : (raw.message || 'provider failed mid-stream');
  const status = Number(raw?.code) || Number(raw?.status) || 502;
  // Carrying the upstream status lets the existing classifiers do their job:
  // 401/402/403 is a credential rejection worth saying plainly, 429/5xx is
  // retryable on another rung.
  return Object.assign(new Error(`${gateway} failed mid-stream: ${message}`), { status });
}
