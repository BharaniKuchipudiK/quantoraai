/**
 * Mini-practice that waits for the student. Answers stay hidden on the board.
 * Setup comes from the session topic, never from a canned chapter pack.
 */
export function miniPracticeFor(_conceptId, label = '') {
  const topic = String(label || 'this idea').trim() || 'this idea';
  return {
    title: `Mini-practice: ${topic}`,
    setup: `One short problem on ${topic}. Work it on paper if you can. Do not look up the answer first.`,
    questions: [
      'State the idea in one sentence.',
      'Apply it to one number or one everyday situation.',
    ],
  };
}

export function studyRealWorldAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Show Real-world applications of ${label} as a two-column Markdown table: Situation | How the laws or idea appear.`,
    'Use 4 everyday rows that actually use this idea — not a stock physics example unless this topic is physics.',
    'Keep each cell to one or two short sentences.',
    'Do not invent a specific YouTube video.',
    'Then STOP. Do not add a worked numerical solution unless I ask.',
  ].join(' ');
}

export function studyMiniPracticeAsk(topic, practice) {
  const label = String(topic || 'this idea').trim();
  const block = practice || miniPracticeFor('', label);
  return [
    `Give me this Mini-practice on ${label}. Show the setup and the questions only.`,
    `Setup: ${block.setup}`,
    `Questions: ${block.questions.join(' ')}`,
    'Do NOT show the numerical answers, a worked solution, or “click to reveal”.',
    'End with: “Write your attempt below. I will wait.”',
    'Wait for my reply before you mark anything.',
  ].join(' ');
}

export function studyAnswerDebriefAsk({
  topic = 'this idea',
  setup = '',
  questions = [],
  studentAnswer = '',
} = {}) {
  const asked = (questions || []).map((item, index) => `${index + 1}. ${item}`).join(' ');
  return [
    `I am a student under exam pressure. Be a calm professor, never mocking.`,
    `Topic: ${String(topic).trim()}.`,
    `The question was framed as: ${setup} ${asked}`.trim(),
    `My attempt: ${String(studentAnswer || '').trim() || '(blank)'}`,
    'Now do all of this, in this order, in short sections:',
    '1) One line of encouragement that is specific to what I tried — not empty praise.',
    '2) Mark: what is right, what is incomplete, what is a misconception. Do not invent a percentile or IIT/NEET rank.',
    '3) Intent: what the question was testing vs what I actually answered — recall, apply, multi-concept, numerical, or assertion-reason if this session named that competency.',
    '4) Another valid way to think it, if there is one.',
    '5) The shortest clean method, step by step, with units.',
    '6) One foundation to repair if I slipped, then one similar check — questions only, wait again.',
  ].join(' ');
}

export function studyScheduleAsk(topic) {
  return [
    `Help me build a study schedule for ${String(topic || 'my next exam').trim()}.`,
    'If you do not know my exam date, hours free today, and sleep/school blocks, ask those first — one question at a time.',
    'Never invent a 14-hour grind. Protect sleep. Foundation first, then this topic, then one mixed check.',
    'This is not an official IIT or NEET timetable and not a promise I will rank.',
    'If I only have a little time, shrink the plan. Do not shame me.',
  ].join(' ');
}

export function buildStudyNotesFile({
  topic = 'Study notes',
  foundation = '',
  lessonText = '',
  studentAttempt = '',
} = {}) {
  const title = String(topic || 'Study notes').trim();
  const lines = [
    `# ${title}`,
    '',
    foundation ? `Foundation: ${foundation}` : '',
    '',
    'These notes are for you. They are not an official IIT or NEET score.',
    '',
    lessonText ? String(lessonText).trim() : '_No lesson in this chat yet. Use Explain on the tutor board._',
    '',
    studentAttempt ? `## Your last attempt\n\n${String(studentAttempt).trim()}` : '',
    '',
    '## Next',
    '- Re-check the foundation, then one mixed problem.',
    '- Use Khan Academy, SWAYAM, or Physics Wallah search from the board — do not trust a made-up video link.',
    '',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === ''));
  return lines.join('\n').trim() + '\n';
}

export function downloadTextFile(filename, text) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
