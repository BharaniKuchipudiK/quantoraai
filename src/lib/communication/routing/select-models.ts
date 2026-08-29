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

/**
 * The rungs that can actually serve an image turn.
 *
 * Vision capability is READ from the catalogue (see discoverAnthropicFlagships),
 * never inferred from an id: a model earns a rung here by declaring it. Anything
 * that does not declare vision is dropped downstream by capabilitiesFor, so
 * offering it builds a ladder with no rungs on it.
 */
function visionRungsFor(ready: ModelLike[], input: SelectModelsInput): string[] {
  const isGemini = (id: string) => id.startsWith('gemini');
  const declaresVision = (model: ModelLike) => model.vision === true && !isGemini(model.id);
  const paid = input.allowPaid ? ready.filter(declaresVision).map((model) => model.id) : [];
  const free = rankFreeModels(ready, input.message, input.arenaPrefs)
    .filter((model) => declaresVision(model as ModelLike))
    .map((model) => model.id);
  return [...new Set([...paid, ...free])];
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
    /*
     * An image turn on a PINNED model needs the same vision-capable ladder as
     * Auto. This branch returns before the vision block below, so it kept the
     * original single-route failure: fallbacks came from rankFreeModels, the
     * capability filter dropped every one of them for not declaring vision, and
     * a paid vision model the session pays for was never attempted. Pin Gemini,
     * attach an image, lose Gemini, and the turn had nowhere to go.
     *
     * The pinned model stays primary either way - the user's choice is not
     * overridden, it is backed up.
     */
    const readyForExplicit = models.filter((model) => typeof model?.id === 'string' && model.available !== false);
    const fallbackModelIds = (input.hasImages
      ? visionRungsFor(readyForExplicit, input)
      : rankFreeModels(models, input.message, input.arenaPrefs)
        .filter((model) => model.available !== false)
        .map((model) => model.id)
    ).filter((id) => id !== explicit.id);
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
    const fallbackModelIds = visionRungsFor(ready, input);

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
