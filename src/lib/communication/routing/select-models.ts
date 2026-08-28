import { chooseBestFreeModel, rankFreeModels } from '../../model-routing.js';
import {
  isCodingDeskAutoSelection,
  rankCodingDeskFallbacks,
  resolveCodingDeskModel,
} from '../../coding-desk-auto-model.js';
import type { RoutingDecision } from './model-router';

type ModelLike = {
  id: string;
  name?: string;
  available?: boolean;
  pricingKind?: string;
  specialty?: string;
  description?: string;
  /** Declared by the provider catalogue, never inferred from the id. */
  vision?: boolean;
  quality?: { sampleSize?: number; score?: number } | null;
};

type SelectModelsInput = {
  models: ModelLike[];
  message: string;
  explicitModelId?: string | null;
  hasImages?: boolean;
  studioMode?: 'ask' | 'build' | 'plan';
  guidedBuild?: boolean;
  refineMode?: boolean;
  buildMode?: boolean;
  taskCategory?: string;
  hasVFS?: boolean;
  allowPaid?: boolean;
  qualityHints?: {
    probeFailure?: boolean;
    repair?: boolean;
    fileCount?: number;
  } | null;
  arenaPrefs?: unknown;
};

function isCodingDeskTurn(input: SelectModelsInput) {
  return Boolean(
    input.buildMode
    || input.studioMode === 'build'
    || input.guidedBuild
    || input.refineMode
    || input.taskCategory === 'coding',
  );
}

export function selectModelsForTurn(input: SelectModelsInput): RoutingDecision {
  const models = Array.isArray(input.models) ? input.models : [];
  const explicitId = typeof input.explicitModelId === 'string' ? input.explicitModelId.trim() : '';
  const autoSelected = isCodingDeskAutoSelection(explicitId || null);
  const explicit = !autoSelected && explicitId
    ? (models.find((model) => model.id === explicitId) || { id: explicitId, available: true })
    : null;

  // The API approval gate is authoritative. Do not silently replace a user's
  // pinned model merely because the optional registry cache is empty/stale.
  if (explicit) {
    const fallbackModelIds = rankFreeModels(models, input.message, input.arenaPrefs)
      .filter((model) => model.id !== explicit.id && model.available !== false)
      .map((model) => model.id);
    return {
      primaryModelId: explicit.id,
      fallbackModelIds,
      reason: input.hasImages ? 'vision' : isCodingDeskTurn(input) ? 'build' : 'quality',
      provider: explicit.id.startsWith('gemini') ? 'gemini' : 'openrouter',
      hasVisionSupport: explicit.id.startsWith('gemini'),
      selectionSource: 'explicit',
    };
  }

  if (input.hasImages) {
    const ready = models.filter((model) => typeof model?.id === 'string' && model.available !== false);
    const isGemini = (id: string) => id.startsWith('gemini');
    const gemini = ready.find((model) => isGemini(model.id));
    /*
     * A vision turn used to have exactly ONE viable route.
     *
     * The primary was forced to Gemini, and the fallbacks came from
     * rankFreeModels - which filters to FREE models. But the only models that
     * DECLARE vision are the discovered flagships, and those are paid, so they
     * could never appear as a rung. Downstream, capabilitiesFor drops any route
     * that does not declare vision, which emptied the rest of the chain too.
     *
     * So attaching an image reduced the whole ladder to Gemini alone, and if
     * Gemini was unhealthy the turn died - on a deployment paying for a
     * vision-capable flagship that was answering fine on every other turn.
     *
     * Vision capability is read from the catalogue (see discoverAnthropicFlagships),
     * never inferred from the id: a model earns a rung here by declaring it.
     */
    const visionCapable = ready.filter((model) => model.vision === true && !isGemini(model.id));
    const paidVisionRungs = input.allowPaid ? visionCapable.map((model) => model.id) : [];
    const freeVisionRungs = rankFreeModels(ready, input.message, input.arenaPrefs)
      .filter((model) => !isGemini(model.id) && model.vision === true)
      .map((model) => model.id);
    const fallbackModelIds = [...new Set([...paidVisionRungs, ...freeVisionRungs])];

    // Gemini stays the default when it exists: it is fast and reliably finishes.
    // A declared vision model only becomes primary when there is no Gemini at all,
    // which is the case that used to 503 outright.
    const primaryModelId = gemini?.id || fallbackModelIds[0] || 'gemini-flash-latest';
    return {
      primaryModelId,
      fallbackModelIds: fallbackModelIds.filter((id) => id !== primaryModelId),
      reason: 'vision',
      provider: isGemini(primaryModelId) ? 'gemini' : 'openrouter',
      hasVisionSupport: true,
      selectionSource: (gemini || fallbackModelIds.length) ? 'vision_default' : 'fallback_default',
    };
  }

  // Coding Desk Auto: Gemini by default; escalate only when turn signals justify it.
  if (autoSelected && isCodingDeskTurn(input)) {
    const resolved = resolveCodingDeskModel({
      task: 'coding',
      message: input.message,
      hasVFS: Boolean(input.hasVFS),
      refineMode: Boolean(input.refineMode),
      availableModels: models,
      qualityHints: input.qualityHints || null,
      allowPaid: Boolean(input.allowPaid),
    });
    // Order the failover chain by finish-reliability (measured outcomes first,
    // a finish prior only until a model is proven), NOT by model name. This is
    // what keeps a fast, reliable Gemini ahead of an unproven slow *:free coder
    // — the pairing that historically blew the 135s deadline — while letting a
    // paid coder climb the chain the moment it earns it on real outcomes.
    // Gemini free-tier is always retained as the last-resort safety net.
    const fallbackModelIds = rankCodingDeskFallbacks(models, {
      primaryId: resolved.modelId,
      allowPaid: Boolean(input.allowPaid),
    });
    return {
      primaryModelId: resolved.modelId,
      fallbackModelIds,
      reason: 'build',
      provider: resolved.modelId.startsWith('gemini') ? 'gemini' : 'openrouter',
      hasVisionSupport: resolved.modelId.startsWith('gemini'),
      selectionSource: 'coding_desk_auto',
    };
  }

  const primary = chooseBestFreeModel(models, input.message, input.arenaPrefs).model;
  const fallbacks = rankFreeModels(models, input.message, input.arenaPrefs)
    .filter((model) => model.id !== primary?.id)
    .map((model) => model.id);

  return {
    primaryModelId: primary?.id || 'gemini-flash-latest',
    fallbackModelIds: fallbacks,
    reason: isCodingDeskTurn(input) ? 'build' : 'speed',
    provider: (primary?.id || 'gemini-flash-latest').startsWith('gemini') ? 'gemini' : 'openrouter',
    hasVisionSupport: (primary?.id || 'gemini-flash-latest').startsWith('gemini'),
    selectionSource: primary ? 'ranked_free' : 'fallback_default',
  };
}
