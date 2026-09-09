import type { StudyLearnerModel } from './study-learner-model.js';

export const STUDY_MISCONCEPTION_REPAIR_ENGINE_VERSION = 'study-misconception-repair-engine-2026-09-09.1';

export type StudyMisconceptionRepairStage = 'none' | 'candidate' | 'confirmed';

export type StudyMisconceptionRepairPlan = {
  version: typeof STUDY_MISCONCEPTION_REPAIR_ENGINE_VERSION;
  stage: StudyMisconceptionRepairStage;
  code: StudyLearnerModel['misconception']['code'];
  reasonCode: 'no_active_misconception' | 'candidate_requires_discriminating_probe' | 'confirmed_by_repeated_targeted_evidence';
};

/**
 * Interpret the existing verified learner projection without creating another
 * learner-truth store. One reviewed distractor is a candidate only. Repeated
 * fresh targeted evidence is required before targeted repair may begin.
 */
export function planStudyMisconceptionRepair(
  learnerModel: StudyLearnerModel | null | undefined,
): StudyMisconceptionRepairPlan {
  const misconception = learnerModel?.misconception || null;
  if (!misconception?.code || misconception.state === 'none_observed') {
    return {
      version: STUDY_MISCONCEPTION_REPAIR_ENGINE_VERSION,
      stage: 'none',
      code: null,
      reasonCode: 'no_active_misconception',
    };
  }

  if (misconception.state === 'signal_observed' && misconception.signalCount >= 2) {
    return {
      version: STUDY_MISCONCEPTION_REPAIR_ENGINE_VERSION,
      stage: 'confirmed',
      code: misconception.code,
      reasonCode: 'confirmed_by_repeated_targeted_evidence',
    };
  }

  return {
    version: STUDY_MISCONCEPTION_REPAIR_ENGINE_VERSION,
    stage: 'candidate',
    code: misconception.code,
    reasonCode: 'candidate_requires_discriminating_probe',
  };
}
