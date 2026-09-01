import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import { buildStudyLearnerModel, type StudyLearnerModel } from './study-learner-model.js';
import {
  estimateStudyMastery,
  STUDY_MASTERY_ESTIMATOR_VERSION,
  type StudyMasteryEstimate,
} from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const STUDY_LEARNER_PROJECTION_SCHEMA_VERSION = 'study-learner-projection-2026-09-02.1';

export type StudyLearnerProjection = {
  schemaVersion: string;
  learnerModelVersion: string;
  estimatorVersion: string;
  conceptId: string;
  conceptKey: string | null;
  evidenceCount: number;
  evidenceKinds: string[];
  observedThrough: string | null;
  projectedAt: string;
  learnerModel: StudyLearnerModel;
};

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function projectionInput(events: StudyMasteryEvidenceEvent[]) {
  const admitted = admittedStudyMasteryEvidence(events)
    .filter((event) => validIso(event.observedAt) !== null)
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
  return {
    admitted,
    observedThrough: admitted.length ? validIso(admitted[admitted.length - 1].observedAt) : null,
    evidenceKinds: [...new Set(admitted.map((event) => event.kind))].sort(),
  };
}

/**
 * Deterministically rebuild one concept projection from the admitted evidence
 * ledger. Callers inject `asOf`; replay must never depend on wall-clock time.
 */
export function replayStudyLearnerProjection(input: {
  conceptId: string;
  conceptKey?: string | null;
  evidence: StudyMasteryEvidenceEvent[];
  asOf: string;
}): StudyLearnerProjection {
  const projectedAt = validIso(input.asOf);
  if (!projectedAt) throw new Error('study_projection_invalid_as_of');

  const { admitted, observedThrough, evidenceKinds } = projectionInput(input.evidence);
  const estimate: StudyMasteryEstimate = estimateStudyMastery(admitted);
  const learnerModel = buildStudyLearnerModel({
    conceptId: input.conceptId,
    conceptKey: input.conceptKey || null,
    evidence: admitted,
    estimate,
    asOf: projectedAt,
  });

  return {
    schemaVersion: STUDY_LEARNER_PROJECTION_SCHEMA_VERSION,
    learnerModelVersion: learnerModel.version,
    estimatorVersion: STUDY_MASTERY_ESTIMATOR_VERSION,
    conceptId: input.conceptId,
    conceptKey: input.conceptKey || null,
    evidenceCount: admitted.length,
    evidenceKinds,
    observedThrough,
    projectedAt,
    learnerModel,
  };
}
