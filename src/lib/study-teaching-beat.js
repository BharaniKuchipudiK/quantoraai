/**
 * H3.5.5 teaching-shape check. This is not a global word-count quota.
 * It fails only on unambiguous chapter dumps: more than one question,
 * a numbered topic list, a definition pile, or prose at the 300-word
 * lecture size the spec names as the thing a diagram should replace.
 */
export function studyTeachingBeatViolations(text = '') {
  const source = String(text || '').trim();
  const violations = [];
  if ((source.match(/\?/g) || []).length > 1) violations.push('multiple_questions');
  if (/\b1[\).:]\s+\S[\s\S]{12,}2[\).:]\s+\S[\s\S]{12,}3[\).:]\s+\S/.test(source)) {
    violations.push('multi_topic_list');
  }
  if ((source.match(/\b(?:is defined as|definition:|defined as)\b/gi) || []).length >= 3) {
    violations.push('definition_dump');
  }
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 300) violations.push('chapter_length');
  return violations;
}

export function assertStudyTeachingBeat(text = '', label = 'lesson') {
  const violations = studyTeachingBeatViolations(text);
  if (!violations.length) return;
  throw new Error(`One-idea pacing failed (${label}): ${violations.join(', ')}`);
}
