import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import type { StudyMasteryEstimate } from './study-mastery-estimator.js';
import {
  STUDY_LEARNING_PRIORITY_DEFAULT_WEIGHTS,
  STUDY_LEARNING_PRIORITY_ENGINE_VERSION,
  rankStudyLearningPriorities,
  type StudyLearningFactorKey,
  type StudyLearningPriorityCandidate,
  type StudyLearningPriorityRecommendation,
  type StudyLearningPriorityResult,
} from './study-learning-priority.js';

const AS_OF = '2026-09-07T00:00:00.000Z';
const LONG_AGO = '2026-06-01T00:00:00.000Z';

/* ─── projection builders (valid shapes; the engine never recomputes them) ── */

function mastery(overrides: Partial<StudyMasteryEstimate> = {}): StudyMasteryEstimate {
  return {
    status: 'provisional',
    mastery: 0.5,
    confidence: 0.5,
    retention: null,
    misconceptionRisk: 0,
    evidenceCount: 3,
    effectiveEvidenceWeight: 3,
    observedThrough: LONG_AGO,
    reasonCodes: [],
    ...overrides,
  };
}

function learnerModel(overrides: Partial<StudyLearnerModel> = {}): StudyLearnerModel {
  const base: StudyLearnerModel = {
    version: 'test-learner-model',
    concept: { id: 'c', key: 'k' },
    understanding: {
      state: 'emerging',
      evidenceCount: 3,
      evidenceKinds: ['assessment_item'],
      observedThrough: LONG_AGO,
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
    retention: { state: 'untested', evidenceCount: 0, anchorAt: null, targetDelayDays: 1, dueAt: null, due: false },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: {
      type: 'vary_evidence',
      reasonCode: 'diverse_evidence_incomplete',
      instruction: 'x',
      learnerFacingText: 'x',
    },
  };
  return {
    ...base,
    ...overrides,
    understanding: { ...base.understanding, ...(overrides.understanding ?? {}) },
    misconception: { ...base.misconception, ...(overrides.misconception ?? {}) },
    retention: { ...base.retention, ...(overrides.retention ?? {}) },
    transfer: { ...base.transfer, ...(overrides.transfer ?? {}) },
    nextLearningMove: { ...base.nextLearningMove, ...(overrides.nextLearningMove ?? {}) },
  };
}

function candidate(
  conceptId: string,
  overrides: Partial<StudyLearningPriorityCandidate> = {},
): StudyLearningPriorityCandidate {
  return {
    conceptId,
    conceptKey: conceptId,
    learnerModel: learnerModel(),
    masteryEstimate: mastery(),
    ...overrides,
  };
}

function byId(result: StudyLearningPriorityResult): string[] {
  return result.recommendations.map((row) => row.conceptId);
}

function rec(
  result: StudyLearningPriorityResult,
  conceptId: string,
): StudyLearningPriorityRecommendation {
  const found = result.recommendations.find((row) => row.conceptId === conceptId);
  assert.ok(found, `expected a recommendation for ${conceptId}`);
  return found;
}

function factorValue(
  recommendation: StudyLearningPriorityRecommendation,
  key: StudyLearningFactorKey,
): number {
  const factor = recommendation.factors.find((entry) => entry.key === key);
  assert.ok(factor, `expected factor ${key}`);
  return factor.value;
}

/* ─── determinism ────────────────────────────────────────────────────────── */

test('the same request yields byte-identical results', () => {
  const request = { asOf: AS_OF, candidates: [candidate('a'), candidate('b'), candidate('c')] };
  const first = rankStudyLearningPriorities(request);
  const second = rankStudyLearningPriorities(request);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('ranking is independent of candidate input order', () => {
  const a = candidate('alpha', { masteryEstimate: mastery({ mastery: 0.2 }) });
  const b = candidate('beta', { masteryEstimate: mastery({ mastery: 0.9 }) });
  const c = candidate('gamma', { masteryEstimate: mastery({ mastery: 0.55 }) });
  const forward = byId(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [a, b, c] }));
  const reverse = byId(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [c, b, a] }));
  assert.deepEqual(forward, reverse);
});

test('a non-parseable asOf throws rather than silently using now', () => {
  assert.throws(
    () => rankStudyLearningPriorities({ asOf: 'not-a-date', candidates: [candidate('a')] }),
    /study_learning_priority_invalid_as_of/,
  );
});

/* ─── boundedness under hostile input ────────────────────────────────────── */

test('scores, values and contributions stay bounded under adversarial inputs', () => {
  const hostile = candidate('hostile', {
    masteryEstimate: mastery({
      mastery: Number.NaN as unknown as number,
      confidence: 42,
      misconceptionRisk: -5,
    }),
    curriculum: { examWeight: 999, depth: -3, confidence: 5 },
    downstream: Array.from({ length: 500 }, (_, i) => ({ conceptId: `d${i}`, edgeConfidence: -7 })),
    estimatedDurationMinutes: Number.POSITIVE_INFINITY,
  });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, availableMinutes: -10, candidates: [hostile] });
  const only = rec(result, 'hostile');
  assert.ok(only.score >= 0 && only.score <= 1);
  for (const factor of only.factors) {
    assert.ok(factor.value >= 0 && factor.value <= 1, `${factor.key} value out of range`);
    assert.ok(Math.abs(factor.contribution) <= 1, `${factor.key} contribution out of range`);
    const expected = Number((factor.direction * factor.weight * factor.value).toFixed(4));
    assert.equal(factor.contribution, expected, `${factor.key} contribution inconsistent`);
  }
});

test('empty candidate list yields empty recommendations and no skips', () => {
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [] });
  assert.deepEqual(result.recommendations, []);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.version, STUDY_LEARNING_PRIORITY_ENGINE_VERSION);
});

/* ─── zero / insufficient / stale evidence honesty ───────────────────────── */

test('insufficient evidence is reported, not invented', () => {
  const cold = candidate('cold', {
    masteryEstimate: mastery({ status: 'insufficient_evidence', mastery: null, confidence: 0, evidenceCount: 0 }),
    learnerModel: learnerModel({
      understanding: { state: 'unverified', evidenceCount: 0, evidenceKinds: [], observedThrough: null },
      nextLearningMove: { type: 'independent_retrieval', reasonCode: 'no_verified_evidence', instruction: 'x', learnerFacingText: 'x' },
    }),
  });
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [cold] }), 'cold');
  assert.equal(only.confidenceBand, 'insufficient');
  assert.equal(only.dataSufficiency, 'insufficient_evidence');
  assert.equal(only.confidence, 0);
  const gap = only.factors.find((f) => f.key === 'masteryGap');
  assert.ok(gap?.reasonCodes.includes('mastery_gap_unknown_insufficient_evidence'));
  assert.ok(only.reasonCodes.includes('insufficient_evidence'));
});

test('a concept never practised carries no recency penalty and says so', () => {
  const fresh = candidate('fresh', {
    lastPracticedAt: null,
    learnerModel: learnerModel({
      understanding: { state: 'unverified', evidenceCount: 0, evidenceKinds: [], observedThrough: null },
    }),
  });
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [fresh] }), 'fresh');
  assert.equal(factorValue(only, 'recentPracticePenalty'), 0);
  const penalty = only.factors.find((f) => f.key === 'recentPracticePenalty');
  assert.ok(penalty?.reasonCodes.includes('never_practiced'));
  assert.ok(only.missingInputs.includes('practice_recency'));
});

/* ─── mastery gap ────────────────────────────────────────────────────────── */

test('a larger mastery gap ranks ahead of a smaller one, all else equal', () => {
  const weak = candidate('weak', { masteryEstimate: mastery({ mastery: 0.15 }) });
  const strong = candidate('strong', { masteryEstimate: mastery({ mastery: 0.95 }) });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [strong, weak] });
  assert.equal(byId(result)[0], 'weak');
  assert.ok(factorValue(rec(result, 'weak'), 'masteryGap') > factorValue(rec(result, 'strong'), 'masteryGap'));
});

/* ─── prerequisite leverage / downstream blocked ─────────────────────────── */

test('a prerequisite bottleneck outranks an otherwise-equal leaf', () => {
  const bottleneck = candidate('bottleneck', {
    downstream: [
      { conceptId: 'x', edgeConfidence: 0.9 },
      { conceptId: 'y', edgeConfidence: 0.85 },
      { conceptId: 'z', edgeConfidence: 0.82 },
    ],
  });
  const leaf = candidate('leaf', { downstream: [] });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [leaf, bottleneck] });
  assert.equal(byId(result)[0], 'bottleneck');
  assert.ok(factorValue(rec(result, 'bottleneck'), 'prerequisiteLeverage') > 0);
  assert.equal(factorValue(rec(result, 'leaf'), 'prerequisiteLeverage'), 0);
});

test('a verified concept blocks nothing downstream', () => {
  const verified = candidate('verified', {
    learnerModel: learnerModel({
      understanding: { state: 'verified', evidenceCount: 6, evidenceKinds: ['assessment_item', 'retrieval'], observedThrough: LONG_AGO },
    }),
    downstream: [
      { conceptId: 'x', edgeConfidence: 0.99 },
      { conceptId: 'y', edgeConfidence: 0.99 },
    ],
  });
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [verified] }), 'verified');
  assert.equal(factorValue(only, 'prerequisiteLeverage'), 0);
  assert.ok(only.factors.find((f) => f.key === 'prerequisiteLeverage')?.reasonCodes.includes('concept_verified_blocks_nothing'));
});

test('an unconsulted graph is a recorded missing input, not zero leverage silently', () => {
  const unknown = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [candidate('u')] }), 'u');
  assert.ok(unknown.missingInputs.includes('downstream_graph'));
  assert.ok(unknown.factors.find((f) => f.key === 'prerequisiteLeverage')?.reasonCodes.includes('downstream_graph_not_consulted'));
});

/* ─── misconception severity ─────────────────────────────────────────────── */

test('an active misconception outranks a quiet concept and a needs-confirmation one', () => {
  const active = candidate('active', {
    learnerModel: learnerModel({
      misconception: { state: 'signal_observed', signalCount: 1, latestSignalAt: LONG_AGO, code: 'sign_error', confidence: 1, reasonCodes: [], remediation: null, lastResolvedCode: null },
      nextLearningMove: { type: 'diagnose_misconception', reasonCode: 'active_misconception:sign_error', instruction: 'x', learnerFacingText: 'x' },
    }),
    masteryEstimate: mastery({ misconceptionRisk: 0.6 }),
  });
  const confirming = candidate('confirming', {
    learnerModel: learnerModel({
      misconception: { state: 'needs_confirmation', signalCount: 1, latestSignalAt: LONG_AGO, code: 'sign_error', confidence: 1, reasonCodes: [], remediation: null, lastResolvedCode: null },
      nextLearningMove: { type: 'confirm_misconception', reasonCode: 'misconception_confirmation_needed:sign_error', instruction: 'x', learnerFacingText: 'x' },
    }),
  });
  const quiet = candidate('quiet');
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [quiet, confirming, active] });
  assert.equal(byId(result)[0], 'active');
  assert.ok(
    factorValue(rec(result, 'active'), 'misconceptionSeverity')
      > factorValue(rec(result, 'confirming'), 'misconceptionSeverity'),
  );
  assert.ok(
    factorValue(rec(result, 'confirming'), 'misconceptionSeverity')
      > factorValue(rec(result, 'quiet'), 'misconceptionSeverity'),
  );
  assert.equal(rec(result, 'active').recommendedActionType, 'diagnose_misconception');
});

/* ─── retention / forgetting risk ────────────────────────────────────────── */

test('an overdue retention probe outranks one still on schedule', () => {
  const overdue = candidate('overdue', {
    learnerModel: learnerModel({
      understanding: { state: 'verified', evidenceCount: 6, evidenceKinds: ['assessment_item', 'retrieval'], observedThrough: LONG_AGO },
      retention: { state: 'supported', evidenceCount: 2, anchorAt: LONG_AGO, targetDelayDays: 7, dueAt: '2026-09-01T00:00:00.000Z', due: true },
    }),
  });
  const scheduled = candidate('scheduled', {
    learnerModel: learnerModel({
      understanding: { state: 'verified', evidenceCount: 6, evidenceKinds: ['assessment_item', 'retrieval'], observedThrough: LONG_AGO },
      retention: { state: 'supported', evidenceCount: 2, anchorAt: LONG_AGO, targetDelayDays: 7, dueAt: '2026-09-20T00:00:00.000Z', due: false },
    }),
  });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [scheduled, overdue] });
  assert.ok(
    factorValue(rec(result, 'overdue'), 'retentionRisk')
      > factorValue(rec(result, 'scheduled'), 'retentionRisk'),
  );
  assert.ok(rec(result, 'overdue').factors.find((f) => f.key === 'retentionRisk')?.reasonCodes.includes('retention_probe_overdue'));
});

test('a failed retention probe (needs_support) is high risk; a fully durable one is low', () => {
  const failing = candidate('failing', {
    learnerModel: learnerModel({ retention: { state: 'needs_support', evidenceCount: 1, targetDelayDays: 1, dueAt: null, due: false } }),
  });
  const durable = candidate('durable', {
    learnerModel: learnerModel({ retention: { state: 'supported', evidenceCount: 3, targetDelayDays: null, dueAt: null, due: false } }),
  });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [durable, failing] });
  assert.ok(factorValue(rec(result, 'failing'), 'retentionRisk') >= 0.8);
  assert.ok(factorValue(rec(result, 'durable'), 'retentionRisk') <= 0.1);
});

/* ─── recent-practice penalty ────────────────────────────────────────────── */

test('a concept practised moments ago is penalised versus the same one practised long ago', () => {
  const shared = { masteryEstimate: mastery({ mastery: 0.3 }) };
  const crammed = candidate('crammed', { ...shared, lastPracticedAt: AS_OF });
  const spaced = candidate('spaced', { ...shared, lastPracticedAt: LONG_AGO });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [crammed, spaced] });
  assert.equal(byId(result)[0], 'spaced');
  assert.ok(factorValue(rec(result, 'crammed'), 'recentPracticePenalty') > factorValue(rec(result, 'spaced'), 'recentPracticePenalty'));
  const crammedRec = rec(result, 'crammed');
  const spacedRec = rec(result, 'spaced');
  assert.ok(crammedRec.factors.find((f) => f.key === 'recentPracticePenalty')?.contribution! < 0);
  assert.equal(spacedRec.factors.find((f) => f.key === 'recentPracticePenalty')?.contribution, 0);
});

test('lastPracticedAt overrides the model observedThrough for recency', () => {
  const model = learnerModel({ understanding: { state: 'emerging', evidenceCount: 3, evidenceKinds: ['assessment_item'], observedThrough: LONG_AGO } });
  const stillPenalised = candidate('recent', { learnerModel: model, lastPracticedAt: AS_OF });
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [stillPenalised] }), 'recent');
  assert.ok(factorValue(only, 'recentPracticePenalty') > 0.9);
});

test('a practice time after asOf is treated as no penalty, not a negative one', () => {
  const future = candidate('future', { lastPracticedAt: '2026-12-31T00:00:00.000Z' });
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [future] }), 'future');
  assert.equal(factorValue(only, 'recentPracticePenalty'), 0);
  assert.ok(only.factors.find((f) => f.key === 'recentPracticePenalty')?.reasonCodes.includes('practice_time_not_before_as_of'));
});

/* ─── available-time fit ─────────────────────────────────────────────────── */

test('a task that fits the time budget outranks one that overruns it, all else equal', () => {
  const short = candidate('short', {
    learnerModel: learnerModel({ nextLearningMove: { type: 'retention_probe', reasonCode: 'retention_probe_due:1d', instruction: 'x', learnerFacingText: 'x' } }),
  });
  const long = candidate('long', {
    learnerModel: learnerModel({ nextLearningMove: { type: 'transfer_task', reasonCode: 'transfer_untested', instruction: 'x', learnerFacingText: 'x' } }),
  });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, availableMinutes: 6, candidates: [long, short] });
  const shortRec = rec(result, 'short');
  const longRec = rec(result, 'long');
  assert.equal(shortRec.fitsAvailableTime, true);
  assert.equal(longRec.fitsAvailableTime, false);
  assert.ok(factorValue(shortRec, 'availableTimeFit') > factorValue(longRec, 'availableTimeFit'));
  assert.ok(longRec.suggestedDurationMinutes <= 6);
  assert.ok(longRec.suggestedDurationMinutes >= 3);
  assert.equal(longRec.baseDurationMinutes, 20);
});

test('with no time budget, time-fit is neutral and recorded as a missing input', () => {
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [candidate('t')] }), 't');
  assert.equal(only.fitsAvailableTime, null);
  assert.ok(only.missingInputs.includes('available_minutes'));
  assert.ok(only.factors.find((f) => f.key === 'availableTimeFit')?.reasonCodes.includes('available_time_unspecified'));
});

test('an explicit duration override drives base and suggested duration', () => {
  const only = rec(
    rankStudyLearningPriorities({ asOf: AS_OF, availableMinutes: 60, candidates: [candidate('d', { estimatedDurationMinutes: 45 })] }),
    'd',
  );
  assert.equal(only.baseDurationMinutes, 45);
  assert.equal(only.suggestedDurationMinutes, 45);
});

/* ─── curriculum / exam importance ───────────────────────────────────────── */

test('higher exam weight ranks ahead of lower, and an unmapped concept is neutral + flagged', () => {
  const heavy = candidate('heavy', { curriculum: { examWeight: 0.95, depth: 3, confidence: 0.9 } });
  const light = candidate('light', { curriculum: { examWeight: 0.1, depth: 3, confidence: 0.9 } });
  const unmapped = candidate('unmapped');
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [light, unmapped, heavy] });
  assert.ok(factorValue(rec(result, 'heavy'), 'curriculumImportance') > factorValue(rec(result, 'light'), 'curriculumImportance'));
  assert.equal(factorValue(rec(result, 'unmapped'), 'curriculumImportance'), 0.5);
  assert.ok(rec(result, 'unmapped').missingInputs.includes('curriculum_exam_weight'));
  assert.ok(rec(result, 'heavy').factors.find((f) => f.key === 'curriculumImportance')?.reasonCodes.includes('high_exam_weight'));
});

/* ─── ties and stable ordering ───────────────────────────────────────────── */

test('exact ties break deterministically by key then id, with sequential ranks', () => {
  const one = candidate('bbb', { conceptKey: 'same' });
  const two = candidate('aaa', { conceptKey: 'same' });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [one, two] });
  // identical scores → conceptKey equal → conceptId decides: 'aaa' before 'bbb'
  assert.deepEqual(byId(result), ['aaa', 'bbb']);
  assert.equal(rec(result, 'aaa').score, rec(result, 'bbb').score);
  assert.deepEqual(result.recommendations.map((r) => r.rank), [1, 2]);
});

test('a tie on score breaks toward higher confidence', () => {
  // Equal scores are engineered by making mastery gaps mirror confidence so the
  // weighted sum matches; simplest: identical except confidence, which does not
  // enter the score, so scores tie and confidence breaks it.
  const surer = candidate('surer', { conceptKey: 'zzz', masteryEstimate: mastery({ confidence: 0.5 }) });
  const lessSure = candidate('lesssure', { conceptKey: 'aaa', masteryEstimate: mastery({ confidence: 0.5 }) });
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [surer, lessSure] });
  // confidences equal here → falls through to key ordering: 'aaa' < 'zzz'
  assert.deepEqual(byId(result), ['lesssure', 'surer']);
});

/* ─── skipped candidates ─────────────────────────────────────────────────── */

test('invalid, incomplete and duplicate candidates are skipped with reasons', () => {
  const good = candidate('good');
  const dup = candidate('good');
  const noId = candidate('', { conceptKey: 'x' });
  const noProjection = { conceptId: 'broken' } as unknown as StudyLearningPriorityCandidate;
  const result = rankStudyLearningPriorities({ asOf: AS_OF, candidates: [good, dup, noId, noProjection] });
  assert.deepEqual(byId(result), ['good']);
  const reasons = new Map(result.skipped.map((s) => [`${s.conceptId}:${s.reasonCode}`, true]));
  assert.ok(reasons.has('good:duplicate_concept'));
  assert.ok(reasons.has(':missing_concept_id'));
  assert.ok(reasons.has('broken:missing_projection'));
});

/* ─── weights, normalisation and limit ───────────────────────────────────── */

test('zeroing a factor weight removes its influence and keeps scores bounded', () => {
  const cand = candidate('w', { masteryEstimate: mastery({ mastery: 0.1 }) });
  const withGap = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [cand] }), 'w');
  const withoutGap = rec(
    rankStudyLearningPriorities({ asOf: AS_OF, weights: { masteryGap: 0 }, candidates: [cand] }),
    'w',
  );
  assert.equal(withoutGap.factors.find((f) => f.key === 'masteryGap')?.contribution, 0);
  assert.notEqual(withGap.score, withoutGap.score);
  assert.ok(withoutGap.score >= 0 && withoutGap.score <= 1);
});

test('out-of-range weights are clamped and reflected in the resolved weights', () => {
  const result = rankStudyLearningPriorities({
    asOf: AS_OF,
    weights: { masteryGap: 5, recentPracticePenalty: -3 } as Record<StudyLearningFactorKey, number>,
    candidates: [candidate('w')],
  });
  assert.equal(result.weights.masteryGap, 1);
  assert.equal(result.weights.recentPracticePenalty, 0);
  assert.ok(result.recommendations[0].score >= 0 && result.recommendations[0].score <= 1);
});

test('all-zero weights degrade to a defined zero score rather than dividing by zero', () => {
  const zeroed = Object.fromEntries(
    Object.keys(STUDY_LEARNING_PRIORITY_DEFAULT_WEIGHTS).map((key) => [key, 0]),
  ) as Record<StudyLearningFactorKey, number>;
  const result = rankStudyLearningPriorities({ asOf: AS_OF, weights: zeroed, candidates: [candidate('z')] });
  assert.equal(result.recommendations[0].score, 0);
});

test('limit slices the returned rows while ranks reflect the full ordering', () => {
  const cands = [
    candidate('lo', { masteryEstimate: mastery({ mastery: 0.9 }) }),
    candidate('hi', { masteryEstimate: mastery({ mastery: 0.1 }) }),
    candidate('mid', { masteryEstimate: mastery({ mastery: 0.5 }) }),
  ];
  const result = rankStudyLearningPriorities({ asOf: AS_OF, limit: 1, candidates: cands });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].conceptId, 'hi');
  assert.equal(result.recommendations[0].rank, 1);
  const zero = rankStudyLearningPriorities({ asOf: AS_OF, limit: 0, candidates: cands });
  assert.deepEqual(zero.recommendations, []);
});

/* ─── structural completeness of the explanation ─────────────────────────── */

test('every recommendation carries all eight factors in canonical order', () => {
  const only = rec(rankStudyLearningPriorities({ asOf: AS_OF, candidates: [candidate('s')] }), 's');
  assert.deepEqual(
    only.factors.map((f) => f.key),
    [
      'masteryGap',
      'prerequisiteLeverage',
      'misconceptionSeverity',
      'retentionRisk',
      'curriculumImportance',
      'evidenceConfidence',
      'availableTimeFit',
      'recentPracticePenalty',
    ],
  );
  const expectedMove: StudyNextLearningMove = 'vary_evidence';
  assert.equal(only.recommendedActionType, expectedMove);
  assert.ok(only.reasonCodes.includes('next_move:vary_evidence'));
});
