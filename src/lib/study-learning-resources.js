/**
 * Official places a learner can go. These are search/home links for a topic,
 * not invented videos. A specific YouTube episode is only valid if a live
 * check in this session confirmed it.
 */
export function studyResourceLinks(topic = '') {
  const query = String(topic || '').replace(/\s+/g, ' ').trim() || 'physics';
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
    `Give one true, checkable icebreaker for ${label} — a short origin, first use, or human story (for Newton’s laws: the apple as a question about why things fall the same way).`,
    'Keep it to a few sentences. Invite me to picture it. Do not invent images, URLs, or animations you cannot show.',
    'Then STOP. Ask me to say “I’m with you” before any definition, table, flashcards, or quiz.',
    'No leaderboard, points, or rank. Do not plan trips, flights, or hotels.',
  ].join(' ');
}

export function studyLessonAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Open with one true one-sentence hook for ${label}, then teach like a patient personal tutor.`,
    'Use numbered sections.',
    'For each idea: a short title, the formal definition in italics, what it means in plain words, one everyday picture, and a tiny worked example if there is math.',
    'Include a Real-world applications table: Situation | How the idea appears (4 rows).',
    'Then a Mini-practice with questions only. Do not reveal answers. End with: Write your attempt. I will wait.',
    'Offer one visual I could sketch.',
    'Do not invent a specific YouTube video, channel episode, or URL. If I need a video, point me to an official search (Khan Academy, SWAYAM, Physics Wallah, YouTube) for this topic.',
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
