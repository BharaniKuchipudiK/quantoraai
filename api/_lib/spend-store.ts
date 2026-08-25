import { DEFAULT_MONTHLY_CEILING_USD, spendMonthKey } from '../../src/lib/spend-ledger.js';

/*
 * Supabase-backed paid-inference spend ledger.
 *
 * This store deliberately does NOT have the local-degraded fallback that
 * provider-circuit-store has. A circuit breaker that loses its shared state can
 * guess locally: the worst case is a wasted retry. A spend meter that loses its
 * state cannot guess, because the worst case is unbounded spend against a
 * ceiling it can no longer see.
 *
 * So every failure path here reports `known: false`, and decidePaidSpend()
 * refuses paid routing on that. Unconfigured Supabase means no paid fallback -
 * which is the correct default for an account that has not opted in.
 */

const STORE_TIMEOUT_MS = 1_500;

export type SpendSnapshot = {
  /** False whenever the true total is unknown; callers must refuse paid spend. */
  known: boolean;
  monthKey: string;
  spentUsd: number;
  ceilingUsd: number;
  calls: number;
};

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

/** Monthly ceiling in USD. Absent or unparseable env means no paid budget. */
export function configuredCeilingUsd(): number {
  const raw = process.env.QUANTORA_PAID_MONTHLY_CEILING_USD;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** The agreed default, exported so callers can show it before opt-in. */
export const SUGGESTED_CEILING_USD = DEFAULT_MONTHLY_CEILING_USD;

function unknown(monthKey: string, ceilingUsd: number): SpendSnapshot {
  return { known: false, monthKey, spentUsd: 0, ceilingUsd, calls: 0 };
}

async function request(path: string, init: RequestInit): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toSnapshot(row: any, monthKey: string, ceilingUsd: number): SpendSnapshot {
  const spent = Number(row?.spent_usd);
  if (!Number.isFinite(spent) || spent < 0) return unknown(monthKey, ceilingUsd);
  return {
    known: true,
    monthKey,
    spentUsd: spent,
    ceilingUsd,
    calls: Math.max(0, Number(row?.calls) || 0),
  };
}

/** Read this month's spend. Any uncertainty returns known:false. */
export async function readMonthlySpend(now = new Date()): Promise<SpendSnapshot> {
  const monthKey = spendMonthKey(now);
  const ceilingUsd = configuredCeilingUsd();
  if (!config()) return unknown(monthKey, ceilingUsd);

  const res = await request(
    `/rest/v1/model_spend_ledger?month_key=eq.${encodeURIComponent(monthKey)}&select=month_key,spent_usd,calls`,
    { method: 'GET' },
  );
  if (!res || !res.ok) return unknown(monthKey, ceilingUsd);
  try {
    const rows = await res.json();
    // No row yet is a KNOWN zero: the table is reachable, this month is simply
    // untouched. That is different from being unable to read it at all.
    if (Array.isArray(rows) && rows.length === 0) {
      return { known: true, monthKey, spentUsd: 0, ceilingUsd, calls: 0 };
    }
    return toSnapshot(Array.isArray(rows) ? rows[0] : rows, monthKey, ceilingUsd);
  } catch {
    return unknown(monthKey, ceilingUsd);
  }
}

/**
 * Record the real cost of one paid call and return the resulting total.
 * A failure to record returns known:false, which closes paid routing until the
 * ledger is readable again - spending we cannot account for must stop.
 */
export async function recordModelSpend(costUsd: number, now = new Date()): Promise<SpendSnapshot> {
  const monthKey = spendMonthKey(now);
  const ceilingUsd = configuredCeilingUsd();
  const cost = Number.isFinite(Number(costUsd)) ? Math.max(0, Number(costUsd)) : 0;
  if (!config()) return unknown(monthKey, ceilingUsd);

  const res = await request('/rest/v1/rpc/record_model_spend', {
    method: 'POST',
    body: JSON.stringify({ p_month_key: monthKey, p_cost_usd: cost }),
  });
  if (!res || !res.ok) return unknown(monthKey, ceilingUsd);
  try {
    const rows = await res.json();
    return toSnapshot(Array.isArray(rows) ? rows[0] : rows, monthKey, ceilingUsd);
  } catch {
    return unknown(monthKey, ceilingUsd);
  }
}
