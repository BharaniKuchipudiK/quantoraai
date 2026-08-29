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
 * The tutor prompt instructs the model to END with "Write your attempt. I will
 * wait." — so it says that line even on an opening turn where the learner
 * explicitly asked it NOT to quiz them yet. Matching the phrase put an answer
 * box under a lesson that had asked nothing, which is a control that reaches
 * nothing: the learner is invited to reply to a question that does not exist.
 *
 * The question itself is the evidence. Strip the closing lines and the picture
 * tags, then look for something actually addressed to the learner.
 */
const WAITING_PHRASE = /(i[''']m with you|write your attempt|i will wait|wait for (?:your|the learner)[^.]*)\.?/gi;
const STUDY_TAG = /<quantora-study-[a-z-]+\b[^>]*\/?>/gi;

export function studyAwaitsAnswer(text) {
  const raw = String(text || '');
  if (!WAITING_PHRASE.test(raw)) {
    WAITING_PHRASE.lastIndex = 0;
    return false;
  }
  WAITING_PHRASE.lastIndex = 0;
  const body = raw.replace(WAITING_PHRASE, ' ').replace(STUDY_TAG, ' ');
  // A question mark is the cheapest honest proxy for "something was asked".
  // An imperative task counts too: "Solve for x" needs no question mark.
  return /\?/.test(body) || /\b(solve|calculate|work out|try|find|show that|prove|sketch|estimate)\b/i.test(body);
}
