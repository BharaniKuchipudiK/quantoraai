/**
 * Official places a learner can go. These are search/home links for a topic,
 * not invented videos. A specific YouTube episode is only valid if a live
 * check in this session confirmed it.
 */
import { studyPicturePromptHint } from './study-pictures.js';

export function studyResourceLinks(topic = '') {
  const query = String(topic || '').replace(/\s+/g, ' ').trim() || 'this topic';
  const encoded = encodeURIComponent(query);
  return [
    {
      id: 'khan',
      label: 'Khan Academy',
      why: 'Clear lessons and practice on this idea',
      href: `https://www.khanacademy.org/search?page_search_query=${encoded}`,
    },
    {
      id: 'swayam',
      label: 'SWAYAM',
      why: 'Indian government courses you can search by this topic',
      href: `https://swayam.gov.in/explorer?searchText=${encoded}`,
    },
    {
      id: 'pw',
      label: 'Physics Wallah',
      why: 'Exam-style explanation in a familiar classroom voice',
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} Physics Wallah`)}`,
    },
    {
      id: 'youtube',
      label: 'YouTube search',
      why: 'Find a worked visual — we do not invent a video title',
      href: `https://www.youtube.com/results?search_query=${encoded}`,
    },
    {
      id: 'notebooklm',
      label: 'Google NotebookLM',
      why: 'Drop a PDF or podcast there, then paste the key points back here so I can quiz you',
      href: 'https://notebooklm.google.com/',
    },
  ];
}

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

export function studyFlashcardAsk(topic) {
  return `Make 6 flashcards for ${String(topic || 'this idea').trim()}. Front = a recall prompt. Back = a one-sentence answer. Number them. Then ask me to say the first one out loud.`;
}

export function studyNotesAsk(topic) {
  return `I will bring notes on ${String(topic || 'this idea').trim()}. Tell me how to use Google NotebookLM for a PDF or podcast, then I will paste the key points here. After I paste, quiz me on those points only — do not invent extra facts.`;
}
