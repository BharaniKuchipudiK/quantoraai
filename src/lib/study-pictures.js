/**
 * Study pictures are caption-first and conversation-scoped.
 * There is no stock scene playlist. The client never invents a Newton
 * (or Algebra) picture because a keyword fired.
 */

const TOKEN_RE = /<(quantora-study-picture|quantora-study-lab|quantora-study-flashcard)\b([^>]*)\/?>/gi;

export const STUDY_LAB_KINDS = Object.freeze(['newton', 'newton-third-law', 'fbd', 'linear-function']);

/*
 * A caption ABOUT THE INSTRUCTION rather than about an idea. The tutor prompt
 * describes the picture tag to the model, and the model sometimes captions the
 * tag instead of the subject — "Opening a study idea with an icebreaker and
 * visual tag" is a caption about captioning. There is no diagram of that.
 */
const META_CAPTION = /\b(icebreaker|picture tag|visual tag|study idea|this idea|one sentence|caption|placeholder|diagram of the (?:idea|concept))\b/i;

const ELECTRICITY_VISUAL = /\b(?:electric(?:ity|al)?|circuit|battery|emf|electromotive force|terminal (?:potential difference|voltage)|potential difference|internal resistance|resistor|ampere|voltage|volt|ohm(?:'s)? law|conventional current|electric(?:al)? current|current (?:flows?|through|in|around|of|is|=))\b/i;
const FIELD_VISUAL = /\b(?:electric field|field lines?|equipotential|electrostatic field|magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i;
const GEOMETRY_VISUAL = /\b(?:pythagoras|pythagorean|right[- ]angled triangle|right triangle|hypotenuse)\b/i;

function compactLabel(value = '', max = 34) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

/** Parse an explicit A -> B -> C teaching sequence. No arrows means no flow. */
export function studyProcessSteps(caption = '') {
  const source = String(caption || '').trim();
  if (!/(?:->|→|⇒)/.test(source)) return [];
  const body = source.includes(':') ? source.slice(source.indexOf(':') + 1) : source;
  const steps = body
    .split(/\s*(?:->|→|⇒)\s*/)
    .map((part) => compactLabel(part.replace(/[.;]+$/g, '')))
    .filter(Boolean);
  return steps.length >= 2 ? steps.slice(0, 4) : [];
}

/** Extract 2–5 explicit four-digit years for a deterministic timeline. */
export function studyTimelinePoints(caption = '') {
  const years = [...String(caption || '').matchAll(/\b((?:1[0-9]{3}|20[0-9]{2}|2100))\b/g)].map((match) => match[1]);
  return [...new Set(years)]
    .sort((a, b) => Number(a) - Number(b))
    .slice(0, 5);
}

/** Parse the intentionally narrow caption form: number line from A to B, mark C. */
export function studyNumberLineSpec(caption = '') {
  const text = String(caption || '');
  const range = /number line\s+from\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/i.exec(text);
  if (!range) return null;
  const min = Number(range[1]);
  const max = Number(range[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const markMatch = /\bmark\s+(-?\d+(?:\.\d+)?)/i.exec(text);
  const mark = markMatch ? Number(markMatch[1]) : null;
  return {
    min: low,
    max: high,
    mark: Number.isFinite(mark) && mark >= low && mark <= high ? mark : null,
  };
}

/** Keep enough precision for narrow ranges without spraying insignificant zeros. */
export function studyNumberLineLabel(value, min, max) {
  const number = Number(value);
  const low = Number(min);
  const high = Number(max);
  if (![number, low, high].every(Number.isFinite)) return '';
  if (Number.isInteger(number)) return String(number);
  const span = Math.abs(high - low);
  const step = span / 6;
  const precision = step > 0
    ? Math.min(12, Math.max(0, Math.ceil(-Math.log10(step)) + 1))
    : 6;
  return String(Number(number.toFixed(precision)));
}

/**
 * Which diagram this caption earns, or NULL when it earns none.
 *
 * Null is the important return. Every caption used to fall through to a generic
 * three-box "Observe / Connect / Check", so a caption naming no subject still
 * got a picture — shapes arranged to look like teaching while teaching nothing.
 * That is placeholder content, and it is precisely what Build Truth flags as a
 * defect in the pages this platform builds for other people. Drawing nothing is
 * the correct answer when there is nothing to draw.
 */
export function studyVisualKind(caption = '') {
  const raw = String(caption || '');
  const text = raw.toLowerCase();
  if (META_CAPTION.test(text)) return null;
  if (studyNumberLineSpec(raw)) return 'number-line';
  if (studyTimelinePoints(raw).length >= 2 && /timeline|chronolog|year|era|history|before|after/i.test(raw)) return 'timeline';
  if (studyProcessSteps(raw).length >= 2 && /process|cycle|flow|pathway|sequence|step|stage|changes?|becomes?|produces?|turns? into/i.test(raw)) return 'process-flow';
  if (/\b(?:displacement[- ]time|velocity[- ]time|position[- ]time|acceleration[- ]time|motion graphs?)\b/.test(text)) return 'graph';
  if (/force|motion|velocity|acceleration|friction|gravity|newton|projectile|free-?body|vector|components?|resultant/.test(text)) return 'physics-motion';
  if (FIELD_VISUAL.test(text)) return 'field-lines';
  if (ELECTRICITY_VISUAL.test(text)) return 'electricity-circuit';
  if (/graph|slope|axis|curve|plot|trend|correlation|distribution|coordinate plane|quadrant|unit circle|trigonometry|trig|sine|cosine|tangent|vector components?/.test(text)) return 'graph';
  if (GEOMETRY_VISUAL.test(text)) return 'geometry-construction';
  if (/equation|algebra|unknown|solve|both sides|variable|\bx\b/.test(text)) return 'algebra-balance';
  if (/cell|nucleus|membrane|mitosis|biology|organelle/.test(text)) return 'biology-cell';
  if (/atom|molecule|bond|electron|chemistry|reaction/.test(text)) return 'chemistry-bond';
  if (/cause|effect|leads? to|depends? on|relationship|compare|versus|\bvs\b|between/.test(text)) return 'concept-relationship';
  return null;
}

export function studyPhysicsVisualVariant(caption = '') {
  const label = String(caption || '');
  if (/\b(?:vector|components?|x-?axis|y-?axis|resultant)\b/i.test(label)) return 'vector-components';
  return /\b(?:passenger|vehicle|car|bus)\b[\s\S]*\b(?:brak|stop)|\b(?:brak|stop)[\s\S]*\b(?:passenger|vehicle|car|bus)\b/i.test(label)
    ? 'braking-inertia'
    : 'free-body';
}

export function studyElectricityVisualVariant(caption = '') {
  return /\b(?:emf|electromotive force|terminal (?:potential difference|voltage)|internal resistance|lost volts?|energy per coulomb)\b/i.test(String(caption || ''))
    ? 'emf-terminal-voltage'
    : 'simple-circuit';
}

export function studyFieldVisualVariant(caption = '') {
  return /\b(?:magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i.test(String(caption || ''))
    ? 'magnetic'
    : 'electric';
}

export function studyGraphVisualVariant(caption = '') {
  const label = String(caption || '');
  if (/\bquadrant\b|\bcoordinate plane\b/i.test(label)) return 'quadrant';
  if (/\bunit circle\b|\btrigonometr|\b(?:sine|cosine|tangent)\b/i.test(label)) return 'unit-circle';
  if (/\b(?:displacement[- ]time|position[- ]time)\b/i.test(label)) return 'displacement-time';
  if (/\bvelocity[- ]time\b/i.test(label)) return 'velocity-time';
  return 'slope';
}

export function studyAlgebraVisualVariant(caption = '') {
  return /\b(?:both sides|same operation|undo|isolat(?:e|ing)|transform)\b/i.test(String(caption || ''))
    ? 'transformation'
    : 'scale';
}

export function studyGeometryVisualVariant(caption = '') {
  return GEOMETRY_VISUAL.test(String(caption || '')) ? 'right-triangle' : null;
}

const STOCK_SCENE_CAPTION = /newton under the tree|apple fall the same way|book at rest on a table|two forces, no motion|truck vs car|step out of a canoe|rocket pushes gas|net force and mass together|on ice, a shove keeps going/i;

function attr(raw, name) {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(raw || '');
  return match ? match[1].trim() : '';
}

function withoutStudyTags(text = '') {
  return String(text || '').replace(/<(quantora-study-picture|quantora-study-lab|quantora-study-flashcard)\b[^>]*\/?>/gi, ' ');
}

function contextHay(topic = '', body = '') {
  return `${topic}\n${withoutStudyTags(body)}`.toLowerCase();
}

function lessonAsksForMechanicsLab(hay = '') {
  return /\bnewton|\binertia\b|free-?body|\bfbd\b|kinematics|\bf\s*=\s*ma\b|first law of motion|third law/i.test(hay);
}

function lessonAsksForLinearFunctionLab(hay = '') {
  return /\blinear function\b|\bslope[- ]intercept\b|\bgradient[- ]intercept\b|\bslope\b.{0,40}\b(?:y[- ]?intercept|intercept)\b|\by\s*=\s*m\s*\*?\s*x\s*(?:[+-]\s*b)?\b/i.test(String(hay || ''));
}

function labKindFitsLesson(kind = '', hay = '') {
  if (kind === 'linear-function') return lessonAsksForLinearFunctionLab(hay);
  if (kind === 'newton' || kind === 'newton-third-law' || kind === 'fbd') return lessonAsksForMechanicsLab(hay);
  return false;
}

function lessonAsksForElectricity(hay = '') {
  return ELECTRICITY_VISUAL.test(String(hay || ''));
}

export function pictureCaptionFitsLesson(caption = '', topic = '', body = '') {
  const cap = String(caption || '').trim();
  if (!cap) return false;
  const hay = contextHay(topic, body);
  if (STOCK_SCENE_CAPTION.test(cap) && !lessonAsksForMechanicsLab(hay)) return false;
  if (ELECTRICITY_VISUAL.test(cap) && !lessonAsksForElectricity(hay)) return false;
  return true;
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
    if (String(tagName || '').toLowerCase() === 'quantora-study-flashcard') {
      const front = attr(attrs, 'front').replace(/"/g, '');
      const back = attr(attrs, 'back').replace(/"/g, '');
      if (!front || !back) return '';
      return `<quantora-study-flashcard front="${front}" back="${back}" />`;
    }
    if (String(tagName || '').toLowerCase() === 'quantora-study-lab') {
      const kindRaw = attr(attrs, 'kind').toLowerCase();
      if (!STUDY_LAB_KINDS.includes(kindRaw) || !labKindFitsLesson(kindRaw, hay)) return '';
      return `<quantora-study-lab kind="${kindRaw}" />`;
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
    if (match.index > last) segments.push({ type: 'md', text: source.slice(last, match.index) });
    const tag = String(match[1] || '').toLowerCase();
    if (tag === 'quantora-study-flashcard') {
      const front = attr(match[2], 'front');
      const back = attr(match[2], 'back');
      if (front && back) segments.push({ type: 'flashcard', front, back });
    } else if (tag === 'quantora-study-lab') {
      const kindRaw = attr(match[2], 'kind').toLowerCase();
      if (STUDY_LAB_KINDS.includes(kindRaw)) segments.push({ type: 'lab', kind: kindRaw });
    } else {
      const caption = attr(match[2], 'caption');
      if (caption) segments.push({ type: 'picture', caption });
    }
    last = match.index + match[0].length;
    match = TOKEN_RE.exec(source);
  }
  if (last < source.length) segments.push({ type: 'md', text: source.slice(last) });
  return segments.filter((segment) => segment.type !== 'md' || String(segment.text || '').trim());
}

function requiredStudyLabTagFromRouting(routing = null) {
  const plan = routing?.representation || null;
  if (
    !plan
    || plan.rendererRequired !== true
    || plan.fallback !== 'none'
    || plan.primaryRepresentation !== 'simulation_or_lab'
  ) {
    return '';
  }
  if (plan.rendererKind === 'newton-lab') return '<quantora-study-lab kind="newton-third-law" />';
  if (plan.rendererKind === 'linear-function-lab') return '<quantora-study-lab kind="linear-function" />';
  return '';
}

export function enforceStudyRendererContract(text = '', routing = null) {
  const source = String(text || '');
  const requiredTag = requiredStudyLabTagFromRouting(routing);
  if (!requiredTag || source.includes(requiredTag)) return source;
  return `${requiredTag}\n\n${source}`.trim();
}

export function wantsStudyLab(text = '') {
  return /free-?body|\bfbd\b|inertia tab|newton lab|quantora-study-lab/i.test(String(text || ''));
}

export function decorateStudyMessage(text = '', topic = '') {
  return rewriteStudyPictureTags(String(text || ''), topic);
}

export function studyPicturePromptHint(topic = '') {
  const label = String(topic || 'this idea').trim();
  return [
    `If a picture helps ${label}, put this tag on its own line: <quantora-study-picture caption="one sentence about this idea" />`,
    'The caption must come from THIS conversation — the idea the learner just asked about.',
    'If the governed representation route requires the linear-function interactive lab for slope/intercept or y = mx + b, use exactly <quantora-study-lab kind="linear-function" /> instead of a picture. Never use that lab for another mathematics topic.',
    'For an electric circuit, name the battery/cell, current, resistor/load, or the EMF/terminal-voltage relationship that the diagram should teach.',
    'For a process, make the caption explicit, for example: “Process: input -> change -> result”.',
    'For a timeline, include at least two real years, for example: “Timeline: 1914 -> 1918 -> 1939”.',
    'For a number line, use the exact form “Number line from -3 to 5, mark 2”.',
    'Use those structured forms only when they are factually true for the concept. Do not reuse a scene from another subject. Do not invent image URLs.',
  ].join(' ');
}
