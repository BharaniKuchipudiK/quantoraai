import assert from "node:assert/strict";
import test from "node:test";
import {
  findStudyAssessmentItem,
  publicStudyAssessmentItem,
  studyAssessmentItemsForConcept,
} from "./study-assessment-items.js";

test("public Study assessment items never expose grading fields", () => {
  const item = studyAssessmentItemsForConcept("physics.kinematics.motion-graphs")[0];
  assert.ok(item);
  const publicItem = publicStudyAssessmentItem(item);
  assert.equal("correctOptionId" in publicItem, false);
  assert.equal("explanation" in publicItem, false);
  assert.equal("misconceptionOptionIds" in publicItem, false);
  assert.deepEqual(publicItem.options, item.options);
});

test("Study assessment lookup is bound to the exact released version", () => {
  assert.ok(findStudyAssessmentItem("motion-graphs-velocity-slope", "1"));
  assert.equal(findStudyAssessmentItem("motion-graphs-velocity-slope", "2"), null);
  assert.equal(findStudyAssessmentItem("unknown-item", "1"), null);
});
