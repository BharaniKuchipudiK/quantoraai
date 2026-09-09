import type { StudyLearnerModel } from './study-learner-model.js';
import { emitStudyLearningFlowMetric } from './study-learning-flow-telemetry.js';
import { loadVerifiedStudyLearnerProjection } from './study-learner-projection-loader.js';
import { withStudyTelemetryScope } from './study-observability.js';
import {
  applyStudyPrerequisiteNextBestAction,
  STUDY_NEXT_BEST_ACTION_VERSION,
} from './study-next-best-action.js';
import { resolveActiveStudyConcept } from './store.js';

export const STUDY_ADAPTIVE_LEARNING_VERSION = 'study-adaptive-learning-2026-09-02.9';

export type StudyWorkingStateSnapshot = {
  version: 'study-working-state-v1';
  temporary: true;
  conceptKey: string;
  conceptLabel: string;
  misconceptionCandidate: 'none' | 'possible';
  hintDependence: 'none' | 'emerging' | 'high';
  representationPreference: 'visual' | 'interactive' | null;
  recentPattern: 'neutral' | 'struggle' | 'mixed' | 'success';
  scaffoldingNeed: 'low' | 'moderate' | 'high';
  observedSignals: number;
  reasonCodes: string[];
};

export type StudyRequestContext = {
  conceptKey: string;
  conceptLabel: string;
  workingState?: StudyWorkingStateSnapshot;
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function normalizeWorkingState(value: unknown, conceptKey: string, conceptLabel: string): StudyWorkingStateSnapshot | undefined {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!input || input.version !== 'study-working-state-v1' || input.temporary !== true) return undefined;
  const stateConceptKey = clean(input.conceptKey, 160).toLowerCase();
  if (stateConceptKey && conceptKey && stateConceptKey !== conceptKey) return undefined;
  const observedSignals = Number.isFinite(Number(input.observedSignals))
    ? Math.max(0, Math.min(12, Math.trunc(Number(input.observedSignals))))
    : 0;
  const reasonCodes = Array.isArray(input.reasonCodes)
    ? input.reasonCodes.map((value) => clean(value, 64)).filter(Boolean).slice(0, 6)
    : [];
  const representation = input.representationPreference === 'visual' || input.representationPreference === 'interactive'
    ? input.representationPreference
    : null;

  return {
    version: 'study-working-state-v1',
    temporary: true,
    conceptKey: stateConceptKey || conceptKey,
    conceptLabel: clean(input.conceptLabel, 300) || conceptLabel,
    misconceptionCandidate: oneOf(input.misconceptionCandidate, ['none', 'possible'] as const, 'none'),
    hintDependence: oneOf(input.hintDependence, ['none', 'emerging', 'high'] as const, 'none'),
    representationPreference: representation,
    recentPattern: oneOf(input.recentPattern, ['neutral', 'struggle', 'mixed', 'success'] as const, 'neutral'),
    scaffoldingNeed: oneOf(input.scaffoldingNeed, ['low', 'moderate', 'high'] as const, 'low'),
    observedSignals,
    reasonCodes,
  };
}

/** Server repeats the Study guard; a forged payload cannot activate elsewhere. */
export function normalizeStudyRequestContext(value: unknown, studioDomain: string | null): StudyRequestContext | null {
  if (studioDomain !== 'education') return null;
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const conceptKey = clean(input.conceptKey, 160).toLowerCase();
  const conceptLabel = clean(input.conceptLabel, 300);
  if (!conceptLabel) return null;
  const workingState = normalizeWorkingState(input.workingState, conceptKey, conceptLabel);
  return { conceptKey, conceptLabel, ...(workingState ? { workingState } : {}) };
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

function emitOperationalLearnerState(model: StudyLearnerModel): void {
  if (model.nextLearningMove.reasonCode.includes('prerequisite_graph_unavailable')) {
    emitStudyLearningFlowMetric({ metric: 'prerequisite_graph', outcome: 'prerequisite_graph_unavailable' });
  }

  if (model.retention.state === 'supported' && model.retention.evidenceCount > 0) {
    emitStudyLearningFlowMetric({ metric: 'retention', outcome: 'retention_completed' });
    return;
  }
  if (model.nextLearningMove.type === 'retention_probe') {
    emitStudyLearningFlowMetric({
      metric: 'retention',
      outcome: model.retention.due === true ? 'retention_due' : 'retention_not_due',
    });
  }
}

export async function loadStudyLearnerModel(input: {
  studioDomain: string | null;
  userSub?: string | null;
  memoryConsented?: boolean;
  studyContext: StudyRequestContext | null;
}): Promise<StudyLearnerModel | null> {
  if (input.studioDomain !== 'education' || !input.userSub || input.memoryConsented !== true || !input.studyContext) return null;

  return withStudyTelemetryScope('adaptive_learner_model', async () => {
    const concept = await resolveActiveStudyConcept(input.studyContext!);
    if (!concept || concept === 'unavailable') return null;
    const loaded = await loadVerifiedStudyLearnerProjection({
      userSub: input.userSub!,
      conceptId: concept.id,
      conceptKey: concept.canonicalKey,
      asOf: new Date().toISOString(),
    });
    if (!loaded) return null;

    const model = await applyStudyPrerequisiteNextBestAction({
      userSub: input.userSub!,
      activeConcept: concept,
      learnerModel: loaded.projection.learnerModel,
    });
    emitOperationalLearnerState(model);
    return model;
  });
}

export function formatStudyAdaptiveDirective(model: StudyLearnerModel | null): string {
  if (!model) return '';
  const strategy = teachingStrategyFor(model);
  const misconceptionDetail = model.misconception.code
    ? `; code: ${model.misconception.code}; remediation: ${model.misconception.remediation?.strategy || 'targeted_clarification'}`
    : model.misconception.lastResolvedCode
      ? `; last resolved code: ${model.misconception.lastResolvedCode}`
      : '';
  const retentionSchedule = model.retention.targetDelayDays == null
    ? 'no further scheduled tier'
    : `${model.retention.targetDelayDays}d target; due=${model.retention.due === true}; dueAt=${model.retention.dueAt || 'unknown'}`;
  return `\n\nSTUDY ADAPTIVE LEARNING (${STUDY_ADAPTIVE_LEARNING_VERSION})
This evidence-backed learner state applies to the active Study concept. The next-best-action planner may step to a canonical prerequisite only when a verified generic failure makes prerequisite recovery relevant.
- Planner: ${STUDY_NEXT_BEST_ACTION_VERSION}
- Understanding: ${model.understanding.state}; verified evidence: ${model.understanding.evidenceCount}; evidence kinds: ${model.understanding.evidenceKinds.join(', ') || 'none'}
- Misconception state: ${model.misconception.state}${misconceptionDetail}
- Retention: ${model.retention.state}; ${retentionSchedule}
- Transfer: ${model.transfer?.state || 'untested'}; verified transfer evidence: ${model.transfer?.evidenceCount || 0}
- Next learning move: ${model.nextLearningMove.type}
- Next learning reason: ${model.nextLearningMove.reasonCode}
- Teaching strategy: ${strategy}
- Required intervention: ${model.nextLearningMove.instruction}
Execute the required intervention using that strategy. Treat the misconception code as evidence-backed only when present; never invent another diagnosis from prose. When the intervention names a prerequisite, that target came from the canonical prerequisite graph plus admitted learner evidence; do not substitute a different prerequisite from model intuition. Retention is only verified after a genuinely delayed governed probe, and transfer is only verified through a governed novel-context item reached by the canonical transfer graph. Do not relabel ordinary conversation or immediate correctness as either. Do not claim stronger understanding than the evidence state. Ask at most one focused learner check, then wait.`;
}

export function publicStudyAdaptiveMetadata(model: StudyLearnerModel | null) {
  if (!model) return undefined;
  return {
    version: STUDY_ADAPTIVE_LEARNING_VERSION,
    plannerVersion: STUDY_NEXT_BEST_ACTION_VERSION,
    understanding: model.understanding.state,
    misconception: model.misconception.state,
    misconceptionCode: model.misconception.code,
    misconceptionRemediation: model.misconception.remediation?.strategy || null,
    lastResolvedMisconception: model.misconception.lastResolvedCode,
    retention: model.retention.state,
    retentionTargetDays: model.retention.targetDelayDays ?? null,
    retentionDueAt: model.retention.dueAt ?? null,
    retentionDue: model.retention.due === true,
    transfer: model.transfer?.state || 'untested',
    transferEvidenceCount: model.transfer?.evidenceCount || 0,
    nextLearningMove: model.nextLearningMove.type,
    nextLearningReason: model.nextLearningMove.reasonCode,
    teachingStrategy: teachingStrategyFor(model),
  };
}