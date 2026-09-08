import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDY_ADAPTIVE_MISSION_PHASE,
  createStudyAdaptiveMissionState,
  sameStudyMissionLabel,
  studyAdaptiveMissionFocusAsk,
  studyAdaptiveMissionReviewAsk,
  studyAdaptiveMissionStartAsk,
  studyAdaptiveMissionStartPhase,
  transitionStudyAdaptiveMission,
} from './study-adaptive-mission.js';

function recommendation(overrides = {}) {
  return {
    conceptId: 'concept-newton-3',
    conceptKey: 'physics.newton-third-law',
    label: "Newton's Third Law",
    recommendedActionType: 'guided_repair',
    suggestedDurationMinutes: 12,
    score: 0.91,
    confidence: 0.84,
    ...overrides,
  };
}

test('guided repair starts with explanation while evidence-seeking Compass moves start with the governed check', () => {
  assert.equal(studyAdaptiveMissionStartPhase(recommendation()), STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN);
  for (const action of [
    'independent_retrieval',
    'diagnose_misconception',
    'confirm_misconception',
    'vary_evidence',
    'retention_probe',
    'transfer_task',
  ]) {
    assert.equal(
      studyAdaptiveMissionStartPhase(recommendation({ recommendedActionType: action })),
      STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK,
      `${action} must not be contaminated by teaching before evidence`,
    );
  }
  assert.equal(
    studyAdaptiveMissionStartPhase(recommendation({ recommendedActionType: 'future_move' })),
    STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN,
    'unknown future moves must not silently acquire verified-evidence semantics',
  );
});

test('Compass mission keeps only execution metadata and never copies priority/mastery truth', () => {
  const started = transitionStudyAdaptiveMission(createStudyAdaptiveMissionState(), {
    type: 'START_COMPASS',
    recommendation: recommendation(),
    activeTopic: "Newton's Third Law",
  });
  assert.equal(started.status, 'active');
  assert.equal(started.phase, STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN);
  assert.equal(started.topicAligned, true);
  assert.equal(started.durationMinutes, 12);
  assert.equal(started.actionType, 'guided_repair');
  assert.equal(Object.hasOwn(started, 'score'), false);
  assert.equal(Object.hasOwn(started, 'confidence'), false);
  assert.equal(Object.hasOwn(started, 'mastery'), false);
  assert.equal(Object.hasOwn(started, 'learnerModel'), false);
});

test('Adaptive Mission executes Explain -> Guided practice -> Verified check -> Review and repairs after a miss', () => {
  let state = transitionStudyAdaptiveMission(createStudyAdaptiveMissionState(), {
    type: 'START_COMPASS',
    recommendation: recommendation(),
    activeTopic: "Newton's Third Law",
  });
  state = transitionStudyAdaptiveMission(state, { type: 'PRACTICE' });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE);

  state = transitionStudyAdaptiveMission(state, { type: 'CHECK_REQUESTED' });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK);

  state = transitionStudyAdaptiveMission(state, { type: 'VERIFIED_RESULT', correct: false });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE);
  assert.equal(state.repairRequired, true);
  assert.equal(state.verifiedOutcome, 'incorrect');

  state = transitionStudyAdaptiveMission(state, { type: 'CHECK_REQUESTED' });
  state = transitionStudyAdaptiveMission(state, { type: 'VERIFIED_RESULT', correct: true });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.REVIEW);
  assert.equal(state.repairRequired, false);
  assert.equal(state.verifiedOutcome, 'correct');

  state = transitionStudyAdaptiveMission(state, { type: 'REVIEW_SENT' });
  assert.equal(state.status, 'completed');
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.COMPLETE);
});

test('the guided continuation chip starts inside Guided practice and is already aligned to the active topic', () => {
  const state = transitionStudyAdaptiveMission(createStudyAdaptiveMissionState(), {
    type: 'START_GUIDED',
    topic: 'Momentum',
  });
  assert.equal(state.source, 'guided_chip');
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE);
  assert.equal(state.topicAligned, true);
});

test('a Compass target must align before CHECK_REQUESTED can advance or clear an error', () => {
  let state = transitionStudyAdaptiveMission(createStudyAdaptiveMissionState(), {
    type: 'START_COMPASS',
    recommendation: recommendation({ recommendedActionType: 'retention_probe' }),
    activeTopic: 'Momentum',
  });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK);
  assert.equal(state.topicAligned, false);

  const blocked = transitionStudyAdaptiveMission(state, { type: 'CHECK_REQUESTED' });
  assert.strictEqual(blocked, state);

  state = transitionStudyAdaptiveMission(state, { type: 'TOPIC_ALIGNED' });
  assert.equal(state.topicAligned, true);
  state = transitionStudyAdaptiveMission(state, { type: 'CHECK_REQUESTED' });
  assert.equal(state.phase, STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK);
});

test('topic matching is strict enough to prevent a wrong-concept verified check but tolerant of punctuation/case', () => {
  assert.equal(sameStudyMissionLabel("Newton’s Third Law", "newton's third law"), true);
  assert.equal(sameStudyMissionLabel('Newton second law', 'Newton third law'), false);
  assert.equal(sameStudyMissionLabel('', 'Momentum'), false);
});

test('mission prompts preserve the truth boundary and do not contaminate verified-first focus changes', () => {
  const start = studyAdaptiveMissionStartAsk(recommendation());
  assert.match(start, /do not infer mastery/i);
  assert.match(start, /Stage 1 is Explain/i);

  const focus = studyAdaptiveMissionFocusAsk(recommendation({ recommendedActionType: 'retention_probe' }));
  assert.match(focus, /Do not teach, explain, hint, solve/i);
  assert.match(focus, /separate governed verified check/i);

  const review = studyAdaptiveMissionReviewAsk("Newton's Third Law", {
    learnerModel: {
      retention: { dueAt: '2026-09-15T10:00:00.000Z' },
      nextLearningMove: { type: 'retention_probe', learnerFacingText: 'Come back later without hints.' },
    },
  });
  assert.match(review, /future evidence point, not proof of retention now/i);
  assert.match(review, /retention_probe/i);
  assert.doesNotMatch(review, /mastery probability/i);
});
