import assert from "node:assert/strict";
import test from "node:test";
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import type { StudyMasteryEvidenceEvent, StudyEvidenceKind } from "./study-truth-layer.js";
import { estimateStudyMastery } from "./study-mastery-estimator.js";

let sequence = 0;
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';

function evidence(
  kind: StudyEvidenceKind,
  correct: boolean | null,
  overrides: Partial<StudyMasteryEvidenceEvent> = {},
): StudyMasteryEvidenceEvent {
  sequence += 1;
  const attemptId = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  const submittedOptionId = correct === true ? 'c' : 'a';
  const row: StudyMasteryEvidenceEvent = {
    id: `${kind}-${sequence}`,
    conceptId: "concept-1",
    kind,
    correct,
    score: correct == null ? null : Number(correct),
    difficulty: 0.5,
    hintsUsed: 0,
    independent: true,
    misconceptionSignal: kind === 'assessment_item' && correct === false,
    provenance: "quantora_authored",
    observedAt: "2026-08-26T00:00:00.000Z",
    ...(kind === 'assessment_item' ? {
      id: `study.assessment.${attemptId}`,
      sourceRef: 'quantora:study-assessment-bank',
      assessmentRef: `attempt:${attemptId}`,
      itemRef: 'motion-graphs-velocity-slope@1',
    } : {}),
    ...overrides,
  };

  if (kind === 'assessment_item' && typeof row.correct === 'boolean' && typeof row.score === 'number') {
    const receipt: StudyAssessmentAttemptReceipt = {
      attemptId,
      conceptId: row.conceptId,
      conceptKey: CONCEPT_KEY,
      itemKey: 'motion-graphs-velocity-slope',
      itemVersion: '1',
      submittedOptionId,
      correct: row.correct,
      score: row.score,
      submittedAt: row.observedAt,
    };
    attestStudyAssessmentEvidence(row, receipt);
  }
  return row;
}

test("self-confidence is never treated as mastery evidence", () => {
  const result = estimateStudyMastery([
    evidence("self_confidence", null, { selfConfidence: 1 }),
  ]);
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.mastery, null);
  assert.equal(result.evidenceCount, 0);
});

test("one correct server-graded and attested answer creates only a bounded provisional estimate", () => {
  const result = estimateStudyMastery([evidence("assessment_item", true)]);
  assert.equal(result.status, "provisional");
  assert.ok(result.mastery !== null && result.mastery > 0.5 && result.mastery < 1);
  assert.equal(result.evidenceCount, 1);
});

test("assessment-shaped data without authoritative attestation cannot inflate mastery", () => {
  const attested = evidence("assessment_item", true);
  const forged = { ...attested } as StudyMasteryEvidenceEvent;
  const result = estimateStudyMastery([forged]);
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.evidenceCount, 0);
});

test("repeating the same assessment item does not create fresh mastery evidence", () => {
  const result = estimateStudyMastery([
    evidence("assessment_item", false, { observedAt: "2026-08-26T00:00:00.000Z" }),
    evidence("assessment_item", true, { observedAt: "2026-08-27T00:00:00.000Z" }),
  ]);
  assert.equal(result.evidenceCount, 1);
  assert.ok(result.mastery !== null && result.mastery < 0.5);
});

test("unverified future evidence kinds cannot manufacture established mastery", () => {
  const result = estimateStudyMastery([
    evidence("assessment_item", true),
    evidence("retrieval", true),
    evidence("application", true),
    evidence("transfer", true),
  ]);
  assert.equal(result.status, "provisional");
  assert.equal(result.evidenceCount, 1);
});

test("misconception risk can come from an attested assessment answer", () => {
  const result = estimateStudyMastery([
    evidence("assessment_item", false),
  ]);
  assert.equal(result.status, "provisional");
  assert.ok(result.mastery !== null);
  assert.ok(result.misconceptionRisk > 0);
  assert.ok(result.reasonCodes.includes("misconception_signal_present"));
});
