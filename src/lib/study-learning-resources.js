import { studyPicturePromptHint } from './study-pictures.js';

export function studyIcebreakerAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Open ${label} with one true icebreaker and a picture tag.`,
    studyPicturePromptHint(label),
    'Do not invent image URLs or YouTube IDs. The tag is how Quantora draws the scene.',
    'Then STOP. Ask me to say “I’m with you” before any definition, table, or quiz.',
    'No leaderboard, points, or rank. Do not plan trips.',
  ].join(' ');
}

export function studyLessonAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Teach ONE idea about ${label} in this message — not a whole chapter.`,
    studyPicturePromptHint(label),
    'Then at most 8 short lines: a title, one plain-language beat, one everyday scene pointing at the picture, and at most one short formula in $$...$$.',
    'No giant tables. No wall of LaTeX. No kiwi pep-talk.',
    'End with one question and: Write your attempt. I will wait.',
    'Do not invent a specific YouTube video, channel episode, or URL.',
  ].join(' ');
}

export function studyQuizAsk(topic) {
  return `Quiz me on ${String(topic || 'this idea').trim()} with 3 short questions. Wait for my answers. Do not give the answers first. If I miss one, repair the foundation, then re-check.`;
}

export function studyPracticeAsk(topic) {
  return `Give me one short practice problem on ${String(topic || 'this idea').trim()}. Use the current conversation and my learning context. Wait for my attempt before explaining or grading it.`;
}

export function studyFlashcardAsk(topic) {
  return `Make 6 flashcards for ${String(topic || 'this idea').trim()}. Front = a recall prompt. Back = a one-sentence answer. Number them. Then ask me to say the first one out loud.`;
}
