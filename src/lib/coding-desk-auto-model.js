/**
 * Coding Desk Auto Mode — pick once per turn at request start.
 * Default Gemini for ordinary coding; escalate only when turn signals justify it.
 * Never invent models; only choose from the Active / available list.
 */

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

const FREE_KINDS = new Set(['free', 'free-tier']);

const COMPLEX_ASK = /\b(architect(?:ure|ural)?|system\s+design|complex|multi-?file|refactor\s+(?:the\s+)?entire|migrate|large[\s-]?scale|production[\s-]?ready|enterprise|codebase)\b/i;
const MULTI_FILE_ASK = /\b(?:across|all)\s+files?\b|\bmultiple\s+files?\b|\bentire\s+(?:app|project|codebase)\b/i;
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
  if (model.quality?.sampleSize >= 5 && Number.isFinite(model.quality?.score)) {
    score += Math.max(0, Math.min(12, model.quality.score / 8));
  }
  if (allowPaid && !isFreeReady(model) && /coder|claude|sonnet|deepseek|qwen/.test(hay)) score += 10;
  if (!allowPaid && isFreeReady(model)) score += 4;
  return score;
}

function pickStrongCoding(models, { allowPaid = false } = {}) {
  const pool = readyModels(models).filter((model) => {
    if (String(model.id).startsWith('gemini')) return false;
    if (allowPaid) return true;
    return isFreeReady(model);
  });
  const specialists = pool.filter((model) => CODING_SPECIALIST.test(`${model.id} ${model.name} ${model.specialty || ''}`));
  const ranked = (specialists.length ? specialists : pool)
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
  const text = String(message || '');
  if (COMPLEX_ASK.test(text) || MULTI_FILE_ASK.test(text)) return true;
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

  const stronger = pickStrongCoding(models, { allowPaid });
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
      : 'escalate_complex_coding',
    escalated: true,
    selectionSource: 'coding_desk_auto',
  };
}
