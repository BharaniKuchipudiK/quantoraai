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
