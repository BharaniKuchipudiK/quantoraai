import assert from "node:assert/strict";
import test from "node:test";
import type { StudyMasteryEvidenceEvent, StudyEvidenceKind } from "./study-truth-layer.js";
import { estimateStudyMastery } from "./study-mastery-estimator.js";

function evidence(
  kind: StudyEvidenceKind,
  correct: boolean | null,
  overrides: Partial<StudyMasteryEvidenceEvent> = {},
): StudyMasteryEvidenceEvent {
  return {
    id: `${kind}-${Math.random()}`,
    conceptId: "concept-1",
    kind,
    correct,
    score: correct == null ? null : Number(correct),
    difficulty: 0.5,
    hintsUsed: 0,
    independent: true,
    misconceptionSignal: false,
    provenance: "quantora_authored",
    observedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

test("self-confidence is never treated as mastery evidence", () => {
  const result = estimateStudyMastery([
    evidence("self_confidence", null, { selfConfidence: 1 }),
  ]);
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.mastery, null);
  assert.equal(result.evidenceCount, 0);
});

test("one correct server-graded answer creates only a bounded provisional estimate", () => {
  const result = estimateStudyMastery([evidence("assessment_item", true)]);
  assert.equal(result.status, "provisional");
  assert.ok(result.mastery !== null && result.mastery > 0.5 && result.mastery < 1);
  assert.equal(result.evidenceCount, 1);
});

test("diverse independent evidence can establish mastery", () => {
  const result = estimateStudyMastery([
    evidence("assessment_item", true),
    evidence("retrieval", true),
    evidence("application", true),
    evidence("transfer", true),
  ]);
  assert.equal(result.status, "established");
  assert.equal(result.evidenceCount, 4);
});

test("misconception risk stays separate from mastery", () => {
  const result = estimateStudyMastery([
    evidence("misconception_probe", false, { misconceptionSignal: true }),
  ]);
  assert.equal(result.status, "provisional");
  assert.ok(result.mastery !== null);
  assert.ok(result.misconceptionRisk > 0);
  assert.ok(result.reasonCodes.includes("misconception_signal_present"));
});
