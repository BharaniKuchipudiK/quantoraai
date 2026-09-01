import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION,
  validateStudyAssessmentCorpusRecord,
  type StudyAssessmentCorpusRecord,
} from './study-assessment-corpus.js';

function record(overrides: Partial<StudyAssessmentCorpusRecord> = {}): StudyAssessmentCorpusRecord {
  return {
    key: 'motion-graphs-velocity-slope',
    version: '1',
    conceptKey: 'physics.kinematics.motion-graphs',
    objectiveCode: 'motion-graph-displacement-slope',
    difficulty: 0.35,
    reviewStatus: 'approved',
    releaseMode: 'reviewed_static',
    corpus: {
      schemaVersion: STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION,
      subject: 'physics',
      curriculumRefs: [{ curriculumKey: 'sg.seab.olevel.physics.6091', curriculumVersion: '2026', objectiveCode: '2(e-h)', level: 'O-Level Physics' }],
      evidencePurpose: 'diagnostic',
      representation: 'graph_interpretation',
      prerequisiteConceptKeys: ['physics.kinematics.speed-velocity-acceleration'],
      provenance: { kind: 'quantora_authored', sourceRef: 'quantora:study-assessment-bank' },
      lifecycle: { state: 'released', previousState: 'approved', reviewRef: 'review:motion-graphs-velocity-slope@1' },
    },
    ...overrides,
  };
}

test('corpus lifecycle requires review before release and permits retirement', () => {
  const invalid = record({
    corpus: {
      ...record().corpus,
      lifecycle: { state: 'released', previousState: 'draft', reviewRef: 'review:motion-graphs-velocity-slope@1' },
    },
  });
  assert.deepEqual(validateStudyAssessmentCorpusRecord(invalid).reasonCodes, [
    'invalid_corpus_lifecycle_transition',
  ]);

  const retired = record({
    corpus: {
      ...record().corpus,
      lifecycle: { state: 'retired', previousState: 'released', reviewRef: 'review:motion-graphs-velocity-slope@1' },
    },
  });
  assert.equal(validateStudyAssessmentCorpusRecord(retired).valid, true);
});

test('released corpus record requires approval, static governance and review evidence', () => {
  const invalid = record({
    reviewStatus: 'draft',
    corpus: { ...record().corpus, lifecycle: { state: 'released', previousState: 'approved', reviewRef: null } },
  });
  const validation = validateStudyAssessmentCorpusRecord(invalid);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.reasonCodes, [
    'released_corpus_item_missing_review_ref',
    'released_corpus_item_not_approved',
  ]);
});

test('corpus record requires explicit curriculum and provenance mappings', () => {
  const invalid = record({
    corpus: {
      ...record().corpus,
      curriculumRefs: [],
      provenance: { kind: 'quantora_authored', sourceRef: ' ' },
    },
  });
  const validation = validateStudyAssessmentCorpusRecord(invalid);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.reasonCodes, [
    'missing_corpus_curriculum_mapping',
    'missing_corpus_provenance',
  ]);
});
