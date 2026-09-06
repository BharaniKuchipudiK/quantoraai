import type { StudyLearnerModel } from './study-learner-model.js';
import {
  resolveStudyRepresentationCapabilityForConcept,
  type StudyRepresentationCapability,
} from './study-representation-capabilities.js';

export const STUDY_ACTIVE_LEARNING_CONTEXT_VERSION = 'study-active-learning-context-2026-09-07.1';

export type StudyActiveLearningMode =
  | 'concept_teaching'
  | 'meta_planning'
  | 'progress_review'
  | 'assessment'
  | 'continuation';

export type StudyConceptResolutionSource =
  | 'verified_learner_model'
  | 'semantic_fallback'
  | 'none';

export type StudyActiveLearningContext = {
  version: typeof STUDY_ACTIVE_LEARNING_CONTEXT_VERSION;
  mode: StudyActiveLearningMode;
  concept: {
    id: string | null;
    key: string | null;
    label: string | null;
    source: StudyConceptResolutionSource;
    confidence: 'canonical' | 'fallback' | 'none';
  };
  learnerState: {
    understanding: StudyLearnerModel['understanding']['state'] | null;
    misconception: StudyLearnerModel['misconception']['state'] | null;
    retention: StudyLearnerModel['retention']['state'] | null;
    transfer: NonNullable<StudyLearnerModel['transfer']>['state'] | null;
    nextLearningMove: StudyLearnerModel['nextLearningMove']['type'] | null;
  };
  explicitRepresentationRequest: boolean;
  representationCapability: StudyRepresentationCapability | null;
  allowAutomaticSubjectVisual: boolean;
};

const PROGRESS_RE = /\b(?:gaps? in my study|study gaps?|learning gaps?|weak(?:ness|nesses)?|strengths?|where am i weak|what am i missing|based on (?:our|this) conversation|how am i doing|progress review|assess my progress)\b/i;
const REPRESENTATION_RE = /\b(?:image|images|picture|pictures|diagram|diagrams|visual|visually|graph|plot|chart|animation|animate|simulation|interactive|worked example|step[- ]by[- ]step|story|analogy|compare|comparison)\b/i;

function modeFor(intent: string, message: string): StudyActiveLearningMode {
  if (intent === 'plan') return 'meta_planning';
  if (PROGRESS_RE.test(message)) return 'progress_review';
  if (intent === 'verify' || intent === 'diagnose' || intent === 'practice' || intent === 'challenge') return 'assessment';
  if (intent === 'continue') return 'continuation';
  return 'concept_teaching';
}

/**
 * One transient semantic control-plane object for a Study turn.
 *
 * This is NOT learner truth and never writes state. Canonical concept identity
 * comes from the existing verified learner model when available. Free text is
 * retained only as a bounded discovery fallback so downstream representation
 * planning does not repeatedly reinterpret the transcript.
 */
export function buildStudyActiveLearningContext(input: {
  intent: string;
  message?: string | null;
  contextText?: string | null;
  learnerModel?: StudyLearnerModel | null;
}): StudyActiveLearningContext {
  const message = String(input.message || '').trim();
  const contextText = String(input.contextText || '').trim();
  const learnerModel = input.learnerModel || null;
  const mode = modeFor(input.intent, message);
  const conceptId = learnerModel?.concept.id || null;
  const conceptKey = learnerModel?.concept.key || null;
  const conceptLabel = contextText || null;
  const source: StudyConceptResolutionSource = conceptId || conceptKey
    ? 'verified_learner_model'
    : conceptLabel && mode !== 'meta_planning' && mode !== 'progress_review'
      ? 'semantic_fallback'
      : 'none';
  const capability = mode === 'meta_planning' || mode === 'progress_review'
    ? null
    : resolveStudyRepresentationCapabilityForConcept({
        conceptKey,
        conceptLabel,
        fallbackText: `${contextText}\n${message}`.trim(),
      });

  return {
    version: STUDY_ACTIVE_LEARNING_CONTEXT_VERSION,
    mode,
    concept: {
      id: conceptId,
      key: conceptKey,
      label: conceptLabel,
      source,
      confidence: conceptId || conceptKey ? 'canonical' : source === 'semantic_fallback' ? 'fallback' : 'none',
    },
    learnerState: {
      understanding: learnerModel?.understanding.state || null,
      misconception: learnerModel?.misconception.state || null,
      retention: learnerModel?.retention.state || null,
      transfer: learnerModel?.transfer?.state || null,
      nextLearningMove: learnerModel?.nextLearningMove.type || null,
    },
    explicitRepresentationRequest: REPRESENTATION_RE.test(message),
    representationCapability: capability,
    allowAutomaticSubjectVisual: Boolean(capability) && mode !== 'meta_planning' && mode !== 'progress_review',
  };
}
