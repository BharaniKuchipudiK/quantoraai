export const STUDY_LOOP_PHASES = Object.freeze([
  'ask',
  'awaiting_learner_response',
  'learner_attempt',
  'evaluate_verify',
  'resolve',
  'advance',
]);

export function createStudyLoopState() {
  return {
    phase: 'advance',
    questionId: '',
    attempt: '',
    outcome: null,
    completedQuestionIds: [],
  };
}

function completed(state, questionId) {
  return state.completedQuestionIds.includes(questionId);
}

/**
 * The Study loop is deliberately domain-gated here, rather than only at the
 * component boundary. A non-Study call is an exact reference-preserving no-op.
 */
export function transitionStudyLoop(state, event, domain = 'education') {
  if (domain !== 'education') return state;
  const current = state || createStudyLoopState();
  const questionId = String(event?.questionId || current.questionId || '').trim();

  switch (event?.type) {
    case 'RESET':
      return createStudyLoopState();
    case 'ASK':
      if (!questionId || (completed(current, questionId) && event.explicitRetry !== true)) return current;
      return { ...current, phase: 'ask', questionId, attempt: '', outcome: null };
    case 'PRESENT':
      if (current.phase !== 'ask' || questionId !== current.questionId) return current;
      return { ...current, phase: 'awaiting_learner_response' };
    case 'ATTEMPT':
      if (current.phase !== 'awaiting_learner_response' || !String(event.answer || '').trim()) return current;
      return { ...current, phase: 'learner_attempt', attempt: String(event.answer).trim() };
    case 'VERIFY':
      if (current.phase !== 'learner_attempt') return current;
      return { ...current, phase: 'evaluate_verify' };
    case 'RESOLVE': {
      if (current.phase !== 'evaluate_verify' || typeof event.correct !== 'boolean') return current;
      const completedQuestionIds = event.correct && !completed(current, current.questionId)
        ? [...current.completedQuestionIds, current.questionId]
        : current.completedQuestionIds;
      return {
        ...current,
        phase: 'resolve',
        outcome: { correct: event.correct, misconception: event.misconception === true },
        completedQuestionIds,
      };
    }
    case 'ADVANCE':
      if (current.phase !== 'resolve') return current;
      return { ...current, phase: 'advance', questionId: '', attempt: '', outcome: null };
    default:
      return current;
  }
}

export function studyQuestionId(item = {}) {
  const stable = String(item.itemKey || item.prompt || '').trim().toLowerCase();
  return stable ? `study-question:${stable.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96)}` : '';
}

export function isStudyQuestionCompleted(state, item) {
  const questionId = studyQuestionId(item);
  return Boolean(questionId && state?.completedQuestionIds?.includes(questionId));
}

/*
 * A closing phrase is not a question.
 *
 * Older tutor replies ended with "Write your attempt. I will wait." even when
 * the learner had not been asked anything. Matching that phrase put an answer
 * state under a lesson with no task. We still strip legacy endings, but current
 * tutoring ends naturally on the actual question.
 *
 * The question itself is the evidence. Strip the closing lines and the picture
 * tags, then look for something actually addressed to the learner.
 */
const WAITING_PHRASE = /(i[''']m with you|write your attempt|i will wait|wait for (?:your|the learner)[^.]*)\.?/gi;
const STUDY_TAG = /<quantora-study-[a-z-]+\b[^>]*\/?>/gi;

export function studyAwaitsAnswer(text) {
  const raw = String(text || '');
  const body = raw.replace(WAITING_PHRASE, ' ').replace(STUDY_TAG, ' ');
  WAITING_PHRASE.lastIndex = 0;
  const clean = body.trim();
  // A natural tutor can end on the question itself. A question buried earlier
  // in an explanation ("Why? Because...") does not make the composer an answer.
  if (/\?\s*(?:[*_`~]|\s)*$/.test(clean)) return true;
  const lastSentence = clean.split(/[.!?]\s+/).pop() || '';
  return /^\s*(?:please\s+)?(?:solve|calculate|work out|try|find|show that|prove|sketch|estimate)\b/i.test(lastSentence);
}
