import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  validateStudyAssessmentItemQuality,
  type StudyAssessmentQualityCandidate,
} from './study-assessment-quality.js';
import { STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION } from './study-assessment-corpus.js';

function item(overrides: Partial<StudyAssessmentQualityCandidate> = {}): StudyAssessmentQualityCandidate {
  return {
    key: 'quality-fixture',
    version: '1',
    conceptKey: 'physics.kinematics.motion-graphs',
    objectiveCode: 'motion-graph-displacement-slope',
    prompt: 'On a displacement-time graph, what does the slope at a point represent?',
    options: [
      { id: 'a', text: 'Acceleration' },
      { id: 'b', text: 'Displacement' },
      { id: 'c', text: 'Velocity' },
      { id: 'd', text: 'Distance travelled' },
    ],
    correctOptionId: 'c',
    explanation: 'The slope is change in displacement divided by change in time, which is velocity.',
    reviewStatus: 'approved',
    releaseMode: 'reviewed_static',
    corpus: {
      schemaVersion: STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION,
      subject: 'physics',
      curriculumRefs: [{
        curriculumKey: 'sg.seab.olevel.physics.6091',
        curriculumVersion: '2026',
        objectiveCode: '2(e-h)',
        level: 'O-Level Physics',
      }],
      evidencePurpose: 'diagnostic',
      representation: 'graph_interpretation',
      prerequisiteConceptKeys: ['physics.kinematics.speed-velocity-acceleration'],
      provenance: { kind: 'quantora_authored', sourceRef: 'quantora:study-assessment-bank' },
      lifecycle: { state: 'released', previousState: 'approved', reviewRef: 'review:quality-fixture@1' },
    },
    ...overrides,
  };
}

test('item quality gate rejects ambiguous options, thin explanation and answer leakage', () => {
  const invalid = item({
    prompt: 'Correct answer: choose the velocity option.',
    options: [
      { id: 'a', text: 'Velocity' },
      { id: 'b', text: ' velocity ' },
    ],
    correctOptionId: 'a',
    explanation: 'Velocity.',
  });
  const decision = validateStudyAssessmentItemQuality(invalid);
  assert.equal(decision.valid, false);
  assert.deepEqual(decision.reasonCodes, [
    'quality_duplicate_option_text',
    'quality_explanation_repeats_answer_only',
    'quality_explanation_too_thin',
    'quality_prompt_answer_leakage',
  ]);
});

test('item option deduplication preserves mathematical operators', () => {
  const trig = validateStudyAssessmentItemQuality(item({
    options: [
      { id: 'a', text: 'sin(x) + cos(x)' },
      { id: 'b', text: 'sin²(x) + cos²(x)' },
      { id: 'c', text: 'tan(x) + cot(x)' },
      { id: 'd', text: 'sin(x)cos(x)' },
    ],
    correctOptionId: 'b',
    explanation: 'The Pythagorean identity sin²(x) + cos²(x) = 1 follows from the unit circle.',
  }));
  assert.equal(trig.valid, true);
  assert.equal(trig.reasonCodes.includes('quality_duplicate_option_text'), false);

  const vector = validateStudyAssessmentItemQuality(item({
    options: [
      { id: 'a', text: 'V sin(θ)' },
      { id: 'b', text: 'V cos(θ)' },
      { id: 'c', text: 'V tan(θ)' },
      { id: 'd', text: 'V / cos(θ)' },
    ],
    correctOptionId: 'b',
    explanation: 'The x-component is adjacent to θ in the component triangle, so it is V cos(θ).',
  }));
  assert.equal(vector.valid, true);
  assert.equal(vector.reasonCodes.includes('quality_duplicate_option_text'), false);
});

test('item option deduplication still catches cosmetic mathematical duplicates', () => {
  const decision = validateStudyAssessmentItemQuality(item({
    options: [
      { id: 'a', text: 'V / cos(θ)' },
      { id: 'b', text: ' v/cos(θ) ' },
      { id: 'c', text: 'V cos(θ)' },
    ],
    correctOptionId: 'c',
  }));
  assert.equal(decision.valid, false);
  assert.ok(decision.reasonCodes.includes('quality_duplicate_option_text'));
});

test('corpus gate rejects exact and near-duplicate prompts inside the same objective', () => {
  const first = item({ key: 'first' });
  const exact = item({ key: 'exact-copy' });
  const near = item({
    key: 'near-copy',
    prompt: 'On a displacement time graph, what does the slope at one point represent?',
  });
  const decision = validateStudyAssessmentCorpusQuality([first, exact, near], {
    id: 'duplicates-only',
    requiredConceptKeys: [],
    minReleasedItemsPerConcept: 1,
    requiredEvidencePurposes: [],
    requiredCurricula: [],
  });
  assert.equal(decision.valid, false);
  assert.ok(decision.reasonCodes.includes('duplicate_prompt:first@1:exact-copy@1'));
  assert.ok(decision.reasonCodes.some((reason) => reason.startsWith('near_duplicate_prompt:first@1:near-copy@1')));
});

test('coverage gate makes the pilot baseline explicit and fails closed on missing breadth', () => {
  const decision = validateStudyAssessmentCorpusQuality([item()], STUDY_H2_PILOT_COVERAGE_POLICY);
  assert.equal(decision.valid, false);
  assert.equal(decision.releasedItemCount, 1);
  assert.ok(decision.reasonCodes.includes('coverage_concept_below_threshold:math.trigonometry.functions:0/1'));
  assert.ok(decision.reasonCodes.includes('coverage_evidence_purpose_missing:retrieval'));
  assert.ok(decision.reasonCodes.includes('coverage_curriculum_missing:in.nta.jeemain.paper1@2026'));
});
