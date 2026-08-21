import { chooseBestFreeModel, rankFreeModels } from '../../model-routing.js';
import type { RoutingDecision } from './model-router';

type ModelLike = {
  id: string;
  name?: string;
  available?: boolean;
  pricingKind?: string;
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
  arenaPrefs?: unknown;
};

export function selectModelsForTurn(input: SelectModelsInput): RoutingDecision {
  const models = Array.isArray(input.models) ? input.models : [];
  const explicit = input.explicitModelId ? models.find((model) => model.id === input.explicitModelId) : null;
  if (explicit) {
    const fallbackModelIds = rankFreeModels(models, input.message, input.arenaPrefs)
      .filter((model) => model.id !== explicit.id && model.available !== false)
      .map((model) => model.id);
    return {
      primaryModelId: explicit.id,
      fallbackModelIds,
      reason: input.hasImages ? 'vision' : input.studioMode === 'build' || input.guidedBuild || input.refineMode ? 'build' : 'quality',
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

  const primary = chooseBestFreeModel(models, input.message, input.arenaPrefs).model;
  const fallbacks = rankFreeModels(models, input.message, input.arenaPrefs)
    .filter((model) => model.id !== primary?.id)
    .map((model) => model.id);

  return {
    primaryModelId: primary?.id || 'openrouter/free',
    fallbackModelIds: fallbacks,
    reason: input.studioMode === 'build' || input.guidedBuild || input.refineMode ? 'build' : 'speed',
    provider: (primary?.id || 'openrouter/free').startsWith('gemini') ? 'gemini' : 'openrouter',
    hasVisionSupport: (primary?.id || 'openrouter/free').startsWith('gemini'),
    selectionSource: primary ? 'ranked_free' : 'fallback_default',
  };
}
