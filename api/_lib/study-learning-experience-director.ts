import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import type { StudyActiveLearningContext } from './study-active-learning-context.js';
import type { StudyLearnerModel } from './study-learner-model.js';
import type { StudyLearningIntervention } from './study-learning-intervention.js';
import { planStudyMisconceptionRepair } from './study-misconception-repair-engine.js';

export const STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION = 'study-learning-experience-director-2026-09-09.2';

export type StudyExperienceTeachingStrategy =
  | 'retrieval_practice'
  | 'misconception_repair'
  | 'compare_and_contrast'
  | 'scaffold_then_fade'
  | 'socratic_application'
  | 'transfer_application';

export type StudyExperienceModality =
  | 'text'
  | 'visual'
  | 'interactive'
  | 'worked_example'
  | 'comparison'
  | 'governed_assessment'
  | 'reference'
  | 'request_driven';

export type StudyExperienceInteraction = 'retrieve' | 'predict' | 'calculate' | 'explain' | 'compare';
export type StudyExperienceDensity = 'compressed' | 'standard' | 'expanded';
export type StudyExperienceHintPolicy = 'none' | 'withhold_until_attempt' | 'progressive' | 'fade';
export type StudyExperienceVerification = 'none' | 'fresh_independent' | 'governed_after_teaching' | 'defer_until_due';
export type StudyExperienceDifficulty = 'foundational' | 'standard' | 'advanced';

export type StudyLearningExperiencePlan = {
  version: typeof STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION;
  teachingStrategy: StudyExperienceTeachingStrategy;
  modality: StudyExperienceModality;
  explanationDensity: StudyExperienceDensity;
  interactionType: StudyExperienceInteraction;
  difficulty: StudyExperienceDifficulty;
  hintPolicy: StudyExperienceHintPolicy;
  verificationRequirement: StudyExperienceVerification;
  reasonCodes: string[];
};

type StudyExperienceIntent = 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue';

function capabilityModality(active: StudyActiveLearningContext | null, preference?: 'visual' | 'interactive' | null): StudyExperienceModality | null {
  const capability = active?.representationCapability || null;
  if (!capability) return null;
  if (preference === 'interactive') {
    return capability.representation === 'simulation_or_lab' ? 'interactive' : null;
  }
  if (preference === 'visual') {
    return capability.representation === 'simulation_or_lab' ? 'visual' : 'visual';
  }
  return capability.representation === 'simulation_or_lab' ? 'interactive' : 'visual';
}

function verifiedPlan(
  learnerModel: StudyLearnerModel,
  workingState: StudyWorkingStateSnapshot | null,
  active: StudyActiveLearningContext | null,
  baseDifficulty: StudyExperienceDifficulty,
): StudyLearningExperiencePlan {
  const move = learnerModel.nextLearningMove.type;
  const reasons = [`verified_move:${move}`, learnerModel.nextLearningMove.reasonCode];
  const struggling = workingState?.recentPattern === 'struggle' || workingState?.scaffoldingNeed === 'high';
  const density: StudyExperienceDensity = struggling ? 'compressed' : 'standard';
  const difficulty: StudyExperienceDifficulty = struggling ? 'foundational' : baseDifficulty;
  const hintPolicy: StudyExperienceHintPolicy = workingState?.hintDependence === 'high'
    ? 'fade'
    : struggling ? 'progressive' : 'withhold_until_attempt';

  switch (move) {
    case 'diagnose_misconception': {
      const repair = planStudyMisconceptionRepair(learnerModel);
      if (repair.stage !== 'confirmed') {
        return {
          version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
          teachingStrategy: 'compare_and_contrast',
          modality: 'governed_assessment',
          explanationDensity: 'compressed',
          interactionType: 'compare',
          difficulty,
          hintPolicy: 'none',
          verificationRequirement: 'fresh_independent',
          reasonCodes: [...reasons, repair.reasonCode],
        };
      }
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'misconception_repair',
        modality: 'comparison',
        explanationDensity: density,
        interactionType: 'compare',
        difficulty,
        hintPolicy,
        verificationRequirement: 'governed_after_teaching',
        reasonCodes: [...reasons, repair.reasonCode],
      };
    }
    case 'confirm_misconception':
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'compare_and_contrast',
        modality: 'governed_assessment',
        explanationDensity: 'compressed',
        interactionType: 'compare',
        difficulty,
        hintPolicy: 'none',
        verificationRequirement: 'fresh_independent',
        reasonCodes: reasons,
      };
    case 'guided_repair': {
      const modality = capabilityModality(active, workingState?.representationPreference) || capabilityModality(active) || 'worked_example';
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'scaffold_then_fade',
        modality,
        explanationDensity: density,
        interactionType: modality === 'visual' || modality === 'interactive' ? 'predict' : 'calculate',
        difficulty,
        hintPolicy,
        verificationRequirement: 'governed_after_teaching',
        reasonCodes: reasons,
      };
    }
    case 'vary_evidence':
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'socratic_application',
        modality: 'worked_example',
        explanationDensity: 'standard',
        interactionType: 'calculate',
        difficulty: baseDifficulty,
        hintPolicy: 'withhold_until_attempt',
        verificationRequirement: 'fresh_independent',
        reasonCodes: reasons,
      };
    case 'retention_probe':
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'retrieval_practice',
        modality: 'governed_assessment',
        explanationDensity: 'compressed',
        interactionType: 'retrieve',
        difficulty: baseDifficulty,
        hintPolicy: 'none',
        verificationRequirement: learnerModel.retention.due === false ? 'defer_until_due' : 'fresh_independent',
        reasonCodes: reasons,
      };
    case 'transfer_task':
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'transfer_application',
        modality: 'governed_assessment',
        explanationDensity: 'standard',
        interactionType: 'explain',
        difficulty: baseDifficulty,
        hintPolicy: 'none',
        verificationRequirement: 'fresh_independent',
        reasonCodes: reasons,
      };
    case 'independent_retrieval':
    default:
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'retrieval_practice',
        modality: 'text',
        explanationDensity: 'compressed',
        interactionType: 'retrieve',
        difficulty: baseDifficulty,
        hintPolicy: 'withhold_until_attempt',
        verificationRequirement: 'fresh_independent',
        reasonCodes: reasons,
      };
  }
}

export function teachingStrategyFromLearnerTruth(model: StudyLearnerModel): StudyExperienceTeachingStrategy {
  switch (model.nextLearningMove.type) {
    case 'diagnose_misconception': return planStudyMisconceptionRepair(model).stage === 'confirmed' ? 'misconception_repair' : 'compare_and_contrast';
    case 'confirm_misconception': return 'compare_and_contrast';
    case 'guided_repair': return 'scaffold_then_fade';
    case 'vary_evidence': return 'socratic_application';
    case 'transfer_task': return 'transfer_application';
    case 'retention_probe':
    case 'independent_retrieval':
    default:
      return 'retrieval_practice';
  }
}

export function directStudyLearningExperience(input: {
  intent: StudyExperienceIntent;
  baseDifficulty: StudyExperienceDifficulty;
  learnerModel?: StudyLearnerModel | null;
  workingState?: StudyWorkingStateSnapshot | null;
  activeLearningContext?: StudyActiveLearningContext | null;
  intervention?: StudyLearningIntervention | null;
}): StudyLearningExperiencePlan {
  const learnerModel = input.learnerModel || null;
  const workingState = input.workingState || null;
  const active = input.activeLearningContext || null;
  const intervention = input.intervention || null;

  if (active && (active.mode === 'meta_planning' || active.mode === 'progress_review')) {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'socratic_application',
      modality: 'text',
      explanationDensity: 'standard',
      interactionType: 'explain',
      difficulty: input.baseDifficulty,
      hintPolicy: 'none',
      verificationRequirement: 'none',
      reasonCodes: [`active_mode:${active.mode}`],
    };
  }

  if (active?.explicitRepresentationRequest) {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: learnerModel ? teachingStrategyFromLearnerTruth(learnerModel) : 'socratic_application',
      modality: 'request_driven',
      explanationDensity: workingState?.scaffoldingNeed === 'high' ? 'compressed' : 'standard',
      interactionType: 'explain',
      difficulty: workingState?.recentPattern === 'struggle' ? 'foundational' : input.baseDifficulty,
      hintPolicy: workingState?.hintDependence === 'high' ? 'fade' : 'withhold_until_attempt',
      verificationRequirement: learnerModel ? verifiedPlan(learnerModel, workingState, active, input.baseDifficulty).verificationRequirement : 'none',
      reasonCodes: ['explicit_representation_request'],
    };
  }

  if (learnerModel) return verifiedPlan(learnerModel, workingState, active, input.baseDifficulty);

  if (workingState) {
    const highScaffold = workingState.scaffoldingNeed === 'high'
      || workingState.recentPattern === 'struggle'
      || workingState.misconceptionCandidate === 'possible';
    if (highScaffold) {
      const modality = capabilityModality(active, workingState.representationPreference) || capabilityModality(active) || 'worked_example';
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'scaffold_then_fade',
        modality,
        explanationDensity: 'compressed',
        interactionType: modality === 'visual' || modality === 'interactive' ? 'predict' : 'calculate',
        difficulty: 'foundational',
        hintPolicy: workingState.hintDependence === 'high' ? 'fade' : 'progressive',
        verificationRequirement: 'governed_after_teaching',
        reasonCodes: ['temporary_scaffolding_needed'],
      };
    }

    const preferred = capabilityModality(active, workingState.representationPreference);
    if (preferred) {
      return {
        version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
        teachingStrategy: 'socratic_application',
        modality: preferred,
        explanationDensity: 'standard',
        interactionType: 'predict',
        difficulty: input.baseDifficulty,
        hintPolicy: workingState.hintDependence === 'high' ? 'fade' : 'withhold_until_attempt',
        verificationRequirement: 'none',
        reasonCodes: ['temporary_representation_preference'],
      };
    }
  }

  if (intervention?.action === 'guided_reconstruction') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'scaffold_then_fade',
      modality: 'text',
      explanationDensity: 'compressed',
      interactionType: 'predict',
      difficulty: 'foundational',
      hintPolicy: 'progressive',
      verificationRequirement: 'governed_after_teaching',
      reasonCodes: ['intervention:guided_reconstruction'],
    };
  }
  if (intervention?.action === 'change_representation') {
    const modality = capabilityModality(active) || 'worked_example';
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'scaffold_then_fade',
      modality,
      explanationDensity: 'compressed',
      interactionType: modality === 'visual' || modality === 'interactive' ? 'predict' : 'calculate',
      difficulty: 'foundational',
      hintPolicy: 'progressive',
      verificationRequirement: 'governed_after_teaching',
      reasonCodes: ['intervention:change_representation'],
    };
  }
  if (intervention?.action === 'compress') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'scaffold_then_fade',
      modality: 'text',
      explanationDensity: 'compressed',
      interactionType: 'explain',
      difficulty: 'foundational',
      hintPolicy: 'progressive',
      verificationRequirement: 'none',
      reasonCodes: ['intervention:compress'],
    };
  }
  if (intervention?.action === 'offer_reference') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'socratic_application',
      modality: 'reference',
      explanationDensity: 'standard',
      interactionType: 'retrieve',
      difficulty: input.baseDifficulty,
      hintPolicy: 'none',
      verificationRequirement: 'none',
      reasonCodes: ['intervention:offer_reference'],
    };
  }

  if (input.intent === 'verify' || input.intent === 'diagnose' || input.intent === 'challenge') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'retrieval_practice',
      modality: 'governed_assessment',
      explanationDensity: 'compressed',
      interactionType: 'retrieve',
      difficulty: input.baseDifficulty,
      hintPolicy: 'none',
      verificationRequirement: 'fresh_independent',
      reasonCodes: [`intent:${input.intent}`],
    };
  }
  if (input.intent === 'worked_example') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'scaffold_then_fade',
      modality: 'worked_example',
      explanationDensity: 'standard',
      interactionType: 'calculate',
      difficulty: input.baseDifficulty,
      hintPolicy: 'withhold_until_attempt',
      verificationRequirement: 'none',
      reasonCodes: ['intent:worked_example'],
    };
  }
  if (input.intent === 'practice') {
    return {
      version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
      teachingStrategy: 'retrieval_practice',
      modality: 'text',
      explanationDensity: 'compressed',
      interactionType: 'retrieve',
      difficulty: input.baseDifficulty,
      hintPolicy: 'withhold_until_attempt',
      verificationRequirement: 'fresh_independent',
      reasonCodes: ['intent:practice'],
    };
  }

  return {
    version: STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
    teachingStrategy: 'socratic_application',
    modality: 'text',
    explanationDensity: 'standard',
    interactionType: 'explain',
    difficulty: input.baseDifficulty,
    hintPolicy: 'withhold_until_attempt',
    verificationRequirement: 'none',
    reasonCodes: ['default_teaching'],
  };
}
