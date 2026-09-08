export const STUDY_ADAPTIVE_MISSION_PHASE = Object.freeze({
  IDLE: 'idle',
  EXPLAIN: 'explain',
  GUIDED_PRACTICE: 'guided_practice',
  VERIFIED_CHECK: 'verified_check',
  REVIEW: 'review',
  COMPLETE: 'complete',
});

export const STUDY_ADAPTIVE_MISSION_STEPS = Object.freeze([
  STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN,
  STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE,
  STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK,
  STUDY_ADAPTIVE_MISSION_PHASE.REVIEW,
]);

/*
 * These moves are evidence-seeking. Teaching or hinting before them would
 * contaminate the very evidence the deterministic learner model asked for.
 * guided_repair is the one canonical move that deliberately starts with
 * teaching; unknown future moves fail to the non-evidence teaching path.
 */
const VERIFIED_FIRST_ACTIONS = new Set([
  'independent_retrieval',
  'diagnose_misconception',
  'confirm_misconception',
  'vary_evidence',
  'retention_probe',
  'transfer_task',
]);

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function boundedMinutes(value) {
  return Math.max(3, Math.min(480, Number(value) || 10));
}

export function normalizeStudyMissionLabel(value) {
  return clean(value, 160)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameStudyMissionLabel(left, right) {
  const a = normalizeStudyMissionLabel(left);
  const b = normalizeStudyMissionLabel(right);
  return Boolean(a && b && a === b);
}

export function studyAdaptiveMissionStartPhase(recommendation = {}) {
  const action = clean(recommendation?.recommendedActionType, 80);
  return VERIFIED_FIRST_ACTIONS.has(action)
    ? STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK
    : STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN;
}

export function createStudyAdaptiveMissionState() {
  return {
    status: 'idle',
    phase: STUDY_ADAPTIVE_MISSION_PHASE.IDLE,
    source: null,
    label: '',
    conceptId: '',
    conceptKey: '',
    actionType: '',
    durationMinutes: null,
    topicAligned: false,
    repairRequired: false,
    verifiedOutcome: null,
    verifiedAttemptId: '',
    error: '',
  };
}

export function transitionStudyAdaptiveMission(state, event = {}) {
  const current = state || createStudyAdaptiveMissionState();

  switch (event.type) {
    case 'RESET':
      return createStudyAdaptiveMissionState();

    case 'START_COMPASS': {
      const recommendation = event.recommendation || {};
      const label = clean(recommendation.label, 160);
      if (!label) return current;
      return {
        status: 'active',
        phase: studyAdaptiveMissionStartPhase(recommendation),
        source: 'compass',
        label,
        conceptId: clean(recommendation.conceptId, 160),
        conceptKey: clean(recommendation.conceptKey, 160),
        actionType: clean(recommendation.recommendedActionType, 80) || 'guided_repair',
        durationMinutes: boundedMinutes(recommendation.suggestedDurationMinutes),
        topicAligned: sameStudyMissionLabel(event.activeTopic, label),
        repairRequired: false,
        verifiedOutcome: null,
        verifiedAttemptId: '',
        error: '',
      };
    }

    case 'START_GUIDED': {
      const label = clean(event.topic, 160);
      if (!label) return current;
      return {
        status: 'active',
        phase: STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE,
        source: 'guided_chip',
        label,
        conceptId: '',
        conceptKey: '',
        actionType: 'guided_repair',
        durationMinutes: null,
        topicAligned: true,
        repairRequired: false,
        verifiedOutcome: null,
        verifiedAttemptId: '',
        error: '',
      };
    }

    case 'TOPIC_ALIGNED':
      if (current.status !== 'active') return current;
      return { ...current, topicAligned: true, error: '' };

    case 'PRACTICE':
      if (current.status !== 'active') return current;
      if (current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN
        && current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE) return current;
      return {
        ...current,
        phase: STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE,
        repairRequired: event.repair === true || current.repairRequired,
        error: '',
      };

    case 'CHECK_REQUESTED':
      if (current.status !== 'active' || !current.topicAligned) return current;
      if (current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE
        && current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK) return current;
      return {
        ...current,
        phase: STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK,
        error: '',
      };

    case 'CHECK_UNAVAILABLE':
      if (current.status !== 'active' || current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK) return current;
      return { ...current, error: clean(event.error, 240) || 'The governed verified check is unavailable right now.' };

    case 'VERIFIED_RESULT': {
      const attemptId = clean(event.attemptId, 160);
      if (current.status !== 'active'
        || current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK
        || typeof event.correct !== 'boolean'
        || !attemptId
        || attemptId === current.verifiedAttemptId) return current;
      if (event.correct) {
        return {
          ...current,
          phase: STUDY_ADAPTIVE_MISSION_PHASE.REVIEW,
          repairRequired: false,
          verifiedOutcome: 'correct',
          verifiedAttemptId: attemptId,
          error: '',
        };
      }
      return {
        ...current,
        phase: STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE,
        repairRequired: true,
        verifiedOutcome: 'incorrect',
        verifiedAttemptId: attemptId,
        error: '',
      };
    }

    case 'REVIEW_SENT':
      if (current.status !== 'active' || current.phase !== STUDY_ADAPTIVE_MISSION_PHASE.REVIEW) return current;
      return {
        ...current,
        status: 'completed',
        phase: STUDY_ADAPTIVE_MISSION_PHASE.COMPLETE,
        error: '',
      };

    default:
      return current;
  }
}

export function studyAdaptiveMissionStartAsk(recommendation = {}) {
  const label = clean(recommendation?.label, 160) || 'this concept';
  const action = clean(recommendation?.recommendedActionType, 80) || 'guided_repair';
  const minutes = boundedMinutes(recommendation?.suggestedDurationMinutes);
  return [
    `Begin a bounded Adaptive Learning Mission for ${label}.`,
    `The deterministic Learning Compass selected action type ${action} for about ${minutes} minutes.`,
    'Stage 1 is Explain. Teach exactly one focused idea that prepares the learner to reason, not a full chapter or solution dump.',
    'Do not grade this turn, do not infer mastery from conversation, and do not claim retention or transfer.',
    'End with one short learner-facing question or invitation to work the next step together, then stop.',
  ].join(' ');
}

export function studyAdaptiveMissionFocusAsk(recommendation = {}) {
  const label = clean(recommendation?.label, 160) || 'this concept';
  return [
    `Move the current Study focus to ${label} for the Learning Compass recommendation.`,
    'Do not teach, explain, hint, solve, or ask a practice question in this turn.',
    'A separate governed verified check will be opened by the client after the Study focus is aligned.',
    'Reply with one short sentence confirming the focus only. Do not claim mastery, evidence, retention, or transfer.',
  ].join(' ');
}

export function studyAdaptiveMissionGuidedPracticeAsk(topic, { repair = false, explanation = '' } = {}) {
  const label = clean(topic, 160) || 'this concept';
  const governedExplanation = clean(explanation, 320);
  const context = repair
    ? `A governed check was not correct.${governedExplanation ? ` Its reviewed explanation was: ${governedExplanation}` : ''}`
    : '';
  return [
    `Continue the Adaptive Learning Mission for ${label} at Guided practice.`,
    context,
    repair
      ? 'Repair the reasoning one step at a time. Do not reuse the previous reviewed item as the next check.'
      : 'Work one step at a time and give the learner one small reasoning move or short practice task.',
    'Do not reveal the whole solution before the learner acts.',
    'This is teaching practice, not verified evidence: do not claim mastery, retention, or transfer from it.',
    'Stop after one learner action is requested.',
  ].filter(Boolean).join(' ');
}

export function studyAdaptiveMissionReviewAsk(topic, result = null) {
  const label = clean(topic, 160) || 'this concept';
  const learnerModel = result?.learnerModel || null;
  const nextMoveType = clean(learnerModel?.nextLearningMove?.type, 80);
  const nextMoveText = clean(learnerModel?.nextLearningMove?.learnerFacingText, 260);
  const dueAt = clean(learnerModel?.retention?.dueAt, 80);
  const nextMove = nextMoveType
    ? `The governed learner model's next move is ${nextMoveType}${nextMoveText ? `: ${nextMoveText}` : '.'}`
    : 'No governed next move is available in this result; do not invent one.';
  const retention = dueAt
    ? `A later retention check is scheduled for ${dueAt}. Treat that as a future evidence point, not proof of retention now.`
    : 'No governed retention date is available here. Do not invent one or claim durable retention.';

  return [
    `Close the Adaptive Learning Mission for ${label} with a concise review grounded only in the governed check that just passed.`,
    'State what was verified by that check and clearly separate it from what remains unverified.',
    nextMove,
    retention,
    'Do not create a new score, probability, mastery claim, or assessment. End with one short sentence describing the later review/retention move.',
  ].join(' ');
}

export function studyAdaptiveMissionPhaseCopy(mission = {}) {
  switch (mission.phase) {
    case STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN:
      return 'Explain one focused idea, then move into guided practice.';
    case STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE:
      return mission.repairRequired
        ? 'Repair the reasoning before asking the governed checker again.'
        : 'Practice with guidance, then choose the governed verified check when ready.';
    case STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK:
      return mission.error || 'Use the reviewed check below. Only this governed path can create learning evidence.';
    case STUDY_ADAPTIVE_MISSION_PHASE.REVIEW:
      return 'The governed check passed. Review what it proved and what still needs later retention.';
    case STUDY_ADAPTIVE_MISSION_PHASE.COMPLETE:
      return 'Mission complete. Retention and transfer still require their own later governed evidence.';
    default:
      return '';
  }
}
