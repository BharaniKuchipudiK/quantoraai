export type ModelAttempt = {
  id: string;
  provider: 'gemini' | 'openrouter';
  reason: 'primary' | 'fallback';
};

const GEMINI_STABLE_FALLBACK = 'gemini-flash-latest';
const MAX_MODEL_ATTEMPTS = 2;

function providerOf(modelId: string): 'gemini' | 'openrouter' {
  return modelId.startsWith('gemini') ? 'gemini' : 'openrouter';
}

/**
 * One turn gets at most two model attempts. Never enumerate every model a key
 * can see: quota exhaustion on one request must not become a provider-wide
 * retry storm.
 *
 * Keep the first retry on the same execution provider because /api/chat can
 * safely swap OpenRouter models before streaming. This is especially important
 * for the default openrouter/free route: if it is temporarily unhealthy, use a
 * second approved free OpenRouter model instead of falling back to Gemini.
 *
 * Travel tool turns stay on Gemini because the current tool schema is attached
 * to Gemini. Cross-provider fallback there would silently remove tool
 * capability, which is worse than a fast explicit failure.
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

  const rawCandidates = [
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
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /timeout|temporar|quota|rate.?limit|high demand|unavailable|network|fetch failed/i.test(message);
}
