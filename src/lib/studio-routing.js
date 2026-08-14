import { chooseBestFreeModel, classifyTask, rankFreeModels } from './model-routing.js';

const DEFAULT_MODEL = {
  id: 'gemini-flash-latest',
  name: 'Gemini Flash',
  pricingKind: 'free-tier',
  available: true,
};

export function resolveStudioRouting({
  availableModels,
  visibleText,
  selectedModel,
  autoSelectEnabled,
  arenaPrefs,
  pendingImages = [],
}) {
  const taskCategory = pendingImages.length ? 'vision' : classifyTask(visibleText);
  const autoChoice = autoSelectEnabled ? chooseBestFreeModel(availableModels, visibleText, arenaPrefs) : null;
  const targetModel = autoChoice?.model || selectedModel || DEFAULT_MODEL;
  const rankedFreeFallbacks = rankFreeModels(availableModels, visibleText, arenaPrefs)
    .filter((model) => model.id !== targetModel.id);

  return {
    taskCategory,
    autoChoice,
    targetModel,
    rankedFreeFallbacks,
  };
}

export function buildStudioRoutingNote({ autoChoice, targetModel }) {
  if (!autoChoice?.model || !targetModel?.name) return null;
  return `Quantora chose ${targetModel.name} because ${autoChoice.reason}.`;
}
