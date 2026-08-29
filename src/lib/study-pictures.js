/**
 * Study pictures are caption-first and conversation-scoped.
 * There is no stock scene playlist. The client never invents a Newton
 * (or Algebra) picture because a keyword fired.
 */

const TOKEN_RE = /<(quantora-study-picture|quantora-study-lab)\b([^>]*)\/?>/gi;

export const STUDY_LAB_KINDS = Object.freeze(['newton', 'fbd']);

export function studyVisualKind(caption = '') {
  const text = String(caption || '').toLowerCase();
  if (/force|motion|velocity|acceleration|friction|gravity|newton|projectile/.test(text)) return 'physics-motion';
  if (/equation|algebra|unknown|solve|both sides|variable|\bx\b/.test(text)) return 'algebra-balance';
  if (/cell|nucleus|membrane|mitosis|biology|organelle/.test(text)) return 'biology-cell';
  if (/atom|molecule|bond|electron|chemistry|reaction/.test(text)) return 'chemistry-bond';
  if (/graph|slope|axis|curve|plot/.test(text)) return 'graph';
  return 'concept-relationship';
}

/** Legacy kind names the model may still emit. They are not a menu and never fill a caption. */
const STOCK_SCENE_CAPTION = /newton under the tree|apple fall the same way|book at rest on a table|two forces, no motion|truck vs car|step out of a canoe|rocket pushes gas|net force and mass together|on ice, a shove keeps going/i;

function attr(raw, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(raw || '');
  return match ? match[1].trim() : '';
}

function withoutStudyTags(text = '') {
  return String(text || '').replace(/<(quantora-study-picture|quantora-study-lab)\b[^>]*\/?>/gi, ' ');
}

function contextHay(topic = '', body = '') {
  return `${topic}\n${withoutStudyTags(body)}`.toLowerCase();
}

function lessonAsksForMechanicsLab(hay = '') {
  return /\bnewton|\binertia\b|free-?body|\bfbd\b|kinematics|\bf\s*=\s*ma\b|first law of motion|third law/i.test(hay);
}

/**
 * A picture stays only when its caption is about this conversation.
 * Empty captions and leftover stock Newton lines are dropped.
 */
export function pictureCaptionFitsLesson(caption = '', topic = '', body = '') {
  const cap = String(caption || '').trim();
  if (!cap) return false;
  const hay = contextHay(topic, body);
  if (!STOCK_SCENE_CAPTION.test(cap)) return true;
  return lessonAsksForMechanicsLab(hay);
}

export function studyPictureCaption(caption = '', topic = '', body = '') {
  const custom = String(caption || '').trim();
  if (!pictureCaptionFitsLesson(custom, topic, body)) return '';
  return custom;
}

export function rewriteStudyPictureTags(text = '', topic = '') {
  const source = String(text || '');
  const hay = contextHay(topic, source);
  TOKEN_RE.lastIndex = 0;
  return source.replace(TOKEN_RE, (full, tagName, attrs) => {
    if (String(tagName || '').toLowerCase() === 'quantora-study-lab') {
      if (!lessonAsksForMechanicsLab(hay)) return '';
      const kindRaw = attr(attrs, 'kind').toLowerCase();
      const kind = STUDY_LAB_KINDS.includes(kindRaw) ? kindRaw : 'newton';
      return `<quantora-study-lab kind="${kind}" />`;
    }
    const caption = studyPictureCaption(attr(attrs, 'caption'), topic, source);
    if (!caption) return '';
    return `<quantora-study-picture caption="${caption.replace(/"/g, '')}" />`;
  });
}

export function splitStudySegments(text = '', topic = '') {
  const source = rewriteStudyPictureTags(text, topic);
  const segments = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(source);
  while (match) {
    if (match.index > last) {
      segments.push({ type: 'md', text: source.slice(last, match.index) });
    }
    const tag = String(match[1] || '').toLowerCase();
    if (tag === 'quantora-study-lab') {
      const kindRaw = attr(match[2], 'kind').toLowerCase();
      segments.push({
        type: 'lab',
        kind: STUDY_LAB_KINDS.includes(kindRaw) ? kindRaw : 'newton',
      });
    } else {
      const caption = attr(match[2], 'caption');
      if (caption) {
        segments.push({
          type: 'picture',
          caption,
        });
      }
    }
    last = match.index + match[0].length;
    match = TOKEN_RE.exec(source);
  }
  if (last < source.length) segments.push({ type: 'md', text: source.slice(last) });
  return segments.filter((segment) => segment.type !== 'md' || String(segment.text || '').trim());
}

export function wantsStudyLab(text = '') {
  return /free-?body|\bfbd\b|inertia tab|newton lab|quantora-study-lab/i.test(String(text || ''));
}

/**
 * Never invent a picture. Only keep tags the model already wrote, and only
 * when they still match this conversation.
 */
export function decorateStudyMessage(text = '', topic = '') {
  return rewriteStudyPictureTags(String(text || ''), topic);
}

export function studyPicturePromptHint(topic = '') {
  const label = String(topic || 'this idea').trim();
  return [
    `If a picture helps ${label}, put this tag on its own line: <quantora-study-picture caption="one sentence about this idea" />`,
    'The caption must come from THIS conversation — the idea the learner just asked about.',
    'Do not reuse a scene from another subject. Do not invent image URLs.',
  ].join(' ');
}
