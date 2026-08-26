export const STUDY_ITEM_BLUEPRINT_VERSION = "study-item-blueprint-2026-08-26.1";

export type StudyExamFamily = "jee_main" | "jee_advanced" | "neet_ug";
export type StudyExamSubject = "mathematics" | "physics" | "chemistry" | "botany" | "zoology";
export type StudyCognitiveOperation =
  | "recall"
  | "representation"
  | "application"
  | "multi_concept_synthesis"
  | "data_interpretation"
  | "error_detection";
export type StudyRepresentation = "text" | "equation" | "table" | "graph" | "diagram";
export type StudyResponseFormat = "single_correct" | "multiple_correct" | "numerical" | "matching";
export type StudyItemOrigin = "quantora_authored" | "licensed";

export type StudyItemBlueprint = {
  version: string;
  id: string;
  examFamily: StudyExamFamily;
  subject: StudyExamSubject;
  curriculumVersion: string;
  curriculumSourceRef: string;
  objectiveCodes: string[];
  conceptIds: string[];
  prerequisiteConceptIds: string[];
  cognitiveOperations: StudyCognitiveOperation[];
  representations: StudyRepresentation[];
  responseFormat: StudyResponseFormat;
  intendedMisconceptions: string[];
  expectedReasoningSteps: string[];
  origin: StudyItemOrigin;
  rightsRef: string | null;
  rightsReviewed: boolean;
  humanReviewed: boolean;
  independentValidationPassed: boolean;
};

export type StudyItemReleaseDecision = {
  releasable: boolean;
  reasons: string[];
};

const EXAMS = new Set<StudyExamFamily>(["jee_main", "jee_advanced", "neet_ug"]);
const SUBJECTS = new Set<StudyExamSubject>(["mathematics", "physics", "chemistry", "botany", "zoology"]);
const OPERATIONS = new Set<StudyCognitiveOperation>([
  "recall", "representation", "application", "multi_concept_synthesis", "data_interpretation", "error_detection",
]);
const REPRESENTATIONS = new Set<StudyRepresentation>(["text", "equation", "table", "graph", "diagram"]);
const RESPONSE_FORMATS = new Set<StudyResponseFormat>(["single_correct", "multiple_correct", "numerical", "matching"]);
const ORIGINS = new Set<StudyItemOrigin>(["quantora_authored", "licensed"]);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function id(value: unknown, max = 160): string {
  return text(value, max).toLowerCase().replace(/[^a-z0-9._:-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function url(value: unknown): string {
  const candidate = text(value, 2000);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function uniqueIds(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => id(entry)).filter(Boolean))].slice(0, maxItems);
}

function enumList<T extends string>(value: unknown, allowed: Set<T>, maxItems: number): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is T => typeof entry === "string" && allowed.has(entry as T)))].slice(0, maxItems);
}

/**
 * Normalizes intent metadata only. Question wording, answers and copied source
 * passages deliberately have no field in this boundary.
 */
export function normalizeStudyItemBlueprint(value: any): StudyItemBlueprint | null {
  const examFamily = text(value?.examFamily, 40) as StudyExamFamily;
  const subject = text(value?.subject, 40) as StudyExamSubject;
  const responseFormat = text(value?.responseFormat, 40) as StudyResponseFormat;
  const origin = text(value?.origin, 40) as StudyItemOrigin;
  const curriculumSourceRef = url(value?.curriculumSourceRef);
  const blueprintId = id(value?.id);
  const curriculumVersion = text(value?.curriculumVersion, 80);
  const conceptIds = uniqueIds(value?.conceptIds);
  const cognitiveOperations = enumList(value?.cognitiveOperations, OPERATIONS, 6);

  if (
    !blueprintId || !EXAMS.has(examFamily) || !SUBJECTS.has(subject)
    || !RESPONSE_FORMATS.has(responseFormat) || !ORIGINS.has(origin)
    || !curriculumVersion || !curriculumSourceRef || !conceptIds.length || !cognitiveOperations.length
  ) return null;

  return {
    version: STUDY_ITEM_BLUEPRINT_VERSION,
    id: blueprintId,
    examFamily,
    subject,
    curriculumVersion,
    curriculumSourceRef,
    objectiveCodes: uniqueStrings(value?.objectiveCodes, 20, 120),
    conceptIds,
    prerequisiteConceptIds: uniqueIds(value?.prerequisiteConceptIds),
    cognitiveOperations,
    representations: enumList(value?.representations, REPRESENTATIONS, 5),
    responseFormat,
    intendedMisconceptions: uniqueStrings(value?.intendedMisconceptions, 12, 300),
    expectedReasoningSteps: uniqueStrings(value?.expectedReasoningSteps, 12, 300),
    origin,
    rightsRef: url(value?.rightsRef) || null,
    rightsReviewed: value?.rightsReviewed === true,
    humanReviewed: value?.humanReviewed === true,
    independentValidationPassed: value?.independentValidationPassed === true,
  };
}

export function studyItemReleaseDecision(blueprint: StudyItemBlueprint): StudyItemReleaseDecision {
  const reasons: string[] = [];
  if (!blueprint.rightsReviewed) reasons.push("rights_review_required");
  if (blueprint.origin === "licensed" && !blueprint.rightsRef) reasons.push("license_reference_required");
  if (!blueprint.humanReviewed) reasons.push("human_subject_review_required");
  if (!blueprint.independentValidationPassed) reasons.push("independent_validation_required");
  if (!blueprint.objectiveCodes.length) reasons.push("official_objective_mapping_required");
  return { releasable: reasons.length === 0, reasons };
}
