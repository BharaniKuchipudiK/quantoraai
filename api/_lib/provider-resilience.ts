export type ProviderResiliencePolicy = {
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  retryableStatuses: readonly number[];
};

export type ProviderCircuitState = {
  failures: number;
  openedUntil: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
};

export interface ProviderCircuitStore {
  get(key: string): Promise<ProviderCircuitState | null>;
  set(key: string, state: ProviderCircuitState): Promise<void>;
  delete(key: string): Promise<void>;
}

export type ProviderOperationContext = {
  attempt: number;
  signal: AbortSignal;
};

export type ProviderOperationInput<T> = {
  provider: string;
  operation: string;
  execute: (context: ProviderOperationContext) => Promise<T>;
  policy?: Partial<ProviderResiliencePolicy>;
  circuitStore?: ProviderCircuitStore;
  shouldRetryResult?: (result: T) => boolean | Promise<boolean>;
  shouldRetryError?: (error: unknown) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type ProviderFetchInput = {
  provider: string;
  operation: string;
  input: string | URL | Request;
  init?: RequestInit;
  fetchFn?: typeof fetch;
  policy?: Partial<ProviderResiliencePolicy>;
  circuitStore?: ProviderCircuitStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_POLICY: ProviderResiliencePolicy = {
  timeoutMs: 8_000,
  maxAttempts: 2,
  baseDelayMs: 150,
  circuitFailureThreshold: 4,
  circuitResetMs: 30_000,
  retryableStatuses: [408, 425, 429, 500, 502, 503, 504],
};

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function providerResiliencePolicy(
  overrides: Partial<ProviderResiliencePolicy> = {},
): ProviderResiliencePolicy {
  return {
    timeoutMs: overrides.timeoutMs ?? boundedEnvInt('PROVIDER_TIMEOUT_MS', DEFAULT_POLICY.timeoutMs, 100, 120_000),
    maxAttempts: overrides.maxAttempts ?? boundedEnvInt('PROVIDER_MAX_ATTEMPTS', DEFAULT_POLICY.maxAttempts, 1, 5),
    baseDelayMs: overrides.baseDelayMs ?? boundedEnvInt('PROVIDER_RETRY_BASE_DELAY_MS', DEFAULT_POLICY.baseDelayMs, 0, 5_000),
    circuitFailureThreshold: overrides.circuitFailureThreshold
      ?? boundedEnvInt('PROVIDER_CIRCUIT_FAILURE_THRESHOLD', DEFAULT_POLICY.circuitFailureThreshold, 1, 20),
    circuitResetMs: overrides.circuitResetMs
      ?? boundedEnvInt('PROVIDER_CIRCUIT_RESET_MS', DEFAULT_POLICY.circuitResetMs, 1_000, 300_000),
    retryableStatuses: overrides.retryableStatuses ?? DEFAULT_POLICY.retryableStatuses,
  };
}

class InMemoryProviderCircuitStore implements ProviderCircuitStore {
  private readonly states = new Map<string, ProviderCircuitState>();

  async get(key: string): Promise<ProviderCircuitState | null> {
    return this.states.get(key) ?? null;
  }

  async set(key: string, state: ProviderCircuitState): Promise<void> {
    this.states.set(key, state);
  }

  async delete(key: string): Promise<void> {
    this.states.delete(key);
  }

  clear(): void {
    this.states.clear();
  }
}

const defaultCircuitStore = new InMemoryProviderCircuitStore();

export class ProviderTimeoutError extends Error {
  readonly code = 'PROVIDER_TIMEOUT';

  constructor(provider: string, operation: string, timeoutMs: number) {
    super(`${provider} ${operation} exceeded its ${timeoutMs}ms execution deadline.`);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderCircuitOpenError extends Error {
  readonly code = 'PROVIDER_CIRCUIT_OPEN';

  constructor(provider: string, operation: string) {
    super(`${provider} ${operation} is temporarily paused after repeated provider failures.`);
    this.name = 'ProviderCircuitOpenError';
  }
}

function safeLabel(value: string, fallback: string): string {
  const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120);
  return cleaned || fallback;
}

function circuitKey(provider: string, operation: string): string {
  return `${safeLabel(provider, 'provider')}:${safeLabel(operation, 'operation')}`;
}

async function updateFailure(
  store: ProviderCircuitStore,
  key: string,
  policy: ProviderResiliencePolicy,
  now: number,
): Promise<void> {
  const previous = await store.get(key);
  const failures = (previous?.failures ?? 0) + 1;
  await store.set(key, {
    failures,
    openedUntil: failures >= policy.circuitFailureThreshold ? now + policy.circuitResetMs : null,
    lastFailureAt: now,
    lastSuccessAt: previous?.lastSuccessAt ?? null,
  });
}

async function updateSuccess(store: ProviderCircuitStore, key: string, now: number): Promise<void> {
  await store.set(key, {
    failures: 0,
    openedUntil: null,
    lastFailureAt: null,
    lastSuccessAt: now,
  });
}

function defaultShouldRetryError(error: unknown): boolean {
  if (error instanceof ProviderCircuitOpenError) return false;
  return true;
}

function delayForAttempt(policy: ProviderResiliencePolicy, attempt: number): number {
  return Math.min(policy.baseDelayMs * (2 ** Math.max(0, attempt - 1)), 10_000);
}

async function withDeadline<T>(
  provider: string,
  operation: string,
  timeoutMs: number,
  execute: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError(provider, operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([execute(controller.signal), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runProviderOperation<T>(input: ProviderOperationInput<T>): Promise<T> {
  const provider = safeLabel(input.provider, 'provider');
  const operation = safeLabel(input.operation, 'operation');
  const policy = providerResiliencePolicy(input.policy);
  const store = input.circuitStore ?? defaultCircuitStore;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const key = circuitKey(provider, operation);

  const existing = await store.get(key);
  if (existing?.openedUntil && existing.openedUntil > now()) {
    throw new ProviderCircuitOpenError(provider, operation);
  }
  if (existing?.openedUntil && existing.openedUntil <= now()) {
    await store.delete(key);
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const result = await withDeadline(provider, operation, policy.timeoutMs, (signal) => (
        input.execute({ attempt, signal })
      ));
      const retryResult = input.shouldRetryResult ? await input.shouldRetryResult(result) : false;
      if (!retryResult) {
        await updateSuccess(store, key, now());
        return result;
      }

      await updateFailure(store, key, policy, now());
      if (attempt >= policy.maxAttempts) return result;
    } catch (error) {
      lastError = error;
      await updateFailure(store, key, policy, now());
      const retryError = input.shouldRetryError
        ? input.shouldRetryError(error)
        : defaultShouldRetryError(error);
      if (!retryError || attempt >= policy.maxAttempts) throw error;
    }

    const delayMs = delayForAttempt(policy, attempt);
    if (delayMs > 0) await sleep(delayMs);
  }

  throw lastError instanceof Error ? lastError : new Error(`${provider} ${operation} failed.`);
}

export async function providerFetch(input: ProviderFetchInput): Promise<Response> {
  const fetchFn = input.fetchFn ?? fetch;
  const policy = providerResiliencePolicy(input.policy);

  return runProviderOperation<Response>({
    provider: input.provider,
    operation: input.operation,
    policy,
    circuitStore: input.circuitStore,
    now: input.now,
    sleep: input.sleep,
    execute: async ({ attempt, signal }) => {
      const combinedSignal = input.init?.signal
        ? AbortSignal.any([input.init.signal, signal])
        : signal;
      const response = await fetchFn(input.input, {
        ...(input.init || {}),
        signal: combinedSignal,
      });

      if (attempt < policy.maxAttempts && policy.retryableStatuses.includes(response.status)) {
        try {
          await response.body?.cancel();
        } catch {
          // Best effort: the retry deadline still bounds how long Quantora waits.
        }
      }
      return response;
    },
    shouldRetryResult: (response) => policy.retryableStatuses.includes(response.status),
  });
}

/** Test/operations hook for the default warm-instance circuit state. */
export function resetProviderResilienceState(): void {
  defaultCircuitStore.clear();
}
