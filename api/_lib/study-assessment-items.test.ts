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
import { selectStudyAssessmentItem } from './study-assessment-selector.js';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { isStudyMisconceptionCode } from './study-misconception-taxonomy.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

test("public Study assessment items never expose grading, diagnosis, or governance fields", () => {
  const item = studyAssessmentItemsForConcept("physics.kinematics.motion-graphs")[0];
  assert.ok(item);
  const publicItem = publicStudyAssessmentItem(item);
  for (const hidden of [
    "correctOptionId",
    "explanation",
    "misconceptionOptionIds",
    "misconceptionByOptionId",
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

test("every reviewed misconception distractor has one bounded taxonomy code", () => {
  const concepts = [
    'math.trigonometry.functions',
    'math.trigonometry.identities',
    'math.vector.scalar-vector',
    'math.vector.resultant',
    'math.vector.components',
    'physics.kinematics.speed-velocity-acceleration',
    'physics.kinematics.motion-graphs',
    'physics.kinematics.motion-in-plane',
    'physics.kinematics.projectile-motion',
  ];
  for (const conceptKey of concepts) {
    for (const item of studyAssessmentItemsForConcept(conceptKey)) {
      const optionIds = new Set(item.options.map((option) => option.id));
      assert.equal(item.misconceptionByOptionId[item.correctOptionId], undefined, `${item.key}: correct option cannot carry a misconception code`);
      for (const optionId of item.misconceptionOptionIds) {
        assert.ok(optionIds.has(optionId), `${item.key}: misconception option must exist`);
        assert.ok(isStudyMisconceptionCode(item.misconceptionByOptionId[optionId]), `${item.key}:${optionId} must have a bounded misconception code`);
      }
      for (const [optionId, code] of Object.entries(item.misconceptionByOptionId)) {
        assert.ok(optionIds.has(optionId), `${item.key}: mapped option must exist`);
        assert.notEqual(optionId, item.correctOptionId, `${item.key}: correct option cannot be mapped`);
        assert.ok(item.misconceptionOptionIds.includes(optionId), `${item.key}:${optionId} must be declared as a misconception distractor`);
        assert.ok(isStudyMisconceptionCode(code), `${item.key}:${optionId} has invalid taxonomy code`);
      }
    }
  }
});

test("motion graphs has a distinct reviewed confirmation item for representation repair", () => {
  const items = studyAssessmentItemsForConcept('physics.kinematics.motion-graphs');
  assert.deepEqual(items.map((item) => item.key), [
    'motion-graphs-velocity-slope',
    'motion-graphs-acceleration-slope',
  ]);
  assert.equal(items[0].misconceptionByOptionId.a, 'representation_misread');
  assert.equal(items[1].misconceptionByOptionId.b, 'representation_misread');
});

test("active diagnosis never reissues a sole used item as a fake confirmation probe", () => {
  const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const observedAt = '2026-08-31T08:00:00.000Z';
  const item = studyAssessmentItemsForConcept('math.vector.components')[0];
  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${attemptId}`,
    conceptId: 'concept-vector-components',
    kind: 'assessment_item',
    correct: false,
    score: 0,
    difficulty: item.difficulty,
    hintsUsed: 0,
    independent: true,
    misconceptionSignal: true,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${attemptId}`,
    itemRef: `${item.key}@${item.version}`,
    observedAt,
  };
  const receipt: StudyAssessmentAttemptReceipt = {
    attemptId,
    conceptId: row.conceptId,
    conceptKey: item.conceptKey,
    itemKey: item.key,
    itemVersion: item.version,
    submittedOptionId: 'a',
    correct: false,
    score: 0,
    submittedAt: observedAt,
  };
  attestStudyAssessmentEvidence(row, receipt);

  const selected = selectStudyAssessmentItem({
    items: [item],
    evidence: [row],
    learnerModel: { misconception: { code: 'representation_misread' } } as any,
  });
  assert.equal(selected, null);
});

test("selector skips unreleased candidates and chooses the available governed item", () => {
  const approved = studyAssessmentItemsForConcept('physics.kinematics.motion-graphs')[0];
  const draft = { ...approved, key: 'draft-shadow-item', reviewStatus: 'draft' as const };
  const generated = { ...approved, key: 'generated-shadow-item', releaseMode: 'generated' as const };
  const selected = selectStudyAssessmentItem({
    items: [draft, generated, approved],
    evidence: [],
    learnerModel: null,
  });
  assert.equal(selected?.key, approved.key);
});

test("Study assessment lookup is bound to the exact released version", () => {
  assert.ok(findStudyAssessmentItem("motion-graphs-velocity-slope", "1"));
  assert.ok(findStudyAssessmentItem("motion-graphs-acceleration-slope", "1"));
  assert.equal(findStudyAssessmentItem("motion-graphs-velocity-slope", "2"), null);
  assert.equal(findStudyAssessmentItem("unknown-item", "1"), null);
});
