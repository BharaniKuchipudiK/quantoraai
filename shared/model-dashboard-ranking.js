/**
 * Model Dashboard ordering by measured outcomes.
 *
 * The dashboard already *shows* each model's measured quality ("87% quality"),
 * but ordering ignored it: the public list bucketed by status/price and then
 * broke ties alphabetically, so a model proven reliable in production sat below
 * an untested one purely because of its name. This module makes measured
 * reality the tiebreak — proven performers rise within their group — while
 * keeping the existing status/price structure the UI depends on.
 *
 * Pure and fail-safe: a model with no trustworthy evidence keeps its place and
 * simply sorts after models that have earned a score, so a cold dashboard looks
 * exactly as it did before.
 */

import { MIN_OUTCOME_SAMPLES } from './model-outcome-routing.js';

/**
 * Measured-outcome sort weight for one model.
 * @param {{quality?: {score?: number|null, sampleSize?: number}}|null|undefined} model
 * @returns {{hasEvidence: boolean, score: number}}
 */
export function measuredOutcomeKey(model) {
  const quality = model?.quality;
  const trusted = !!quality
    && Number(quality.sampleSize) >= MIN_OUTCOME_SAMPLES
    && Number.isFinite(quality.score);
  return { hasEvidence: trusted, score: trusted ? Number(quality.score) : -1 };
}

/**
 * Break a tie by measured outcome: models with trustworthy evidence come first,
 * highest score wins, and untested models fall back to name order. Returns a
 * negative / positive / zero comparator result; 0 means "decide it elsewhere".
 */
export function compareByMeasuredOutcome(a, b) {
  const ka = measuredOutcomeKey(a);
  const kb = measuredOutcomeKey(b);
  if (ka.hasEvidence !== kb.hasEvidence) return ka.hasEvidence ? -1 : 1;
  if (ka.score !== kb.score) return kb.score - ka.score;
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

/**
 * Status/price bucket used by the public dashboard list. Lower sorts first.
 * Preserved verbatim from the original ModelDashboard ordering so the only
 * behavior change is the measured-outcome tiebreak below.
 */
function publicBucket(model, selectedModelId) {
  if (selectedModelId && model.id === selectedModelId) return 0;
  if (model.status === 'discovered') return 1;
  if (model.status === 'available' && (model.pricingKind === 'free' || model.pricingKind === 'free-tier')) return 2;
  if (model.status === 'available') return 3;
  if (model.isNew || model.isUpdated) return 4;
  return 5;
}

/**
 * Order the public (non-admin) dashboard list: keep the status/price buckets,
 * but within each bucket surface models with the strongest measured record.
 *
 * @param {Array<object>} models
 * @param {{selectedModelId?: string|null}} [opts]
 * @returns {Array<object>} new array; input is not mutated.
 */
export function rankPublicDashboardModels(models, { selectedModelId = null } = {}) {
  return [...(Array.isArray(models) ? models : [])].sort((a, b) => {
    const bucket = publicBucket(a, selectedModelId) - publicBucket(b, selectedModelId);
    if (bucket) return bucket;
    return compareByMeasuredOutcome(a, b);
  });
}

/**
 * Order the admin dashboard list: preserve the category grouping (featured,
 * then approved, then candidates, then retired — the order the API already
 * emits them in) and, within each category, surface the strongest measured
 * record first. A category's first-seen order is the stable fallback so groups
 * never interleave.
 *
 * @param {Array<object>} models
 * @returns {Array<object>} new array; input is not mutated.
 */
export function rankAdminDashboardModels(models) {
  const list = Array.isArray(models) ? models : [];
  const categoryOrder = [];
  const seen = new Set();
  for (const model of list) {
    const category = model?.category || 'other';
    if (!seen.has(category)) {
      seen.add(category);
      categoryOrder.push(category);
    }
  }
  const rankOfCategory = new Map(categoryOrder.map((category, index) => [category, index]));
  return list
    .map((model, index) => ({ model, index }))
    .sort((a, b) => {
      const catA = rankOfCategory.get(a.model?.category || 'other');
      const catB = rankOfCategory.get(b.model?.category || 'other');
      if (catA !== catB) return catA - catB;
      const outcome = compareByMeasuredOutcome(a.model, b.model);
      if (outcome) return outcome;
      return a.index - b.index; // stable within category
    })
    .map((entry) => entry.model);
}
