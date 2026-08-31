import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyLearnerModel } from './study-learner-model.js';
import { applyStudyPrerequisiteNextBestAction } from './study-next-best-action.js';

const ACTIVE_ID = 'active-id';
const ACTIVE_KEY = 'math.vector.resultant';

type EvidenceFixture = {
  id: string;
  key: string;
  label: string;
  attemptId: string;
  itemKey: string;
  optionId: string;
  difficulty: number;
  misconceptionSignal: boolean;
};

const fixtures: EvidenceFixture[] = [
  {
    id: 'b-id', key: 'math.vector.components', label: 'Vector components',
    attemptId: '77777777-7777-4777-8777-777777777777', itemKey: 'vector-components-angle',
    optionId: 'c', difficulty: 0.4, misconceptionSignal: false,
  },
  {
    id: 'a-id', key: 'physics.kinematics.speed-velocity-acceleration', label: 'Speed, velocity and acceleration',
    attemptId: '88888888-8888-4888-8888-888888888888', itemKey: 'kinematics-acceleration-change',
    optionId: 'd', difficulty: 0.4, misconceptionSignal: false,
  },
  {
    id: 'c-id', key: 'physics.kinematics.motion-graphs', label: 'Motion graphs',
    attemptId: '99999999-9999-4999-8999-999999999999', itemKey: 'motion-graphs-velocity-slope',
    optionId: 'b', difficulty: 0.35, misconceptionSignal: false,
  },
  {
    id: 'd-id', key: 'math.vector.scalar-vector', label: 'Scalar and vector quantities',
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', itemKey: 'scalar-vector-classification',
    optionId: 'a', difficulty: 0.25, misconceptionSignal: true,
  },
  {
    id: 'e-id', key: 'math.trigonometry.identities', label: 'Trigonometric identities',
    attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', itemKey: 'trig-identities-unit-circle',
    optionId: 'a', difficulty: 0.3, misconceptionSignal: true,
  },
];

const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
const observedAt = '2026-08-31T00:00:00.000Z';

function activeModel(): StudyLearnerModel {
  return {
    version: 'test-v6',
    concept: { id: ACTIVE_ID, key: ACTIVE_KEY },
    understanding: {
      state: 'emerging', evidenceCount: 1, evidenceKinds: ['assessment_item'], observedThrough: observedAt,
    },
    misconception: {
      state: 'none_observed', signalCount: 0, latestSignalAt: null, code: null, confidence: null,
      reasonCodes: [], remediation: null, lastResolvedCode: null,
    },
    retention: { state: 'untested', evidenceCount: 0 },
    nextLearningMove: {
      type: 'guided_repair',
      reasonCode: 'verified_failure_requires_repair',
      instruction: 'Repair the first material error.',
      learnerFacingText: 'Next: repair the first material error.',
    },
  };
}

function evidenceRow(fixture: EvidenceFixture) {
  return {
    event_key: `study.assessment.${fixture.attemptId}`,
    event_kind: 'assessment_item',
    correct: false,
    score: 0,
    difficulty: fixture.difficulty,
    hints_used: 0,
    independent: true,
    misconception_signal: fixture.misconceptionSignal,
    provenance: 'quantora_authored',
    source_ref: 'quantora:study-assessment-bank',
    assessment_ref: `attempt:${fixture.attemptId}`,
    item_ref: `${fixture.itemKey}@1`,
    observed_at: observedAt,
  };
}

function attemptRow(fixture: EvidenceFixture) {
  return {
    id: fixture.attemptId,
    concept_id: fixture.id,
    item_key: fixture.itemKey,
    item_version: '1',
    submitted_option_id: fixture.optionId,
    submitted_at: observedAt,
    correct: false,
    score: 0,
  };
}

function targetConceptId(url: string): string | null {
  const match = url.match(/target_concept_id=eq\.([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function exactConceptId(url: string): string | null {
  const match = url.match(/&id=eq\.([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function evidenceConceptId(url: string): string | null {
  const match = url.match(/concept_id=eq\.([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

test('V6 traverses a converging prerequisite DAG with branch-local cycle state and bounded cached reads', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  const requests: string[] = [];
  const edges = new Map<string, Array<{ source_concept_id: string; confidence: number }>>([
    // Equal confidence means canonical key ordering visits b-id first.
    [ACTIVE_ID, [
      { source_concept_id: 'b-id', confidence: 0.95 },
      { source_concept_id: 'a-id', confidence: 0.95 },
    ]],
    // First branch reaches d-id shallowly.
    ['b-id', [{ source_concept_id: 'd-id', confidence: 0.95 }]],
    // Second branch reaches the same d-id through c-id, plus a competing e-id.
    ['a-id', [{ source_concept_id: 'c-id', confidence: 0.95 }]],
    ['c-id', [
      { source_concept_id: 'd-id', confidence: 0.99 },
      { source_concept_id: 'e-id', confidence: 0.90 },
    ]],
  ]);

  global.fetch = async (url: any) => {
    const target = String(url);
    requests.push(target);

    if (target.includes('/rest/v1/study_concept_edges?')) {
      const id = targetConceptId(target);
      return new Response(JSON.stringify(id ? (edges.get(id) || []) : []), { status: 200 });
    }
    if (target.includes('/rest/v1/study_concepts?') && target.includes('&id=eq.')) {
      const id = exactConceptId(target);
      const fixture = id ? byId.get(id) : null;
      return new Response(JSON.stringify(fixture ? [{ id: fixture.id, canonical_key: fixture.key, label: fixture.label }] : []), { status: 200 });
    }
    if (target.includes('/rest/v1/study_mastery_events?')) {
      const id = evidenceConceptId(target);
      const fixture = id ? byId.get(id) : null;
      return new Response(JSON.stringify(fixture ? [evidenceRow(fixture)] : []), { status: 200 });
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      const id = evidenceConceptId(target);
      const fixture = id ? byId.get(id) : null;
      return new Response(JSON.stringify(fixture ? [attemptRow(fixture)] : []), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const model = await applyStudyPrerequisiteNextBestAction({
      userSub: 'learner-v6-converging-dag',
      activeConcept: { id: ACTIVE_ID, canonicalKey: ACTIVE_KEY, label: 'Vector addition and resultants' },
      learnerModel: activeModel(),
    });

    // With one shared mutable visited set, d-id is consumed by the shallow first
    // branch and suppressed in the deeper second branch, which incorrectly lets
    // e-id win on depth. Branch-local path state must keep d-id eligible there.
    assert.equal(model.nextLearningMove.type, 'diagnose_misconception');
    assert.match(
      model.nextLearningMove.reasonCode,
      /^prerequisite_recovery:math\.vector\.scalar-vector:active_misconception:conceptual_inversion$/,
    );

    const dEvidenceReads = requests.filter((url) =>
      url.includes('/rest/v1/study_mastery_events?') && url.includes('concept_id=eq.d-id'));
    assert.equal(dEvidenceReads.length, 1, 'shared prerequisite learner evidence is cached across converging branches');

    const dConceptReads = requests.filter((url) =>
      url.includes('/rest/v1/study_concepts?') && url.includes('&id=eq.d-id'));
    assert.equal(dConceptReads.length, 1, 'shared canonical concept resolution is cached across converging branches');

    const edgeReads = requests.filter((url) => url.includes('/rest/v1/study_concept_edges?'));
    assert.ok(edgeReads.length >= 1);
    assert.ok(edgeReads.every((url) => url.includes('limit=12')), 'every graph frontier is capped before concept fan-out');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
