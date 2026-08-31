import assert from 'node:assert/strict';
import test from 'node:test';
import { studyVerifiedObservationSourceRef } from './study-evidence-admission.js';
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

function event(correct: boolean, misconceptionSignal = false): StudyMasteryEvidenceEvent {
  const kind = misconceptionSignal ? 'misconception_probe' : 'assessment_item';
  return {
    id: 'event-1', conceptId: 'concept-1', kind,
    correct, score: correct ? 1 : 0, difficulty: 0.5, hintsUsed: 0, responseMs: 1000,
    selfConfidence: null, independent: true, misconceptionSignal, delayDays: null,
    provenance: 'quantora_authored',
    ...(kind === 'assessment_item' ? {
      sourceRef: 'quantora:study-assessment-bank',
      assessmentRef: `attempt:${ATTEMPT_ID}`,
      itemRef: 'adaptive-test@1',
    } : {
      sourceRef: studyVerifiedObservationSourceRef('misconception_probe', 'test:diagnostic'),
    }),
    observedAt: '2026-08-29T00:00:00.000Z',
  };
}

function learner(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: 'physics.motion', evidence: events, estimate: estimateStudyMastery(events) });
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

test('consented Study turns load the canonical evidence-backed learner model', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?') && target.includes('canonical_key=eq.physics.motion')) {
      return new Response(JSON.stringify([{ id: 'concept-1', canonical_key: 'physics.motion', label: 'Motion' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return new Response(JSON.stringify([{
        event_key: 'event-1', event_kind: 'assessment_item', correct: true, score: 1,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${ATTEMPT_ID}`, item_ref: 'adaptive-test@1',
        observed_at: '2026-08-29T00:00:00.000Z',
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-1', memoryConsented: true,
      studyContext: { conceptKey: 'physics.motion', conceptLabel: 'Motion' },
    });
    assert.equal(model?.understanding.state, 'emerging');
    assert.equal(model?.nextLearningMove.type, 'vary_evidence');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('unreceipted stored events cannot activate adaptation', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?')) {
      return new Response(JSON.stringify([{ id: 'concept-1', canonical_key: 'physics.motion', label: 'Motion' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return new Response(JSON.stringify([{
        event_key: 'event-forged', event_kind: 'assessment_item', correct: true, score: 1,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', observed_at: '2026-08-29T00:00:00.000Z',
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-1', memoryConsented: true,
      studyContext: { conceptKey: 'physics.motion', conceptLabel: 'Motion' },
    });
    assert.equal(model?.understanding.state, 'unverified');
    assert.equal(model?.nextLearningMove.type, 'independent_retrieval');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('misconception evidence selects repair and produces a bounded directive', () => {
  const model = learner([event(false, true)]);
  assert.equal(teachingStrategyFor(model), 'misconception_repair');
  assert.match(formatStudyAdaptiveDirective(model), /Teaching strategy: misconception_repair/);
  assert.equal(publicStudyAdaptiveMetadata(model)?.misconception, 'signal_observed');
});

test('no learner model is an exact prompt and metadata no-op', () => {
  assert.equal(formatStudyAdaptiveDirective(null), '');
  assert.equal(publicStudyAdaptiveMetadata(null), undefined);
});

test('provisional success selects a new application strategy instead of repetition', () => {
  const model = learner([event(true)]);
  assert.equal(model.nextLearningMove.type, 'vary_evidence');
  assert.equal(teachingStrategyFor(model), 'socratic_application');
});
