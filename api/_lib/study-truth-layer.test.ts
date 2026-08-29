import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStudyMasteryEvidenceEvent,
} from "./study-truth-layer.js";

test("evidence normalization keeps learning signals but drops unknown raw response fields", () => {
  const event = normalizeStudyMasteryEvidenceEvent({
    id: "event-1",
    conceptId: "physics.projectile-motion",
    kind: "transfer",
    correct: true,
    difficulty: 0.85,
    hintsUsed: 0,
    responseMs: 32000,
    selfConfidence: 0.9,
    independent: true,
    delayDays: 3,
    provenance: "connected_source",
    sourceRef: "assessment:42",
    observedAt: "2026-08-20T06:00:00Z",
    rawAnswer: "student private free-form answer",
    chainOfThought: "must never be persisted",
  });
  assert.ok(event);
  assert.equal(event?.kind, "transfer");
  assert.equal(event?.difficulty, 0.85);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "rawAnswer"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "chainOfThought"), false);
});

test("malformed evidence is rejected instead of becoming zero mastery", () => {
  assert.equal(normalizeStudyMasteryEvidenceEvent({ conceptId: "x", kind: "retrieval" }), null);
});
