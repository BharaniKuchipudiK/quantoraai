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
const MAX_MODEL_ATTEMPTS = 2;

const QUALIFIED_OPENROUTER_FALLBACKS: Record<string, string> = {
  // Free endpoints are useful as the first route, but OpenRouter's free tier is
  // account-rate-limited and individual endpoints can disappear. A failed free
  // build therefore gets one low-cost paid emergency attempt instead of another
  // free request that is subject to the same exhausted quota.
  [NEMOTRON_SUPER]: DEEPSEEK_CHAT,
  [LAGUNA_S]: DEEPSEEK_CHAT,
  [NEMOTRON_ULTRA]: DEEPSEEK_CHAT,
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
    ...(qualifiedFallback ? [qualifiedFallback] : []),
    ...(input.fallbackModelIds || []),
    ...(primary.startsWith('gemini') ? [GEMINI_STABLE_FALLBACK] : []),
  ]
    .map((candidate) => String(candidate || '').trim())
    .filter(Boolean);

  const candidates = [
    ...rawCandidates.filter((candidate) => providerOf(candidate) === primaryProvider),
    ...rawCandidates.filter((candidate) => providerOf(candidate) !== primaryProvider),
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

export function shouldFallbackBeforeStreaming(error: unknown) {
  const message = String((error as any)?.message || error || '');
  const status = Number((error as any)?.status || 0);
  if ([401, 403].includes(status)) return false;
  if ([404, 408, 410, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /not found|no endpoints?|timeout|temporar|quota|rate.?limit|high demand|unavailable|network|fetch failed/i.test(message);
}
