import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_MASTERY_ESTIMATOR_VERSION = 'study-mastery-estimator-2026-08-31.2';

export type StudyMasteryEstimate = {
  status: 'insufficient_evidence' | 'provisional' | 'established';
  mastery: number | null;
  confidence: number;
  retention: number | null;
  misconceptionRisk: number;
  evidenceCount: number;
  effectiveEvidenceWeight: number;
  observedThrough: string | null;
  reasonCodes: string[];
};

export type StudyMasteryAccumulator = {
  weightedScore: number;
  totalWeight: number;
  misconceptionWeight: number;
  retentionScore: number;
  retentionWeight: number;
  evidenceCount: number;
  kinds: string[];
  observedThrough: string | null;
};

const KIND_WEIGHT: Record<string, number> = {
  assessment_item: 1,
  retrieval: 1.05,
  application: 1.15,
  transfer: 1.35,
  teach_back: 1.2,
  retention_probe: 1.35,
  misconception_probe: 1.15,
};

function bounded(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

export function studyMasteryEventScore(event: StudyMasteryEvidenceEvent): number | null {
  if (typeof event.score === 'number' && Number.isFinite(event.score)) return bounded(event.score);
  if (typeof event.correct === 'boolean') return event.correct ? 1 : 0;
  return null;
}

export function studyMasteryEventWeight(event: StudyMasteryEvidenceEvent, score: number): number {
  const kind = KIND_WEIGHT[event.kind] || 1;
  const independence = event.independent ? 1 : 0.55;
  const hintPenalty = 1 / (1 + Math.max(0, event.hintsUsed || 0) * 0.3);
  const difficulty = typeof event.difficulty === 'number' ? bounded(event.difficulty) : 0.5;
  const diagnostic = score >= 0.75 ? 0.7 + difficulty * 0.6 : 1.3 - difficulty * 0.6;
  return Math.max(0.1, kind * independence * hintPenalty * diagnostic);
}

export function createStudyMasteryAccumulator(): StudyMasteryAccumulator {
  return {
    weightedScore: 0,
    totalWeight: 0,
    misconceptionWeight: 0,
    retentionScore: 0,
    retentionWeight: 0,
    evidenceCount: 0,
    kinds: [],
    observedThrough: null,
  };
}

/** Append one already-admitted event to the deterministic mastery replay state. */
export function appendStudyMasteryAccumulator(
  current: StudyMasteryAccumulator,
  event: StudyMasteryEvidenceEvent,
): StudyMasteryAccumulator {
  const score = studyMasteryEventScore(event);
  if (score === null) return current;
  const weight = studyMasteryEventWeight(event, score);
  const kinds = new Set(current.kinds);
  kinds.add(event.kind);
  const observedMillis = Date.parse(event.observedAt);
  const currentMillis = current.observedThrough ? Date.parse(current.observedThrough) : Number.NaN;
  const observedThrough = Number.isFinite(observedMillis)
    && (!Number.isFinite(currentMillis) || observedMillis > currentMillis)
    ? new Date(observedMillis).toISOString()
    : current.observedThrough;
  return {
    weightedScore: current.weightedScore + weight * score,
    totalWeight: current.totalWeight + weight,
    misconceptionWeight: current.misconceptionWeight + (event.misconceptionSignal ? weight : 0),
    retentionScore: current.retentionScore + (event.kind === 'retention_probe' ? weight * score : 0),
    retentionWeight: current.retentionWeight + (event.kind === 'retention_probe' ? weight : 0),
    evidenceCount: current.evidenceCount + 1,
    kinds: [...kinds].sort(),
    observedThrough,
  };
}

export function estimateStudyMasteryFromAccumulator(state: StudyMasteryAccumulator): StudyMasteryEstimate {
  if (!state.evidenceCount) {
    return {
      status: 'insufficient_evidence',
      mastery: null,
      confidence: 0,
      retention: null,
      misconceptionRisk: 0,
      evidenceCount: 0,
      effectiveEvidenceWeight: 0,
      observedThrough: null,
      reasonCodes: [STUDY_MASTERY_ESTIMATOR_VERSION, 'no_verified_scored_evidence'],
    };
  }

  const mastery = bounded((1 + state.weightedScore) / (2 + state.totalWeight));
  const confidence = bounded(1 - Math.exp(-state.totalWeight / 3));
  const retention = state.retentionWeight > 0
    ? bounded(state.retentionScore / state.retentionWeight)
    : null;
  const misconceptionRisk = bounded(state.misconceptionWeight / Math.max(state.totalWeight, 0.001));
  const established = state.totalWeight >= 4 && state.evidenceCount >= 4 && state.kinds.length >= 2;

  return {
    status: established ? 'established' : 'provisional',
    mastery,
    confidence,
    retention,
    misconceptionRisk,
    evidenceCount: state.evidenceCount,
    effectiveEvidenceWeight: Number(state.totalWeight.toFixed(4)),
    observedThrough: state.observedThrough,
    reasonCodes: [
      STUDY_MASTERY_ESTIMATOR_VERSION,
      established ? 'diverse_evidence_threshold_met' : 'more_diverse_evidence_required',
      ...(misconceptionRisk > 0 ? ['misconception_signal_present'] : []),
    ],
  };
}

/** Transparent, replaceable estimate. Self-confidence never enters mastery. */
export function estimateStudyMastery(events: StudyMasteryEvidenceEvent[]): StudyMasteryEstimate {
  let state = createStudyMasteryAccumulator();
  for (const event of admittedStudyMasteryEvidence(events)) {
    state = appendStudyMasteryAccumulator(state, event);
  }
  return estimateStudyMasteryFromAccumulator(state);
}
