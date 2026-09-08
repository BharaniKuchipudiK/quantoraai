/*
 * WHAT THE PLANNER DID, AS NUMBERS (Phase 7, second cut).
 *
 * The planner decides the lane of every turn. Until it is measured, "the
 * model beats the rules" is a design, not evidence: nobody can say how often
 * the planner answered in time, how often it agreed with the rules it
 * replaced, where it overruled them, or what it cost in latency. This module
 * turns the turn_plan_events rows into those numbers, without a network, so
 * the arithmetic is tested and the admin dashboard reads it.
 *
 * Precise on purpose: agreement is measured only on turns the PLANNER decided
 * (a fallback turn agrees with itself); a rate over zero turns is null, not
 * zero, so an empty table never reads as a perfect planner (§4).
 */
import type { TurnPlanEventRow } from './store.js';

export const TURN_PLAN_WINDOW_HOURS = 24;
export const TURN_LANES = ['build', 'office', 'advisor', 'chat'] as const;

export type TurnPlanSummary = {
  turns: number;
  planner: number;
  fallback: number;
  plannerRate: number | null;
  agreedRate: number | null;
  lanes: Record<(typeof TURN_LANES)[number], number>;
  disagreements: Array<{ from: string; to: string; count: number }>;
  medianPlannerMs: number | null;
  errors: number;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function summarizeTurnPlans(rows: TurnPlanEventRow[] | null | undefined): TurnPlanSummary {
  const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
  const lanes: TurnPlanSummary['lanes'] = { build: 0, office: 0, advisor: 0, chat: 0 };
  const overruled = new Map<string, { from: string; to: string; count: number }>();
  const plannerMs: number[] = [];
  let planner = 0;
  let agreed = 0;
  let errors = 0;
  for (const row of list) {
    if (row.lane in lanes) lanes[row.lane as keyof typeof lanes] += 1;
    if (row.planner_error) errors += 1;
    if (row.source !== 'planner') continue;
    planner += 1;
    if (row.agreed === true) agreed += 1;
    if (Number.isFinite(Number(row.planner_ms))) plannerMs.push(Number(row.planner_ms));
    if (row.deterministic_lane && row.lane !== row.deterministic_lane) {
      const key = `${row.deterministic_lane}→${row.lane}`;
      const entry = overruled.get(key) || { from: row.deterministic_lane, to: row.lane, count: 0 };
      entry.count += 1;
      overruled.set(key, entry);
    }
  }
  return {
    turns: list.length,
    planner,
    fallback: list.length - planner,
    plannerRate: percent(planner, list.length),
    agreedRate: percent(agreed, planner),
    lanes,
    disagreements: [...overruled.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)).slice(0, 3),
    medianPlannerMs: median(plannerMs),
    errors,
  };
}

/**
 * How a ledger reading came to be what it is. Four states, because three of
 * them arrive as an empty list and mean entirely different things — and the
 * remedy differs: a missing table wants a migration, an unanswered query wants
 * the store looked at, and a real zero wants nothing at all.
 */
export type LedgerSource = 'measured' | 'no-rows' | 'not_configured' | 'unavailable';

/** The dashboard's one line, from the summary — the same words wherever it is shown. */
export function describeTurnPlans(summary: TurnPlanSummary, source: LedgerSource): string {
  if (source === 'not_configured') return 'Turn planner: the store is not configured, so no plan is recorded.';
  /*
   * Not 'no-rows'. That branch tells the operator to apply a migration, which
   * is the wrong errand when the table is fine and the query simply did not
   * come back — and an unanswered query is the reading most worth knowing is
   * unreliable, because it is the one that looks like a quiet day.
   */
  if (source === 'unavailable') {
    return 'Turn planner: the store did not answer, so this is not a measurement — nothing here is evidence that turns are or are not being planned.';
  }
  if (source === 'no-rows' || summary.turns === 0) {
    return 'Turn planner: no plans recorded in the last 24 hours. If turns are being made, the turn_plan_events table is missing — apply migration 20260906170000_turn_plan_events.sql.';
  }
  const lanes = TURN_LANES.map((lane) => `${lane} ${summary.lanes[lane]}`).join(' / ');
  const overruled = summary.disagreements.length
    ? ` · most overruled: ${summary.disagreements.map((entry) => `${entry.from}→${entry.to} ×${entry.count}`).join(', ')}`
    : '';
  return `Turn planner (24h): ${summary.turns} turns · planner decided ${summary.plannerRate ?? 0}%`
    + ` · agreed with the rules ${summary.agreedRate === null ? 'n/a' : `${summary.agreedRate}%`}`
    + ` · median ${summary.medianPlannerMs === null ? 'n/a' : `${summary.medianPlannerMs} ms`}`
    + ` · ${lanes} · planner errors ${summary.errors}${overruled}`;
}
