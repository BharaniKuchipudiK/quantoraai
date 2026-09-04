/**
 * Study pictures are caption-first and conversation-scoped.
 * There is no stock scene playlist. The client never invents a Newton
 * (or Algebra) picture because a keyword fired.
 */

const TOKEN_RE = /<(quantora-study-picture|quantora-study-lab|quantora-study-flashcard)\b([^>]*)\/?>/gi;

export const STUDY_LAB_KINDS = Object.freeze(['newton', 'fbd']);

/*
 * A caption ABOUT THE INSTRUCTION rather than about an idea. The tutor prompt
 * describes the picture tag to the model, and the model sometimes captions the
 * tag instead of the subject — "Opening a study idea with an icebreaker and
 * visual tag" is a caption about captioning. There is no diagram of that.
 */
const META_CAPTION = /\b(icebreaker|picture tag|visual tag|study idea|this idea|one sentence|caption|placeholder|diagram of the (?:idea|concept))\b/i;

const ELECTRICITY_VISUAL = /\b(?:electric(?:ity|al)?|circuit|battery|emf|electromotive force|terminal (?:potential difference|voltage)|potential difference|internal resistance|resistor|ampere|voltage|volt|ohm(?:'s)? law|conventional current|electric(?:al)? current|current (?:flows?|through|in|around|of|is|=))\b/i;
const FIELD_VISUAL = /\b(?:electric field|field lines?|equipotential|electrostatic field|magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i;

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
  if (/equation|algebra|unknown|solve|both sides|variable|\bx\b/.test(text)) return 'algebra-balance';
  if (/cell|nucleus|membrane|mitosis|biology|organelle/.test(text)) return 'biology-cell';
  if (/atom|molecule|bond|electron|chemistry|reaction/.test(text)) return 'chemistry-bond';
  /*
   * The relationship diagram is real, but only for a caption that actually
   * describes a relationship. Requiring the words keeps it from becoming the
   * catch-all it used to be.
   */
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

/**
 * Graph is one renderer family with mutually exclusive teaching variants.
 * A quadrant-sign or unit-circle lesson must not inherit the generic slope
 * picture — that is a mismatched diagram, not a fallback.
 */
/**
 * Field lines are one renderer family. A magnetic-direction lesson must not
 * inherit the electric +/− picture — that is a mismatched diagram.
 */
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

/**
 * Algebra is one renderer family. A both-sides transformation lesson must not
 * inherit the static scale picture — that restates equality instead of showing
 * the operation that keeps it.
 */
export function studyAlgebraVisualVariant(caption = '') {
  return /\b(?:both sides|same operation|undo|isolat(?:e|ing)|transform)\b/i.test(String(caption || ''))
    ? 'transformation'
    : 'scale';
}

/** Legacy kind names the model may still emit. They are not a menu and never fill a caption. */
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

function lessonAsksForElectricity(hay = '') {
  return ELECTRICITY_VISUAL.test(String(hay || ''));
}

/**
 * A picture stays only when its caption is about this conversation.
 * Empty captions and leftover stock Newton lines are dropped.
 */
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
    if (tag === 'quantora-study-flashcard') {
      const front = attr(match[2], 'front');
      const back = attr(match[2], 'back');
      if (front && back) segments.push({ type: 'flashcard', front, back });
    } else if (tag === 'quantora-study-lab') {
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

/** Keep model-authored tags only when they still match this conversation. */
export function decorateStudyMessage(text = '', topic = '') {
  return rewriteStudyPictureTags(String(text || ''), topic);
}

const TEACHING_CAPTIONS = Object.freeze({
  'physics-motion': 'Free-body diagram of a moving block: normal force up, weight down, applied force forward, and friction backward',
  'field-lines': 'Electric field lines point from positive to negative and their density shows field strength',
  'electricity-circuit': 'Battery circuit: the cell drives conventional current through a resistor and back to the cell',
  'algebra-balance': 'An equation balance showing the same operation applied to both sides',
  'biology-cell': 'A labelled cell showing the membrane, cytoplasm, and nucleus',
  'chemistry-bond': 'Two atoms sharing electrons in a covalent bond',
  graph: 'A labelled graph showing axes, slope, and change between two points',
});

/**
 * A long explanation about a diagrammable subject should not become a wall of
 * text merely because a model forgot the picture tag. This fallback is limited
 * to known teaching diagrams; unknown topics still draw nothing.
 */
export function ensureStudyTeachingVisual(text = '', topic = '') {
  const source = String(text || '');
  TOKEN_RE.lastIndex = 0;
  if (TOKEN_RE.test(source)) {
    TOKEN_RE.lastIndex = 0;
    return source;
  }
  TOKEN_RE.lastIndex = 0;
  if (source.trim().length < 120) return source;
  const hay = `${topic}\n${source}`;
  const kind = studyVisualKind(hay);
  let caption = TEACHING_CAPTIONS[kind];
  if (kind === 'physics-motion' && /\b(?:inertia|brak(?:e|es|ing)|seatbelt)\b/i.test(hay)) {
    caption = 'Passenger motion when a vehicle brakes: velocity continues forward while the braking force acts backward';
  }
  if (kind === 'electricity-circuit' && /\b(?:emf|electromotive force|terminal (?:potential difference|voltage)|internal resistance|lost volts?)\b/i.test(hay)) {
    caption = 'EMF and terminal potential difference: energy per coulomb supplied by the battery splits into useful energy per coulomb in the external circuit and energy per coulomb lost in internal resistance';
  }
  if (kind === 'field-lines' && /\b(?:magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i.test(hay)) {
    caption = 'Right-hand grip: thumb along current I, fingers curl in the magnetic field B around the wire';
  }
  if (kind === 'algebra-balance' && /\b(?:both sides|same operation|undo|isolat(?:e|ing)|transform)\b/i.test(hay)) {
    caption = 'Equation transformation: subtract 8 from both sides of x + 8 = 15 to keep the balance and isolate x';
  }
  if (kind === 'graph' && /\bquadrant\b|\bcoordinate plane\b/i.test(hay)) {
    caption = 'Quadrant II on the coordinate plane: x is negative and y is positive, so cosine is negative and sine is positive';
  } else if (kind === 'graph' && /\bunit circle\b|\btrigonometr|\b(?:sine|cosine|tangent)\b/i.test(hay)) {
    caption = 'Unit circle: an angle measured from the positive x-axis has cosine as the x-coordinate and sine as the y-coordinate';
  } else if (kind === 'graph' && /\b(?:displacement[- ]time|position[- ]time)\b/i.test(hay)) {
    caption = 'Displacement-time graph: the slope at a point is velocity, change in displacement over change in time';
  } else if (kind === 'graph' && /\bvelocity[- ]time\b/i.test(hay)) {
    caption = 'Velocity-time graph: the slope at a point is acceleration, change in velocity over change in time';
  }
  if (!caption) return source;
  return `<quantora-study-picture caption="${caption}" />\n\n${source}`;
}

export function studyPicturePromptHint(topic = '') {
  const label = String(topic || 'this idea').trim();
  return [
    `If a picture helps ${label}, put this tag on its own line: <quantora-study-picture caption="one sentence about this idea" />`,
    'The caption must come from THIS conversation — the idea the learner just asked about.',
    'For an electric circuit, name the battery/cell, current, resistor/load, or the EMF/terminal-voltage relationship that the diagram should teach.',
    'For a process, make the caption explicit, for example: “Process: input -> change -> result”.',
    'For a timeline, include at least two real years, for example: “Timeline: 1914 -> 1918 -> 1939”.',
    'For a number line, use the exact form “Number line from -3 to 5, mark 2”.',
    'Use those structured forms only when they are factually true for the concept. Do not reuse a scene from another subject. Do not invent image URLs.',
  ].join(' ');
}
