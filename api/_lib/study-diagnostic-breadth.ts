import type { StudyLearnerModel } from './study-learner-model.js';

export type StudyDiagnosticConcept = {
  id: string;
  canonicalKey: string;
  label: string;
};

export type StudyDiagnosticCandidate = {
  concept: StudyDiagnosticConcept;
  model: StudyLearnerModel;
  /** 0 is the active concept; larger values are deeper prerequisite checks. */
  depth: number;
  /** Canonical-graph confidence when this candidate came from a prerequisite edge. */
  edgeConfidence?: number;
};

export type StudyDiagnosticPlan =
  | {
      action: 'check';
      concept: StudyDiagnosticConcept;
      reasonCode: string;
      model: StudyLearnerModel;
      depth: number;
    }
  | {
      action: 'stop';
      reasonCode: 'diagnostic_budget_exhausted' | 'diagnostic_sufficient_for_available_scope';
    };

const DEFAULT_MAX_CHECKS = 5;

function bounded(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

/**
 * H2.4 keeps the diagnostic short and information-seeking. This score is not a
 * mastery probability. It is only a deterministic ordering over evidence-backed
 * next moves so the runtime chooses the smallest useful check first.
 */
function diagnosticPriority(model: StudyLearnerModel): number {
  switch (model.nextLearningMove.type) {
    case 'diagnose_misconception': return 100;
    case 'confirm_misconception': return 95;
    case 'guided_repair': return 80;
    case 'independent_retrieval': return model.understanding.evidenceCount === 0 ? 75 : 70;
    case 'vary_evidence': return 55;
    case 'retention_probe':
    case 'transfer_task':
    default:
      return 0;
  }
}

function uncertaintyPriority(model: StudyLearnerModel): number {
  if (model.understanding.state === 'unverified') return 3;
  if (model.understanding.state === 'emerging') return 2;
  return 1;
}

/**
 * Select one next diagnostic concept across a bounded multi-concept frontier.
 *
 * Rules:
 * - never diagnose a concept already checked in this short session;
 * - specific misconception evidence outranks generic uncertainty;
 * - unresolved prerequisite depth breaks ties toward the deeper blocker;
 * - graph confidence breaks remaining prerequisite ties;
 * - stop when the bounded session is exhausted or no diagnostic-relevant move
 *   remains in the available governed scope.
 */
export function planStudyDiagnosticBreadth(input: {
  candidates: StudyDiagnosticCandidate[];
  checkedConceptKeys?: Iterable<string>;
  checksCompleted?: number;
  maxChecks?: number;
}): StudyDiagnosticPlan {
  const suppliedMaxChecks = Number.isFinite(input.maxChecks) ? Number(input.maxChecks) : DEFAULT_MAX_CHECKS;
  const suppliedCompleted = Number.isFinite(input.checksCompleted) ? Number(input.checksCompleted) : 0;
  const maxChecks = Math.max(1, Math.min(12, Math.trunc(suppliedMaxChecks)));
  const checksCompleted = Math.max(0, Math.trunc(suppliedCompleted));
  if (checksCompleted >= maxChecks) {
    return { action: 'stop', reasonCode: 'diagnostic_budget_exhausted' };
  }

  const checked = new Set(input.checkedConceptKeys || []);
  const eligible = input.candidates
    .filter((candidate) => candidate.concept.canonicalKey && !checked.has(candidate.concept.canonicalKey))
    .map((candidate) => ({
      ...candidate,
      priority: diagnosticPriority(candidate.model),
      uncertainty: uncertaintyPriority(candidate.model),
      edgeConfidence: bounded(candidate.edgeConfidence),
    }))
    .filter((candidate) => candidate.priority > 0)
    .sort((left, right) =>
      right.priority - left.priority
      || right.uncertainty - left.uncertainty
      || right.depth - left.depth
      || right.edgeConfidence - left.edgeConfidence
      || left.concept.canonicalKey.localeCompare(right.concept.canonicalKey));

  const selected = eligible[0];
  if (!selected) {
    return { action: 'stop', reasonCode: 'diagnostic_sufficient_for_available_scope' };
  }

  return {
    action: 'check',
    concept: selected.concept,
    model: selected.model,
    depth: selected.depth,
    reasonCode: `diagnostic_next:${selected.model.nextLearningMove.type}:${selected.concept.canonicalKey}`,
  };
}
