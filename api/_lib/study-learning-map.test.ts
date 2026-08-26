import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyLearningMap } from "./study-learning-map.js";

const concepts = [
  { id: "physics.forces.fbd", label: "Free-body diagrams" },
  { id: "physics.forces.friction", label: "Friction" },
  { id: "physics.forces.tension", label: "Tension" },
];

test("self-confidence never becomes verified understanding", () => {
  const map = buildStudyLearningMap(concepts, [{
    id: "event-1", conceptId: "physics.forces.fbd", kind: "self_confidence",
    independent: false, misconceptionSignal: false, observedAt: "2026-08-26T00:00:00Z",
  }]);
  assert.equal(map[0].state, "insufficient_evidence");
  assert.equal(map[0].verifiedEvidenceCount, 0);
  assert.equal(JSON.stringify(map).includes("pass"), false);
  assert.equal(JSON.stringify(map).includes("rank"), false);
});
test("two independent positive checks can produce verified understanding", () => {
  const map = buildStudyLearningMap(concepts, [
    { id: "event-1", conceptId: "physics.forces.fbd", kind: "assessment_item", correct: true, independent: true, misconceptionSignal: false, observedAt: "2026-08-25T00:00:00Z" },
    { id: "event-2", conceptId: "physics.forces.fbd", kind: "transfer", score: 0.9, independent: true, misconceptionSignal: false, observedAt: "2026-08-26T00:00:00Z" },
  ]);
  assert.equal(map[0].state, "verified_understanding");
  assert.equal(map[0].verifiedEvidenceCount, 2);
  assert.equal(map[1].state, "not_assessed");
});

test("a verified misconception signal outranks positive evidence", () => {
  const map = buildStudyLearningMap(concepts, [
    { id: "event-1", conceptId: "physics.forces.friction", kind: "assessment_item", correct: true, independent: true, misconceptionSignal: false, observedAt: "2026-08-25T00:00:00Z" },
    { id: "event-2", conceptId: "physics.forces.friction", kind: "misconception_probe", correct: false, independent: true, misconceptionSignal: true, observedAt: "2026-08-26T00:00:00Z" },
  ]);
  assert.equal(map[1].state, "misconception_detected");
});
