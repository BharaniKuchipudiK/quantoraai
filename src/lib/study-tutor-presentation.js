import { studyTeachingTurnKind, studyTeachingTurnNudge } from './study-teaching-turn.js';

const ROBOTIC_SECTION_LABEL = /(^|\n)[ \t]*(?:\*\*)?(?:why (?:it(?:'|’)s|this is) relevant|context-aware question|key takeaway|tutor question)[ \t]*(?::[ \t]*(?:\*\*)?|(?:\*\*)[ \t]*:)[ \t]*/gi;
const PASSIVE_READY_CLOSER = /(?:\n\s*)?(?:(?:(?:let me know (?:once|when)|tell me when) you(?:'|’)re ready)(?:,\s*)?(?:and\s+)?|when you(?:'|’)re ready,?\s*(?=(?:we(?:'|’)ll|i(?:'|’)ll|we can|let(?:'|’)s|continue\b|move on\b|go on\b)))[^\n.!?]*(?:[.!?])?\s*$/i;

const NUDGE_RULES = [
  { kind: 'wave', label: 'I’m with you', pattern: /^\s*(?:hi|hello|hey|okay|ok|got it|i hear you|let(?:'|’)s start)\b/i },
  { kind: 'spark', label: 'Good thinking', pattern: /\b(?:exactly|that(?:'|’)s right|you(?:'|’)ve got it|well spotted|nice reasoning|correct)\b/i },
  { kind: 'magnify', label: 'Let’s look closer', pattern: /\b(?:almost|not quite|mix[- ]?up|misconception|confus(?:ed|ing)?|stuck|tricky|close, but)\b/i },
  { kind: 'pencil', label: 'Let’s work it out', pattern: /\b(?:try this|practice|solve this|work this out|have a go|test your understanding)\b/i },
  { kind: 'idea', label: 'Notice this', pattern: /\b(?:notice|surpris(?:e|ing)|interesting|did you know|worth noticing)\b/i },
];

export function polishStudyTutorText(text = '') {
  return normalizeStudyFlashcards(String(text || ''))
    .replace(ROBOTIC_SECTION_LABEL, '$1')
    .replace(PASSIVE_READY_CLOSER, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function studyTutorNudge(text = '') {
  const source = polishStudyTutorText(text)
    .replace(/<quantora-study-(?:picture|lab|flashcard)\b[^>]*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return null;
  const openingBeat = source.slice(0, 260);
  const match = NUDGE_RULES.find((rule) => rule.pattern.test(openingBeat));
  if (match) return { kind: match.kind, label: match.label };
  return studyTeachingTurnNudge(studyTeachingTurnKind('', source));
}

function cleanCardCell(value = '') {
  return String(value)
    .trim()
    .replace(/^\d+\.\s*/, '')
    .replace(/^(["“])|(["”])$/g, '')
    .replace(/\*\*/g, '')
    .replace(/"/g, '”');
}

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
