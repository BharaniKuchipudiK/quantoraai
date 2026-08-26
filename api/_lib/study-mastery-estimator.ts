import type { StudyMasteryEvidenceEvent } from "./study-truth-layer.js";

export const STUDY_MASTERY_ESTIMATOR_VERSION = "study-mastery-estimator-2026-08-26.1";

export type StudyMasteryEstimate = {
  status: "insufficient_evidence" | "provisional" | "established";
  mastery: number | null;
  confidence: number;
  retention: number | null;
  misconceptionRisk: number;
  evidenceCount: number;
  effectiveEvidenceWeight: number;
  observedThrough: string | null;
  reasonCodes: string[];
};

const VERIFIED_KINDS = new Set([
  "assessment_item", "retrieval", "application", "transfer", "teach_back", "retention_probe", "misconception_probe",
]);

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

function eventScore(event: StudyMasteryEvidenceEvent): number | null {
  if (typeof event.score === "number" && Number.isFinite(event.score)) return bounded(event.score);
  if (typeof event.correct === "boolean") return event.correct ? 1 : 0;
  return null;
}

function eventWeight(event: StudyMasteryEvidenceEvent, score: number): number {
  const kind = KIND_WEIGHT[event.kind] || 1;
  const independence = event.independent ? 1 : 0.55;
  const hintPenalty = 1 / (1 + Math.max(0, event.hintsUsed || 0) * 0.3);
  const difficulty = typeof event.difficulty === "number" ? bounded(event.difficulty) : 0.5;
  const diagnostic = score >= 0.75 ? 0.7 + difficulty * 0.6 : 1.3 - difficulty * 0.6;
  return Math.max(0.1, kind * independence * hintPenalty * diagnostic);
}

/** Transparent, replaceable estimate. Self-confidence never enters mastery. */
export function estimateStudyMastery(events: StudyMasteryEvidenceEvent[]): StudyMasteryEstimate {
  const scored = (Array.isArray(events) ? events : [])
    .filter((event) => event?.independent === true && VERIFIED_KINDS.has(event.kind))
    .map((event) => ({ event, score: eventScore(event) }))
    .filter((row): row is { event: StudyMasteryEvidenceEvent; score: number } => row.score !== null);

  if (!scored.length) {
    return {
      status: "insufficient_evidence",
      mastery: null,
      confidence: 0,
      retention: null,
      misconceptionRisk: 0,
      evidenceCount: 0,
      effectiveEvidenceWeight: 0,
      observedThrough: null,
      reasonCodes: [STUDY_MASTERY_ESTIMATOR_VERSION, "no_verified_scored_evidence"],
    };
  }

  let weightedScore = 0;
  let totalWeight = 0;
  let misconceptionWeight = 0;
  let retentionScore = 0;
  let retentionWeight = 0;
  const kinds = new Set<string>();
  for (const { event, score } of scored) {
    const weight = eventWeight(event, score);
    weightedScore += weight * score;
    totalWeight += weight;
    kinds.add(event.kind);
    if (event.misconceptionSignal) misconceptionWeight += weight;
    if (event.kind === "retention_probe") {
      retentionScore += weight * score;
      retentionWeight += weight;
    }
  }

  // Weak prior prevents one answer from becoming an extreme mastery claim.
  const mastery = bounded((1 + weightedScore) / (2 + totalWeight));
  const confidence = bounded(1 - Math.exp(-totalWeight / 3));
  const retention = retentionWeight > 0 ? bounded(retentionScore / retentionWeight) : null;
  const misconceptionRisk = bounded(misconceptionWeight / Math.max(totalWeight, 0.001));
  const established = totalWeight >= 4 && scored.length >= 4 && kinds.size >= 2;
  const observedThrough = scored
    .map(({ event }) => event.observedAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

  return {
    status: established ? "established" : "provisional",
    mastery,
    confidence,
    retention,
    misconceptionRisk,
    evidenceCount: scored.length,
    effectiveEvidenceWeight: Number(totalWeight.toFixed(4)),
    observedThrough,
    reasonCodes: [
      STUDY_MASTERY_ESTIMATOR_VERSION,
      established ? "diverse_evidence_threshold_met" : "more_diverse_evidence_required",
      ...(misconceptionRisk > 0 ? ["misconception_signal_present"] : []),
    ],
  };
}
