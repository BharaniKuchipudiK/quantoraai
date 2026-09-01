import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudyAssessmentHistory, learnerAssessmentType } from './study-assessment-history.js';

test('history projects only learner-safe assessment fields', () => {
  const history = buildStudyAssessmentHistory([
    {
      concept_id: '11111111-1111-4111-8111-111111111111',
      evidence_concept_id: null,
      evidence_kind: 'assessment_item',
      difficulty: 0.65,
      submitted_at: '2026-09-01T08:00:00.000Z',
      correct: true,
      score: 1,
      correct_option_id: 'secret-answer',
      submitted_option_id: 'a',
      user_sub: 'private-user',
    },
  ], [
    {
      id: '11111111-1111-4111-8111-111111111111',
      canonical_key: 'physics.kinematics.acceleration',
      subject: 'physics',
      label: 'Acceleration',
    },
  ]);

  assert.deepEqual(history, [{
    submittedAt: '2026-09-01T08:00:00.000Z',
    subject: 'physics',
    concept: { key: 'physics.kinematics.acceleration', label: 'Acceleration' },
    evidenceKind: 'assessment_item',
    assessmentType: 'Assessment',
    scorePercent: 100,
    correct: true,
    difficulty: 0.65,
    evidenceFor: null,
  }]);
  assert.equal('correct_option_id' in history[0], false);
  assert.equal('submitted_option_id' in history[0], false);
  assert.equal('user_sub' in history[0], false);
});

test('transfer history preserves target concept and source evidence context', () => {
  const history = buildStudyAssessmentHistory([
    {
      concept_id: '22222222-2222-4222-8222-222222222222',
      evidence_concept_id: '11111111-1111-4111-8111-111111111111',
      evidence_kind: 'transfer',
      difficulty: 0.8,
      submitted_at: '2026-08-31T08:00:00.000Z',
      correct: false,
      score: 0,
    },
  ], [
    {
      id: '11111111-1111-4111-8111-111111111111',
      canonical_key: 'math.vector.components',
      subject: 'math',
      label: 'Vector components',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      canonical_key: 'physics.forces.resultant',
      subject: 'physics',
      label: 'Resultant force',
    },
  ]);

  assert.equal(history[0].assessmentType, 'Transfer check');
  assert.deepEqual(history[0].concept, {
    key: 'physics.forces.resultant',
    label: 'Resultant force',
  });
  assert.deepEqual(history[0].evidenceFor, {
    key: 'math.vector.components',
    label: 'Vector components',
  });
  assert.equal(history[0].correct, false);
  assert.equal(history[0].scorePercent, 0);
});

test('malformed or incomplete attempt rows are omitted rather than invented', () => {
  const history = buildStudyAssessmentHistory([
    { concept_id: 'x', submitted_at: null, correct: true, score: 1, difficulty: 0.5 },
    { concept_id: 'x', submitted_at: '2026-09-01T00:00:00Z', correct: null, score: 1, difficulty: 0.5 },
    { concept_id: 'x', submitted_at: '2026-09-01T00:00:00Z', correct: true, score: 4, difficulty: 0.5 },
  ], []);
  assert.deepEqual(history, []);
});

test('assessment kind labels stay learner-facing', () => {
  assert.equal(learnerAssessmentType('retrieval'), 'Recall check');
  assert.equal(learnerAssessmentType('application'), 'Application check');
  assert.equal(learnerAssessmentType('retention_probe'), 'Retention check');
  assert.equal(learnerAssessmentType('misconception_probe'), 'Understanding check');
  assert.equal(learnerAssessmentType('unknown'), 'Assessment');
});
