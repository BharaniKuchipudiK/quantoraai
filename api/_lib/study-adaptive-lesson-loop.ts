import type { StudyTeachingRepresentationPlan } from './study-teaching-representation.js';
import type { StudyLearningIntervention } from './study-learning-intervention.js';
import type { StudyLearningExperiencePlan } from './study-learning-experience-director.js';

export const STUDY_ADAPTIVE_LESSON_LOOP_VERSION = 'study-adaptive-lesson-loop-2026-09-09.2';

export type StudyTeachingBeat = 'HOOK' | 'PREDICT' | 'SEE' | 'CONFRONT' | 'EXPLAIN' | 'TRY' | 'VERIFY' | 'EXAM_READY';

export type StudyAdaptiveLessonLoopPlan = {
  version: typeof STUDY_ADAPTIVE_LESSON_LOOP_VERSION;
  beats: StudyTeachingBeat[];
  mustWaitForLearner: boolean;
  maxLearnerQuestions: 0 | 1;
  reason:
    | 'guided_reconstruction'
    | 'representation_change'
    | 'first_struggle'
    | 'practice'
    | 'verification'
    | 'prediction_first'
    | 'continuation_policy'
    | 'explicit_representation'
    | 'experience_director'
    | 'verified_learner_state'
    | 'direct_explanation';
};

function predictionFirstEligible(input: {
  intent: string;
  representation: StudyTeachingRepresentationPlan;
  intervention: StudyLearningIntervention;
  experiencePlan?: StudyLearningExperiencePlan | null;
}): boolean {
  if (input.intent !== 'explain' && input.intent !== 'worked_example') return false;
  if (input.intervention.state !== 'stable') return false;
  if (input.representation.requestedMode !== null) return false;
  if (input.representation.reason === 'verified_learner_state') return false;
  if (input.experiencePlan?.reasonCodes.includes('temporary_representation_preference')) return false;
  if (input.intervention.predictionEligible !== true) return false;
  const verification = input.experiencePlan?.verificationRequirement;
  return verification !== 'fresh_independent'
    && verification !== 'governed_after_teaching'
    && verification !== 'defer_until_due';
}

export function planStudyAdaptiveLessonLoop(input: {
  intent: 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue';
  representation: StudyTeachingRepresentationPlan;
  intervention: StudyLearningIntervention;
  experiencePlan?: StudyLearningExperiencePlan | null;
}): StudyAdaptiveLessonLoopPlan {
  const { intent, representation, intervention } = input;

  if (intervention.action === 'guided_reconstruction') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: representation.rendererRequired ? ['SEE', 'PREDICT'] : ['PREDICT'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'guided_reconstruction',
    };
  }

  if (intervention.action === 'change_representation') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: representation.rendererRequired ? ['SEE', 'PREDICT'] : ['EXPLAIN', 'TRY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'representation_change',
    };
  }

  if (intervention.action === 'compress') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['EXPLAIN', 'TRY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'first_struggle',
    };
  }

  if (intent === 'practice') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['TRY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'practice',
    };
  }

  if (intent === 'continue') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: [],
      mustWaitForLearner: false,
      maxLearnerQuestions: 0,
      reason: 'continuation_policy',
    };
  }

  if (intent === 'verify' || intent === 'diagnose' || intent === 'challenge') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['VERIFY', 'TRY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'verification',
    };
  }

  if (intervention.predictionPromptSeen && (intent === 'explain' || intent === 'worked_example')) {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['SEE', 'CONFRONT', 'EXPLAIN', 'VERIFY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'prediction_first',
    };
  }

  if (predictionFirstEligible(input)) {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['PREDICT'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'prediction_first',
    };
  }

  if (representation.reason === 'explicit_request') {
    const beats: StudyTeachingBeat[] = representation.rendererRequired
      ? ['SEE', 'EXPLAIN']
      : representation.primaryRepresentation === 'worked_example'
        ? ['EXPLAIN']
        : representation.primaryRepresentation === 'reference'
          ? ['EXPLAIN']
          : ['EXPLAIN'];
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats,
      mustWaitForLearner: false,
      maxLearnerQuestions: 0,
      reason: 'explicit_representation',
    };
  }

  if (representation.reason === 'experience_director' && input.experiencePlan) {
    const verificationNow = input.experiencePlan.verificationRequirement === 'fresh_independent'
      || input.experiencePlan.verificationRequirement === 'governed_after_teaching';
    const beats: StudyTeachingBeat[] = verificationNow
      ? representation.rendererRequired
        ? ['SEE', 'PREDICT']
        : representation.primaryRepresentation === 'governed_assessment'
          || representation.primaryRepresentation === 'interactive_probe'
          ? ['TRY']
          : ['EXPLAIN', 'TRY']
      : representation.rendererRequired
        ? ['SEE', 'EXPLAIN']
        : ['EXPLAIN'];
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats,
      mustWaitForLearner: verificationNow,
      maxLearnerQuestions: verificationNow ? 1 : 0,
      reason: 'experience_director',
    };
  }

  if (representation.reason === 'verified_learner_state') {
    const beats: StudyTeachingBeat[] = representation.rendererRequired
      ? ['SEE', 'PREDICT']
      : representation.primaryRepresentation === 'interactive_probe'
        || representation.primaryRepresentation === 'governed_assessment'
        ? ['TRY']
        : ['EXPLAIN', 'TRY'];
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats,
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'verified_learner_state',
    };
  }

  return {
    version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
    beats: ['EXPLAIN'],
    mustWaitForLearner: false,
    maxLearnerQuestions: 0,
    reason: 'direct_explanation',
  };
}
