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
  /*
   * WEIGHTED BY THE ROWS THE AVERAGE WAS TAKEN OVER.
   *
   * The view computes avg_latency_ms as `avg(latency_ms) filter (where outcome
   * = 'success')`, so a row's average stands for exactly `successful_responses`
   * calls. Adding those per-category averages unweighted makes a category with
   * one sample count as much as one with a hundred: a model with a single 100ms
   * coding success and a hundred 1000ms writing successes reads as 550ms rather
   * than the true ~991ms, and can be ranked ahead of a genuinely faster route.
   *
   * That inaccuracy was harmless while nothing read this number. Routing on it
   * is what makes the weight load-bearing, so it is corrected here rather than
   * left for whoever trusts it next. Raised in review of #590.
   */
  const lat = num(row.avg_latency_ms);
  const latSamples = num(row.successful_responses);
  if (lat > 0 && latSamples > 0) {
    bucket.latSum += lat * latSamples;
    bucket.latN += latSamples;
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
 * The measured latency of a route, or null when there is not enough evidence.
 *
 * Same trust bar as every other signal in this file: below MIN_OUTCOME_SAMPLES
 * a number is a hunch, and a zero or missing latency measures nothing.
 */
export function trustedLatencyMs(model) {
  const samples = Number(model?.quality?.sampleSize);
  const latency = Number(model?.quality?.avgLatencyMs);
  if (!Number.isFinite(samples) || samples < MIN_OUTCOME_SAMPLES) return null;
  if (!Number.isFinite(latency) || latency <= 0) return null;
  return latency;
}

/**
 * Break ties between routes by how fast they have actually answered.
 *
 * WHAT THIS REPLACES
 *
 * Both rankers already tie-break, on `a.index - b.index`: the earlier entry in
 * the catalogue wins. That is an accident of list order standing in for a
 * decision the evidence could make -- model_quality_events records latency per
 * turn and avgLatencyMs has ridden on every signal since outcome routing
 * shipped, read by nobody.
 *
 * WHY THIS MOVES POSITIONS RATHER THAN SCORING ROUTES
 *
 * The first version added a small number to each route's score, capped below
 * half a point so it could not overturn a difference in merit. Review of #590
 * found the flaw: a route with NO latency evidence scored 0, which sits in the
 * middle of the measured range, so it was silently treated as faster than every
 * measured-slow route and slower than every measured-fast one. There is no
 * evidence for either claim. "No data means no adjustment" held per route and
 * failed pairwise, which is the comparison that actually decides.
 *
 * A pairwise comparator -- use latency only when BOTH sides are measured -- is
 * the obvious repair, and it is unsound. With routes slow, unknown, fast in
 * catalogue order it demands fast before slow from evidence, slow before
 * unknown from catalogue order, and unknown before fast from catalogue order:
 * a cycle. Array.prototype.sort with an intransitive comparator has no defined
 * result, so that repair trades a wrong order for an unpredictable one.
 *
 * So the reordering is positional. Within a run of equal merit, the POSITIONS
 * already held by measured routes are collected, those routes are sorted among
 * themselves by measured latency, and they are written back into exactly those
 * positions. A route without evidence never moves and is never compared to
 * anything. Merit is untouched because the runs are defined by it, so latency
 * decides ties and nothing else -- by construction now, rather than by an
 * arithmetic bound that had to be argued.
 *
 * Equal latencies keep catalogue order, because sort is stable and a tie on the
 * evidence is not a reason to invent an order.
 *
 * @param {Array<{score:number, model:object}>} ranked  Already ordered by merit.
 * @returns {Array} a new array; the input is not mutated.
 */
export function settleLatencyTies(ranked) {
  const out = Array.isArray(ranked) ? [...ranked] : [];
  let start = 0;
  while (start < out.length) {
    let end = start + 1;
    while (end < out.length && out[end]?.score === out[start]?.score) end += 1;
    if (end - start > 1) {
      const slots = [];
      for (let i = start; i < end; i += 1) {
        if (trustedLatencyMs(out[i]?.model) !== null) slots.push(i);
      }
      if (slots.length > 1) {
        const measured = slots.map((i) => out[i]);
        measured.sort((a, b) => trustedLatencyMs(a.model) - trustedLatencyMs(b.model));
        slots.forEach((slot, n) => { out[slot] = measured[n]; });
      }
    }
    start = end;
  }
  return out;
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
