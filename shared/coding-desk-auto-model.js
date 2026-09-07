/**
 * Coding Desk Auto Mode — pick once per turn at request start.
 * Default Gemini for ordinary coding; escalate only when turn signals justify it.
 * Never invent models; only choose from the Active / available list.
 */

import { MIN_OUTCOME_SAMPLES, outcomeRoutingAdjust, settleLatencyTies } from './model-outcome-routing.js';

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
// An "AI agent", a backend/integration, an OAuth/API connection, or crawling/
// automation over an external service is far heavier than a static page — the
// fast default routinely blows the build deadline on these. Escalate up front.
const AGENT_OR_INTEGRATION_ASK = /\b(a\s?i\.?\s*agent|agent\s+that|autonomous|automat(?:e|es|ed|ion|ing)|integrat(?:e|es|ed|ion|ing)|connect(?:s|ed|ing)?\s+to|o\s?auth|api\s+(?:key|integration|call|endpoint)|webhook|back-?end|server-?side|micro-?service|database|data\s+pipeline|crawl(?:s|ing)?|scrap(?:e|er|ers|ing)|index(?:es|ing)?\s+(?:files|documents|data)|google\s+drive|dropbox|gmail|outlook|slack|notion|airtable|salesforce)\b/i;
const CODING_SPECIALIST = /coder|nemotron|deepseek|gpt-oss|qwen|claude|sonnet|gpt-?4|gpt-?5|opus/i;

// A long request that strings together several distinct deliverables is a bigger
// build than the fast default reliably finishes in one turn — route it up front.
function looksLikeBigMultiPartAsk(text = '') {
  const t = String(text || '');
  if (t.length < 240) return false;
  const requirements = (t.match(/\b(list|find|organi[sz]e|categori[sz]e|detect|dedup(?:e|licate)?|generate|create|build|connect|crawl|sort|filter|remove|delete|move|summari[sz]e|analy[sz]e|sync|schedule|track)\b/gi) || []).length;
  return requirements >= 3;
}

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

/*
 * Exported so the premium debit can ask the same question the resolver asks.
 * A second definition of "is this engine paid" would drift from this one, and
 * the two would disagree about what to charge for.
 */
export function isFreeReady(model) {
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
  // A paid FLAGSHIP (Claude/GPT-4+/GPT-5 class) writes COMPLETE builds; a cheap
  // "coder" specialist truncates. The literal word "coder" alone scores +48, so
  // without this a weak coder outranks a flagship. When paid is allowed, give a
  // genuine flagship the decisive edge — but never a mini/lite/haiku variant,
  // which carries a flagship name without the completion reliability.
  if (
    allowPaid
    && !isFreeReady(model)
    && /claude|sonnet|opus|gpt-?4|gpt-?5/.test(hay)
    && !/mini|nano|lite|haiku|flash|small|tiny|\b\d{1,2}b\b/.test(hay)
  ) score += 40;
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
  const field = contenders.length ? contenders : pool;
  /*
   * Phase 6: when merit ties, the faster proven route wins.
   *
   * Only routes with measured evidence move, and only within a run of equal
   * merit, so a route nobody has timed keeps its position and is never compared
   * to one that has been. See settleLatencyTies for why a pairwise comparator
   * would be unsound here.
   */
  const ranked = settleLatencyTies(
    field
      .map((model, index) => ({ model, index, score: codingStrength(model, { allowPaid }) }))
      .sort((a, b) => b.score - a.score || a.index - b.index),
  );
  return ranked[0]?.model || null;
}

/**
 * How reliably a model FINISHES a coding turn in time — the objective for a
 * failover pick (which differs from `codingStrength`, whose objective is raw
 * coding power for the PRIMARY pick).
 *
 * Measured reality leads: `outcomeRoutingAdjust` promotes a model that actually
 * succeeds and demotes one that keeps stalling, and contributes 0 until there
 * is trustworthy evidence. Only while a model is still UNPROVEN do we seed a
 * finish-reliability prior — the one place a name matters, and only until real
 * outcomes replace it:
 *   - Gemini reliably finishes fast, inside the build deadline → strong prior.
 *   - A paid coder generally finishes → mild prior.
 *   - An unproven free coder (e.g. a queued `*:free`) is the model that blew the
 *     135s deadline and triggered the fake "proved on the desk" → negative prior.
 * Swap the catalog tomorrow and this still does the right thing, because the
 * order is driven by evidence + a finish prior, never by hardcoded identity.
 */
function fallbackFinishReliability(model, { allowPaid = false } = {}) {
  // Identity prior — the finish-reliability floor, the one place a name matters.
  const id = String(model?.id || '');
  let prior;
  if (id.startsWith('gemini')) prior = 20;                    // reliably finishes fast, in-deadline
  else if (allowPaid && !isFreeReady(model)) prior = 12;      // a paid coder generally finishes
  else prior = -6;                                            // unproven free coder: the deadline risk
  // Measured reality ADDS on top (never replaces the prior): a model that
  // actually finishes climbs, one that stalls sinks; 0 until there is trustworthy
  // evidence. Keeping the prior as a floor preserves the invariant — an UNPROVEN
  // paid model (12) can never pass proven Gemini (20 + its measured lift); a coder
  // only overtakes Gemini by EARNING enough measured merit to exceed that floor.
  return prior + outcomeRoutingAdjust(model?.quality);
}

/**
 * Order the failover candidates for a Coding Desk turn by finish-reliability,
 * NOT by model name. Gemini free-tier is always kept as the last-resort safety
 * net; a paid coder can only rank ahead of it by EARNING it on measured
 * outcomes, never by default. Anonymous/free sessions keep a free-only failover
 * set (allowPaid=false); a session with a usable key may also fail over to
 * another paid coder when the evidence says it is the more reliable finisher.
 */
export function rankCodingDeskFallbacks(availableModels = [], { primaryId = '', allowPaid = false } = {}) {
  const pool = readyModels(availableModels).filter((model) => {
    if (model.id === primaryId) return false;
    return allowPaid ? true : isFreeReady(model);
  });
  // Same tie-break as the primary pick: equal finish-reliability is settled by
  // measured speed, never by where the model sits in the catalogue.
  const ranked = settleLatencyTies(
    pool
      .map((model, index) => ({ model, index, score: fallbackFinishReliability(model, { allowPaid }) }))
      .sort((a, b) => b.score - a.score || a.index - b.index),
  ).map((entry) => entry.model.id);
  if (primaryId !== 'gemini-flash-latest' && !ranked.includes('gemini-flash-latest')) {
    ranked.push('gemini-flash-latest');
  }
  return ranked;
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
  // Agent/backend/integration builds and long multi-part asks are heavy enough
  // that the fast default tends to time out — escalate to a stronger coder so
  // the turn has a real chance of finishing, instead of a 135s dead spinner.
  if (AGENT_OR_INTEGRATION_ASK.test(text)) return true;
  if (looksLikeBigMultiPartAsk(text)) return true;
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

  // Do NOT leave the fast, reliable Gemini default for an UNPROVEN FREE model.
  // A free non-Gemini coder (e.g. a queued `*:free` model) is routinely slower
  // than Gemini and blew past the 135s build deadline — which then triggered the
  // "inject canned photos + claim proved on the desk" fallback. Gemini finishes
  // in time and writes the real rich page. Only escalate away from it to a PAID
  // capable coder, or to a free model that has actually earned it on measured
  // outcomes (not the fabricated "proved-on-dead" successes).
  if (!allowPaid && isFreeReady(stronger) && !hasTrustedOutcome(stronger)) {
    return {
      model: gemini,
      modelId: geminiId,
      reason: 'stay_gemini_unproven_free',
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
