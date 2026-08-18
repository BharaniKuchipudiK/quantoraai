function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function exactTotal(parts, explicitTotal) {
  const explicit = nonNegativeInt(explicitTotal);
  if (explicit != null) return explicit;
  const input = nonNegativeInt(parts.inputTokens) || 0;
  const output = nonNegativeInt(parts.outputTokens) || 0;
  const reasoning = nonNegativeInt(parts.reasoningTokens) || 0;
  return input + output + reasoning;
}

export function normalizeOpenRouterUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const inputTokens = nonNegativeInt(raw.prompt_tokens);
  const outputTokens = nonNegativeInt(raw.completion_tokens);
  const reasoningTokens = nonNegativeInt(raw.completion_tokens_details?.reasoning_tokens);
  const cachedTokens = nonNegativeInt(raw.prompt_tokens_details?.cached_tokens);
  const costUsd = nonNegativeNumber(raw.cost);
  const hasProviderUsage = [inputTokens, outputTokens, reasoningTokens, cachedTokens, nonNegativeInt(raw.total_tokens), costUsd]
    .some((value) => value != null);
  if (!hasProviderUsage) return null;

  return {
    tokenSource: 'provider',
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    totalTokens: exactTotal({ inputTokens, outputTokens, reasoningTokens }, raw.total_tokens),
    costUsd,
  };
}

export function normalizeGeminiUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const inputTokens = nonNegativeInt(raw.promptTokenCount);
  const outputTokens = nonNegativeInt(raw.candidatesTokenCount);
  const reasoningTokens = nonNegativeInt(raw.thoughtsTokenCount);
  const cachedTokens = nonNegativeInt(raw.cachedContentTokenCount);
  const explicitTotal = nonNegativeInt(raw.totalTokenCount);
  const hasProviderUsage = [inputTokens, outputTokens, reasoningTokens, cachedTokens, explicitTotal]
    .some((value) => value != null);
  if (!hasProviderUsage) return null;

  return {
    tokenSource: 'provider',
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    totalTokens: exactTotal({ inputTokens, outputTokens, reasoningTokens }, explicitTotal),
    costUsd: null,
  };
}

export function estimatedUsageFromText(text = '') {
  const length = typeof text === 'string' ? text.length : 0;
  const totalTokens = Math.max(0, Math.ceil(length / 4));
  return {
    tokenSource: 'estimated',
    inputTokens: null,
    outputTokens: totalTokens,
    reasoningTokens: null,
    cachedTokens: null,
    totalTokens,
    costUsd: null,
  };
}

export function usageOrEstimate(providerUsage, text = '') {
  return providerUsage || estimatedUsageFromText(text);
}
