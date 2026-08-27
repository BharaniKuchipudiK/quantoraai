import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStudyItemBlueprint, studyItemReleaseDecision } from "./study-item-blueprint.js";

const base = {
  id: "quantora:jee:physics:vectors:001",
  examFamily: "jee_main",
  subject: "physics",
  curriculumVersion: "2026",
  curriculumSourceRef: "https://jeemain.nta.nic.in/document/syllabus-2026/",
  objectiveCodes: ["Physics Unit 2"],
  conceptIds: ["physics.kinematics.motion-in-plane"],
  prerequisiteConceptIds: ["math.vector.components"],
  cognitiveOperations: ["representation", "application"],
  representations: ["diagram", "equation"],
  responseFormat: "numerical",
  intendedMisconceptions: ["Treating velocity direction as force direction"],
  expectedReasoningSteps: ["Resolve the vectors", "Apply the governing relation"],
  origin: "quantora_authored",
  rightsReviewed: true,
  humanReviewed: true,
  independentValidationPassed: true,
};

test("exam blueprint stores intent and provenance without a copied-question field", () => {
  const blueprint = normalizeStudyItemBlueprint({ ...base, verbatimQuestionText: "untrusted copied text" });
  assert.ok(blueprint);
  assert.equal(Object.hasOwn(blueprint, "verbatimQuestionText"), false);
  assert.equal(blueprint.curriculumSourceRef.startsWith("https://"), true);
  assert.deepEqual(studyItemReleaseDecision(blueprint), { releasable: true, reasons: [] });
});
test("licensed items fail closed without a license reference and review gates", () => {
  const blueprint = normalizeStudyItemBlueprint({
    ...base,
    origin: "licensed",
    rightsRef: "",
    rightsReviewed: false,
    humanReviewed: false,
    independentValidationPassed: false,
  });
  assert.ok(blueprint);
  assert.deepEqual(studyItemReleaseDecision(blueprint), {
    releasable: false,
    reasons: [
      "rights_review_required",
      "license_reference_required",
      "human_subject_review_required",
      "independent_validation_required",
    ],
  });
});

test("unknown exams, subjects, insecure sources and missing concepts are rejected", () => {
  assert.equal(normalizeStudyItemBlueprint({ ...base, examFamily: "rank_predictor" }), null);
  assert.equal(normalizeStudyItemBlueprint({ ...base, subject: "astrology" }), null);
  assert.equal(normalizeStudyItemBlueprint({ ...base, curriculumSourceRef: "http://example.test/syllabus" }), null);
  assert.equal(normalizeStudyItemBlueprint({ ...base, conceptIds: [] }), null);
});
