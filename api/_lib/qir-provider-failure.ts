export type QirProviderFailure = {
  provider: string;
  modelId: string;
  httpStatus: number | null;
  providerCode: string;
  providerMessage: string;
  retryable: boolean;
  route: string;
  fallbackAttempted: boolean;
};

function bounded(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * Provider errors are evidence, not diagnoses.
 *
 * In particular, HTTP 402 alone is not enough to claim that an OpenRouter
 * account balance is empty: key budgets, workspace/member budgets and other
 * provider policy can use the same status. This normalizer preserves the facts
 * the provider actually returned so QIR can make a recovery decision without
 * inventing a user-facing cause.
 */
export function qirProviderFailure(input: {
  provider?: unknown;
  modelId?: unknown;
  httpStatus?: unknown;
  providerCode?: unknown;
  providerMessage?: unknown;
  retryable?: unknown;
  route?: unknown;
  fallbackAttempted?: unknown;
}): QirProviderFailure {
  const numericStatus = Number(input.httpStatus);
  return {
    provider: bounded(input.provider, 80) || 'unknown',
    modelId: bounded(input.modelId, 200),
    httpStatus: Number.isInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599
      ? numericStatus
      : null,
    providerCode: bounded(input.providerCode, 120),
    providerMessage: bounded(input.providerMessage, 500),
    retryable: input.retryable === true,
    route: bounded(input.route, 200),
    fallbackAttempted: input.fallbackAttempted === true,
  };
}

export function describeQirProviderFailure(failure: QirProviderFailure): string {
  const provider = failure.provider || 'provider';
  const model = failure.modelId ? ` (${failure.modelId})` : '';
  const status = failure.httpStatus ? ` HTTP ${failure.httpStatus}` : '';
  const code = failure.providerCode ? ` ${failure.providerCode}` : '';
  const detail = failure.providerMessage || 'The provider refused or failed this attempt without a usable message.';
  return `${provider}${model}${status}${code}: ${detail}`.slice(0, 900);
}
