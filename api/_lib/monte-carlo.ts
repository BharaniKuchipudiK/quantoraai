/**
 * Monte Carlo goal-probability (ADR-025) — the honest upgrade over a single-point
 * "you'll have X". It simulates many return paths under LABELED assumptions and
 * reports the odds and the spread: how often you reach the goal, the median
 * outcome, and a bad-decade (10th percentile) outcome.
 *
 * Deliberately SEEDED and deterministic — the same inputs always produce the same
 * probability, so this is a reproducible planning figure, not a number that
 * flickers each run. Normal returns are a simplification (real markets have fat
 * tails); the caller states the assumptions. Pure and network-free.
 */

// Deterministic PRNG (mulberry32) — small, fast, good enough for planning sims.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box–Muller from two uniforms.
function normal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export type MonteCarloInputs = {
  goal: number;
  current: number;
  monthlyContribution: number;
  horizonMonths: number;
  annualReturnPct: number; // labeled planning assumption (mean)
  annualVolPct: number; // labeled planning assumption (volatility)
  paths?: number; // default 1000
  seed?: number; // default fixed, for reproducibility
};

export type MonteCarloResult = {
  paths: number;
  hits: number;
  probabilityPct: number; // share of paths reaching the goal
  p10: number; // tough-decade outcome
  p50: number; // median outcome
  p90: number; // strong outcome
};

const MAX_PATHS = 5000;
const MAX_MONTHS = 1200;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return Number(sorted[idx].toFixed(2));
}

// A "healthy" planning confidence — the bar the solver aims to clear. Not a
// guarantee; planners commonly treat ~80% of scenarios succeeding as on-track.
export const CONFIDENCE_TARGET_PCT = 80;

/**
 * Smallest monthly contribution that lifts the goal-probability to `targetPct`,
 * or null when the current pace already clears it (nothing to raise) or no
 * reachable contribution gets there within the horizon. Deterministic: with a
 * fixed seed, raising the contribution raises every path's ending balance, so
 * probability is monotonic and a binary search is valid. Uses a lighter path
 * count so the solve stays cheap on the request path.
 */
export function requiredMonthlyForConfidence(
  base: MonteCarloInputs,
  targetPct: number = CONFIDENCE_TARGET_PCT,
): number | null {
  const probAt = (monthly: number): number =>
    simulateGoalProbability({ ...base, monthlyContribution: monthly, paths: 400 }).probabilityPct;

  const start = Math.max(0, base.monthlyContribution);
  if (probAt(start) >= targetPct) return null; // already on track — nothing to add

  let lo = start;
  let hi = Math.max(start * 2, start + 1000);
  for (let i = 0; i < 20 && probAt(hi) < targetPct; i += 1) {
    hi *= 2;
    if (hi > 1e9) return null; // unreachable within any sane contribution
  }
  if (probAt(hi) < targetPct) return null;

  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (probAt(mid) >= targetPct) hi = mid;
    else lo = mid;
  }
  return Number(hi.toFixed(0));
}

export function simulateGoalProbability(inputs: MonteCarloInputs): MonteCarloResult {
  const paths = Math.min(MAX_PATHS, Math.max(100, Math.floor(inputs.paths ?? 1000)));
  const months = Math.min(MAX_MONTHS, Math.max(1, Math.floor(inputs.horizonMonths)));
  const goal = Math.max(0, inputs.goal);
  const current = Math.max(0, inputs.current);
  const contribution = Math.max(0, inputs.monthlyContribution);
  const muM = inputs.annualReturnPct / 100 / 12;
  const sigmaM = Math.max(0, inputs.annualVolPct) / 100 / Math.sqrt(12);
  const rand = mulberry32(inputs.seed ?? 0x9e3779b9);

  const finals: number[] = new Array(paths);
  let hits = 0;
  for (let p = 0; p < paths; p += 1) {
    let balance = current;
    for (let m = 0; m < months; m += 1) {
      // Monthly return floored at -99% so a draw can't drive the balance negative.
      const r = Math.max(-0.99, muM + sigmaM * normal(rand));
      balance = balance * (1 + r) + contribution;
    }
    finals[p] = balance;
    if (balance >= goal) hits += 1;
  }
  finals.sort((a, b) => a - b);

  return {
    paths,
    hits,
    probabilityPct: Number(((hits / paths) * 100).toFixed(1)),
    p10: percentile(finals, 10),
    p50: percentile(finals, 50),
    p90: percentile(finals, 90),
  };
}
