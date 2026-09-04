import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  admittedStudyMasteryEvidence,
  evaluateStudyEvidenceAdmission,
} from './study-evidence-admission.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';
import { buildStudyLearnerModel } from './study-learner-model.js';
import { planStudyTeachingRepresentation } from './study-teaching-representation.js';
import { normalizeStudyMasteryEvidenceEvent } from './study-truth-layer.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const FORBIDDEN_EVIDENCE_KIND = /representation_view|visual_view|picture_view|got_it|learner_preference|renderer_available/;

function readSibling(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

function viewedPictureEvent(overrides: Partial<StudyMasteryEvidenceEvent> = {}): StudyMasteryEvidenceEvent {
  return {
    id: 'study.representation.view',
    conceptId: 'concept-1',
    kind: 'self_confidence',
    correct: true,
    score: 1,
    difficulty: 0.5,
    hintsUsed: 0,
    selfConfidence: 1,
    independent: true,
    misconceptionSignal: false,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-picture',
    observedAt: '2026-09-04T00:00:00.000Z',
    ...overrides,
  };
}

test('the evidence vocabulary has no representation, view, or preference kind', () => {
  const truth = readSibling('./study-truth-layer.ts');
  const admission = readSibling('./study-evidence-admission.ts');
  const kinds = truth.slice(truth.indexOf('const EVIDENCE_KINDS'), truth.indexOf('function clean'));
  const verified = admission.slice(
    admission.indexOf('const VERIFIED_KINDS'),
    admission.indexOf('const ASSESSMENT_BACKED_KINDS'),
  );
  assert.match(kinds, /assessment_item/);
  assert.match(verified, /assessment_item/);
  assert.doesNotMatch(kinds, FORBIDDEN_EVIDENCE_KIND);
  assert.doesNotMatch(verified, FORBIDDEN_EVIDENCE_KIND);
});

test('a representation or view kind cannot be normalized into the mastery ledger', () => {
  const forged = normalizeStudyMasteryEvidenceEvent({
    id: 'study.representation.view',
    conceptId: 'concept-1',
    kind: 'representation_view',
    correct: true,
    score: 1,
    independent: true,
    observedAt: '2026-09-04T00:00:00.000Z',
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-picture',
  });
  assert.equal(forged, null);
});

test('viewing a picture or clicking got-it cannot enter admitted mastery', () => {
  const viewed = viewedPictureEvent();
  assert.deepEqual(evaluateStudyEvidenceAdmission(viewed), {
    admitted: false,
    reasonCode: 'unverified_evidence_kind',
  });
  assert.deepEqual(admittedStudyMasteryEvidence([viewed]), []);
  assert.equal(estimateStudyMastery([viewed]).status, 'insufficient_evidence');
  assert.equal(estimateStudyMastery([viewed]).evidenceCount, 0);
});

test('representation coverage telemetry is not an evidence event', () => {
  assert.equal(evaluateStudyEvidenceAdmission({
    id: 'representation_coverage',
    conceptId: 'concept-1',
    kind: 'representation_coverage' as StudyMasteryEvidenceEvent['kind'],
    correct: true,
    score: 1,
    hintsUsed: 0,
    independent: true,
    misconceptionSignal: false,
    provenance: 'quantora_authored',
    observedAt: '2026-09-04T00:00:00.000Z',
  }).admitted, false);
});

test('planning or showing a representation does not change the learner model', () => {
  const empty: StudyMasteryEvidenceEvent[] = [];
  const before = buildStudyLearnerModel({
    conceptId: 'concept-1',
    conceptKey: 'physics.electricity.emf-terminal-voltage',
    evidence: empty,
    estimate: estimateStudyMastery(empty),
  });

  const plan = planStudyTeachingRepresentation({
    message: 'Teach me using images',
    contextText: 'EMF versus terminal voltage in a battery circuit',
  });
  assert.equal(plan.rendererRequired, true);
  assert.equal(plan.rendererKind, 'electricity-circuit');

  const afterViewing = [viewedPictureEvent()];
  const after = buildStudyLearnerModel({
    conceptId: 'concept-1',
    conceptKey: 'physics.electricity.emf-terminal-voltage',
    evidence: afterViewing,
    estimate: estimateStudyMastery(afterViewing),
  });

  assert.equal(after.understanding.evidenceCount, before.understanding.evidenceCount);
  assert.equal(after.understanding.state, before.understanding.state);
  assert.equal(after.nextLearningMove.type, before.nextLearningMove.type);
});
