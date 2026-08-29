export const STUDY_TRUTH_LAYER_VERSION = "study-truth-layer-2026-08-20.1";

export type StudyConceptStatus = "draft" | "active" | "retired";
export type StudyTruthProvenance = "official" | "open_licensed" | "quantora_authored" | "connected_source" | "derived";
export type StudyConceptRelation =
  | "prerequisite_of"
  | "part_of"
  | "application_of"
  | "commonly_confused_with"
  | "supports_transfer_to";

export type StudyConceptNode = {
  canonicalId: string;
  contentVersion: string;
  subject: string;
  label: string;
  description?: string | null;
  status: StudyConceptStatus;
  provenance: StudyTruthProvenance;
  confidence: number;
  sourceRef?: string | null;
  licenseRef?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

/**
 * Direction is always source -> target. For prerequisite_of, source is the
 * prerequisite and target is the concept that depends on it.
 */
export type StudyConceptEdge = {
  sourceConceptId: string;
  targetConceptId: string;
  relation: StudyConceptRelation;
  confidence: number;
  provenance: StudyTruthProvenance;
  sourceRef?: string | null;
};

export type StudyCurriculumFramework = {
  id: string;
  jurisdiction: string;
  authority: string;
  name: string;
  version: string;
  status: StudyConceptStatus;
  sourceRef: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

export type StudyCurriculumMapping = {
  curriculumId: string;
  conceptId: string;
  objectiveCode?: string | null;
  stage?: string | null;
  depth: number;
  examWeight?: number | null;
  confidence: number;
  sourceRef: string;
};

export type StudyTruthSnapshot = {
  version: string;
  concepts: StudyConceptNode[];
  edges: StudyConceptEdge[];
  curricula: StudyCurriculumFramework[];
  mappings: StudyCurriculumMapping[];
};

export type StudyEvidenceKind =
  | "assessment_item"
  | "retrieval"
  | "application"
  | "transfer"
  | "teach_back"
  | "retention_probe"
  | "misconception_probe"
  | "self_confidence";

export type StudyMasteryEvidenceEvent = {
  id: string;
  conceptId: string;
  kind: StudyEvidenceKind;
  correct?: boolean | null;
  score?: number | null;
  difficulty?: number | null;
  hintsUsed: number;
  responseMs?: number | null;
  selfConfidence?: number | null;
  independent: boolean;
  misconceptionSignal: boolean;
  delayDays?: number | null;
  provenance: StudyTruthProvenance;
  sourceRef?: string | null;
  assessmentRef?: string | null;
  itemRef?: string | null;
  observedAt: string;
};

export type StudyTruthValidation = { valid: boolean; issues: string[] };

const CONCEPT_STATUSES = new Set<StudyConceptStatus>(["draft", "active", "retired"]);
const PROVENANCE = new Set<StudyTruthProvenance>(["official", "open_licensed", "quantora_authored", "connected_source", "derived"]);
const RELATIONS = new Set<StudyConceptRelation>([
  "prerequisite_of",
  "part_of",
  "application_of",
  "commonly_confused_with",
  "supports_transfer_to",
]);
const EVIDENCE_KINDS = new Set<StudyEvidenceKind>([
  "assessment_item",
  "retrieval",
  "application",
  "transfer",
  "teach_back",
  "retention_probe",
  "misconception_probe",
  "self_confidence",
]);

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanId(value: unknown, max = 160): string {
  return clean(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function optionalText(value: unknown, max = 2000): string | null {
  const text = clean(value, max);
  return text || null;
}

function bounded(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(4));
}

function nonNegativeInt(value: unknown, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(max, Math.round(numeric)));
}

function isoOrNull(value: unknown): string | null {
  const text = clean(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function provenance(value: unknown, fallback: StudyTruthProvenance = "derived"): StudyTruthProvenance {
  const normalized = clean(value, 40) as StudyTruthProvenance;
  return PROVENANCE.has(normalized) ? normalized : fallback;
}

function status(value: unknown): StudyConceptStatus {
  const normalized = clean(value, 20) as StudyConceptStatus;
  return CONCEPT_STATUSES.has(normalized) ? normalized : "draft";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function duplicateKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function prerequisiteCycle(snapshot: StudyTruthSnapshot): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const concept of snapshot.concepts) adjacency.set(concept.canonicalId, []);
  for (const edge of snapshot.edges) {
    if (edge.relation !== "prerequisite_of") continue;
    adjacency.get(edge.sourceConceptId)?.push(edge.targetConceptId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      return [...path.slice(Math.max(0, start)), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    path.push(id);
    for (const next of adjacency.get(id) || []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of adjacency.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function normalizeStudyMasteryEvidenceEvent(input: any): StudyMasteryEvidenceEvent | null {
  const id = cleanId(input?.id, 200);
  const conceptId = cleanId(input?.conceptId);
  const kind = clean(input?.kind, 60) as StudyEvidenceKind;
  const observedAt = isoOrNull(input?.observedAt);
  if (!id || !conceptId || !EVIDENCE_KINDS.has(kind) || !observedAt) return null;

  const score = input?.score == null ? null : bounded(input.score);
  const correct = typeof input?.correct === "boolean" ? input.correct : null;
  return {
    id,
    conceptId,
    kind,
    correct,
    score,
    difficulty: input?.difficulty == null ? null : bounded(input.difficulty),
    hintsUsed: nonNegativeInt(input?.hintsUsed, 100),
    responseMs: input?.responseMs == null ? null : nonNegativeInt(input.responseMs, 86_400_000),
    selfConfidence: input?.selfConfidence == null ? null : bounded(input.selfConfidence),
    independent: input?.independent !== false,
    misconceptionSignal: input?.misconceptionSignal === true,
    delayDays: input?.delayDays == null ? null : nonNegativeInt(input.delayDays, 3650),
    provenance: provenance(input?.provenance, "derived"),
    sourceRef: optionalText(input?.sourceRef, 2000),
    assessmentRef: optionalText(input?.assessmentRef, 500),
    itemRef: optionalText(input?.itemRef, 500),
    observedAt,
  };
}

export function normalizeStudyMasteryEvidenceEvents(input: unknown): StudyMasteryEvidenceEvent[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: StudyMasteryEvidenceEvent[] = [];
  for (const raw of input) {
    const event = normalizeStudyMasteryEvidenceEvent(raw);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
    if (result.length >= 5000) break;
  }
  return result.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}
