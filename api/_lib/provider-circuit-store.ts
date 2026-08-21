import type {
  AtomicProviderCircuitStore,
  ProviderCircuitState,
} from './provider-resilience.js';

const STORE_TIMEOUT_MS = 1_500;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function toState(row: any): ProviderCircuitState | null {
  if (!row || typeof row !== 'object') return null;
  const time = (value: any) => {
    if (!value) return null;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    failures: Math.max(0, Number(row.failures) || 0),
    openedUntil: time(row.opened_until),
    lastFailureAt: time(row.last_failure_at),
    lastSuccessAt: time(row.last_success_at),
  };
}

async function request(path: string, init: RequestInit) {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Provider circuit store ${init.method || 'GET'} ${path} -> ${response.status}`);
      return null;
    }
    return response;
  } catch (error: any) {
    console.warn('Provider circuit store unavailable:', error?.message || error);
    return null;
  }
}

class LocalAtomicCircuitStore implements AtomicProviderCircuitStore {
  private readonly states = new Map<string, ProviderCircuitState>();

  async get(key: string) { return this.states.get(key) || null; }
  async set(key: string, state: ProviderCircuitState) { this.states.set(key, state); }
  async delete(key: string) { this.states.delete(key); }

  async recordFailure(key: string, input: { now: number; failureThreshold: number; resetMs: number }) {
    const previous = this.states.get(key);
    const failures = (previous?.failures || 0) + 1;
    const state: ProviderCircuitState = {
      failures,
      openedUntil: failures >= input.failureThreshold ? input.now + input.resetMs : null,
      lastFailureAt: input.now,
      lastSuccessAt: previous?.lastSuccessAt || null,
    };
    this.states.set(key, state);
    return state;
  }

  async recordSuccess(key: string, now: number) {
    const state: ProviderCircuitState = {
      failures: 0,
      openedUntil: null,
      lastFailureAt: null,
      lastSuccessAt: now,
    };
    this.states.set(key, state);
    return state;
  }
}

/**
 * Shared-first, fail-soft circuit storage.
 *
 * Supabase is authoritative when configured, so every Vercel instance sees the
 * same provider health. If that control-plane store is temporarily unreachable,
 * the local atomic store keeps the request path functional rather than making a
 * database outage take down Travel as well.
 */
class SharedProviderCircuitStore implements AtomicProviderCircuitStore {
  private readonly local = new LocalAtomicCircuitStore();

  async get(key: string): Promise<ProviderCircuitState | null> {
    const response = await request(
      `provider_circuits?select=failures,opened_until,last_failure_at,last_success_at&circuit_key=eq.${encodeURIComponent(key)}&limit=1`,
      { method: 'GET' },
    );
    if (response) {
      try {
        const rows = await response.json();
        const state = Array.isArray(rows) && rows.length ? toState(rows[0]) : null;
        if (state) await this.local.set(key, state);
        return state;
      } catch { /* local fallback below */ }
    }
    return this.local.get(key);
  }

  async set(key: string, state: ProviderCircuitState): Promise<void> {
    await this.local.set(key, state);
    await request('provider_circuits?on_conflict=circuit_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        circuit_key: key,
        failures: state.failures,
        opened_until: state.openedUntil ? new Date(state.openedUntil).toISOString() : null,
        last_failure_at: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
        last_success_at: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      }]),
    });
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key);
    await request(`provider_circuits?circuit_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  async recordFailure(
    key: string,
    input: { now: number; failureThreshold: number; resetMs: number },
  ): Promise<ProviderCircuitState> {
    const response = await request('rpc/provider_circuit_failure', {
      method: 'POST',
      body: JSON.stringify({
        p_key: key,
        p_failure_threshold: input.failureThreshold,
        p_reset_ms: input.resetMs,
      }),
    });
    if (response) {
      try {
        const rows = await response.json();
        const state = toState(Array.isArray(rows) ? rows[0] : rows);
        if (state) {
          await this.local.set(key, state);
          return state;
        }
      } catch { /* local fallback below */ }
    }
    return this.local.recordFailure(key, input);
  }

  async recordSuccess(key: string, now: number): Promise<ProviderCircuitState> {
    const response = await request('rpc/provider_circuit_success', {
      method: 'POST',
      body: JSON.stringify({ p_key: key }),
    });
    if (response) {
      try {
        const rows = await response.json();
        const state = toState(Array.isArray(rows) ? rows[0] : rows);
        if (state) {
          await this.local.set(key, state);
          return state;
        }
      } catch { /* local fallback below */ }
    }
    return this.local.recordSuccess(key, now);
  }
}

export const providerCircuitStore: AtomicProviderCircuitStore = new SharedProviderCircuitStore();
