const CHECKS = [
  {
    id: 'physics.kinematics.projectile-motion',
    label: 'Projectile motion',
    foundation: 'Vector components',
    prompt: 'A ball is thrown sideways off a cliff. Ignore air. What happens to its sideways speed while it falls?',
    options: [
      { id: 'a', text: 'It stays the same', correct: true },
      { id: 'b', text: 'It keeps getting faster sideways', correct: false },
      { id: 'c', text: 'It has no sideways speed', correct: false },
    ],
    ifWrong: 'Sideways motion has no force (ignore air). Fix vector components first, then try projectile motion again.',
    ifRight: 'That foundation is holding. Next we use it on a two-direction problem — not a full exam paper yet.',
  },
  {
    id: 'math.vector.components',
    label: 'Vector components',
    foundation: 'Trigonometric functions',
    prompt: 'A vector of length 10 sits at 30° above the x-axis. The x-part is closest to:',
    options: [
      { id: 'a', text: '10 × cos(30°)', correct: true },
      { id: 'b', text: '10 × tan(30°)', correct: false },
      { id: 'c', text: '30', correct: false },
    ],
    ifWrong: 'The adjacent side of the angle is cosine. Repair trig functions, then components.',
    ifRight: 'Good. This is the brick under projectile motion.',
  },
  {
    id: 'math.trigonometry.functions',
    label: 'Trigonometric functions',
    foundation: 'Right-triangle meaning of sin and cos',
    prompt: 'In a right triangle, cos(θ) is:',
    options: [
      { id: 'a', text: 'Adjacent / hypotenuse', correct: true },
      { id: 'b', text: 'Opposite / hypotenuse', correct: false },
      { id: 'c', text: 'Opposite / adjacent', correct: false },
    ],
    ifWrong: 'Cosine is adjacent over hypotenuse. We do not mark mastery until you can retrieve that without looking.',
    ifRight: 'Solid. Climb to vector components next.',
  },
];

function haystack({ conversationContext = {}, messages = [] } = {}) {
  const facts = conversationContext.facts || [];
  const users = (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text));
  return [conversationContext.goal, conversationContext.understanding, ...facts, ...users].join('\n').toLowerCase();
}

export function deriveStudyTutorBrief(input = {}) {
  const hay = haystack(input);
  const hit = CHECKS.find((item) => hay.includes(item.label.toLowerCase()))
    || (/\b(projectile|jee|neet|mechanics|iit)\b/i.test(hay) ? CHECKS[0] : null);
  if (!hit) {
    return {
      conceptId: '',
      label: '',
      foundation: '',
      next: 'What should we make stronger — a topic, an exam, or a question you got wrong?',
      check: null,
    };
  }
  return {
    conceptId: hit.id,
    label: hit.label,
    foundation: hit.foundation,
    next: `Check ${hit.label}. If it breaks, we repair ${hit.foundation} first.`,
    check: hit,
  };
}

export function gradeStudyCheck(check, optionId) {
  if (!check || !optionId) return null;
  const option = (check.options || []).find((item) => item.id === optionId);
  if (!option) return null;
  return {
    correct: option.correct === true,
    message: option.correct ? check.ifRight : check.ifWrong,
  };
}
