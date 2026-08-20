import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyAdvisorCandidate } from "./study-mastery-intelligence.js";
import {
  estimateStudyMastery,
  estimateStudyMasterySet,
  masteryEstimatesToAdvisorEvidence,
} from "./study-mastery-estimator.js";
import { normalizeStudyMasteryEvidenceEvents } from "./study-truth-layer.js";

const NOW = "2026-08-20T12:00:00Z";

function event(input: Record<string, unknown>) {
  return {
    id: input.id,
    conceptId: input.conceptId,
    kind: input.kind,
    correct: input.correct,
    score: input.score,
    difficulty: input.difficulty ?? 0.5,
    hintsUsed: input.hintsUsed ?? 0,
    selfConfidence: input.selfConfidence,
    independent: input.independent ?? true,
    misconceptionSignal: input.misconceptionSignal ?? false,
    delayDays: input.delayDays,
    provenance: "derived",
    sourceRef: input.sourceRef ?? input.id,
    observedAt: input.observedAt ?? "2026-08-20T10:00:00Z",
  };
}

test("no scored evidence produces insufficient evidence rather than a fabricated mastery percentage", () => {
  const events = normalizeStudyMasteryEvidenceEvents([
    event({ id: "confidence-only", conceptId: "algebra.linear", kind: "self_confidence", selfConfidence: 0.9 }),
  ]);
  const estimate = estimateStudyMastery({ conceptId: "algebra.linear", events, now: NOW });
  assert.equal(estimate.status, "insufficient_evidence");
  assert.equal(estimate.mastery, null);
  assert.equal(estimate.confidence, 0);
});

test("independent transfer evidence carries more mastery weight than hinted easy practice", () => {
  const transfer = estimateStudyMastery({
    conceptId: "vectors",
    now: NOW,
    events: normalizeStudyMasteryEvidenceEvents([
      event({ id: "t1", conceptId: "vectors", kind: "transfer", correct: true, difficulty: 0.9, hintsUsed: 0, independent: true }),
    ]),
  });
  const hinted = estimateStudyMastery({
    conceptId: "vectors",
    now: NOW,
    events: normalizeStudyMasteryEvidenceEvents([
      event({ id: "h1", conceptId: "vectors", kind: "assessment_item", correct: true, difficulty: 0.2, hintsUsed: 3, independent: false }),
    ]),
  });
  assert.ok((transfer.mastery || 0) > (hinted.mastery || 0));
  assert.ok(transfer.effectiveEvidenceWeight > hinted.effectiveEvidenceWeight);
});

test("confidently wrong evidence raises misconception risk separately from mastery", () => {
  const estimate = estimateStudyMastery({
    conceptId: "newton.third-law",
    now: NOW,
    events: normalizeStudyMasteryEvidenceEvents([
      event({ id: "m1", conceptId: "newton.third-law", kind: "misconception_probe", correct: false, difficulty: 0.4, selfConfidence: 0.95 }),
    ]),
  });
  assert.ok(estimate.mastery != null && estimate.mastery < 0.5);
  assert.ok(estimate.misconceptionRisk >= 0.8);
  assert.ok(estimate.reasonCodes.includes("confidently_wrong_signal"));
});

test("delayed retrieval creates a distinct retention estimate", () => {
  const estimate = estimateStudyMastery({
    conceptId: "trig.identities",
    now: NOW,
    events: normalizeStudyMasteryEvidenceEvents([
      event({ id: "r1", conceptId: "trig.identities", kind: "retrieval", correct: true, delayDays: 7, difficulty: 0.6 }),
      event({ id: "r2", conceptId: "trig.identities", kind: "application", correct: true, delayDays: 14, difficulty: 0.7 }),
    ]),
  });
  assert.ok(estimate.retention != null && estimate.retention > 0.5);
  assert.ok(estimate.reasonCodes.includes("delayed_retrieval_evidence"));
});

test("derived estimates bridge into bottom-up Advisor Intelligence and omit unknown prerequisites", () => {
  const concepts = [
    { id: "trig", label: "Trigonometric component interpretation", prerequisiteIds: [], examWeight: 0.8 },
    { id: "vectors", label: "Vector decomposition", prerequisiteIds: ["trig"], examWeight: 0.9 },
    { id: "projectile", label: "Projectile motion", prerequisiteIds: ["vectors"], examWeight: 0.9 },
  ];
  const events = normalizeStudyMasteryEvidenceEvents([
    event({ id: "v1", conceptId: "vectors", kind: "application", correct: false, difficulty: 0.5, selfConfidence: 0.6 }),
    event({ id: "p1", conceptId: "projectile", kind: "assessment_item", correct: false, difficulty: 0.6, selfConfidence: 0.5 }),
  ]);
  const estimates = estimateStudyMasterySet({ conceptIds: ["trig", "vectors", "projectile"], events, now: NOW });
  const advisorEvidence = masteryEstimatesToAdvisorEvidence(estimates);
  assert.equal(advisorEvidence.some((item) => item.conceptId === "trig"), false);

  const candidate = buildStudyAdvisorCandidate({
    goalLabel: "Master projectile motion",
    targetConceptIds: ["projectile"],
    concepts,
    evidence: advisorEvidence,
  });
  assert.ok(candidate.gaps.some((gap) => gap.kind === "evidence_gap" && gap.label.includes("Trigonometric")));
  assert.ok(candidate.interventions.some((item) => item.label.includes("diagnostic") && item.label.includes("Trigonometric")));
});
