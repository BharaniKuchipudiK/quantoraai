/**
 * Measured-outcome routing signals.
 *
 * The platform already records real per-turn outcomes in `model_quality_events`
 * (success / failure / helpful / not_helpful, latency, fallback origin) and
 * exposes them through the `model_quality_summary` view — but until now that
 * evidence only decorated the Model Dashboard. Routing still picked models by
 * matching name strings ("coder" +48, "gemini" -8), so a model that *looks*
 * strong but actually fails in production kept winning the turn.
 *
 * This module turns the summary rows into a small, task-aware signal that the
 * router can trust: how reliable a model has actually been, weighted by how
 * much evidence we have. It is deliberately pure and fail-safe — no data means
 * no adjustment, so a cold catalog behaves exactly like the name-string router
 * it augments. As evidence accumulates, measured reality can promote a quiet
 * workhorse or demote a big name that keeps missing.
 */

/** Reliability samples (success + failure) required before we trust a signal. */
export const MIN_OUTCOME_SAMPLES = 5;

/** Samples at which measured evidence carries its full routing weight. */
export const FULL_CONFIDENCE_SAMPLES = 20;

/** Largest swing measured outcomes may add to (or subtract from) a route score. */
export const MAX_OUTCOME_ADJUST = 30;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyBucket() {
  return { successes: 0, failures: 0, helpful: 0, notHelpful: 0, fallbacks: 0, latSum: 0, latN: 0 };
}

function addRow(bucket, row) {
  bucket.successes += num(row.successful_responses);
  bucket.failures += num(row.failed_responses);
  bucket.helpful += num(row.helpful_votes);
  bucket.notHelpful += num(row.not_helpful_votes);
  bucket.fallbacks += num(row.fallback_rescues);
  const lat = num(row.avg_latency_ms);
  if (lat > 0) {
    bucket.latSum += lat;
    bucket.latN += 1;
  }
}

function finalize(bucket) {
  const reliabilitySamples = bucket.successes + bucket.failures;
  const feedbackSamples = bucket.helpful + bucket.notHelpful;
  const reliability = reliabilitySamples ? bucket.successes / reliabilitySamples : null;
  const usefulness = feedbackSamples ? bucket.helpful / feedbackSamples : null;
  const score = reliabilitySamples >= MIN_OUTCOME_SAMPLES
    ? Math.round(100 * ((reliability ?? 0.5) * 0.7 + (usefulness ?? reliability ?? 0.5) * 0.3))
    : null;
  return {
    sampleSize: reliabilitySamples,
    score,
    reliability,
    usefulness,
    avgLatencyMs: bucket.latN ? Math.round(bucket.latSum / bucket.latN) : null,
  };
}

/**
 * Fold `model_quality_summary` rows into a per-model signal for one task.
 *
 * The view is keyed by (model_id, task_category). We prefer evidence from the
 * turn's own category when it clears the trust bar, and otherwise fall back to
 * the model's whole-catalog aggregate — so a coding turn leans on coding
 * history when it exists, but still benefits from broad reliability data for a
 * model that simply hasn't logged much coding yet.
 *
 * @param {Array<object>} rows  Rows from `model_quality_summary`.
 * @param {string} [taskCategory='coding']  Turn task category.
 * @returns {Map<string, {sampleSize:number, score:number|null, reliability:number|null, usefulness:number|null, avgLatencyMs:number|null}>}
 */
export function outcomeSignalsForTask(rows, taskCategory = 'coding') {
  const exact = new Map();
  const all = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.model_id !== 'string' || !row.model_id) continue;
    if (!all.has(row.model_id)) all.set(row.model_id, emptyBucket());
    addRow(all.get(row.model_id), row);
    if (taskCategory && row.task_category === taskCategory) {
      if (!exact.has(row.model_id)) exact.set(row.model_id, emptyBucket());
      addRow(exact.get(row.model_id), row);
    }
  }

  const result = new Map();
  const ids = new Set([...exact.keys(), ...all.keys()]);
  for (const id of ids) {
    const exactSignal = exact.has(id) ? finalize(exact.get(id)) : null;
    const broadSignal = all.has(id) ? finalize(all.get(id)) : null;
    const chosen = exactSignal && exactSignal.sampleSize >= MIN_OUTCOME_SAMPLES
      ? exactSignal
      : (broadSignal || exactSignal);
    if (chosen) result.set(id, chosen);
  }
  return result;
}

/**
 * Fold `model_quality_summary` rows into one overall signal per model, across
 * every task category. This is the whole-catalog view the Model Dashboard shows
 * and ranks by — the same reliability/usefulness math as {@link outcomeSignalsForTask}
 * without the per-task split, so there is one definition of "how good is this
 * model" rather than a dashboard copy and a routing copy.
 *
 * @param {Array<object>} rows  Rows from `model_quality_summary`.
 * @returns {Map<string, {sampleSize:number, score:number|null, reliability:number|null, usefulness:number|null, avgLatencyMs:number|null}>}
 */
export function overallOutcomeSignals(rows) {
  const all = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.model_id !== 'string' || !row.model_id) continue;
    if (!all.has(row.model_id)) all.set(row.model_id, emptyBucket());
    addRow(all.get(row.model_id), row);
  }
  const result = new Map();
  for (const [id, bucket] of all) result.set(id, finalize(bucket));
  return result;
}

/**
 * Signed routing adjustment from a measured signal.
 *
 * Score 50 is neutral (coin-flip reliability). Above it rewards, below it
 * penalizes, scaled by a confidence ramp so a five-sample hunch nudges gently
 * while twenty-plus samples move the full range. Fail-safe: no trustworthy
 * signal returns 0, leaving the name-string heuristics untouched.
 *
 * @param {{sampleSize?:number, score?:number|null}|null|undefined} signal
 * @returns {number} bounded to [-MAX_OUTCOME_ADJUST, MAX_OUTCOME_ADJUST]
 */
export function outcomeRoutingAdjust(signal) {
  if (!signal) return 0;
  const { sampleSize, score } = signal;
  if (!Number.isFinite(score) || !Number.isFinite(sampleSize) || sampleSize < MIN_OUTCOME_SAMPLES) {
    return 0;
  }
  const confidence = Math.min(1, sampleSize / FULL_CONFIDENCE_SAMPLES);
  const delta = (score - 50) * 0.6 * confidence;
  return Math.max(-MAX_OUTCOME_ADJUST, Math.min(MAX_OUTCOME_ADJUST, Math.round(delta)));
}

/**
 * Attach measured signals onto a list of routing models as `.quality`, in the
 * shape the router's scorer already understands ({ sampleSize, score, ... }).
 * Models with no evidence keep whatever `.quality` they already carried (or
 * none) — this only ever adds knowledge, never erases it.
 *
 * @param {Array<object>} models
 * @param {Map<string, object>} signals  From {@link outcomeSignalsForTask}.
 * @returns {Array<object>} new array; input models are not mutated.
 */
export function withOutcomeSignals(models, signals) {
  if (!(signals instanceof Map) || signals.size === 0) {
    return Array.isArray(models) ? models : [];
  }
  return (Array.isArray(models) ? models : []).map((model) => {
    if (!model || typeof model.id !== 'string') return model;
    const signal = signals.get(model.id);
    if (!signal) return model;
    return { ...model, quality: signal };
  });
}
