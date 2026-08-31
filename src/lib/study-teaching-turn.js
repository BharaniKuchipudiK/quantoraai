const STUDY_FACT_RE = /^(?:Syllabus overlay|Syllabus node|Study subject|Competency tag|Check passed|Evidence verified|Check missed|Figure URL|Foundation|Flashcard):/i;
const TOPIC_SELECTION_RE = /\b(?:suggest|recommend|choose|pick)\b[\s\S]{0,48}\b(?:topic|subject)\b|\bwhat should i study\b/i;
const CONTINUATION_RE = /^\s*(?:yes|yeah|yep|ok(?:ay)?|ready|continue|go on|next|show me|tell me more|i(?:'|’)m with you|got it)\s*[.!?]*\s*$/i;
const DIRECT_QUESTION_RE = /\?\s*$|^\s*(?:why|how|what|when|where|which|does|do|is|are|can|could|would|should|explain why|solve|calculate|find)\b/i;
const NEW_CONCEPT_RE = /^\s*(?:teach(?:\s+me)?|help me (?:learn|understand)|let(?:'|’)s learn|start|explain)\b/i;
const ATTEMPT_RESPONSE_RE = /^\s*(?:exactly|correct|that(?:'|’)s right|you(?:'|’)ve got|almost|not quite|close|good attempt|you chose|your answer|the first step is right)\b/i;

function cleanLine(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * AiStudio passes the Study syllabus haystack to the renderer. Study-owned facts
 * may lead that string, followed by learner turns. Keep only learner-looking
 * lines so the teaching cue follows the current conversation rather than sticky
 * syllabus metadata.
 */
export function studyTeachingUserTurns(topicHistory = '') {
  return String(topicHistory || '')
    .split(/\n+/)
    .map(cleanLine)
    .filter((line) => line && !STUDY_FACT_RE.test(line));
}

/**
 * Presentation-only teaching-turn classifier. It never changes learner truth,
 * evidence, verification, or nextLearningMove. Its job is to select humane
 * chrome and fail away from a one-size-fits-all lesson cue.
 */
export function studyTeachingTurnKind(topicHistory = '', assistantText = '') {
  const turns = studyTeachingUserTurns(topicHistory);
  const current = turns[turns.length - 1] || '';
  const reply = cleanLine(assistantText);

  if (!current) return 'new_concept';
  if (TOPIC_SELECTION_RE.test(current)) return 'topic_selection';
  if (CONTINUATION_RE.test(current)) return 'continuation';
  if (DIRECT_QUESTION_RE.test(current)) return 'direct_question';
  if (ATTEMPT_RESPONSE_RE.test(reply)) return 'learner_attempt';
  if (NEW_CONCEPT_RE.test(current)) return 'new_concept';

  // A short bare concept label such as "Light: Reflection & Refraction" is a
  // natural way to begin Study and should not be mistaken for an attempt.
  if (turns.length === 1 && current.length <= 96) return 'new_concept';
  return 'continuation';
}

export function studyTeachingTurnNudge(kind = '') {
  switch (kind) {
    case 'topic_selection': return { kind: 'book', label: 'Pick a direction' };
    case 'new_concept': return { kind: 'idea', label: 'Start with something familiar' };
    case 'direct_question': return { kind: 'book', label: 'Here’s the idea' };
    case 'continuation': return { kind: 'idea', label: 'Keep going' };
    case 'learner_attempt': return { kind: 'pencil', label: 'Check the reasoning' };
    default: return { kind: 'book', label: 'Here’s the idea' };
  }
}
