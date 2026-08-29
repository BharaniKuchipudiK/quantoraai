import { studyPicturePromptHint } from './study-pictures.js';

export function studyIcebreakerAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Open ${label} with one true icebreaker and a picture tag.`,
    studyPicturePromptHint(label),
    'Do not invent image URLs or YouTube IDs. The tag is how Quantora draws the scene.',
    'Then STOP. Ask me to signal that I am ready before any definition, table, or quiz.',
    'No leaderboard, points, or rank. Do not plan trips.',
  ].join(' ');
}

export function studyLessonAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Teach ONE idea about ${label} in this message — not a whole chapter.`,
    studyPicturePromptHint(label),
    'Keep the explanation concise and adapted to the learner context already present in this conversation.',
    'Use at most one short formula in $$...$$ unless the learner asks for a derivation.',
    'End with one context-aware question and wait for the learner before continuing.',
    'Do not invent a specific YouTube video, channel episode, or URL.',
  ].join(' ');
}

export function studyQuizAsk(topic) {
  return `Quiz me on ${String(topic || 'this idea').trim()} with 3 short questions that fit the current conversation and learner context. Wait for my answers. Do not give the answers first. If I miss one, identify the likely prerequisite or misconception before re-checking.`;
}

export function studyPracticeAsk(topic) {
  return `Give me one short practice problem on ${String(topic || 'this idea').trim()}. Use the current conversation and my learning context. Wait for my attempt before explaining or grading it.`;
}

export function studyAnotherExampleAsk(topic) {
  return `Show one short, different worked example for ${String(topic || 'this idea').trim()} that directly repairs the misconception in my last answer. Contrast the mistaken idea with the correct one, then ask one fresh question and wait.`;
}

export function studyUsefulReferenceAsk(topic) {
  return `Recommend one genuinely useful reference for the exact gap we just found in ${String(topic || 'this idea').trim()}. Use a verified link already available in this session; otherwise give one precise search objective instead of inventing a URL.`;
}

export function studyNextQuestionAsk(topic) {
  return `That question is complete. Ask one new, non-repeating question on ${String(topic || 'this idea').trim()} that checks transfer rather than the same wording. Wait for my attempt.`;
}

export function studyFlashcardAsk(topic) {
  return `Create a small set of recall flashcards for ${String(topic || 'this idea').trim()} using only concepts supported by the current conversation. Keep each front focused and each back concise, then let me work through them interactively.`;
}

export function studyApplicationAsk(topic) {
  return `Help me apply ${String(topic || 'this idea').trim()} to a real situation that fits the current learning context. Pick the example from the subject and level already established in this conversation, explain why it is relevant, and then give me one short application question.`;
}

export function studyPlanAsk(topic) {
  return `Help me plan the next study steps for ${String(topic || 'this idea').trim()} from the context already known in this conversation. Use known constraints first, ask only for material information that is missing, protect realistic study and rest time, and prioritize prerequisite gaps before extra volume.`;
}

export function studyNotesAsk(topic) {
  return `Turn what we have actually established in this conversation about ${String(topic || 'this idea').trim()} into concise study notes. Separate verified ideas, open questions, and any misconception or prerequisite that still needs work. Do not introduce unsupported facts merely to make the notes look complete.`;
}
