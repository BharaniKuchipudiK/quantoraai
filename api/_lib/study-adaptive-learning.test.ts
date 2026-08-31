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

function event(correct: boolean): StudyMasteryEvidenceEvent {
  const submittedOptionId = correct ? 'c' : 'a';
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
    misconceptionSignal: !correct,
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
    submittedOptionId,
    correct,
    score: correct ? 1 : 0,
    submittedAt: OBSERVED_AT,
  };
  return attestStudyAssessmentEvidence(row, receipt);
}

function learner(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: CONCEPT_KEY, evidence: events, estimate: estimateStudyMastery(events) });
}

async function withStudyStoreMock(
  fetchImpl: (url: any) => Promise<Response>,
  run: () => Promise<void>,
) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  global.fetch = fetchImpl as any;
  try {
    await run();
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
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

test('consented Study turns validate assessment option receipts before adaptation', async () => {
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
        event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: true,
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
        submitted_option_id: 'a',
        submitted_at: OBSERVED_AT,
        correct: false,
        score: 0,
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-1', memoryConsented: true,
      studyContext: { conceptKey: CONCEPT_KEY, conceptLabel: 'Motion graphs' },
    });
    assert.equal(model?.misconception.state, 'signal_observed');
    assert.equal(model?.misconception.code, 'representation_misread');
    assert.equal(model?.misconception.remediation?.strategy, 'representation_bridge');
    assert.equal(model?.nextLearningMove.type, 'diagnose_misconception');
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
        event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.5, hints_used: 0, independent: true, misconception_signal: true,
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
    assert.equal(model?.misconception.code, null);
    assert.equal(model?.nextLearningMove.type, 'independent_retrieval');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('attested assessment misconception produces specific repair directive and metadata', () => {
  const model = learner([event(false)]);
  assert.equal(teachingStrategyFor(model), 'misconception_repair');
  const directive = formatStudyAdaptiveDirective(model);
  assert.match(directive, /code: representation_misread/);
  assert.match(directive, /remediation: representation_bridge/);
  assert.match(directive, /never invent another diagnosis from prose/i);
  const metadata = publicStudyAdaptiveMetadata(model);
  assert.equal(metadata?.misconception, 'signal_observed');
  assert.equal(metadata?.misconceptionCode, 'representation_misread');
  assert.equal(metadata?.misconceptionRemediation, 'representation_bridge');
  assert.match(metadata?.plannerVersion || '', /study-next-best-action/);
});

test('no learner model is an exact prompt and metadata no-op', () => {
  assert.equal(formatStudyAdaptiveDirective(null), '');
  assert.equal(publicStudyAdaptiveMetadata(null), undefined);
});

test('provisional attested success selects a new application strategy instead of repetition', () => {
  const model = learner([event(true)]);
  assert.equal(model.nextLearningMove.type, 'vary_evidence');
  assert.equal(teachingStrategyFor(model), 'socratic_application');
  assert.equal(publicStudyAdaptiveMetadata(model)?.misconceptionCode, null);
});

test('V6 checks an unverified canonical prerequisite before generic repair and ignores unadmitted retention-shaped evidence', async () => {
  const activeAttempt = '22222222-2222-4222-8222-222222222222';
  const activeObservedAt = '2026-08-31T00:00:00.000Z';
  const activeKey = 'math.vector.resultant';
  const activeId = 'resultant-id';
  const prerequisiteId = 'scalar-id';

  await withStudyStoreMock(async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?') && target.includes(`canonical_key=eq.${activeKey}`)) {
      return new Response(JSON.stringify([{ id: activeId, canonical_key: activeKey, label: 'Vector addition and resultants' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${activeAttempt}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.45, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${activeAttempt}`, item_ref: 'vector-resultant-perpendicular@1',
        observed_at: activeObservedAt,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        id: activeAttempt, concept_id: activeId, item_key: 'vector-resultant-perpendicular', item_version: '1',
        submitted_option_id: 'a', submitted_at: activeObservedAt, correct: false, score: 0,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?') && target.includes(`concept_id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concept_edges?') && target.includes(`target_concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{ source_concept_id: prerequisiteId, confidence: 0.95 }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concepts?') && target.includes(`id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([{ id: prerequisiteId, canonical_key: 'math.vector.scalar-vector', label: 'Scalar and vector quantities' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?') && target.includes(`concept_id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([{
        event_key: 'unverified-retention-shape', event_kind: 'retention_probe', correct: true, score: 1,
        difficulty: 0.3, hints_used: 0, independent: true, misconception_signal: false, delay_days: 7,
        provenance: 'derived', observed_at: '2026-08-30T00:00:00.000Z',
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-v6', memoryConsented: true,
      studyContext: { conceptKey: activeKey, conceptLabel: 'Vector addition and resultants' },
    });
    assert.equal(model?.nextLearningMove.type, 'independent_retrieval');
    assert.equal(model?.nextLearningMove.reasonCode, 'prerequisite_evidence_missing:math.vector.scalar-vector');
    assert.match(model?.nextLearningMove.instruction || '', /Scalar and vector quantities/);
    assert.match(model?.nextLearningMove.instruction || '', /never promote mastery from conversation alone/i);
    assert.equal(publicStudyAdaptiveMetadata(model)?.nextLearningReason, 'prerequisite_evidence_missing:math.vector.scalar-vector');
  });
});

test('V6 prioritizes a prerequisite with a verified specific misconception over generic active-concept repair', async () => {
  const activeAttempt = '44444444-4444-4444-8444-444444444444';
  const prerequisiteAttempt = '55555555-5555-4555-8555-555555555555';
  const activeObservedAt = '2026-08-31T00:00:00.000Z';
  const prerequisiteObservedAt = '2026-08-30T00:00:00.000Z';
  const activeKey = 'math.vector.resultant';
  const activeId = 'resultant-id';
  const prerequisiteId = 'scalar-id';

  await withStudyStoreMock(async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?') && target.includes(`canonical_key=eq.${activeKey}`)) {
      return new Response(JSON.stringify([{ id: activeId, canonical_key: activeKey, label: 'Vector addition and resultants' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${activeAttempt}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.45, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${activeAttempt}`, item_ref: 'vector-resultant-perpendicular@1',
        observed_at: activeObservedAt,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        id: activeAttempt, concept_id: activeId, item_key: 'vector-resultant-perpendicular', item_version: '1',
        submitted_option_id: 'a', submitted_at: activeObservedAt, correct: false, score: 0,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concept_edges?') && target.includes(`target_concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{ source_concept_id: prerequisiteId, confidence: 0.95 }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concepts?') && target.includes(`id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([{ id: prerequisiteId, canonical_key: 'math.vector.scalar-vector', label: 'Scalar and vector quantities' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?') && target.includes(`concept_id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${prerequisiteAttempt}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.25, hints_used: 0, independent: true, misconception_signal: true,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${prerequisiteAttempt}`, item_ref: 'scalar-vector-classification@1',
        observed_at: prerequisiteObservedAt,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?') && target.includes(`concept_id=eq.${prerequisiteId}`)) {
      return new Response(JSON.stringify([{
        id: prerequisiteAttempt, concept_id: prerequisiteId, item_key: 'scalar-vector-classification', item_version: '1',
        submitted_option_id: 'a', submitted_at: prerequisiteObservedAt, correct: false, score: 0,
      }]), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-v6', memoryConsented: true,
      studyContext: { conceptKey: activeKey, conceptLabel: 'Vector addition and resultants' },
    });
    assert.equal(model?.nextLearningMove.type, 'diagnose_misconception');
    assert.match(model?.nextLearningMove.reasonCode || '', /^prerequisite_recovery:math\.vector\.scalar-vector:active_misconception:conceptual_inversion$/);
    assert.match(model?.nextLearningMove.instruction || '', /Step back to prerequisite Scalar and vector quantities/);
    assert.match(model?.nextLearningMove.instruction || '', /Keep Vector addition and resultants unchanged in the learner truth/i);
  });
});

test('V6 fails closed when the prerequisite graph cannot be read instead of inventing a prerequisite', async () => {
  const activeAttempt = '66666666-6666-4666-8666-666666666666';
  const activeObservedAt = '2026-08-31T00:00:00.000Z';
  const activeKey = 'math.vector.resultant';
  const activeId = 'resultant-id';

  await withStudyStoreMock(async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concepts?') && target.includes(`canonical_key=eq.${activeKey}`)) {
      return new Response(JSON.stringify([{ id: activeId, canonical_key: activeKey, label: 'Vector addition and resultants' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        event_key: `study.assessment.${activeAttempt}`, event_kind: 'assessment_item', correct: false, score: 0,
        difficulty: 0.45, hints_used: 0, independent: true, misconception_signal: false,
        provenance: 'quantora_authored', source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${activeAttempt}`, item_ref: 'vector-resultant-perpendicular@1',
        observed_at: activeObservedAt,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?') && target.includes(`concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify([{
        id: activeAttempt, concept_id: activeId, item_key: 'vector-resultant-perpendicular', item_version: '1',
        submitted_option_id: 'a', submitted_at: activeObservedAt, correct: false, score: 0,
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concept_edges?') && target.includes(`target_concept_id=eq.${activeId}`)) {
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  }, async () => {
    const model = await loadStudyLearnerModel({
      studioDomain: 'education', userSub: 'learner-v6', memoryConsented: true,
      studyContext: { conceptKey: activeKey, conceptLabel: 'Vector addition and resultants' },
    });
    assert.equal(model?.nextLearningMove.type, 'guided_repair');
    assert.match(model?.nextLearningMove.reasonCode || '', /prerequisite_graph_unavailable$/);
    assert.match(model?.nextLearningMove.instruction || '', /do not name or assume a prerequisite/i);
  });
});
