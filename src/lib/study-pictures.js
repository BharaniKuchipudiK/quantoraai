export const STUDY_PICTURE_KINDS = Object.freeze([
  'apple-tree',
  'book-table',
  'truck-car',
  'canoe-dock',
  'rocket',
  'force-arrows',
  'ice-puck',
]);

const PICTURE_RE = /<quantora-study-picture\b([^>]*)\/?>/gi;

function attr(raw, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(raw || '');
  return match ? match[1].trim() : '';
}

export function studyPictureCaption(kind, caption = '') {
  if (caption) return caption;
  const labels = {
    'apple-tree': 'Newton under the tree — why does the apple fall the same way every time?',
    'book-table': 'A book at rest on a table — two forces, no motion.',
    'truck-car': 'Truck vs car — same pair of forces, different accelerations.',
    'canoe-dock': 'Step out of a canoe — you go one way, the boat goes the other.',
    rocket: 'A rocket pushes gas down, so the gas pushes the rocket up.',
    'force-arrows': 'Net force and mass together set acceleration.',
    'ice-puck': 'On ice, a shove keeps going until something else acts.',
  };
  return labels[kind] || 'A picture of this idea.';
}

export function splitStudySegments(text = '') {
  const source = String(text || '');
  const segments = [];
  let last = 0;
  PICTURE_RE.lastIndex = 0;
  let match = PICTURE_RE.exec(source);
  while (match) {
    if (match.index > last) {
      segments.push({ type: 'md', text: source.slice(last, match.index) });
    }
    const kindRaw = attr(match[1], 'kind').toLowerCase();
    const kind = STUDY_PICTURE_KINDS.includes(kindRaw) ? kindRaw : 'force-arrows';
    segments.push({
      type: 'picture',
      kind,
      caption: studyPictureCaption(kind, attr(match[1], 'caption')),
    });
    last = match.index + match[0].length;
    match = PICTURE_RE.exec(source);
  }
  if (last < source.length) segments.push({ type: 'md', text: source.slice(last) });
  return segments.filter((segment) => segment.type === 'picture' || String(segment.text || '').trim());
}

function hasPictureTag(text) {
  return /<quantora-study-picture\b/i.test(text);
}

/**
 * Old Study replies never emitted picture tags. Attach up to two real drawings
 * so a Newton wall of text still gets images on screen.
 */
export function decorateStudyMessage(text = '') {
  const source = String(text || '');
  if (!source.trim()) return source;
  if (hasPictureTag(source)) return source;

  const kinds = [];
  if (/apple|newton|first law|inertia/i.test(source)) kinds.push('apple-tree');
  if (/book|table|normal force|second law/i.test(source)) kinds.push('book-table');
  if (/truck|collision|third law|action/i.test(source)) kinds.push('truck-car');
  if (/canoe|dock|rocket|recoil/i.test(source)) kinds.push('rocket');
  if (/ice|puck|skat/i.test(source)) kinds.push('ice-puck');
  if (!kinds.length && /force|accelerat|momentum/i.test(source)) kinds.push('force-arrows');

  const unique = [...new Set(kinds)].slice(0, 2);
  if (!unique.length) return source;
  const tags = unique.map((kind) => `<quantora-study-picture kind="${kind}" />`).join('\n');
  return `${tags}\n\n${source}`;
}
