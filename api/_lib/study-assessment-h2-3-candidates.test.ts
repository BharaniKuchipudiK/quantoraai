import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allStudyAssessmentItems,
  studyAssessmentItemsForConcept,
  type StudyAssessmentItem,
} from './study-assessment-items.js';
import {
  validateStudyAssessmentCorpusRecord,
  type StudyAssessmentEvidencePurpose,
  type StudyAssessmentRepresentation,
} from './study-assessment-corpus.js';
import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  validateStudyAssessmentItemQuality,
  type StudyAssessmentCoveragePolicy,
} from './study-assessment-quality.js';

type CandidateInput = {
  key: string;
  conceptKey: string;
  prompt: string;
  options: StudyAssessmentItem['options'];
  correctOptionId: string;
  explanation: string;
  difficulty: number;
  objectiveCode: string;
  cognitiveOperation: StudyAssessmentItem['cognitiveOperation'];
  misconceptionOptionIds: string[];
  misconceptionByOptionId: StudyAssessmentItem['misconceptionByOptionId'];
  evidencePurpose: StudyAssessmentEvidencePurpose;
  representation: StudyAssessmentRepresentation;
  prerequisiteConceptKeys?: string[];
};

function candidate(input: CandidateInput): StudyAssessmentItem {
  const template = studyAssessmentItemsForConcept(input.conceptKey)[0];
  if (!template) throw new Error(`Missing released corpus template for ${input.conceptKey}`);
  return {
    key: input.key,
    version: '1',
    conceptKey: input.conceptKey,
    prompt: input.prompt,
    options: input.options.map((option) => ({ ...option })),
    correctOptionId: input.correctOptionId,
    explanation: input.explanation,
    difficulty: input.difficulty,
    objectiveCode: input.objectiveCode,
    cognitiveOperation: input.cognitiveOperation,
    misconceptionOptionIds: [...input.misconceptionOptionIds],
    misconceptionByOptionId: { ...input.misconceptionByOptionId },
    reviewStatus: 'draft',
    releaseMode: 'reviewed_static',
    corpus: {
      ...template.corpus,
      curriculumRefs: template.corpus.curriculumRefs.map((ref) => ({ ...ref })),
      evidencePurpose: input.evidencePurpose,
      representation: input.representation,
      prerequisiteConceptKeys: [...(input.prerequisiteConceptKeys || [])],
      provenance: {
        kind: 'quantora_authored',
        sourceRef: 'quantora:study-assessment-h2-3-review-fixture',
      },
      lifecycle: {
        state: 'in_review',
        previousState: 'draft',
        reviewRef: null,
      },
    },
  };
}

const H2_3_CANDIDATES: StudyAssessmentItem[] = [
  candidate({
    key: 'trig-functions-third-quadrant-signs',
    conceptKey: 'math.trigonometry.functions',
    prompt: 'An angle is 210°. Which sign pattern is correct for its sine and cosine?',
    options: [
      { id: 'a', text: 'Sine positive, cosine positive' },
      { id: 'b', text: 'Sine positive, cosine negative' },
      { id: 'c', text: 'Sine negative, cosine positive' },
      { id: 'd', text: 'Sine negative, cosine negative' },
    ],
    correctOptionId: 'd',
    explanation: 'An angle of 210° lies in quadrant III, where both the vertical and horizontal unit-circle coordinates are negative.',
    difficulty: 0.4,
    objectiveCode: 'trig-signs-q3',
    cognitiveOperation: 'application',
    misconceptionOptionIds: ['a', 'b', 'c'],
    misconceptionByOptionId: { a: 'sign_error', b: 'sign_error', c: 'sign_error' },
    evidencePurpose: 'application',
    representation: 'spatial',
  }),
  candidate({
    key: 'trig-identities-missing-cosine',
    conceptKey: 'math.trigonometry.identities',
    prompt: 'For an acute angle x, sin(x) = 3/5. What is cos(x)?',
    options: [
      { id: 'a', text: '2/5' },
      { id: 'b', text: '3/4' },
      { id: 'c', text: '4/5' },
      { id: 'd', text: '5/3' },
    ],
    correctOptionId: 'c',
    explanation: 'Using sin²(x) + cos²(x) = 1 gives cos²(x) = 16/25; the acute-angle condition makes cosine positive, so cos(x) = 4/5.',
    difficulty: 0.5,
    objectiveCode: 'trig-pythagorean-solve-ratio',
    cognitiveOperation: 'application',
    misconceptionOptionIds: ['a', 'b', 'd'],
    misconceptionByOptionId: { a: 'formula_selection', b: 'arithmetic_slip', d: 'formula_selection' },
    evidencePurpose: 'application',
    representation: 'quantitative',
    prerequisiteConceptKeys: ['math.trigonometry.functions'],
  }),
  candidate({
    key: 'scalar-vector-speed-velocity-distinction',
    conceptKey: 'math.vector.scalar-vector',
    prompt: 'Which extra information is needed to turn a speed of 12 m/s into a velocity?',
    options: [
      { id: 'a', text: 'A direction' },
      { id: 'b', text: 'A mass' },
      { id: 'c', text: 'A temperature' },
      { id: 'd', text: 'A time interval' },
    ],
    correctOptionId: 'a',
    explanation: 'Speed supplies magnitude only; velocity requires the same magnitude together with a direction of motion.',
    difficulty: 0.3,
    objectiveCode: 'vector-speed-velocity-distinction',
    cognitiveOperation: 'error_detection',
    misconceptionOptionIds: ['b', 'c', 'd'],
    misconceptionByOptionId: { b: 'conceptual_inversion', c: 'conceptual_inversion', d: 'conceptual_inversion' },
    evidencePurpose: 'misconception_probe',
    representation: 'text',
  }),
  candidate({
    key: 'vector-resultant-opposite-directions',
    conceptKey: 'math.vector.resultant',
    prompt: 'A 9 N force acts east and a 4 N force acts west along the same line. What is the resultant force?',
    options: [
      { id: 'a', text: '5 N east' },
      { id: 'b', text: '5 N west' },
      { id: 'c', text: '13 N east' },
      { id: 'd', text: '13 N west' },
    ],
    correctOptionId: 'a',
    explanation: 'Opposite collinear forces subtract in magnitude, and the larger force is eastward, so the resultant is 5 N east.',
    difficulty: 0.4,
    objectiveCode: 'vector-resultant-collinear-opposite',
    cognitiveOperation: 'application',
    misconceptionOptionIds: ['b', 'c', 'd'],
    misconceptionByOptionId: { b: 'sign_error', c: 'rule_outside_domain', d: 'rule_outside_domain' },
    evidencePurpose: 'misconception_probe',
    representation: 'quantitative',
    prerequisiteConceptKeys: ['math.vector.scalar-vector'],
  }),
  candidate({
    key: 'vector-components-vertical-thirty-degrees',
    conceptKey: 'math.vector.components',
    prompt: 'A 20 N vector is directed 30° above the horizontal. What is its vertical component?',
    options: [
      { id: 'a', text: '10 N' },
      { id: 'b', text: '10√3 N' },
      { id: 'c', text: '20 N' },
      { id: 'd', text: '40 N' },
    ],
    correctOptionId: 'a',
    explanation: 'The vertical component is opposite the 30° angle, so it equals 20 sin(30°) = 10 N.',
    difficulty: 0.5,
    objectiveCode: 'vector-resolve-y-component',
    cognitiveOperation: 'application',
    misconceptionOptionIds: ['b', 'c'],
    misconceptionByOptionId: { b: 'representation_misread', c: 'formula_selection' },
    evidencePurpose: 'application',
    representation: 'quantitative',
    prerequisiteConceptKeys: ['math.trigonometry.functions', 'math.vector.scalar-vector'],
  }),
  candidate({
    key: 'kinematics-constant-velocity-zero-acceleration',
    conceptKey: 'physics.kinematics.speed-velocity-acceleration',
    prompt: 'An object moves in a straight line at a constant velocity of 8 m/s. What is its acceleration?',
    options: [
      { id: 'a', text: '0 m/s²' },
      { id: 'b', text: '8 m/s²' },
      { id: 'c', text: '64 m/s²' },
      { id: 'd', text: 'It cannot be determined without the distance.' },
    ],
    correctOptionId: 'a',
    explanation: 'Acceleration measures change in velocity; a constant velocity has no change in magnitude or direction, so acceleration is zero.',
    difficulty: 0.35,
    objectiveCode: 'kinematics-constant-velocity-acceleration',
    cognitiveOperation: 'error_detection',
    misconceptionOptionIds: ['b', 'd'],
    misconceptionByOptionId: { b: 'conceptual_inversion', d: 'prerequisite_gap' },
    evidencePurpose: 'misconception_probe',
    representation: 'text',
  }),
  candidate({
    key: 'motion-plane-horizontal-launch-accelerations',
    conceptKey: 'physics.kinematics.motion-in-plane',
    prompt: 'A ball is launched horizontally and air resistance is ignored. Which acceleration components act while it is in flight?',
    options: [
      { id: 'a', text: 'Zero horizontal acceleration and downward gravitational acceleration' },
      { id: 'b', text: 'Forward horizontal acceleration and zero vertical acceleration' },
      { id: 'c', text: 'Equal horizontal and vertical accelerations' },
      { id: 'd', text: 'Zero acceleration in both directions' },
    ],
    correctOptionId: 'a',
    explanation: 'With air resistance ignored, gravity is the only acceleration and acts vertically downward; the horizontal acceleration is zero.',
    difficulty: 0.45,
    objectiveCode: 'motion-plane-component-accelerations',
    cognitiveOperation: 'error_detection',
    misconceptionOptionIds: ['b', 'c', 'd'],
    misconceptionByOptionId: { b: 'component_confusion', c: 'component_confusion', d: 'component_confusion' },
    evidencePurpose: 'misconception_probe',
    representation: 'text',
    prerequisiteConceptKeys: ['math.vector.components', 'physics.kinematics.speed-velocity-acceleration'],
  }),
  candidate({
    key: 'projectile-highest-point-components',
    conceptKey: 'physics.kinematics.projectile-motion',
    prompt: "Ignoring air resistance, which statement is true at the highest point of a projectile's flight?",
    options: [
      { id: 'a', text: 'Both horizontal and vertical velocity are zero.' },
      { id: 'b', text: 'Vertical velocity is zero while horizontal velocity remains nonzero.' },
      { id: 'c', text: 'Horizontal velocity is zero while vertical velocity remains upward.' },
      { id: 'd', text: 'Acceleration is zero because the projectile momentarily stops rising.' },
    ],
    correctOptionId: 'b',
    explanation: 'At the highest point the vertical velocity is momentarily zero, but horizontal velocity remains constant and gravity still accelerates downward.',
    difficulty: 0.5,
    objectiveCode: 'projectile-apex-components',
    cognitiveOperation: 'error_detection',
    misconceptionOptionIds: ['a', 'c', 'd'],
    misconceptionByOptionId: { a: 'component_confusion', c: 'component_confusion', d: 'conceptual_inversion' },
    evidencePurpose: 'misconception_probe',
    representation: 'text',
    prerequisiteConceptKeys: ['physics.kinematics.motion-in-plane'],
  }),
];

const H2_3_TARGET_POLICY: StudyAssessmentCoveragePolicy = {
  id: 'study-h2-reviewed-expansion-target-2026-09-02.1',
  requiredConceptKeys: [...STUDY_H2_PILOT_COVERAGE_POLICY.requiredConceptKeys],
  minReleasedItemsPerConcept: 2,
  requiredEvidencePurposes: [...STUDY_H2_PILOT_COVERAGE_POLICY.requiredEvidencePurposes],
  requiredCurricula: STUDY_H2_PILOT_COVERAGE_POLICY.requiredCurricula.map((entry) => ({ ...entry })),
};

test('H2.3 candidates are quality-valid but remain explicitly in review', () => {
  assert.equal(H2_3_CANDIDATES.length, 8);
  for (const item of H2_3_CANDIDATES) {
    assert.equal(item.reviewStatus, 'draft', `${item.key} must not claim independent approval`);
    assert.equal(item.corpus.lifecycle.state, 'in_review', `${item.key} must remain outside the released bank`);
    assert.equal(item.corpus.lifecycle.reviewRef, null, `${item.key} must not fabricate review evidence`);
    const corpus = validateStudyAssessmentCorpusRecord(item);
    assert.deepEqual(corpus.reasonCodes, [], `${item.key} has invalid staging metadata`);
    const quality = validateStudyAssessmentItemQuality(item);
    assert.deepEqual(quality.reasonCodes, [], `${item.key} fails deterministic item quality`);
  }
});

test('H2.3 candidates cannot issue verified assessment attempts before review', () => {
  for (const item of H2_3_CANDIDATES) {
    const decision = verifyStudyAssessmentRelease(item);
    assert.equal(decision.canIssueVerifiedAttempt, false, `${item.key} must remain fail-closed before independent review`);
    assert.deepEqual(decision.reasonCodes, ['assessment_corpus_item_not_released']);
  }
});

test('candidate staging does not weaken the currently released H2.2 corpus floor', () => {
  const combined = [...allStudyAssessmentItems(), ...H2_3_CANDIDATES];
  const audit = validateStudyAssessmentCorpusQuality(combined, STUDY_H2_PILOT_COVERAGE_POLICY);
  assert.deepEqual(audit.reasonCodes, []);
  assert.equal(audit.valid, true);
  assert.equal(audit.releasedItemCount, 10, 'in-review candidates must not count as released coverage');
});

test('approved promotion of all H2.3 candidates would satisfy the deliberate two-item floor', () => {
  const promoted = H2_3_CANDIDATES.map((item) => ({
    ...item,
    reviewStatus: 'approved' as const,
    corpus: {
      ...item.corpus,
      lifecycle: {
        state: 'released' as const,
        previousState: 'approved' as const,
        reviewRef: `review:h2-3:${item.key}@${item.version}`,
      },
    },
  }));
  const audit = validateStudyAssessmentCorpusQuality(
    [...allStudyAssessmentItems(), ...promoted],
    H2_3_TARGET_POLICY,
  );
  assert.deepEqual(audit.reasonCodes, []);
  assert.equal(audit.valid, true);
  assert.equal(audit.releasedItemCount, 18);
  for (const count of Object.values(audit.conceptCoverage)) assert.equal(count, 2);
});
