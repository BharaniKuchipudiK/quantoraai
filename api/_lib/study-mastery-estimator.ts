import type { StudyMasteryEvidenceEvent } from "./study-truth-layer.js";
import type { StudyMasteryEvidence } from "./study-mastery-intelligence.js";

export const STUDY_MASTERY_ESTIMATOR_VERSION = "study-mastery-estimator-2026-08-20.1";

export type StudyMasteryEstimateStatus = "insufficient_evidence" | "provisional" | "established";

export type StudyMasteryEstimate = {
  conceptId: string;
  status: StudyMasteryEstimateStatus;
  mastery: number | null;
  confidence: number;
  retention: number | null;
  misconceptionRisk: number;
  evidenceCount: number;
  effectiveEvidenceWeight: number;
  evidenceKinds: string[];
  evidenceRefs: string[];
  observedThrough: string | null;
  estimatorVersion: string;
  reasonCodes: string[];
};

export type StudyMasteryEstimatorPolicy = {
  priorAlpha: number;
  priorBeta: number;
  establishedWeight: number;
  establishedDiversity: number;
  recencyHalfLifeDays: number;
  misconceptionConfidenceThreshold: number;
};

export const DEFAULT_STUDY_MASTERY_ESTIMATOR_POLICY: StudyMasteryEstimatorPolicy = {
  priorAlpha: 1,
  priorBeta: 1,
  establishedWeight: 4,
  establishedDiversity: 2,
  recencyHalfLifeDays: 180,
  misconceptionConfidenceThreshold: 0.7,
};

const KIND_WEIGHT: Record<StudyMasteryEvidenceEvent["kind"], number> = {
  assessment_item: 0.9,
  retrieval: 1,
  application: 1.1,
  transfer: 1.3,
  teach_back: 1.15,
  retention_probe: 1.2,
  misconception_probe: 1.1,
  self_confidence: 0,
};

function bounded(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function cleanId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 160)
    : "";
}

function eventOutcome(event: StudyMasteryEvidenceEvent): number | null {
  if (typeof event.correct === "boolean") return event.correct ? 1 : 0;
  if (typeof event.score === "number" && Number.isFinite(event.score)) return bounded(event.score);
  return null;
}

function ageDays(observedAt: string, nowMs: number): number {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return 0;
  return Math.max(0, (nowMs - observed) / 86_400_000);
}

function recencyWeight(event: StudyMasteryEvidenceEvent, nowMs: number, halfLifeDays: number): number {
  const halfLife = Math.max(30, halfLifeDays);
  return Math.max(0.35, Math.pow(0.5, ageDays(event.observedAt, nowMs) / halfLife));
}

function supportWeight(event: StudyMasteryEvidenceEvent, outcome: number, nowMs: number, policy: StudyMasteryEstimatorPolicy): number {
  const base = KIND_WEIGHT[event.kind] || 0;
  if (!base) return 0;
  const independence = event.independent ? 1 : 0.6;
  const hintPenalty = Math.max(0.35, 1 / (1 + Math.max(0, event.hintsUsed) * 0.25));
  const difficulty = event.difficulty == null ? 0.5 : bounded(event.difficulty);
  // Correct hard evidence and incorrect easy evidence are more diagnostic.
  const difficultyFactor = outcome >= 0.5
    ? 0.85 + 0.3 * difficulty
    : 1.15 - 0.3 * difficulty;
  return base * independence * hintPenalty * difficultyFactor * recencyWeight(event, nowMs, policy.recencyHalfLifeDays);
}

function retentionEligible(event: StudyMasteryEvidenceEvent): boolean {
  if (event.kind === "retention_probe") return true;
  return (event.delayDays || 0) >= 1 && ["retrieval", "application", "transfer", "teach_back"].includes(event.kind);
}

function refs(events: StudyMasteryEvidenceEvent[]): string[] {
  const values = events.flatMap((event) => [event.sourceRef, event.assessmentRef, event.itemRef]).filter((value): value is string => Boolean(value));
  return [...new Set(values)].slice(0, 20);
}

export function estimateStudyMastery(input: {
  conceptId: string;
  events: StudyMasteryEvidenceEvent[];
  now?: string | Date;
  policy?: Partial<StudyMasteryEstimatorPolicy>;
}): StudyMasteryEstimate {
  const conceptId = cleanId(input.conceptId);
  const policy: StudyMasteryEstimatorPolicy = { ...DEFAULT_STUDY_MASTERY_ESTIMATOR_POLICY, ...(input.policy || {}) };
  const nowMs = input.now instanceof Date
    ? input.now.getTime()
    : typeof input.now === "string" && Number.isFinite(Date.parse(input.now))
      ? Date.parse(input.now)
      : Date.now();
  const events = (Array.isArray(input.events) ? input.events : [])
    .filter((event) => cleanId(event.conceptId) === conceptId)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  let alpha = Math.max(0.01, policy.priorAlpha);
  let beta = Math.max(0.01, policy.priorBeta);
  let effectiveWeight = 0;
  let scoredCount = 0;
  const kinds = new Set<string>();

  let retentionAlpha = 1;
  let retentionBeta = 1;
  let retentionWeight = 0;
  let misconceptionComplement = 1;
  const reasonCodes = new Set<string>();

  for (const event of events) {
    const outcome = eventOutcome(event);
    const recency = recencyWeight(event, nowMs, policy.recencyHalfLifeDays);

    if (event.misconceptionSignal) {
      misconceptionComplement *= 1 - 0.9 * recency;
      reasonCodes.add("explicit_misconception_signal");
    }
    if (outcome != null && outcome < 0.5 && (event.selfConfidence || 0) >= policy.misconceptionConfidenceThreshold) {
      const confidentWrong = bounded(0.6 + 0.4 * (event.selfConfidence || 0));
      misconceptionComplement *= 1 - confidentWrong * recency;
      reasonCodes.add("confidently_wrong_signal");
    }

    if (outcome == null) continue;
    const weight = supportWeight(event, outcome, nowMs, policy);
    if (weight <= 0) continue;
    alpha += weight * outcome;
    beta += weight * (1 - outcome);
    effectiveWeight += weight;
    scoredCount += 1;
    kinds.add(event.kind);

    if (retentionEligible(event)) {
      retentionAlpha += weight * outcome;
      retentionBeta += weight * (1 - outcome);
      retentionWeight += weight;
      reasonCodes.add("delayed_retrieval_evidence");
    }
  }

  const observedThrough = events.length ? events.at(-1)?.observedAt || null : null;
  const misconceptionRisk = bounded(1 - misconceptionComplement);
  if (!scoredCount || effectiveWeight <= 0) {
    return {
      conceptId,
      status: "insufficient_evidence",
      mastery: null,
      confidence: 0,
      retention: null,
      misconceptionRisk,
      evidenceCount: events.length,
      effectiveEvidenceWeight: 0,
      evidenceKinds: [...kinds],
      evidenceRefs: refs(events),
      observedThrough,
      estimatorVersion: STUDY_MASTERY_ESTIMATOR_VERSION,
      reasonCodes: [...reasonCodes, "no_scored_mastery_evidence"],
    };
  }

  const mastery = bounded(alpha / (alpha + beta));
  const diversity = kinds.size;
  const evidenceConfidence = 1 - Math.exp(-effectiveWeight / 3);
  const diversityFactor = 0.75 + 0.25 * Math.min(1, diversity / 3);
  const confidence = bounded(evidenceConfidence * diversityFactor);
  const retention = retentionWeight > 0 ? bounded(retentionAlpha / (retentionAlpha + retentionBeta)) : null;
  const established = effectiveWeight >= Math.max(1, policy.establishedWeight)
    && diversity >= Math.max(1, policy.establishedDiversity);

  reasonCodes.add(established ? "multi_signal_mastery_established" : "mastery_provisional");
  if (kinds.has("transfer")) reasonCodes.add("transfer_evidence_present");
  if (kinds.has("teach_back")) reasonCodes.add("teach_back_evidence_present");
  if (events.some((event) => event.hintsUsed > 0 || !event.independent)) reasonCodes.add("supported_attempts_downweighted");

  return {
    conceptId,
    status: established ? "established" : "provisional",
    mastery,
    confidence,
    retention,
    misconceptionRisk,
    evidenceCount: events.length,
    effectiveEvidenceWeight: Number(effectiveWeight.toFixed(4)),
    evidenceKinds: [...kinds].sort(),
    evidenceRefs: refs(events),
    observedThrough,
    estimatorVersion: STUDY_MASTERY_ESTIMATOR_VERSION,
    reasonCodes: [...reasonCodes],
  };
}

export function estimateStudyMasterySet(input: {
  conceptIds: string[];
  events: StudyMasteryEvidenceEvent[];
  now?: string | Date;
  policy?: Partial<StudyMasteryEstimatorPolicy>;
}): StudyMasteryEstimate[] {
  return [...new Set(input.conceptIds.map(cleanId).filter(Boolean))]
    .map((conceptId) => estimateStudyMastery({ conceptId, events: input.events, now: input.now, policy: input.policy }));
}

/**
 * Bridge derived estimates into the existing Study Advisor. Insufficient
 * estimates are intentionally omitted so Advisor Intelligence creates an
 * evidence gap instead of inventing mastery.
 */
export function masteryEstimatesToAdvisorEvidence(estimates: StudyMasteryEstimate[]): StudyMasteryEvidence[] {
  return estimates.flatMap((estimate) => {
    if (estimate.mastery == null || estimate.status === "insufficient_evidence") return [];
    return [{
      conceptId: estimate.conceptId,
      mastery: estimate.mastery,
      confidence: estimate.confidence,
      retention: estimate.retention,
      selfConfidence: null,
      misconception: estimate.misconceptionRisk >= 0.7,
      attempts: estimate.evidenceCount,
      sourceRefs: estimate.evidenceRefs,
      observedAt: estimate.observedThrough,
    } satisfies StudyMasteryEvidence];
  });
}
