/**
 * Coding Desk Auto Mode — pick once per turn at request start.
 * Default Gemini for ordinary coding; escalate only when turn signals justify it.
 * Never invent models; only choose from the Active / available list.
 */

import { MIN_OUTCOME_SAMPLES, outcomeRoutingAdjust } from './model-outcome-routing.js';

export const CODING_DESK_AUTO_MODEL_ID = 'auto';

export const CODING_DESK_AUTO_MODEL = {
  id: CODING_DESK_AUTO_MODEL_ID,
  name: 'Auto',
  specialty: 'Gemini for ordinary coding; escalates only when the turn needs a stronger coder',
  badge: 'Default',
  provider: 'Quantora',
  available: true,
  pricingKind: 'free-tier',
};


/**
 * Active catalog for Auto / turn routing: featured Direct+Curated models plus
 * only registry rows that are approved and lifecycle=available. Raw discovery
 * history must never enter Auto selection.
 */
export function activeModelsForRouting({
  registryRows = [],
  featuredModels = [],
} = {}) {
  const byId = new Map();
  for (const model of Array.isArray(featuredModels) ? featuredModels : []) {
    if (!model?.id) continue;
    byId.set(model.id, {
      ...model,
      available: model.available !== false,
      pricingKind: model.pricingKind
        || (String(model.id).startsWith('gemini') ? 'free-tier'
          : String(model.id).endsWith(':free') ? 'free'
            : 'paid'),
    });
  }
  for (const row of Array.isArray(registryRows) ? registryRows : []) {
    if (!row?.id) continue;
    if (row.approved !== true || row.lifecycle !== 'available') continue;
    if (byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      name: row.name || row.id,
      available: true,
      pricingKind: row.is_free === true || String(row.id).endsWith(':free')
        ? 'free'
        : (row.pricing_kind || row.pricingKind || 'paid'),
      specialty: row.description || row.specialty,
      quality: row.quality || null,
    });
  }
  return [...byId.values()];
}

const FREE_KINDS = new Set(['free', 'free-tier']);

const COMPLEX_ASK = /\b(architect(?:ure|ural)?|system\s+design|complex|multi-?file|refactor\s+(?:the\s+)?entire|migrate|large[\s-]?scale|production[\s-]?ready|enterprise|codebase)\b/i;
const MULTI_FILE_ASK = /\b(?:across|all)\s+files?\b|\bmultiple\s+files?\b|\bentire\s+(?:app|project|codebase)\b/i;
// A shop/e-commerce build must satisfy the real-photo + cart + styling contract —
// too much for a weak default model, so escalate to a capable coder up front.
const SHOP_BUILD_ASK = /\b(shop|store|storefront|e-?commerce|boutique|catalog(?:ue)?|marketplace)\b|\bsell(?:ing)?\s+online\b/i;
const CODING_SPECIALIST = /coder|nemotron|deepseek|gpt-oss|qwen|claude|sonnet|gpt-?4|gpt-?5|opus/i;

export function isCodingDeskAutoSelection(modelOrId) {
  if (modelOrId == null) return true;
  if (typeof modelOrId === 'string') {
    const id = modelOrId.trim().toLowerCase();
    return !id || id === CODING_DESK_AUTO_MODEL_ID;
  }
  const id = String(modelOrId.id || '').trim().toLowerCase();
  return !id || id === CODING_DESK_AUTO_MODEL_ID;
}

function readyModels(models = []) {
  return (Array.isArray(models) ? models : []).filter(
    (model) => model && typeof model.id === 'string' && model.id.trim() && model.available !== false,
  );
}

function isFreeReady(model) {
  if (FREE_KINDS.has(String(model.pricingKind || '').toLowerCase())) return true;
  if (model.is_free === true) return true;
  const id = String(model.id || '');
  if (id.endsWith(':free')) return true;
  if (id.startsWith('gemini')) return true;
  return false;
}

function pickGemini(models) {
  const gemini = readyModels(models).filter((model) => String(model.id).startsWith('gemini'));
  return gemini.find((model) => model.id === 'gemini-flash-latest')
    || gemini.find((model) => /flash/i.test(model.id) || /flash/i.test(model.name || ''))
    || gemini[0]
    || null;
}

function codingStrength(model, { allowPaid = false } = {}) {
  const hay = `${model.id || ''} ${model.name || ''} ${model.specialty || model.description || ''}`.toLowerCase();
  let score = 0;
  if (/coder/.test(hay)) score += 48; // dedicated coding model
  else if (/nemotron|deepseek|gpt-oss|qwen/.test(hay)) score += 40;
  if (/claude|sonnet|opus|gpt-?4|gpt-?5/.test(hay)) score += 28;
  if (/llama[^a-z]*3\.[13]|mistral[^a-z]*large|grok/.test(hay)) score += 16;
  if (/gemini|flash/.test(hay)) score -= 8;
  // Measured reality overrides the name guess as evidence accumulates: a model
  // that actually succeeds is promoted, one that keeps failing is demoted.
  // Fail-safe — no trustworthy signal contributes 0 (see model-outcome-routing).
  score += outcomeRoutingAdjust(model.quality);
  if (allowPaid && !isFreeReady(model) && /coder|claude|sonnet|deepseek|qwen/.test(hay)) score += 10;
  if (!allowPaid && isFreeReady(model)) score += 4;
  return score;
}

function hasTrustedOutcome(model) {
  return Number(model?.quality?.sampleSize) >= MIN_OUTCOME_SAMPLES
    && Number.isFinite(model?.quality?.score);
}

function pickStrongCoding(models, { allowPaid = false } = {}) {
  const pool = readyModels(models).filter((model) => {
    if (String(model.id).startsWith('gemini')) return false;
    if (allowPaid) return true;
    return isFreeReady(model);
  });
  // Name specialists are the usual contenders, but a model with a trustworthy
  // measured record earns a seat at the table even without "coder" in its name —
  // otherwise the name gate would hide a proven performer before evidence is read.
  const contenders = pool.filter((model) =>
    CODING_SPECIALIST.test(`${model.id} ${model.name} ${model.specialty || ''}`)
    || hasTrustedOutcome(model),
  );
  const ranked = (contenders.length ? contenders : pool)
    .map((model, index) => ({ model, index, score: codingStrength(model, { allowPaid }) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.model || null;
}

/**
 * Whether this coding turn should leave the Gemini default for a stronger coder.
 * Switch is decided once here — callers must not re-route mid-stream.
 */
export function shouldEscalateCodingDeskModel({
  message = '',
  refineMode = false,
  hasVFS = false,
  qualityHints = null,
} = {}) {
  if (refineMode) return true;
  if (qualityHints?.probeFailure || qualityHints?.repair) return true;
  if (qualityHints?.shopImageOversize) return true;
  const text = String(message || '');
  if (COMPLEX_ASK.test(text) || MULTI_FILE_ASK.test(text)) return true;
  if (SHOP_BUILD_ASK.test(text)) return true;
  const fileCount = Number(qualityHints?.fileCount) || 0;
  if (hasVFS && (fileCount >= 5 || text.length >= 2500)) return true;
  return false;
}

/**
 * @returns {{
 *   model: object | null,
 *   modelId: string,
 *   reason: string,
 *   escalated: boolean,
 *   selectionSource: 'coding_desk_auto'
 * }}
 */

function pickShopIntakeModel(models, { allowPaid = false, gemini = null } = {}) {
  const stronger = pickStrongCoding(models, { allowPaid });
  if (!stronger) return gemini;
  const hay = `${stronger.id || ''} ${stronger.name || ''}`.toLowerCase();
  if (/nemotron/.test(hay)) return gemini || stronger;
  return stronger;
}

export function resolveCodingDeskModel({
  task = 'coding',
  message = '',
  hasVFS = false,
  refineMode = false,
  availableModels = [],
  qualityHints = null,
  allowPaid = false,
} = {}) {
  const models = readyModels(availableModels);
  const gemini = pickGemini(models);
  const geminiId = gemini?.id || 'gemini-flash-latest';

  // Auto Mode is Coding Desk only; other domains keep their own routers.
  if (task && task !== 'coding' && task !== 'build') {
    return {
      model: gemini,
      modelId: geminiId,
      reason: 'non_coding_task',
      escalated: false,
      selectionSource: 'coding_desk_auto',
    };
  }

  const shopOversize = Boolean(qualityHints?.shopImageOversize);
  const escalate = shouldEscalateCodingDeskModel({ message, refineMode, hasVFS, qualityHints });
  if (!escalate) {
    return {
      model: gemini,
      modelId: geminiId,
      reason: 'default_gemini',
      escalated: false,
      selectionSource: 'coding_desk_auto',
    };
  }

  const stronger = shopOversize
    ? pickShopIntakeModel(models, { allowPaid, gemini })
    : pickStrongCoding(models, { allowPaid });
  if (!stronger || stronger.id === geminiId) {
    return {
      model: gemini,
      modelId: geminiId,
      reason: 'escalate_unavailable_stay_gemini',
      escalated: false,
      selectionSource: 'coding_desk_auto',
    };
  }

  return {
    model: stronger,
    modelId: stronger.id,
    reason: refineMode || qualityHints?.probeFailure || qualityHints?.repair
      ? 'escalate_refine_or_repair'
      : shopOversize
        ? 'escalate_shop_image_oversize'
        : 'escalate_complex_coding',
    escalated: true,
    selectionSource: 'coding_desk_auto',
  };
}
