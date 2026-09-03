export const STUDY_LEARNING_INTERVENTION_VERSION = 'study-learning-intervention-2026-09-02.3';

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
  reason: 'none' | 'single_struggle' | 'repeated_struggle' | 'representation_failure' | 'verified_prerequisite_gap';
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };

const STRUGGLE_RE = /\b(?:i\s+(?:still\s+)?(?:don'?t|do not)\s+(?:understand|get(?:\s+it)?|know)|i\s+don'?t\s+know|confused|lost|not getting it|too hard|difficult to understand|doesn['’]?t make sense)\b/i;
const SIMPLIFY_RE = /\b(?:make it easy|make it easier|simplify|simpler|plain english|from basics?|start from basics?|explain again|another way)\b/i;
const REPRESENTATION_RE = /\b(?:image|images|picture|diagram|visual(?:ly)?|graph|animation|animate|gif|story|storytelling|analogy|example|step[- ]by[- ]step)\b/i;
const REFERENCE_RE = /\b(?:reference|resource|video|book|notes|material|study material|where can i learn)\b/i;

function textOf(item: HistoryItem): string {
  return String(item?.text || item?.content || '').trim();
}

function isLearner(item: HistoryItem): boolean {
  return item?.sender === 'user' || item?.role === 'user' || (!item?.sender && !item?.role);
}

export function evaluateStudyLearningIntervention(input: {
  message?: string | null;
  history?: HistoryItem[];
  verifiedPrerequisiteGap?: boolean;
}): StudyLearningIntervention {
  if (input.verifiedPrerequisiteGap === true) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'prerequisite_gap',
      action: 'rewind_prerequisite',
      struggleSignals: 0,
      representationRequests: 0,
      reason: 'verified_prerequisite_gap',
    };
  }

  const current = String(input.message || '').trim();
  const learnerTurns = [...(Array.isArray(input.history) ? input.history : []), { role: 'user', text: current }]
    .filter(isLearner)
    .map(textOf)
    .filter(Boolean)
    .slice(-8);

  let struggleSignals = 0;
  let representationRequests = 0;
  let referenceRequests = 0;
  for (const turn of learnerTurns) {
    if (STRUGGLE_RE.test(turn) || SIMPLIFY_RE.test(turn)) struggleSignals += 1;
    if (REPRESENTATION_RE.test(turn)) representationRequests += 1;
    if (REFERENCE_RE.test(turn)) referenceRequests += 1;
  }

  // Two genuine difficulty signals plus two attempted representation changes
  // means the teaching strategy itself is failing. Escalate to reconstruction
  // instead of cycling through another prose/style rewrite. Representation
  // requests alone never create this state.
  if (struggleSignals >= 2 && representationRequests >= 2) {
    return {
      version: STUDY_LEARNING_INTERVENTION_VERSION,
      state: 'blocked',
      action: 'guided_reconstruction',
      struggleSignals,
      representationRequests,
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
      reason: 'single_struggle',
    };
  }

  return {
    version: STUDY_LEARNING_INTERVENTION_VERSION,
    state: 'stable',
    action: 'continue',
    struggleSignals,
    representationRequests,
    reason: 'none',
  };
}
