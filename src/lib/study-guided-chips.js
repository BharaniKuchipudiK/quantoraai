import { studyAwaitsAnswer } from './study-conversation-loop.js';
import { studyTeachingTurnKind } from './study-teaching-turn.js';

const FAILURE_RE = /\b(?:temporarily unavailable|connection error|rate limit|try again later|no healthy ai route|could not complete|unable to respond)\b/i;
const INTERRUPTED_RE = /\b(?:the reply was cut off here|model route dropped mid-answer|tap continue and i['’]ll pick up from this point)\b/i;
const MISCONCEPTION_RE = /\b(?:not quite|almost|common mistake|common misconception|misconception|you may be mixing|you(?:'|’)re mixing|your answer is incorrect|that step is incorrect|that(?:'|’)s not correct|careful:|the issue is)\b/i;
const RECOMMENDATION_RE = /\b(?:learning compass|next best|recommend(?:ation|ed)?|best next|focus on|priority|start with|work on this next|next learning action)\b/i;
const META_ONLY_RE = /\b(?:which syllabus|choose your syllabus|pick a syllabus|select a syllabus)\b/i;
const ACK_ONLY_RE = /^\s*(?:ok(?:ay)?|yes|yeah|yep|sure|great|got it|sounds good|ready|continue|go on|thanks?|thank you)[.!]?\s*$/i;

const CHIP = Object.freeze({
  together: Object.freeze({
    id: 'study-work-together',
    label: 'Let’s work through it together',
    value: 'Let’s work through this step by step together. Ask me for the next step instead of revealing everything at once.',
  }),
  hint: Object.freeze({
    id: 'study-hint',
    label: 'Give me a hint',
    value: 'Give me one small hint that helps me make the next step without revealing the final answer.',
  }),
  try: Object.freeze({
    id: 'study-let-me-try',
    label: 'Let me try',
    value: 'Let me try this myself first. Please wait for my attempt before explaining more.',
  }),
  example: Object.freeze({
    id: 'study-another-example',
    label: 'Show another example',
    value: 'Show me one different example of the same idea, then give me a similar one to try myself.',
  }),
  why: Object.freeze({
    id: 'study-why-this-first',
    label: 'Why this first?',
    value: 'Explain briefly why this is the best thing for me to work on next, using the learning evidence you actually have.',
  }),
});

function cloneChip(chip, priority, prompt, state) {
  return { ...chip, priority, prompt, kind: 'study-guided', state };
}

/**
 * Deterministically classify only the meaningful Study states that deserve a
 * fresh guided choice row. This is presentation guidance only: it never writes
 * learner truth, mastery, evidence, plans, or schedule state.
 */
export function classifyStudyGuidedState({ userPrompt = '', aiResponse = '' } = {}) {
  const user = String(userPrompt || '').trim();
  const ai = String(aiResponse || '').trim();
  // Interrupted partial replies already carry the canonical Resume continueSet
  // from useChatStream. Returning no Study beats preserves that recovery action
  // instead of filling the three-chip merge budget with fresh tutor choices.
  if (!ai || FAILURE_RE.test(ai) || INTERRUPTED_RE.test(ai) || META_ONLY_RE.test(ai) || ACK_ONLY_RE.test(ai)) return null;

  // A remediation turn may intentionally end with a guiding question. Repair
  // state is more specific than the generic "awaiting learner answer" shape,
  // so classify it first and keep the chips focused on repairing the idea.
  if (MISCONCEPTION_RE.test(ai)) return 'misconception';
  if (studyAwaitsAnswer(ai)) return 'question';
  if (RECOMMENDATION_RE.test(`${user}\n${ai}`)) return 'recommendation';

  const turnKind = studyTeachingTurnKind(user, ai);
  if (turnKind === 'topic_selection') return 'recommendation';

  // A concise explanation can still be a complete learning beat. Suppress only
  // tiny non-teaching fragments rather than imposing an arbitrary paragraph
  // length, otherwise valid short lessons recreate the silent-state defect.
  if (ai.length < 24) return null;
  return 'lesson';
}

export function studyGuidedChipBeats({ userPrompt = '', aiResponse = '' } = {}) {
  const state = classifyStudyGuidedState({ userPrompt, aiResponse });
  if (!state) return [];

  if (state === 'question') {
    const prompt = 'How do you want to tackle it?';
    return [
      cloneChip(CHIP.hint, 130, prompt, state),
      cloneChip(CHIP.together, 129, prompt, state),
      cloneChip(CHIP.try, 128, prompt, state),
    ];
  }

  if (state === 'misconception') {
    const prompt = 'What would help repair this?';
    return [
      cloneChip(CHIP.together, 130, prompt, state),
      cloneChip(CHIP.hint, 129, prompt, state),
      cloneChip(CHIP.example, 128, prompt, state),
    ];
  }

  if (state === 'recommendation') {
    const prompt = 'How should we use this recommendation?';
    return [
      cloneChip(CHIP.together, 130, prompt, state),
      cloneChip(CHIP.why, 129, prompt, state),
      cloneChip(CHIP.try, 128, prompt, state),
    ];
  }

  const prompt = 'What would help next?';
  return [
    cloneChip(CHIP.together, 130, prompt, state),
    cloneChip(CHIP.try, 129, prompt, state),
    cloneChip(CHIP.example, 128, prompt, state),
  ];
}
