import type { StudyEvidenceKind } from "./study-truth-layer.js";

export const STUDY_LEARNING_MAP_VERSION = "study-learning-map-2026-08-26.1";

export type StudyLearningState =
  | "verified_understanding"
  | "emerging_understanding"
  | "misconception_detected"
  | "insufficient_evidence"
  | "not_assessed";

export type StudyLearningMapConcept = {
  id: string;
  label: string;
  prerequisiteIds?: string[];
};

export type StudyLearningMapEvidence = {
  id: string;
  conceptId: string;
  kind: StudyEvidenceKind;
  correct?: boolean | null;
  score?: number | null;
  independent: boolean;
  misconceptionSignal: boolean;
  observedAt: string;
};

export type StudyLearningMapNode = {
  conceptId: string;
  label: string;
  state: StudyLearningState;
  evidenceCount: number;
  verifiedEvidenceCount: number;
  nextAction: string;
};

const VERIFIED_KINDS = new Set<StudyEvidenceKind>([
  "assessment_item", "retrieval", "application", "transfer", "teach_back", "retention_probe", "misconception_probe",
]);

function clean(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function cleanId(value: unknown): string {
  return clean(value, 160).toLowerCase().replace(/[^a-z0-9._:-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function isPositive(event: StudyLearningMapEvidence): boolean {
  return event.correct === true || (typeof event.score === "number" && Number.isFinite(event.score) && event.score >= 0.75);
}

function isVerified(event: StudyLearningMapEvidence): boolean {
  return event.independent === true && VERIFIED_KINDS.has(event.kind) && (event.correct != null || event.score != null || event.misconceptionSignal);
}

/** User-facing projection only: no rank, pass probability, predicted score or opaque percentage. */
export function buildStudyLearningMap(
  concepts: StudyLearningMapConcept[],
  evidence: StudyLearningMapEvidence[],
): StudyLearningMapNode[] {
  const evidenceByConcept = new Map<string, StudyLearningMapEvidence[]>();
  for (const raw of Array.isArray(evidence) ? evidence : []) {
    const conceptId = cleanId(raw?.conceptId);
    const eventId = cleanId(raw?.id);
    if (!conceptId || !eventId) continue;
    const rows = evidenceByConcept.get(conceptId) || [];
    if (!rows.some((event) => cleanId(event.id) === eventId)) rows.push({ ...raw, id: eventId, conceptId });
    evidenceByConcept.set(conceptId, rows);
  }

  const result: StudyLearningMapNode[] = [];
  const seen = new Set<string>();
  for (const concept of Array.isArray(concepts) ? concepts : []) {
    const conceptId = cleanId(concept?.id);
    const label = clean(concept?.label);
    if (!conceptId || !label || seen.has(conceptId)) continue;
    seen.add(conceptId);
    const events = evidenceByConcept.get(conceptId) || [];
    const verified = events.filter(isVerified);
    const positive = verified.filter(isPositive);
    const misconception = verified.some((event) => event.misconceptionSignal);
    const hasNegative = verified.some((event) => event.correct === false || (typeof event.score === "number" && event.score < 0.75));

    let state: StudyLearningState;
    let nextAction: string;
    if (!events.length) {
      state = "not_assessed";
      nextAction = `Try a short diagnostic for ${label}.`;
    } else if (!verified.length) {
      state = "insufficient_evidence";
      nextAction = `Add an independently checked response for ${label}.`;
    } else if (misconception) {
      state = "misconception_detected";
      nextAction = `Contrast the misconception with a worked counterexample for ${label}.`;
    } else if (positive.length >= 2 && !hasNegative) {
      state = "verified_understanding";
      nextAction = `Use a delayed or transfer problem to confirm retention of ${label}.`;
    } else {
      state = "emerging_understanding";
      nextAction = `Practice a changed example of ${label} without hints.`;
    }

    result.push({ conceptId, label, state, evidenceCount: events.length, verifiedEvidenceCount: verified.length, nextAction });
  }
  return result;
}
