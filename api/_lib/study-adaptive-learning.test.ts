import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { buildStudyLearnerModel } from './study-learner-model.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';
import {
  formatStudyAdaptiveDirective,
  loadStudyLearnerModel,
  normalizeStudyRequestContext,
  publicStudyAdaptiveMetadata,
  teachingStrategyFor,
} from './study-adaptive-learning.js';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';
const OBSERVED_AT = '2026-08-29T00:00:00.000Z';

function event(correct: boolean, misconceptionSignal = false): StudyMasteryEvidenceEvent {
  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${ATTEMPT_ID}`,
    conceptId: 'concept-1',
    kind: 'assessment_item',
    correct,
    score: correct ? 1 : 0,
    difficulty: 0.5,
    hintsUsed: 0,
    responseMs: 1000,
    selfConfidence: null,
    independent: true,
    misconceptionSignal,
    delayDays: null,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${ATTEMPT_ID}`,
    itemRef: 'motion-graphs-velocity-slope@1',
    observedAt: OBSERVED_AT,
  };
  const receipt: StudyAssessmentAttemptReceipt = {
    attemptId: ATTEMPT_ID,
    conceptId: 'concept-1',
    conceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    correct,
    score: correct ? 1 : 0,
    submittedAt: OBSERVED_AT,
  };
  return attestStudyAssessmentEvidence(row, receipt);
}

function learner(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: CONCEPT_KEY, evidence: events, estimate: estimateStudyMastery(events) });
}

test('server rejects adaptive context outside Study even when payload is forged', () => {
  const payload = { conceptKey: 'physics.motion', conceptLabel: 'Motion' };
  for (const domain of [null, 'finance', 'research', 'travel', 'coding', 'general']) {
    assert.equal(normalizeStudyRequestContext(payload, domain), null);
  }
  assert.deepEqual(normalizeStudyRequestContext(payload, 'education'), payload);
});

test('non-Study and non-consented turns do not touch learner evidence storage', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('storage must not be called'); };
  try {
    const context = { conceptKey: 'physics.motion', conceptLabel: 'Motion' };
    assert.equal(await loadStudyLearnerModel({ studioDomain: 'finance', userSub: 'learner-1', memoryConsented: true, studyContext: context }), null);
    assert.equal(await loadStudyLearnerModel({ studioDomain: 'education', userSub: 'learner-1', memoryConsented: false, studyContext: context }), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('consented Study turns validate assessment evidence against submitted attempts before adaptation', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?') && target.includes('canonical_key=eq.physics.kinematics.motion-graphs')) {
      return new Response(JSON.stringify([{ id: 'concept-1', canonical_key: CONCEPT_KEY, label: 'Motion graphs' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: 'assessment_item', correct: true, score: 1,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${ATTEMPT_ID}`, item_ref: 'motion-graphs-velocity-slope@1',
        observed_at: OBSERVED_AT,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      return new Response(JSON.stringify([{
        id: ATTEMPT_ID,
        concept_id: 'concept-1',
        item_key: 'motion-graphs-velocity-slope',
        item_version: '1',
        submitted_at: OBSERVED_AT,
        correct: true,
        score: 1,
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-1', memoryConsented: true,
      studyContext: { conceptKey: CONCEPT_KEY, conceptLabel: 'Motion graphs' },
    });
    assert.equal(model?.understanding.state, 'emerging');
    assert.equal(model?.nextLearningMove.type, 'vary_evidence');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('stored assessment-shaped rows without an authoritative attempt cannot activate adaptation', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?')) {
      return new Response(JSON.stringify([{ id: 'concept-1', canonical_key: CONCEPT_KEY, label: 'Motion graphs' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: 'assessment_item', correct: true, score: 1,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${ATTEMPT_ID}`, item_ref: 'motion-graphs-velocity-slope@1',
        observed_at: OBSERVED_AT,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-1', memoryConsented: true,
      studyContext: { conceptKey: CONCEPT_KEY, conceptLabel: 'Motion graphs' },
    });
    assert.equal(model?.understanding.state, 'unverified');
    assert.equal(model?.nextLearningMove.type, 'independent_retrieval');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('attested assessment misconception selects repair and produces a bounded directive', () => {
  const model = learner([event(false, true)]);
  assert.equal(teachingStrategyFor(model), 'misconception_repair');
  assert.match(formatStudyAdaptiveDirective(model), /Teaching strategy: misconception_repair/);
  assert.equal(publicStudyAdaptiveMetadata(model)?.misconception, 'signal_observed');
});

test('no learner model is an exact prompt and metadata no-op', () => {
  assert.equal(formatStudyAdaptiveDirective(null), '');
  assert.equal(publicStudyAdaptiveMetadata(null), undefined);
});

test('provisional attested success selects a new application strategy instead of repetition', () => {
  const model = learner([event(true)]);
  assert.equal(model.nextLearningMove.type, 'vary_evidence');
  assert.equal(teachingStrategyFor(model), 'socratic_application');
});
