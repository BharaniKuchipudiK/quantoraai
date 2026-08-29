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

/**
 * 402 IS NOT A REJECTED KEY.
 *
 * isProviderCredentialRejection groups 401, 402 and 403, which is right for
 * routing — all three are fatal for this credential and no retry helps. It was
 * wrong for the sentence the user reads. A build ran on Gemini at 19:45 and the
 * next turn was told its API key "has never been accepted", while the Gemini
 * dashboard showed 100% success and zero errors. The key was fine. The wallet
 * behind a different provider was empty.
 *
 * A key that stops working mid-session is almost never a key that expired; it
 * is a balance that hit zero. Telling somebody to go re-issue a working key
 * sends them to the one place the problem is not.
 */
export function isOutOfCredit(error: unknown) {
  const status = Number((error as any)?.status || 0);
  if (status === 402) return true;
  const message = String((error as any)?.message || error || '');
  return /\b(payment required|insufficient (?:credits?|balance|funds)|out of credits?|quota exceeded for your plan)\b/i.test(message);
}

/**
 * Which provider actually refused, said plainly.
 *
 * The turn already computed this for the SSE payload and dropped it from the
 * text, so the user was left to guess between their providers — and guessed
 * wrong, because the one named nowhere is the one that failed.
 */
export function describeCredentialFailure(error: unknown, modelId?: string) {
  const provider = providerOf(String(modelId || ''));
  const name = provider === 'gemini' ? 'Google Gemini' : 'OpenRouter';
  const where = provider === 'gemini'
    ? 'GEMINI_API_KEY'
    : 'OPENROUTER_API_KEY';

  if (isOutOfCredit(error)) {
    return `${name} refused this turn for billing, not for a bad key (HTTP 402). `
      + `The credential is accepted; the balance behind it is not sufficient. `
      + `Top up the ${name} account — re-issuing the key will change nothing. `
      + `Other providers are unaffected.`;
  }

  return `${name} rejected the credential itself (HTTP 401/403), so no model on `
    + `that gateway could run. Retrying fails identically until the key changes. `
    + `Check ${where} in the server environment, or paste your own under `
    + `Privacy Vault → Session-only provider keys. A key showing "Last Used: Never" `
    + `on the ${name} dashboard has never been accepted. `
    + `Providers other than ${name} are unaffected.`;
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
