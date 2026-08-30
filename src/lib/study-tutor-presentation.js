/*
 * Small client-side guardrails for weaker tutor models. They remove narration
 * about the response format without rewriting the learner-facing explanation.
 */
const ROBOTIC_SECTION_LABEL = /(^|\n)[ \t]*(?:\*\*)?(?:why (?:it(?:'|’)s|this is) relevant|context-aware question|key takeaway|tutor question)[ \t]*(?::[ \t]*(?:\*\*)?|(?:\*\*)[ \t]*:)[ \t]*/gi;

export function polishStudyTutorText(text = '') {
  return normalizeStudyFlashcards(String(text || ''))
    .replace(ROBOTIC_SECTION_LABEL, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanCardCell(value = '') {
  return String(value)
    .trim()
    .replace(/^\d+\.\s*/, '')
    .replace(/^(["“])|(["”])$/g, '')
    .replace(/\*\*/g, '')
    .replace(/"/g, '”');
}

/** Turn a weak-model Front/Back Markdown table into a real interactive deck. */
export function normalizeStudyFlashcards(text = '') {
  const source = String(text || '');
  if (/<quantora-study-flashcard\b/i.test(source)) return source;
  const lines = source.split('\n');
  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!/^\s*\|?\s*front\s*\|\s*back\s*\|?\s*$/i.test(lines[index])) continue;
    if (!/^\s*\|?\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|?\s*$/.test(lines[index + 1])) continue;
    const cards = [];
    let end = index + 2;
    while (end < lines.length && lines[end].includes('|')) {
      const cells = lines[end].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
      if (cells.length < 2) break;
      const front = cleanCardCell(cells[0]);
      const back = cleanCardCell(cells.slice(1).join('|'));
      if (front && back) cards.push(`<quantora-study-flashcard front="${front}" back="${back}" />`);
      end += 1;
    }
    if (cards.length < 2) return source;
    return [...lines.slice(0, index), ...cards, ...lines.slice(end)].join('\n');
  }
  return source;
}
