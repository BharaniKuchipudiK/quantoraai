import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildStudyLearningCompass,
  normalizeStudyLearningCompassRequest,
  STUDY_LEARNING_COMPASS_MAX_FRONTIER,
} from './study-learning-compass.js';

const ACTIVE = '11111111-1111-4111-8111-111111111111';
const PREREQUISITE = '22222222-2222-4222-8222-222222222222';
const DOWNSTREAM = '33333333-3333-4333-8333-333333333333';
const CURRICULUM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AS_OF = '2026-09-07T03:00:00.000Z';

function learnerModel(conceptId: string, conceptKey: string, move = 'independent_retrieval') {
  return {
    version: 'test-learner-model',
    concept: { id: conceptId, key: conceptKey },
    understanding: {
      state: 'emerging',
      evidenceCount: 1,
      evidenceKinds: ['assessment_item'],
      observedThrough: '2026-09-05T03:00:00.000Z',
    },
    misconception: {
      state: 'none_observed',
      signalCount: 0,
      latestSignalAt: null,
      code: null,
      confidence: null,
      reasonCodes: [],
      remediation: null,
      lastResolvedCode: null,
    },
    retention: { state: 'untested', evidenceCount: 0 },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: {
      type: move,
      reasonCode: `test:${move}`,
      instruction: 'test instruction',
      learnerFacingText: 'test next move',
    },
  } as any;
}

function masteryEstimate(mastery: number | null, confidence: number, status = mastery == null ? 'insufficient_evidence' : 'provisional') {
  return {
    status,
    mastery,
    confidence,
    retention: null,
    misconceptionRisk: 0,
    evidenceCount: mastery == null ? 0 : 1,
    effectiveEvidenceWeight: mastery == null ? 0 : 1,
    observedThrough: mastery == null ? null : '2026-09-05T03:00:00.000Z',
    reasonCodes: ['test-estimate'],
  } as any;
}

function dependencies(options: { unavailableConceptId?: string } = {}) {
  const concepts = new Map([
    [ACTIVE, { id: ACTIVE, canonical_key: 'physics.motion', label: 'Motion' }],
    [PREREQUISITE, { id: PREREQUISITE, canonical_key: 'physics.vectors', label: 'Vectors' }],
    [DOWNSTREAM, { id: DOWNSTREAM, canonical_key: 'physics.forces', label: 'Forces' }],
  ]);
  const calls: string[] = [];
  const deps = {
    resolveConcept: async () => ({ id: ACTIVE, canonicalKey: 'physics.motion', label: 'Motion' }),
    readRows: async (path: string) => {
      calls.push(path);
      if (path.startsWith('study_concept_edges?') && path.includes('or=(')) {
        return [
          { source_concept_id: PREREQUISITE, target_concept_id: ACTIVE, confidence: 0.96 },
          { source_concept_id: ACTIVE, target_concept_id: DOWNSTREAM, confidence: 0.92 },
        ];
      }
      if (path.startsWith('study_concept_edges?')) {
        return [
          { source_concept_id: PREREQUISITE, target_concept_id: ACTIVE, confidence: 0.96 },
          { source_concept_id: ACTIVE, target_concept_id: DOWNSTREAM, confidence: 0.92 },
        ];
      }
      if (path.startsWith('study_concepts?')) {
        return [...concepts.values()].filter((concept) => path.includes(concept.id));
      }
      if (path.startsWith('study_curricula?')) return [{ id: CURRICULUM }];
      if (path.startsWith('study_curriculum_mappings?')) {
        return [
          { concept_id: ACTIVE, curriculum_id: CURRICULUM, exam_weight: 0.8, confidence: 0.9 },
          { concept_id: PREREQUISITE, curriculum_id: CURRICULUM, exam_weight: 0.4, confidence: 0.9 },
          { concept_id: DOWNSTREAM, curriculum_id: CURRICULUM, exam_weight: null, confidence: 0.9 },
        ];
      }
      throw new Error(`Unexpected read: ${path}`);
    },
    loadProjection: async ({ conceptId, conceptKey }: any) => {
      if (conceptId === options.unavailableConceptId) return null;
      const mastery = conceptId === PREREQUISITE ? 0.25 : conceptId === ACTIVE ? 0.5 : null;
      return {
        projection: {
          conceptId,
          conceptKey,
          observedThrough: '2026-09-05T03:00:00.000Z',
          learnerModel: learnerModel(conceptId, conceptKey),
        },
        masteryEstimate: masteryEstimate(mastery, mastery == null ? 0 : 0.4),
        source: 'checkpoint_delta',
      };
    },
    rank: undefined,
  } as any;
  delete deps.rank;
  return { deps, calls };
}

test('Learning Compass request normalization requires canonical Study context and bounds time', () => {
  assert.deepEqual(normalizeStudyLearningCompassRequest({
    conceptKey: ' physics.motion ',
    conceptLabel: ' Motion ',
    availableMinutes: 45.4,
  }), {
    conceptKey: 'physics.motion',
    conceptLabel: 'Motion',
    availableMinutes: 45,
  });
  assert.equal(normalizeStudyLearningCompassRequest({ conceptKey: '', conceptLabel: 'Motion' }), null);
  assert.equal(normalizeStudyLearningCompassRequest({ conceptKey: 'physics.motion', conceptLabel: 'Motion', availableMinutes: 'nope' }), null);
  assert.equal(normalizeStudyLearningCompassRequest({ conceptKey: 'physics.motion', conceptLabel: 'Motion', availableMinutes: 2 })?.availableMinutes, 5);
  assert.equal(normalizeStudyLearningCompassRequest({ conceptKey: 'physics.motion', conceptLabel: 'Motion', availableMinutes: 900 })?.availableMinutes, 240);
});

test('Learning Compass ranks a bounded canonical neighborhood using verified projection + mastery state', async () => {
  const { deps, calls } = dependencies();
  const result = await buildStudyLearningCompass({
    userSub: 'learner-test',
    request: { conceptKey: 'physics.motion', conceptLabel: 'Motion', availableMinutes: 30 },
    asOf: AS_OF,
  }, deps);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.activeConcept.id, ACTIVE);
  assert.equal(result.frontierSize, 3);
  assert.equal(result.loadedCandidateCount, 3);
  assert.ok(result.frontierSize <= STUDY_LEARNING_COMPASS_MAX_FRONTIER);
  assert.equal(result.availableMinutes, 30);
  assert.deepEqual(new Set(result.recommendations.map((entry) => entry.label)), new Set(['Motion', 'Vectors', 'Forces']));
  assert.ok(result.recommendations.every((entry) => entry.score >= 0 && entry.score <= 1));
  assert.ok(calls.some((path) => path.startsWith('study_curriculum_mappings?')));
  assert.ok(calls.some((path) => path.includes('relation=eq.prerequisite_of')));
});

test('Learning Compass skips an unavailable candidate projection instead of inventing learner state', async () => {
  const { deps } = dependencies({ unavailableConceptId: DOWNSTREAM });
  const result = await buildStudyLearningCompass({
    userSub: 'learner-test',
    request: { conceptKey: 'physics.motion', conceptLabel: 'Motion', availableMinutes: null },
    asOf: AS_OF,
  }, deps);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.loadedCandidateCount, 2);
  assert.ok(result.skipped.some((entry) => entry.conceptId === DOWNSTREAM && entry.reasonCode === 'verified_projection_unavailable'));
});

test('Learning Compass production route is authenticated, rate-limited and calls the canonical service', async () => {
  const route = await readFile('api/study-learning-compass.ts', 'utf8');
  assert.match(route, /requireActiveSession/);
  assert.match(route, /isRateLimited\(`study-learning-compass:/);
  assert.match(route, /normalizeStudyLearningCompassRequest/);
  assert.match(route, /buildStudyLearningCompass/);
  assert.doesNotMatch(route, /study_mastery_events.*POST|study_mastery_estimates.*POST|saveStudyMasteryEstimate/);
});

test('projection loader exposes the canonical mastery estimate on both replay paths', async () => {
  const loader = await readFile('api/_lib/study-learner-projection-loader.ts', 'utf8');
  assert.match(loader, /masteryEstimate: StudyMasteryEstimate/);
  assert.match(loader, /estimateStudyMastery\(full\.evidence\)/);
  assert.match(loader, /estimateStudyMasteryFromAccumulator\(replayed\.nextCheckpoint\.masteryState\)/);
  assert.match(loader, /return \{ projection, masteryEstimate, source: 'full_replay' \}/);
  assert.match(loader, /return \{ projection: replayed\.projection, masteryEstimate, source: 'checkpoint_delta' \}/);
});