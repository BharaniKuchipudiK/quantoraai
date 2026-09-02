import {
  admittedStudyMasteryEvidence,
  STUDY_EVIDENCE_ADMISSION_VERSION,
  studyAssessmentReceiptForAttestedEvidence,
} from './study-evidence-admission.js';
import {
  appendStudyLearnerModelAccumulator,
  buildStudyLearnerModelFromAccumulator,
  createStudyLearnerModelAccumulator,
  STUDY_LEARNER_MODEL_VERSION,
  type StudyLearnerModelAccumulator,
} from './study-learner-model.js';
import {
  STUDY_LEARNER_PROJECTION_SCHEMA_VERSION,
  type StudyLearnerProjection,
} from './study-learner-projection.js';
import {
  appendStudyMasteryAccumulator,
  createStudyMasteryAccumulator,
  estimateStudyMasteryFromAccumulator,
  STUDY_MASTERY_ESTIMATOR_VERSION,
  type StudyMasteryAccumulator,
} from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_REPLAY_CHECKPOINT_VERSION = 'study-replay-checkpoint-2026-09-02.1';

export type StudyLedgerAppendCursor = {
  createdAt: string;
  id: string;
};

export type StudyReplayCheckpoint = {
  checkpointVersion: string;
  projectionSchemaVersion: string;
  learnerModelVersion: string;
  estimatorVersion: string;
  admissionVersion: string;
  conceptId: string;
  conceptKey: string | null;
  cursor: StudyLedgerAppendCursor | null;
  seenAssessmentItemRefs: string[];
  masteryState: StudyMasteryAccumulator;
  learnerState: StudyLearnerModelAccumulator;
};

export type StudyCheckpointReplayResult =
  | { status: 'replayed'; projection: StudyLearnerProjection; nextCheckpoint: StudyReplayCheckpoint }
  | { status: 'incompatible'; reasonCode: string };

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function validCursor(value: StudyLedgerAppendCursor | null | undefined): StudyLedgerAppendCursor | null {
  if (value == null) return null;
  const createdAt = validIso(value.createdAt);
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  return createdAt && id ? { createdAt, id } : null;
}

function checkpointCompatibility(input: StudyReplayCheckpoint, conceptId: string, conceptKey: string | null) {
  if (input.checkpointVersion !== STUDY_REPLAY_CHECKPOINT_VERSION) return 'checkpoint_version_mismatch';
  if (input.projectionSchemaVersion !== STUDY_LEARNER_PROJECTION_SCHEMA_VERSION) return 'projection_schema_version_mismatch';
  if (input.learnerModelVersion !== STUDY_LEARNER_MODEL_VERSION) return 'learner_model_version_mismatch';
  if (input.estimatorVersion !== STUDY_MASTERY_ESTIMATOR_VERSION) return 'estimator_version_mismatch';
  if (input.admissionVersion !== STUDY_EVIDENCE_ADMISSION_VERSION) return 'admission_version_mismatch';
  if (input.conceptId !== conceptId || input.conceptKey !== conceptKey) return 'checkpoint_concept_mismatch';
  if (input.cursor && !validCursor(input.cursor)) return 'checkpoint_cursor_invalid';
  if (!Array.isArray(input.seenAssessmentItemRefs)
    || !input.masteryState
    || !input.learnerState) return 'checkpoint_shape_invalid';
  return null;
}

function foldAdmitted(
  events: StudyMasteryEvidenceEvent[],
  masterySeed = createStudyMasteryAccumulator(),
  learnerSeed = createStudyLearnerModelAccumulator(),
  seenSeed: string[] = [],
) {
  let masteryState = structuredClone(masterySeed);
  let learnerState = structuredClone(learnerSeed);
  const seenAssessmentItemRefs = new Set(seenSeed);
  const admitted = admittedStudyMasteryEvidence(events).filter((event) => {
    const receipt = studyAssessmentReceiptForAttestedEvidence(event);
    if (!receipt || !event.itemRef) return true;
    if (seenAssessmentItemRefs.has(event.itemRef)) return false;
    seenAssessmentItemRefs.add(event.itemRef);
    return true;
  });

  for (const event of admitted) {
    masteryState = appendStudyMasteryAccumulator(masteryState, event);
    learnerState = appendStudyLearnerModelAccumulator(learnerState, event);
  }
  return {
    admitted,
    masteryState,
    learnerState,
    seenAssessmentItemRefs: [...seenAssessmentItemRefs].sort(),
  };
}

export function buildStudyReplayCheckpoint(input: {
  conceptId: string;
  conceptKey?: string | null;
  evidence: StudyMasteryEvidenceEvent[];
  cursor?: StudyLedgerAppendCursor | null;
}): StudyReplayCheckpoint {
  const folded = foldAdmitted(input.evidence);
  return {
    checkpointVersion: STUDY_REPLAY_CHECKPOINT_VERSION,
    projectionSchemaVersion: STUDY_LEARNER_PROJECTION_SCHEMA_VERSION,
    learnerModelVersion: STUDY_LEARNER_MODEL_VERSION,
    estimatorVersion: STUDY_MASTERY_ESTIMATOR_VERSION,
    admissionVersion: STUDY_EVIDENCE_ADMISSION_VERSION,
    conceptId: input.conceptId,
    conceptKey: input.conceptKey || null,
    cursor: validCursor(input.cursor),
    seenAssessmentItemRefs: folded.seenAssessmentItemRefs,
    masteryState: folded.masteryState,
    learnerState: folded.learnerState,
  };
}

export function replayStudyLearnerProjectionFromCheckpoint(input: {
  checkpoint: StudyReplayCheckpoint;
  conceptId: string;
  conceptKey?: string | null;
  deltaEvidence: StudyMasteryEvidenceEvent[];
  asOf: string;
  cursor?: StudyLedgerAppendCursor | null;
}): StudyCheckpointReplayResult {
  const conceptKey = input.conceptKey || null;
  const reasonCode = checkpointCompatibility(input.checkpoint, input.conceptId, conceptKey);
  if (reasonCode) return { status: 'incompatible', reasonCode };
  const projectedAt = validIso(input.asOf);
  if (!projectedAt) return { status: 'incompatible', reasonCode: 'projection_clock_invalid' };

  const admittedDelta = admittedStudyMasteryEvidence(input.deltaEvidence);
  const checkpointObserved = input.checkpoint.learnerState.observedThrough
    ? Date.parse(input.checkpoint.learnerState.observedThrough)
    : Number.NaN;
  if (Number.isFinite(checkpointObserved)
    && admittedDelta.some((event) => Date.parse(event.observedAt) <= checkpointObserved)) {
    return { status: 'incompatible', reasonCode: 'backdated_delta_requires_full_replay' };
  }

  const folded = foldAdmitted(
    admittedDelta,
    input.checkpoint.masteryState,
    input.checkpoint.learnerState,
    input.checkpoint.seenAssessmentItemRefs,
  );
  const estimate = estimateStudyMasteryFromAccumulator(folded.masteryState);
  const learnerModel = buildStudyLearnerModelFromAccumulator({
    conceptId: input.conceptId,
    conceptKey,
    state: folded.learnerState,
    estimate,
    asOf: projectedAt,
  });
  const projection: StudyLearnerProjection = {
    schemaVersion: STUDY_LEARNER_PROJECTION_SCHEMA_VERSION,
    learnerModelVersion: learnerModel.version,
    estimatorVersion: STUDY_MASTERY_ESTIMATOR_VERSION,
    conceptId: input.conceptId,
    conceptKey,
    evidenceCount: folded.learnerState.evidenceCount,
    evidenceKinds: folded.learnerState.evidenceKinds,
    observedThrough: folded.learnerState.observedThrough,
    projectedAt,
    learnerModel,
  };
  return {
    status: 'replayed',
    projection,
    nextCheckpoint: {
      ...input.checkpoint,
      cursor: validCursor(input.cursor) || input.checkpoint.cursor,
      seenAssessmentItemRefs: folded.seenAssessmentItemRefs,
      masteryState: folded.masteryState,
      learnerState: folded.learnerState,
    },
  };
}
