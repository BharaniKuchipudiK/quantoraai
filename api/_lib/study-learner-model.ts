import type { StudyMasteryEstimate } from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_LEARNER_MODEL_VERSION = 'study-learner-model-2026-08-29.1';

export type StudyUnderstandingState = 'unverified' | 'emerging' | 'verified';
export type StudyMisconceptionState = 'none_observed' | 'signal_observed' | 'needs_confirmation';
export type StudyNextLearningMove =
  | 'independent_retrieval'
  | 'diagnose_misconception'
  | 'confirm_misconception'
  | 'guided_repair'
  | 'vary_evidence'
  | 'retention_probe'
  | 'transfer_task';

export type StudyLearnerModel = {
  version: string;
  concept: { id: string; key: string | null };
  understanding: {
    state: StudyUnderstandingState;
    evidenceCount: number;
    evidenceKinds: string[];
    observedThrough: string | null;
  };
  misconception: {
    state: StudyMisconceptionState;
    signalCount: number;
    latestSignalAt: string | null;
  };
  retention: {
    state: 'untested' | 'needs_support' | 'supported';
    evidenceCount: number;
  };
  nextLearningMove: {
    type: StudyNextLearningMove;
    reasonCode: string;
    instruction: string;
    learnerFacingText: string;
  };
};

const VERIFIED_KINDS = new Set([
  'assessment_item', 'retrieval', 'application', 'transfer', 'teach_back', 'retention_probe', 'misconception_probe',
]);

function eventScore(event: StudyMasteryEvidenceEvent): number | null {
  if (typeof event.score === 'number' && Number.isFinite(event.score)) return Math.max(0, Math.min(1, event.score));
  if (typeof event.correct === 'boolean') return event.correct ? 1 : 0;
  return null;
}

function validDate(value: unknown): string | null {
  const text = typeof value === 'string' ? value : '';
  const millis = Date.parse(text);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function verifiedRows(events: StudyMasteryEvidenceEvent[]) {
  const seenAssessmentItems = new Set<string>();
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.independent === true && VERIFIED_KINDS.has(event.kind))
    .filter((event) => {
      if (event.kind !== 'assessment_item' || !event.itemRef) return true;
      if (seenAssessmentItems.has(event.itemRef)) return false;
      seenAssessmentItems.add(event.itemRef);
      return true;
    })
    .map((event) => ({ event, score: eventScore(event), observedAt: validDate(event.observedAt) }))
    .filter((row): row is { event: StudyMasteryEvidenceEvent; score: number; observedAt: string } => row.score !== null && row.observedAt !== null)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function misconceptionProjection(rows: ReturnType<typeof verifiedRows>) {
  const signals = rows.filter((row) => row.event.misconceptionSignal === true);
  const latestSignal = signals[signals.length - 1] || null;
  const laterSuccess = latestSignal
    ? rows.some((row) => Date.parse(row.observedAt) > Date.parse(latestSignal.observedAt) && row.score >= 0.75 && !row.event.misconceptionSignal)
    : false;
  const laterDiagnosticSuccess = latestSignal
    ? rows.some((row) => Date.parse(row.observedAt) > Date.parse(latestSignal.observedAt) && row.score >= 0.75 && row.event.kind === 'misconception_probe' && !row.event.misconceptionSignal)
    : false;
  const state: StudyMisconceptionState = latestSignal && !laterSuccess
    ? 'signal_observed'
    : latestSignal && !laterDiagnosticSuccess
      ? 'needs_confirmation'
      : 'none_observed';
  return {
    state,
    signalCount: signals.length,
    latestSignalAt: latestSignal?.observedAt || null,
  };
}

function retentionProjection(rows: ReturnType<typeof verifiedRows>, estimate: StudyMasteryEstimate) {
  const retentionRows = rows.filter((row) => row.event.kind === 'retention_probe');
  const state = retentionRows.length === 0 || estimate.retention == null
    ? 'untested'
    : estimate.retention >= 0.7
      ? 'supported'
      : 'needs_support';
  return { state: state as 'untested' | 'needs_support' | 'supported', evidenceCount: retentionRows.length };
}

function chooseNextMove(input: {
  rows: ReturnType<typeof verifiedRows>;
  estimate: StudyMasteryEstimate;
  misconception: ReturnType<typeof misconceptionProjection>;
  retention: ReturnType<typeof retentionProjection>;
}): StudyLearnerModel['nextLearningMove'] {
  const { rows, estimate, misconception, retention } = input;
  if (!rows.length) {
    return { type: 'independent_retrieval', reasonCode: 'no_verified_evidence', instruction: 'Ask for one independent answer without hints before adapting the lesson.', learnerFacingText: 'Next: try one independent answer without hints.' };
  }
  if (misconception.state === 'signal_observed') {
    return { type: 'diagnose_misconception', reasonCode: 'active_misconception_signal', instruction: 'Use one targeted contrast or counterexample, then ask the learner to explain the corrected distinction.', learnerFacingText: 'Next: compare the two ideas, then explain the corrected distinction.' };
  }
  if (misconception.state === 'needs_confirmation') {
    return { type: 'confirm_misconception', reasonCode: 'misconception_confirmation_needed', instruction: 'Use a fresh targeted misconception probe before treating the earlier signal as resolved.', learnerFacingText: 'Next: try a fresh targeted check to confirm the earlier gap is repaired.' };
  }
  const latest = rows[rows.length - 1];
  if (latest.score < 0.75) {
    return { type: 'guided_repair', reasonCode: 'latest_verified_attempt_incorrect', instruction: 'Repair the first material error with the smallest prerequisite step, then retry with a new item.', learnerFacingText: 'Next: repair the first error, then try a changed example.' };
  }
  const kinds = new Set(rows.map((row) => row.event.kind));
  if (estimate.status !== 'established' || rows.length < 4 || kinds.size < 2) {
    return { type: 'vary_evidence', reasonCode: 'diverse_evidence_incomplete', instruction: 'Collect a different independent evidence kind, preferably application or teach-back, instead of repeating the same item.', learnerFacingText: 'Next: show the idea in a different way—application or teach-back.' };
  }
  if (retention.state !== 'supported') {
    return { type: 'retention_probe', reasonCode: retention.state === 'untested' ? 'retention_untested' : 'retention_needs_support', instruction: 'Schedule a delayed, no-hint retrieval check before treating the understanding as durable.', learnerFacingText: 'Next: return for a delayed no-hint check.' };
  }
  return { type: 'transfer_task', reasonCode: 'understanding_and_retention_supported', instruction: 'Use a novel transfer problem that requires the concept in a different representation or context.', learnerFacingText: 'Next: try the idea in a new context.' };
}

/**
 * Evidence-backed, read-only projection. It never mutates or replaces mastery,
 * and self-confidence cannot enter verified understanding.
 */
export function buildStudyLearnerModel(input: {
  conceptId: string;
  conceptKey?: string | null;
  evidence?: StudyMasteryEvidenceEvent[] | null;
  estimate: StudyMasteryEstimate;
}): StudyLearnerModel {
  const rows = verifiedRows(input.evidence || []);
  const misconception = misconceptionProjection(rows);
  const retention = retentionProjection(rows, input.estimate);
  const evidenceKinds = [...new Set(rows.map((row) => row.event.kind))].sort();
  const verified = input.estimate.status === 'established' && misconception.state === 'none_observed';
  const understanding: StudyUnderstandingState = verified ? 'verified' : rows.length ? 'emerging' : 'unverified';

  return {
    version: STUDY_LEARNER_MODEL_VERSION,
    concept: { id: String(input.conceptId || ''), key: input.conceptKey || null },
    understanding: {
      state: understanding,
      evidenceCount: rows.length,
      evidenceKinds,
      observedThrough: rows[rows.length - 1]?.observedAt || null,
    },
    misconception,
    retention,
    nextLearningMove: chooseNextMove({ rows, estimate: input.estimate, misconception, retention }),
  };
}
