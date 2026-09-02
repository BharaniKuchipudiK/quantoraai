import type { StudyTeachingRepresentationPlan } from './study-teaching-representation.js';
import type { StudyLearningIntervention } from './study-learning-intervention.js';

export const STUDY_ADAPTIVE_LESSON_LOOP_VERSION = 'study-adaptive-lesson-loop-2026-09-02.1';

export type StudyTeachingBeat = 'HOOK' | 'PREDICT' | 'SEE' | 'EXPLAIN' | 'TRY' | 'VERIFY' | 'EXAM_READY';

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
    | 'explicit_representation'
    | 'direct_explanation';
};

export function planStudyAdaptiveLessonLoop(input: {
  intent: 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue';
  representation: StudyTeachingRepresentationPlan;
  intervention: StudyLearningIntervention;
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

  if (intent === 'practice' || intent === 'continue') {
    return {
      version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
      beats: ['TRY'],
      mustWaitForLearner: true,
      maxLearnerQuestions: 1,
      reason: 'practice',
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

  return {
    version: STUDY_ADAPTIVE_LESSON_LOOP_VERSION,
    beats: ['EXPLAIN'],
    mustWaitForLearner: false,
    maxLearnerQuestions: 0,
    reason: 'direct_explanation',
  };
}
