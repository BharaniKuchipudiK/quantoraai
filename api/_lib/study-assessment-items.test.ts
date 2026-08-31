import assert from "node:assert/strict";
import test from "node:test";
import './study-assessment-governance.test.js';
import './study-evidence-admission.test.js';
import './study-verified-learning-loop.test.js';
import {
  findStudyAssessmentItem,
  publicStudyAssessmentItem,
  studyAssessmentItemsForConcept,
} from "./study-assessment-items.js";

test("public Study assessment items never expose grading or governance fields", () => {
  const item = studyAssessmentItemsForConcept("physics.kinematics.motion-graphs")[0];
  assert.ok(item);
  const publicItem = publicStudyAssessmentItem(item);
  for (const hidden of [
    "correctOptionId",
    "explanation",
    "misconceptionOptionIds",
    "reviewStatus",
    "releaseMode",
    "objectiveCode",
    "cognitiveOperation",
    "difficulty",
  ]) {
    assert.equal(hidden in publicItem, false, `${hidden} must remain server-side`);
  }
  assert.deepEqual(publicItem.options, item.options);
});

test("Study assessment lookup is bound to the exact released version", () => {
  assert.ok(findStudyAssessmentItem("motion-graphs-velocity-slope", "1"));
  assert.equal(findStudyAssessmentItem("motion-graphs-velocity-slope", "2"), null);
  assert.equal(findStudyAssessmentItem("unknown-item", "1"), null);
});
