import { chooseBestFreeModel, rankFreeModels } from '../../model-routing.js';
import {
  isCodingDeskAutoSelection,
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
    const gemini = models.find((model) => typeof model.id === 'string' && model.id.startsWith('gemini') && model.available !== false);
    return {
      primaryModelId: gemini?.id || 'gemini-flash-latest',
      fallbackModelIds: rankFreeModels(models, input.message, input.arenaPrefs)
        .filter((model) => !model.id.startsWith('gemini') && model.available !== false)
        .map((model) => model.id),
      reason: 'vision',
      provider: 'gemini',
      hasVisionSupport: true,
      selectionSource: gemini ? 'vision_default' : 'fallback_default',
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
    const fallbackModelIds = rankFreeModels(models, input.message, input.arenaPrefs)
      .filter((model) => model.id !== resolved.modelId && model.available !== false)
      .map((model) => model.id);
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
