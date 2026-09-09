import { resolveStudyRepresentationCapability } from './study-representation-capabilities.js';

export const STUDY_LEARNING_INTERVENTION_VERSION = 'study-learning-intervention-2026-09-09.4';

export type StudyLearningInterventionState = 'stable' | 'struggling' | 'blocked' | 'prerequisite_gap';
export type StudyLearningInterventionAction =
  | 'continue'
  | 'compress'
  | 'change_representation'
  | 'rewind_prerequisite'
  | 'guided_reconstruction'
  | 'offer_reference';

export type StudyLearningIntervention = {
  version: typeof STUDY_LEARNING_INTERVENTION_VERSION;
  state: StudyLearningInterventionState;
  action: StudyLearningInterventionAction;
  struggleSignals: number;
  representationRequests: number;
  predictionPromptSeen?: boolean;
  predictionEligible?: boolean;
  reason: 'none' | 'single_struggle' | 'repeated_struggle' | 'representation_failure' | 'verified_prerequisite_gap';
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };

const STRUGGLE_RE = /\b(?:i\s+(?:still\s+)?(?:don'?t|do not)\s+(?:understand|get(?:\s+it)?|know)|i\s+don'?t\s+know|confused|lost|not getting it|too hard|difficult to understand|doesn['’]?t make sense)\b/i;
const SIMPLIFY_RE = /\b(?:make it easy|make it easier|simplify|simpler|plain english|from basics?|start from basics?|explain again|another way)\b/i;
const REPRESENTATION_RE = /\b(?:image|images|picture|diagram|visual(?:ly)?|graph|animation|animate|gif|story|storytelling|analogy|example|step[- ]by[- ]step)\b/i;
const REFERENCE_RE = /\b(?:reference|resource|video|book|notes|material|study material|where can i learn)\b/i;
const PREDICTION_PROMPT_RE = /\b(?:predict(?:ion)? first|what do you (?:predict|think will happen)|before i explain[^?]{0,80}what do you think|make a prediction)\b/i;
const PREDICTION_RENDERERS = new Set([
  'physics-motion',
  'newton-lab',
  'linear-function-lab',
  'electricity-circuit',
  'field-lines',
  'graph',
  'process-flow',
  'before-after',
]);

function textOf(item: HistoryItem): string {
  return String(item?.text || item?.content || '').trim();
}

function isLearner(item: HistoryItem): boolean {
  return item?.sender === 'user' || item?.role === 'user' || (!item?.sender && !item?.role);
}

function isAssistant(item: HistoryItem): boolean {
  return item?.sender === 'ai' || item?.role === 'assistant' || item?.role === 'model';
}

function predictionPromptSeen(history: HistoryItem[]): boolean {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (!isAssistant(item)) continue;
    const text = textOf(item);
    if (!text) continue;
    return PREDICTION_PROMPT_RE.test(text);
  }
  return false;
}

export function evaluateStudyLearningIntervention(input: {
  message?: string | null;
  history?: HistoryItem[];
  verifiedPrerequisiteGap?: boolean;
}): StudyLearningIntervention {
  const history = Array.isArray(input.history) ? input.history : [];
  const priorPredictionPrompt = predictionPromptSeen(history);
  const current = String(input.message || '').trim();
  const learnerTurns = [...history, { role: 'user', text: current }]
    .filter(isLearner)
    .map(textOf)
    .filter(Boolean)
    .slice(-8);
  const capability = resolveStudyRepresentationCapability(current);
  const predictionEligible = Boolean(capability?.rendererKind && PREDICTION_RENDERERS.has(capability.rendererKind));

  if (input.verifiedPrerequisiteGap === true) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'prerequisite_gap',
      action: 'rewind_prerequisite',
      struggleSignals: 0,
      representationRequests: 0,
      predictionPromptSeen: priorPredictionPrompt,
      predictionEligible,
      reason: 'verified_prerequisite_gap',
    };
  }

  let struggleSignals = 0;
  let representationRequests = 0;
  let referenceRequests = 0;
  for (const turn of learnerTurns) {
    if (STRUGGLE_RE.test(turn) || SIMPLIFY_RE.test(turn)) struggleSignals += 1;
    if (REPRESENTATION_RE.test(turn)) representationRequests += 1;
    if (REFERENCE_RE.test(turn)) referenceRequests += 1;
  }

  if (struggleSignals >= 2 && representationRequests >= 2) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'blocked',
      action: 'guided_reconstruction',
      struggleSignals,
      representationRequests,
      predictionPromptSeen: priorPredictionPrompt,
      predictionEligible,
      reason: 'representation_failure',
    };
  }

  if (struggleSignals >= 3) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'blocked',
      action: 'change_representation',
      struggleSignals,
      representationRequests,
      predictionPromptSeen: priorPredictionPrompt,
      predictionEligible,
      reason: 'repeated_struggle',
    };
  }

  if (struggleSignals >= 2 || (struggleSignals >= 1 && representationRequests >= 2)) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'struggling',
      action: 'change_representation',
      struggleSignals,
      representationRequests,
      predictionPromptSeen: priorPredictionPrompt,
      predictionEligible,
      reason: representationRequests >= 2 ? 'representation_failure' : 'repeated_struggle',
    };
  }

  if (struggleSignals === 1) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'struggling',
      action: referenceRequests > 0 ? 'offer_reference' : 'compress',
      struggleSignals,
      representationRequests,
      predictionPromptSeen: priorPredictionPrompt,
      predictionEligible,
      reason: 'single_struggle',
    };
  }

  return {
    version: STUDY_LEARNING_INTERVENTION_VERSION,
    state: 'stable',
    action: 'continue',
    struggleSignals,
    representationRequests,
    predictionPromptSeen: priorPredictionPrompt,
    predictionEligible,
    reason: 'none',
  };
}
