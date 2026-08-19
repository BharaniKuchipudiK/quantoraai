import type { TravelProviderName, TravelProviderResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;

type CircuitState = { failures: number; openUntil: number };
const circuits = new Map<string, CircuitState>();

function nowIso() {
  return new Date().toISOString();
}

export function unavailable<T>(
  provider: TravelProviderName | null,
  message: string,
  reason = 'PROVIDER_UNAVAILABLE',
): TravelProviderResult<T> {
  return {
    status: 'unavailable',
    executed: false,
    provider,
    fetchedAt: nowIso(),
    reason,
    message,
  };
}

export function providerError<T>(
  provider: TravelProviderName,
  message: string,
  reason = 'PROVIDER_ERROR',
): TravelProviderResult<T> {
  return {
    status: 'error',
    executed: false,
    provider,
    fetchedAt: nowIso(),
    reason,
    message,
  };
}

export function success<T>(
  provider: TravelProviderName,
  data: T,
  warnings: string[] = [],
): TravelProviderResult<T> {
  return {
    status: 'success',
    executed: true,
    provider,
    fetchedAt: nowIso(),
    data,
    ...(warnings.length ? { warnings } : {}),
  };
}

function circuitKey(provider: TravelProviderName, operation: string) {
  return `${provider}:${operation}`;
}

function isCircuitOpen(key: string) {
  const state = circuits.get(key);
  if (!state) return false;
  if (state.openUntil <= Date.now()) {
    circuits.delete(key);
    return false;
  }
  return true;
}

function recordSuccess(key: string) {
  circuits.delete(key);
}

function recordFailure(key: string) {
  const prior = circuits.get(key) || { failures: 0, openUntil: 0 };
  const failures = prior.failures + 1;
  circuits.set(key, {
    failures,
    openUntil: failures >= FAILURE_THRESHOLD ? Date.now() + CIRCUIT_OPEN_MS : 0,
  });
}

export async function runProviderCall<T>({
  provider,
  operation,
  fn,
  timeoutMs = Number(process.env.TRAVEL_PROVIDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
}: {
  provider: TravelProviderName;
  operation: string;
  fn: () => Promise<TravelProviderResult<T>>;
  timeoutMs?: number;
}): Promise<TravelProviderResult<T>> {
  const key = circuitKey(provider, operation);
  if (isCircuitOpen(key)) {
    return unavailable(provider, `${provider} is temporarily paused after repeated failures.`, 'CIRCUIT_OPEN');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<TravelProviderResult<T>>((resolve) => {
      timer = setTimeout(() => {
        resolve(providerError(provider, `${provider} timed out while running ${operation}.`, 'PROVIDER_TIMEOUT'));
      }, Math.max(1_000, Math.min(25_000, timeoutMs)));
    });

    const result = await Promise.race([fn(), timeout]);
    if (result.status === 'success') recordSuccess(key);
    else recordFailure(key);
    return result;
  } catch (error: any) {
    recordFailure(key);
    console.error(`[Travel Provider] ${provider}/${operation} failed:`, error?.message || error);
    return providerError(provider, `${provider} failed while running ${operation}.`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
