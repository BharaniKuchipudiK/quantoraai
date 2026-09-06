/*
 * QIR Phase 6 — ROUTING READS WHAT WAS MEASURED.
 *
 * `model_quality_events` has been written since Phase 6 opened: one row per
 * finished turn, success or failure by the provider's own finish, with the
 * latency. Nothing read it. The ladder was ordered by independence, declared
 * health, the requested order and cost — never by whether a model had actually
 * been answering in the last half hour. A route that failed six of its last
 * eight turns was tried first as long as its circuit was closed, and the
 * circuit only opens on consecutive failures of the same key.
 *
 * This module turns the ledger into a ranking signal, and keeps it precise
 * (CLAUDE.md §5): a model is demoted only on unambiguous evidence — at least
 * MEASURED_MIN_SAMPLES turns inside MEASURED_WINDOW_MS with a failure rate at
 * or above MEASURED_DEMOTE_FAILURE_RATE. It reorders; it never removes a
 * route, never promotes a paid rung, and with no evidence it changes nothing.
 */

export type ModelQualityEvent = {
  model_id: string;
  outcome: string;
  latency_ms?: number | null;
  created_at?: string | null;
};

export type MeasuredOutcome = {
  modelId: string;
  samples: number;
  successes: number;
  failures: number;
  failureRate: number;
  p50LatencyMs: number | null;
};

export type MeasuredOutcomeMap = Record<string, MeasuredOutcome>;

export const MEASURED_WINDOW_MS = 30 * 60_000;
export const MEASURED_MIN_SAMPLES = 5;
export const MEASURED_DEMOTE_FAILURE_RATE = 0.5;

function timeOf(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Per-model summary of the ledger inside the window. Only the measured
 * outcomes count — `success` and `failure` — never the thumbs, which are a
 * person's opinion of a reply and a different signal. A row with no readable
 * timestamp is taken as inside the window: the store writes the time, and a
 * missing one is a store fault, not a reason to discard evidence.
 */
export function summarizeModelQuality(
  events: ModelQualityEvent[] | null | undefined,
  { now = Date.now(), windowMs = MEASURED_WINDOW_MS }: { now?: number; windowMs?: number } = {},
): MeasuredOutcomeMap {
  const since = now - windowMs;
  const buckets = new Map<string, { successes: number; failures: number; latencies: number[] }>();
  for (const event of Array.isArray(events) ? events : []) {
    const modelId = String(event?.model_id || '').trim();
    if (!modelId) continue;
    const outcome = String(event?.outcome || '');
    if (outcome !== 'success' && outcome !== 'failure') continue;
    const at = timeOf(event?.created_at);
    if (at !== null && at < since) continue;
    const bucket = buckets.get(modelId) || { successes: 0, failures: 0, latencies: [] };
    if (outcome === 'success') bucket.successes += 1; else bucket.failures += 1;
    const latency = Number(event?.latency_ms);
    if (Number.isFinite(latency) && latency > 0) bucket.latencies.push(latency);
    buckets.set(modelId, bucket);
  }
  const summary: MeasuredOutcomeMap = {};
  for (const [modelId, bucket] of buckets) {
    const samples = bucket.successes + bucket.failures;
    summary[modelId] = {
      modelId,
      samples,
      successes: bucket.successes,
      failures: bucket.failures,
      failureRate: samples ? bucket.failures / samples : 0,
      p50LatencyMs: median(bucket.latencies),
    };
  }
  return summary;
}

/** True only on unambiguous evidence: enough turns, and most of them failed. */
export function isMeasuredPoor(
  measured: MeasuredOutcome | null | undefined,
  { minSamples = MEASURED_MIN_SAMPLES, demoteAt = MEASURED_DEMOTE_FAILURE_RATE }: { minSamples?: number; demoteAt?: number } = {},
): boolean {
  if (!measured) return false;
  return measured.samples >= minSamples && measured.failureRate >= demoteAt;
}

export type MeasuredRankable = { id: string; paid?: boolean };

/**
 * Reorder a ladder by measured outcome, stably: routes with poor evidence move
 * behind every route without it, and everything else keeps its order. Each
 * returned route carries what was measured (`measured`) and, when it moved,
 * why (`demoted`). A paid rescue rung is never promoted past a free one by
 * this: the free ladder is ranked among itself, and the paid rung stays last.
 */
export function rankByMeasuredOutcome<T extends MeasuredRankable>(
  routes: T[],
  measured: MeasuredOutcomeMap | null | undefined,
  options: { minSamples?: number; demoteAt?: number } = {},
): Array<T & { measured?: MeasuredOutcome; demoted?: 'measured-outcome' }> {
  const list = Array.isArray(routes) ? routes : [];
  const evidence = measured || {};
  const decorated = list.map((route) => {
    const record = evidence[route.id];
    const poor = !route.paid && isMeasuredPoor(record, options);
    return {
      ...route,
      ...(record ? { measured: record } : {}),
      ...(poor ? { demoted: 'measured-outcome' as const } : {}),
    };
  });
  const free = decorated.filter((route) => !route.paid);
  const paid = decorated.filter((route) => route.paid);
  const kept = free.filter((route) => !route.demoted);
  const moved = free.filter((route) => route.demoted);
  return [...kept, ...moved, ...paid];
}

/*
 * The live reader, cached per instance for a minute: the ledger changes turn
 * by turn, the ranking need not. Never throws — no store, a slow store or an
 * unreadable row all read as "no evidence", which changes nothing.
 */
const CACHE_MS = 60_000;
let cache: { at: number; summary: MeasuredOutcomeMap } | null = null;

export async function readMeasuredOutcomes(
  loadEvents: (sinceIso: string) => Promise<ModelQualityEvent[]>,
  { now = Date.now(), windowMs = MEASURED_WINDOW_MS, cacheMs = CACHE_MS }: { now?: number; windowMs?: number; cacheMs?: number } = {},
): Promise<MeasuredOutcomeMap> {
  if (cacheMs > 0 && cache && now - cache.at < cacheMs) return cache.summary;
  try {
    const events = await loadEvents(new Date(now - windowMs).toISOString());
    const summary = summarizeModelQuality(events, { now, windowMs });
    cache = { at: now, summary };
    return summary;
  } catch {
    return {};
  }
}
