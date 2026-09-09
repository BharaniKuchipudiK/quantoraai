export const STUDY_LEARNING_INTERACTION_EVENT = 'quantora:study-learning-interaction';
export const STUDY_LEARNING_INTERACTION_VERSION = 'study-learning-interaction-v1';

export const STUDY_LEARNING_INTERACTION = Object.freeze({
  RESPONSE_CORRECT: 'response_correct',
  RESPONSE_INCORRECT: 'response_incorrect',
  ANSWER_CHANGED: 'answer_changed',
  HINT_REQUESTED: 'hint_requested',
  HINT_DEPTH_USED: 'hint_depth_used',
  REPEATED_EXPLANATION_REQUESTED: 'repeated_explanation_requested',
  VISUAL_REQUESTED: 'visual_requested',
  SIMULATION_MANIPULATED: 'simulation_manipulated',
  PREDICTION_MADE: 'prediction_made',
  RETRY_SUCCESS: 'retry_success',
  RETRIEVAL_SUCCESS: 'retrieval_success',
});

const ALLOWED_TYPES = new Set(Object.values(STUDY_LEARNING_INTERACTION));
let sequence = 0;

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boundedHintDepth(value) {
  const depth = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(depth)) return null;
  return Math.max(1, Math.min(6, depth));
}

function browserDispatch(event) {
  if (typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof window.CustomEvent !== 'function') return;
  window.dispatchEvent(new window.CustomEvent(STUDY_LEARNING_INTERACTION_EVENT, { detail: event }));
}

function normalizeStudyLearningInteraction(input = {}, now = Date.now) {
  const type = clean(input.type, 64);
  if (!ALLOWED_TYPES.has(type)) return null;

  const nextSequence = sequence + 1;
  const timestamp = Number(now());
  const occurredAt = new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
  const event = {
    contractVersion: STUDY_LEARNING_INTERACTION_VERSION,
    id: `study-interaction-${nextSequence}`,
    sequence: nextSequence,
    occurredAt,
    observationOnly: true,
    type,
    source: clean(input.source, 64) || 'study',
  };

  const sessionId = clean(input.sessionId, 128);
  const conceptId = clean(input.conceptId, 160);
  const conceptLabel = clean(input.conceptLabel, 220);
  const attemptId = clean(input.attemptId, 80);
  const evidenceKind = clean(input.evidenceKind, 40);
  const labKind = clean(input.labKind, 64);
  const control = clean(input.control, 64);
  const controlValue = clean(input.controlValue, 40);
  const choiceId = clean(input.choiceId, 80);
  const hintDepth = boundedHintDepth(input.hintDepth);

  if (sessionId) event.sessionId = sessionId;
  if (conceptId) event.conceptId = conceptId;
  if (conceptLabel) event.conceptLabel = conceptLabel;
  if (attemptId) event.attemptId = attemptId;
  if (evidenceKind) event.evidenceKind = evidenceKind;
  if (labKind) event.labKind = labKind;
  if (control) event.control = control;
  if (controlValue) event.controlValue = controlValue;
  if (choiceId) event.choiceId = choiceId;
  if (hintDepth !== null) event.hintDepth = hintDepth;
  if (typeof input.correct === 'boolean') event.correct = input.correct;
  if (input.retry === true) event.retry = true;

  return Object.freeze(event);
}

export function recordStudyLearningInteraction(input = {}, options = {}) {
  const event = normalizeStudyLearningInteraction(input, options.now || Date.now);
  if (!event) return null;
  sequence = event.sequence;
  browserDispatch(event);
  return event;
}

export function recordStudyHintRequest({ hintDepth = 1, ...context } = {}) {
  const requested = recordStudyLearningInteraction({
    ...context,
    type: STUDY_LEARNING_INTERACTION.HINT_REQUESTED,
  });
  const depth = recordStudyLearningInteraction({
    ...context,
    type: STUDY_LEARNING_INTERACTION.HINT_DEPTH_USED,
    hintDepth,
  });
  return [requested, depth].filter(Boolean);
}

export function recordStudyAnswerChange({ previousChoiceId = '', nextChoiceId = '', ...context } = {}) {
  const previous = clean(previousChoiceId, 80);
  const next = clean(nextChoiceId, 80);
  if (!previous || !next || previous === next) return null;
  return recordStudyLearningInteraction({
    ...context,
    type: STUDY_LEARNING_INTERACTION.ANSWER_CHANGED,
    choiceId: next,
  });
}

export function recordStudyAssessmentOutcome({ attemptId = '', result = null, retry = false, source = 'verified_assessment' } = {}) {
  if (!result || typeof result.correct !== 'boolean') return [];
  const conceptId = clean(result?.evidenceConcept?.key, 160);
  const conceptLabel = clean(result?.evidenceConcept?.label, 220);
  const common = {
    source,
    attemptId,
    conceptId,
    conceptLabel,
    evidenceKind: result.evidenceKind,
    correct: result.correct,
  };
  const recorded = [recordStudyLearningInteraction({
    ...common,
    type: result.correct
      ? STUDY_LEARNING_INTERACTION.RESPONSE_CORRECT
      : STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT,
  })];

  if (retry && result.correct) {
    recorded.push(recordStudyLearningInteraction({
      ...common,
      type: STUDY_LEARNING_INTERACTION.RETRY_SUCCESS,
      retry: true,
    }));
  }
  if (result.correct && result.evidenceKind === 'retrieval') {
    recorded.push(recordStudyLearningInteraction({
      ...common,
      type: STUDY_LEARNING_INTERACTION.RETRIEVAL_SUCCESS,
    }));
  }
  return recorded.filter(Boolean);
}
