import { currentStudyTraceId } from './study-observability.js';

export const STUDY_LEARNING_FLOW_TELEMETRY_VERSION = 'study-learning-flow-telemetry-2026-09-02.1';

export type StudyLearningFlowMetric =
  | 'assessment_availability'
  | 'evidence_guard'
  | 'prerequisite_graph'
  | 'retention';

export type StudyLearningFlowOutcome =
  | 'assessment_issued'
  | 'assessment_bank_exhausted'
  | 'assessment_unavailable'
  | 'misconception_confirmation_unavailable'
  | 'retention_probe_unavailable'
  | 'transfer_unavailable'
  | 'evidence_graded'
  | 'duplicate_evidence_blocked'
  | 'freshness_conflict'
  | 'prerequisite_graph_unavailable'
  | 'retention_due'
  | 'retention_not_due'
  | 'retention_completed';

export type StudyLearningFlowEvidenceKind =
  | 'assessment_item'
  | 'retrieval'
  | 'application'
  | 'transfer'
  | 'retention_probe'
  | 'misconception_probe';

/**
 * Emit only closed categorical counters. No learner/content identifiers or
 * arbitrary metadata are accepted by this API.
 */
export function emitStudyLearningFlowMetric(input: {
  metric: StudyLearningFlowMetric;
  outcome: StudyLearningFlowOutcome;
  evidenceKind?: StudyLearningFlowEvidenceKind;
}): void {
  console.info('Study learning-flow metric', {
    version: STUDY_LEARNING_FLOW_TELEMETRY_VERSION,
    traceId: currentStudyTraceId(),
    metric: input.metric,
    outcome: input.outcome,
    ...(input.evidenceKind ? { evidenceKind: input.evidenceKind } : {}),
  });
}
