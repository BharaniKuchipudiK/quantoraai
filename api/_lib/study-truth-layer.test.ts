import assert from "node:assert/strict";
import test from "node:test";
import {
  curriculumRefsFor,
  normalizeStudyMasteryEvidenceEvent,
  normalizeStudyTruthSnapshot,
  prerequisiteIdsFor,
  validateStudyTruthSnapshot,
} from "./study-truth-layer.js";

function validSnapshot() {
  return normalizeStudyTruthSnapshot({
    version: "pilot-1",
    concepts: [
      { canonicalId: "math.trig.components", contentVersion: "1", subject: "mathematics", label: "Trigonometric component interpretation", status: "active", provenance: "quantora_authored", confidence: 0.95 },
      { canonicalId: "physics.vector.decomposition", contentVersion: "1", subject: "physics", label: "Vector decomposition", status: "active", provenance: "quantora_authored", confidence: 0.95 },
      { canonicalId: "physics.projectile-motion", contentVersion: "1", subject: "physics", label: "Projectile motion", status: "active", provenance: "quantora_authored", confidence: 0.95 },
    ],
    edges: [
      { sourceConceptId: "math.trig.components", targetConceptId: "physics.vector.decomposition", relation: "prerequisite_of", confidence: 0.95, provenance: "quantora_authored" },
      { sourceConceptId: "physics.vector.decomposition", targetConceptId: "physics.projectile-motion", relation: "prerequisite_of", confidence: 0.95, provenance: "quantora_authored" },
    ],
    curricula: [
      { id: "curriculum-a", jurisdiction: "example", authority: "Example Authority", name: "Physics", version: "2026", status: "active", sourceRef: "https://example.org/syllabus" },
      { id: "curriculum-b", jurisdiction: "example", authority: "Second Authority", name: "Science", version: "2026", status: "active", sourceRef: "https://example.org/second" },
    ],
    mappings: [
      { curriculumId: "curriculum-a", conceptId: "physics.projectile-motion", objectiveCode: "P1", stage: "advanced", depth: 0.9, examWeight: 0.8, confidence: 1, sourceRef: "https://example.org/syllabus#p1" },
      { curriculumId: "curriculum-b", conceptId: "physics.projectile-motion", objectiveCode: "S8", stage: "secondary", depth: 0.5, confidence: 1, sourceRef: "https://example.org/second#s8" },
    ],
  });
}

test("one canonical concept can serve multiple curriculum overlays without forking knowledge", () => {
  const snapshot = validSnapshot();
  const validation = validateStudyTruthSnapshot(snapshot);
  assert.equal(validation.valid, true);
  assert.deepEqual(curriculumRefsFor(snapshot, "physics.projectile-motion"), ["curriculum-a", "curriculum-b"]);
  assert.deepEqual(prerequisiteIdsFor(snapshot, "physics.projectile-motion"), ["physics.vector.decomposition"]);
  assert.equal(snapshot.concepts.filter((item) => item.canonicalId === "physics.projectile-motion").length, 1);
});

test("truth validation rejects prerequisite cycles and dangling mappings", () => {
  const snapshot = validSnapshot();
  snapshot.edges.push({
    sourceConceptId: "physics.projectile-motion",
    targetConceptId: "math.trig.components",
    relation: "prerequisite_of",
    confidence: 1,
    provenance: "derived",
  });
  snapshot.mappings.push({
    curriculumId: "missing-curriculum",
    conceptId: "physics.projectile-motion",
    depth: 0.5,
    examWeight: null,
    confidence: 1,
    sourceRef: "source",
  });
  const validation = validateStudyTruthSnapshot(snapshot);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.startsWith("prerequisite_cycle:")));
  assert.ok(validation.issues.includes("mapping_missing_curriculum:missing-curriculum"));
});

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
