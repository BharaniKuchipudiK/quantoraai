import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import type { StudyActiveLearningContext } from './study-active-learning-context.js';
import type {
  StudyExperienceDifficulty,
  StudyLearningExperiencePlan,
} from './study-learning-experience-director.js';
import type { StudyLearnerModel } from './study-learner-model.js';
import type { StudyLearningIntervention } from './study-learning-intervention.js';
import { planStudyMisconceptionRepair } from './study-misconception-repair-engine.js';

export const STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION = 'study-adaptive-difficulty-controller-2026-09-09.3';

export type StudyDifficultyAction = 'reduce' | 'maintain' | 'increase';
export type StudyScaffoldingAction = 'add' | 'maintain' | 'remove';
export type StudyRepresentationAction = 'maintain' | 'change';
export type StudyPracticeMode = 'recognition' | 'retrieval' | 'routine' | 'application';

export type StudyAdaptiveDifficultyPlan = {
  version: typeof STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION;
  difficultyAction: StudyDifficultyAction;
  scaffoldingAction: StudyScaffoldingAction;
  representationAction: StudyRepresentationAction;
  practiceMode: StudyPracticeMode;
  reasonCodes: string[];
};

function plan(input: Omit<StudyAdaptiveDifficultyPlan, 'version'>): StudyAdaptiveDifficultyPlan {
  return { version: STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION, ...input };
}

function varyEvidenceMode(model: StudyLearnerModel): StudyPracticeMode {
  const kinds = new Set(model.understanding.evidenceKinds);
  if (!kinds.has('retrieval')) return 'retrieval';
  if (!kinds.has('application')) return 'application';
  return 'retrieval';
}

function verifiedBasePlan(model: StudyLearnerModel | null): { plan: StudyAdaptiveDifficultyPlan; independentEvidenceLocked: boolean } {
  if (!model) {
    return {
      plan: plan({
        difficultyAction: 'maintain',
        scaffoldingAction: 'maintain',
        representationAction: 'maintain',
        practiceMode: 'routine',
        reasonCodes: ['no_verified_difficulty_evidence'],
      }),
      independentEvidenceLocked: false,
    };
  }

  const repair = planStudyMisconceptionRepair(model);
  if (repair.stage === 'candidate') {
    return {
      plan: plan({
        difficultyAction: 'maintain',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode: 'recognition',
        reasonCodes: ['misconception_candidate_probe_locked'],
      }),
      independentEvidenceLocked: true,
    };
  }
  if (repair.stage === 'confirmed') {
    return {
      plan: plan({
        difficultyAction: 'reduce',
        scaffoldingAction: 'add',
        representationAction: 'maintain',
        practiceMode: 'recognition',
        reasonCodes: ['confirmed_misconception_targeted_repair'],
      }),
      independentEvidenceLocked: false,
    };
  }

  const move = model.nextLearningMove.type;
  if (move === 'guided_repair') {
    return {
      plan: plan({
        difficultyAction: 'reduce',
        scaffoldingAction: 'add',
        representationAction: 'maintain',
        practiceMode: 'recognition',
        reasonCodes: ['verified_guided_repair'],
      }),
      independentEvidenceLocked: false,
    };
  }
  if (move === 'independent_retrieval') {
    return {
      plan: plan({
        difficultyAction: 'maintain',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode: 'retrieval',
        reasonCodes: ['verified_independent_retrieval'],
      }),
      independentEvidenceLocked: true,
    };
  }
  if (move === 'vary_evidence') {
    const practiceMode = varyEvidenceMode(model);
    return {
      plan: plan({
        difficultyAction: 'maintain',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode,
        reasonCodes: [`verified_vary_evidence:${practiceMode}`],
      }),
      independentEvidenceLocked: true,
    };
  }
  if (move === 'retention_probe') {
    return {
      plan: plan({
        difficultyAction: 'maintain',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode: 'retrieval',
        reasonCodes: ['verified_retention_probe'],
      }),
      independentEvidenceLocked: true,
    };
  }
  if (move === 'transfer_task' && model.transfer.state === 'needs_support') {
    return {
      plan: plan({
        difficultyAction: 'reduce',
        scaffoldingAction: 'add',
        representationAction: 'maintain',
        practiceMode: 'application',
        reasonCodes: ['verified_transfer_needs_support'],
      }),
      independentEvidenceLocked: false,
    };
  }
  if (move === 'transfer_task') {
    return {
      plan: plan({
        difficultyAction: 'increase',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode: 'application',
        reasonCodes: ['verified_transfer_ready'],
      }),
      independentEvidenceLocked: true,
    };
  }

  if (model.understanding.state === 'verified' && model.retention.state === 'supported') {
    return {
      plan: plan({
        difficultyAction: 'increase',
        scaffoldingAction: 'remove',
        representationAction: 'maintain',
        practiceMode: 'application',
        reasonCodes: ['verified_understanding_and_retention'],
      }),
      independentEvidenceLocked: false,
    };
  }

  return {
    plan: plan({
      difficultyAction: 'maintain',
      scaffoldingAction: 'maintain',
      representationAction: 'maintain',
      practiceMode: 'routine',
      reasonCodes: ['insufficient_verified_evidence_to_change'],
    }),
    independentEvidenceLocked: false,
  };
}

function overlaySupport(
  base: StudyAdaptiveDifficultyPlan,
  input: {
    learnerModel: StudyLearnerModel | null;
    workingState: StudyWorkingStateSnapshot | null;
    intervention: StudyLearningIntervention | null;
    independentEvidenceLocked: boolean;
  },
): StudyAdaptiveDifficultyPlan {
  if (input.independentEvidenceLocked) return base;

  const intervention = input.intervention?.action || null;
  if (intervention === 'guided_reconstruction' || intervention === 'change_representation') {
    return plan({
      ...base,
      difficultyAction: 'reduce',
      scaffoldingAction: 'add',
      representationAction: 'change',
      practiceMode: input.learnerModel ? base.practiceMode : 'recognition',
      reasonCodes: [...base.reasonCodes, `intervention:${intervention}`],
    });
  }
  if (intervention === 'compress') {
    return plan({
      ...base,
      difficultyAction: 'reduce',
      scaffoldingAction: 'add',
      practiceMode: input.learnerModel ? base.practiceMode : 'recognition',
      reasonCodes: [...base.reasonCodes, 'intervention:compress'],
    });
  }

  if (input.workingState?.recentPattern === 'struggle' || input.workingState?.scaffoldingNeed === 'high') {
    return plan({
      ...base,
      difficultyAction: 'reduce',
      scaffoldingAction: 'add',
      representationAction: input.workingState.representationPreference ? 'change' : base.representationAction,
      practiceMode: input.learnerModel ? base.practiceMode : 'recognition',
      reasonCodes: [...base.reasonCodes, 'temporary_struggle_pattern'],
    });
  }

  return base;
}

export function controlStudyAdaptiveDifficulty(input: {
  learnerModel?: StudyLearnerModel | null;
  workingState?: StudyWorkingStateSnapshot | null;
  intervention?: StudyLearningIntervention | null;
}): StudyAdaptiveDifficultyPlan {
  const learnerModel = input.learnerModel || null;
  const workingState = input.workingState || null;
  const intervention = input.intervention || null;
  const base = verifiedBasePlan(learnerModel);
  return overlaySupport(base.plan, {
    learnerModel,
    workingState,
    intervention,
    independentEvidenceLocked: base.independentEvidenceLocked,
  });
}

export function applyStudyAdaptiveDifficulty(input: {
  experiencePlan: StudyLearningExperiencePlan;
  difficultyPlan: StudyAdaptiveDifficultyPlan;
  activeLearningContext?: StudyActiveLearningContext | null;
  workingState?: StudyWorkingStateSnapshot | null;
}): StudyLearningExperiencePlan {
  const experience = input.experiencePlan;
  const control = input.difficultyPlan;
  const workingState = input.workingState || null;
  const active = input.activeLearningContext || null;

  const shiftDifficulty = (current: StudyExperienceDifficulty): StudyExperienceDifficulty => {
    if (control.difficultyAction === 'reduce') {
      if (current === 'advanced') return 'standard';
      if (current === 'standard') return 'foundational';
      return 'foundational';
    }
    if (control.difficultyAction === 'increase') {
      // Preserve an explicitly foundational/base-level request rather than
      // silently escalating it above what the learner asked for.
      if (current === 'foundational') return 'foundational';
      if (current === 'standard') return 'advanced';
      return 'advanced';
    }
    return current;
  };

  let modality = experience.modality;
  let interactionType = experience.interactionType;
  let explanationDensity = experience.explanationDensity;
  let hintPolicy = experience.hintPolicy;

  if (control.representationAction === 'change' && modality !== 'request_driven') {
    const capability = active?.representationCapability || null;
    if (capability) modality = capability.representation === 'simulation_or_lab' ? 'interactive' : 'visual';
  }

  if (control.scaffoldingAction === 'add' && experience.verificationRequirement !== 'fresh_independent') {
    explanationDensity = 'compressed';
    if (hintPolicy !== 'none') hintPolicy = workingState?.hintDependence === 'high' ? 'fade' : 'progressive';
  } else if (control.scaffoldingAction === 'remove' && experience.verificationRequirement === 'fresh_independent') {
    hintPolicy = 'none';
  }

  if (control.practiceMode === 'retrieval') {
    interactionType = 'retrieve';
    if (experience.verificationRequirement === 'fresh_independent' && modality === 'worked_example') modality = 'governed_assessment';
  } else if (control.practiceMode === 'application') {
    interactionType = 'explain';
    if (experience.verificationRequirement === 'fresh_independent' && modality === 'worked_example') modality = 'governed_assessment';
  }

  const reasonCodes = [
    ...experience.reasonCodes,
    `difficulty:${control.difficultyAction}`,
    `scaffolding:${control.scaffoldingAction}`,
    `representation:${control.representationAction}`,
    `practice:${control.practiceMode}`,
    ...control.reasonCodes.map((reason) => `difficulty_control:${reason}`),
  ];

  return {
    ...experience,
    difficulty: shiftDifficulty(experience.difficulty),
    modality,
    interactionType,
    explanationDensity,
    hintPolicy,
    reasonCodes: [...new Set(reasonCodes)],
  };
}
