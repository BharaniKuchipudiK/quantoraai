/**
 * Study pictures must match the lesson. The original pack was Newton's laws
 * only. Using those tags as the default for every icebreaker put gravity,
 * apples, and books-on-tables into Algebra. That is not intelligence and
 * it is not PCL memory — it is a hard-coded physics kit.
 */

export const MECHANICS_PICTURE_KINDS = Object.freeze([
  'apple-tree',
  'book-table',
  'truck-car',
  'canoe-dock',
  'rocket',
  'force-arrows',
  'ice-puck',
]);

export const ALGEBRA_PICTURE_KINDS = Object.freeze([
  'mystery-box',
  'balance-scale',
  'number-line',
]);

export const STUDY_PICTURE_KINDS = Object.freeze([
  ...ALGEBRA_PICTURE_KINDS,
  'concept-card',
  ...MECHANICS_PICTURE_KINDS,
]);

const TOKEN_RE = /<(quantora-study-picture|quantora-study-lab)\b([^>]*)\/?>/gi;

export const STUDY_LAB_KINDS = Object.freeze(['newton', 'fbd']);

const MECHANICS_KIND_SET = new Set(MECHANICS_PICTURE_KINDS);
const ALGEBRA_KIND_SET = new Set(ALGEBRA_PICTURE_KINDS);

function attr(raw, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(raw || '');
  return match ? match[1].trim() : '';
}

export function studyPictureCaption(kind, caption = '') {
  const custom = String(caption || '').trim();
  if (custom) return custom;
  const labels = {
    'mystery-box': 'The unknown is a box — algebra finds what is inside.',
    'balance-scale': 'An equation is a balance. Whatever you do to one side, do to the other.',
    'number-line': 'A number sits on a line. Operations move it.',
    'concept-card': 'A picture of this idea.',
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

export function inferStudyPictureSubject(hay = '') {
  const source = String(hay || '');
  const mechanics = /\bnewton|\binertia\b|kinematics|projectile|\bf\s*=\s*ma\b|free-?body|\bfbd\b|\bmomentum\b|third law|first law of motion|second law of motion|\bgravity\b|\baccelerat|\bnet force\b/i.test(source);
  const algebra = /\balgebra\b|\bequation\b|\bvariable\b|polynomial|quadratic|linear equation|inverse operat|\bunknown\b|\bexpressions?\b|\binequalit|\bfactoris|\bsolve for\b|\bx\s*[-+=]|mystery box/i.test(source);
  if (algebra && !mechanics) return 'algebra';
  if (mechanics && !algebra) return 'mechanics';
  if (algebra && mechanics) return 'algebra';
  return 'general';
}

export function suggestStudyPictureKind(topic = '', text = '') {
  const hay = `${topic}\n${text}`;
  const subject = inferStudyPictureSubject(hay);
  if (subject === 'algebra') {
    if (/balance|both sides|inverse|equation/i.test(hay)) return 'balance-scale';
    if (/number line|integer|negative/i.test(hay)) return 'number-line';
    return 'mystery-box';
  }
  if (subject === 'mechanics') {
    if (/third law|truck|collision|action and reaction/i.test(hay)) return 'truck-car';
    if (/second law|\bf\s*=\s*ma\b|net force/i.test(hay)) return 'force-arrows';
    if (/ice|puck|inertia|first law of motion/i.test(hay)) return 'ice-puck';
    if (/rocket|recoil|canoe/i.test(hay)) return 'rocket';
    if (/book on a table|normal force/i.test(hay)) return 'book-table';
    return 'apple-tree';
  }
  return 'concept-card';
}

export function fitStudyPictureKind(kind, subject, topic = '', text = '') {
  const raw = String(kind || '').toLowerCase();
  if (subject === 'algebra') {
    if (ALGEBRA_KIND_SET.has(raw)) return raw;
    return suggestStudyPictureKind(topic, text);
  }
  if (subject === 'mechanics') {
    if (MECHANICS_KIND_SET.has(raw)) return raw;
    return suggestStudyPictureKind(topic, text);
  }
  if (MECHANICS_KIND_SET.has(raw)) return 'concept-card';
  if (STUDY_PICTURE_KINDS.includes(raw)) return raw;
  return 'concept-card';
}

function physicsCaption(caption = '') {
  return /newton|apple fall|two forces|truck vs car|canoe|rocket pushes|net force and mass|on ice, a shove/i.test(String(caption || ''));
}

function rewriteTag(full, tagName, attrs, subject, topic, text) {
  if (String(tagName || '').toLowerCase() === 'quantora-study-lab') {
    if (subject !== 'mechanics') return '';
    const kindRaw = attr(attrs, 'kind').toLowerCase();
    const kind = STUDY_LAB_KINDS.includes(kindRaw) ? kindRaw : 'newton';
    return `<quantora-study-lab kind="${kind}" />`;
  }
  const kind = fitStudyPictureKind(attr(attrs, 'kind'), subject, topic, text);
  let caption = attr(attrs, 'caption');
  if (subject !== 'mechanics' && physicsCaption(caption)) caption = '';
  const captionAttr = caption ? ` caption="${caption.replace(/"/g, '')}"` : '';
  return `<quantora-study-picture kind="${kind}"${captionAttr} />`;
}

export function rewriteStudyPictureTags(text = '', topic = '') {
  const source = String(text || '');
  const subject = inferStudyPictureSubject(`${topic}\n${source}`);
  TOKEN_RE.lastIndex = 0;
  return source.replace(TOKEN_RE, (full, tagName, attrs) => (
    rewriteTag(full, tagName, attrs, subject, topic, source)
  ));
}

export function splitStudySegments(text = '', topic = '') {
  const source = rewriteStudyPictureTags(text, topic);
  const subject = inferStudyPictureSubject(`${topic}\n${source}`);
  const segments = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(source);
  while (match) {
    if (match.index > last) {
      segments.push({ type: 'md', text: source.slice(last, match.index) });
    }
    const tag = String(match[1] || '').toLowerCase();
    const kindRaw = attr(match[2], 'kind').toLowerCase();
    if (tag === 'quantora-study-lab') {
      if (subject === 'mechanics') {
        segments.push({
          type: 'lab',
          kind: STUDY_LAB_KINDS.includes(kindRaw) ? kindRaw : 'newton',
        });
      }
    } else {
      const kind = fitStudyPictureKind(kindRaw, subject, topic, source);
      const captionRaw = attr(match[2], 'caption');
      const caption = subject !== 'mechanics' && physicsCaption(captionRaw) ? '' : captionRaw;
      segments.push({
        type: 'picture',
        kind,
        caption: studyPictureCaption(kind, caption),
      });
    }
    last = match.index + match[0].length;
    match = TOKEN_RE.exec(source);
  }
  if (last < source.length) segments.push({ type: 'md', text: source.slice(last) });
  return segments.filter((segment) => segment.type !== 'md' || String(segment.text || '').trim());
}

function hasPictureTag(text) {
  return /<quantora-study-picture\b/i.test(text);
}

function hasLabTag(text) {
  return /<quantora-study-lab\b/i.test(text);
}

export function wantsStudyLab(text = '') {
  return /visual (workspace|laboratory|board|lab)|free-?body|fbd\b|vector tab|give one quick push|inertia tab|incline angle|interactive visual/i.test(String(text || ''));
}

function pickMechanicsKinds(source = '') {
  const kinds = [];
  if (/\bnewton\b|first law of motion|\binertia\b/i.test(source)) kinds.push('apple-tree');
  if (/book on a table|normal force|second law of motion/i.test(source)) kinds.push('book-table');
  if (/truck|collision|third law|action and reaction/i.test(source)) kinds.push('truck-car');
  if (/canoe|dock|rocket|recoil/i.test(source)) kinds.push('rocket');
  if (/ice|puck|skat/i.test(source)) kinds.push('ice-puck');
  if (!kinds.length && /\bforce\b|\baccelerat|\bmomentum\b/i.test(source)) kinds.push('force-arrows');
  return [...new Set(kinds)].slice(0, 2);
}

/**
 * Old Study replies described labs that were never drawn. Attach real pictures
 * only for the subject on the desk. Never inject Newton into Algebra because
 * the model said "apple" or "table".
 */
export function decorateStudyMessage(text = '', topic = '') {
  let source = String(text || '');
  if (!source.trim()) return source;
  const hay = `${topic}\n${source}`;
  const subject = inferStudyPictureSubject(hay);
  source = rewriteStudyPictureTags(source, topic);

  if (!hasLabTag(source) && wantsStudyLab(source) && subject === 'mechanics') {
    const kind = /fbd|free-?body|incline|normal force/i.test(source) ? 'fbd' : 'newton';
    source = `<quantora-study-lab kind="${kind}" />\n\n${source}`;
  }
  if (hasPictureTag(source)) return source;

  if (subject === 'algebra') {
    if (inferStudyPictureSubject(source) !== 'algebra') return source;
    return `<quantora-study-picture kind="${suggestStudyPictureKind(topic, source)}" />\n\n${source}`;
  }
  if (subject !== 'mechanics') return source;

  const unique = pickMechanicsKinds(source);
  if (!unique.length) return source;
  const tags = unique.map((kind) => `<quantora-study-picture kind="${kind}" />`).join('\n');
  return `${tags}\n\n${source}`;
}

export function studyPicturePromptHint(topic = '') {
  const kind = suggestStudyPictureKind(topic);
  return [
    `Put this tag on its own line: <quantora-study-picture kind="${kind}" />`,
    'The picture must match THIS topic.',
    'Algebra / equations / variables: mystery-box, balance-scale, or number-line.',
    'Newton / forces / motion only: apple-tree, book-table, truck-car, canoe-dock, rocket, force-arrows, ice-puck.',
    'Never use Newton, a falling apple, a book on a table, a truck crash, or a rocket unless this lesson is mechanics.',
  ].join(' ');
}
