import { estimateStudyMastery } from './study-mastery-estimator.js';
import { buildStudyLearnerModel, type StudyLearnerModel } from './study-learner-model.js';
import { readStudyMasteryEvidence, resolveActiveStudyConcept } from './store.js';

export const STUDY_ADAPTIVE_LEARNING_VERSION = 'study-adaptive-learning-2026-08-29.1';

export type StudyRequestContext = { conceptKey: string; conceptLabel: string };

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Server repeats the Study guard; a forged payload cannot activate elsewhere. */
export function normalizeStudyRequestContext(value: unknown, studioDomain: string | null): StudyRequestContext | null {
  if (studioDomain !== 'education') return null;
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const conceptKey = clean(input.conceptKey, 160).toLowerCase();
  const conceptLabel = clean(input.conceptLabel, 300);
  if (!conceptLabel) return null;
  return { conceptKey, conceptLabel };
}

export type StudyTeachingStrategy =
  | 'retrieval_practice'
  | 'misconception_repair'
  | 'compare_and_contrast'
  | 'scaffold_then_fade'
  | 'socratic_application'
  | 'transfer_application';

export function teachingStrategyFor(model: StudyLearnerModel): StudyTeachingStrategy {
  switch (model.nextLearningMove.type) {
    case 'diagnose_misconception': return 'misconception_repair';
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

export async function loadStudyLearnerModel(input: {
  studioDomain: string | null;
  userSub?: string | null;
  memoryConsented?: boolean;
  studyContext: StudyRequestContext | null;
}): Promise<StudyLearnerModel | null> {
  if (input.studioDomain !== 'education' || !input.userSub || input.memoryConsented !== true || !input.studyContext) return null;
  const concept = await resolveActiveStudyConcept(input.studyContext);
  if (!concept || concept === 'unavailable') return null;
  const evidence = await readStudyMasteryEvidence(input.userSub, concept.id);
  if (!evidence) return null;
  const estimate = estimateStudyMastery(evidence);
  return buildStudyLearnerModel({ conceptId: concept.id, conceptKey: concept.canonicalKey, evidence, estimate });
}

export function formatStudyAdaptiveDirective(model: StudyLearnerModel | null): string {
  if (!model) return '';
  const strategy = teachingStrategyFor(model);
  return `\n\nSTUDY ADAPTIVE LEARNING (${STUDY_ADAPTIVE_LEARNING_VERSION})
This evidence-backed learner state applies only to the active Study concept.
- Understanding: ${model.understanding.state}; verified evidence: ${model.understanding.evidenceCount}; evidence kinds: ${model.understanding.evidenceKinds.join(', ') || 'none'}
- Misconception state: ${model.misconception.state}
- Retention: ${model.retention.state}
- Next learning move: ${model.nextLearningMove.type}
- Teaching strategy: ${strategy}
Execute the next learning move using that strategy. Do not claim stronger understanding than the evidence state. Do not repeat the previous representation when the move calls for repair or confirmation. Ask at most one focused learner check, then wait.`;
}

export function publicStudyAdaptiveMetadata(model: StudyLearnerModel | null) {
  if (!model) return undefined;
  return {
    version: STUDY_ADAPTIVE_LEARNING_VERSION,
    understanding: model.understanding.state,
    misconception: model.misconception.state,
    retention: model.retention.state,
    nextLearningMove: model.nextLearningMove.type,
    teachingStrategy: teachingStrategyFor(model),
  };
}
