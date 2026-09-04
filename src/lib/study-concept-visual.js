import { studyVisualKind } from './study-pictures.js';

const TOPIC_SELECTION_RE = /\b(?:suggest|recommend|choose|pick)\b[\s\S]{0,48}\b(?:topic|subject)\b|\bwhat should i study\b/i;
const BROAD_TOPIC_RE = /^\s*(?:science|math(?:ematics)?|maths|physics|chemistry|biology|study)\s*[?.!]*\s*$/i;
const OPTICS_TOPIC_RE = /\b(?:light|reflection|refraction|mirror|lens|optics|concave|convex)\b/i;
const MECHANICS_TOPIC_RE = /\b(?:newton(?:ian)?|force|motion|velocity|acceleration|friction|gravity|projectile|inertia|free-?body|momentum)\b/i;
const GEOMETRY_TOPIC_RE = /\b(?:pythagoras|pythagorean|right[- ]angled triangle|right triangle|hypotenuse|geometry)\b/i;
const ALGEBRA_TOPIC_RE = /\b(?:algebra|equation|variable|unknown|polynomial|quadratic|factoris(?:e|ation)|factoriz(?:e|ation))\b|\bx\b/i;
const BIOLOGY_TOPIC_RE = /\b(?:biology|cell|nucleus|membrane|organelle|mitosis|meiosis|photosynthesis|respiration|genetics?|dna|chromosome)\b/i;
const CHEMISTRY_TOPIC_RE = /\b(?:chemistry|chemical|atom|molecule|bond|electron|reaction|reactant|product|acid|base|salt|periodic)\b/i;
const EXPLICIT_GRAPH_RE = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution|coordinate plane|quadrant|unit circle)\b/i;
const CONCAVE_RE = /\bconcave\b|\bbowl side\b|\binside (?:of )?(?:a |the )?spoon\b|\bspoon\b[\s\S]{0,40}\b(?:bowl|inside)\b/i;
const BEYOND_F_RE = /\b(?:beyond|outside|past|farther than|further than|more than)\s+(?:the\s+)?(?:focus|focal point|focal distance|focal length|F)\b|\bobject\b[\s\S]{0,40}\b(?:distance|position)\b[\s\S]{0,32}\b(?:greater than|more than)\b[\s\S]{0,24}\b(?:focal length|f)\b/i;
const INSIDE_F_RE = /\b(?:inside|within|closer than|less than)\s+(?:the\s+)?(?:focus|focal point|focal distance|focal length|F)\b|\bbetween\b[\s\S]{0,32}\b(?:pole|mirror|P)\b[\s\S]{0,32}\b(?:focus|focal point|F)\b/i;
const STUDY_FACT_RE = /^(?:Syllabus overlay|Syllabus node|Study subject|Competency tag|Check passed|Evidence verified|Check missed|Figure URL|Foundation|Flashcard):/i;
const CONTINUATION_ONLY_RE = /^\s*(?:yes|yeah|yep|ok(?:ay)?|ready|go on|continue|next|why\??|how so\??|tell me more|show me|got it|i understand)\s*[.!?]*\s*$/i;
const STRUCTURED_VISUAL_KINDS = new Set(['process-flow', 'timeline', 'number-line', 'concept-relationship']);
const KIND_SUBJECT = Object.freeze({
  'physics-motion': 'mechanics',
  'algebra-balance': 'algebra',
  'geometry-construction': 'geometry',
  'biology-cell': 'biology',
  'chemistry-bond': 'chemistry',
});

function normalizedTopic(topic = '') {
  return String(topic || '').replace(/\s+/g, ' ').trim();
}

function historyLines(topicHistory = '') {
  return String(topicHistory || '')
    .split(/\n+/)
    .map((line) => normalizedTopic(line))
    .filter((line) => line && !STUDY_FACT_RE.test(line));
}

export function isStudyTopicSelection(topic = '') {
  const label = normalizedTopic(topic);
  return !label || TOPIC_SELECTION_RE.test(label) || BROAD_TOPIC_RE.test(label);
}

export function studySubjectFamily(value = '') {
  const text = normalizedTopic(value);
  if (!text) return null;
  if (OPTICS_TOPIC_RE.test(text)) return 'optics';
  if (MECHANICS_TOPIC_RE.test(text)) return 'mechanics';
  if (GEOMETRY_TOPIC_RE.test(text)) return 'geometry';
  if (ALGEBRA_TOPIC_RE.test(text)) return 'algebra';
  if (BIOLOGY_TOPIC_RE.test(text)) return 'biology';
  if (CHEMISTRY_TOPIC_RE.test(text)) return 'chemistry';
  return null;
}

function subjectFamilies(value = '') {
  const text = normalizedTopic(value);
  const families = [];
  if (OPTICS_TOPIC_RE.test(text)) families.push('optics');
  if (MECHANICS_TOPIC_RE.test(text)) families.push('mechanics');
  if (GEOMETRY_TOPIC_RE.test(text)) families.push('geometry');
  if (ALGEBRA_TOPIC_RE.test(text)) families.push('algebra');
  if (BIOLOGY_TOPIC_RE.test(text)) families.push('biology');
  if (CHEMISTRY_TOPIC_RE.test(text)) families.push('chemistry');
  return [...new Set(families)];
}

/**
 * `StudyMarkdown` historically receives the syllabus haystack, not a message-local
 * topic. Resolve the active concept for THIS assistant answer rather than letting
 * later user turns reclassify older answers. A single-subject answer is matched
 * back to the nearest user turn from that subject. Generic continuations fall
 * back to the nearest established concept. Topic-selection turns remain broad
 * and therefore fail closed.
 */
export function studyActiveConcept(topicHistory = '', responseText = '') {
  const lines = historyLines(topicHistory);
  if (!lines.length) return '';
  if (lines.length === 1) return lines[0];

  const responseFamilies = subjectFamilies(responseText);
  if (responseFamilies.length === 1) {
    const family = responseFamilies[0];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (studySubjectFamily(lines[index]) === family) return lines[index];
    }
  }

  const latest = lines[lines.length - 1];
  if (isStudyTopicSelection(latest)) return latest;
  const latestFamily = studySubjectFamily(latest);
  if (latestFamily && (responseFamilies.length === 0 || responseFamilies.includes(latestFamily))) return latest;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (isStudyTopicSelection(line)) {
      if (responseFamilies.length !== 1) return line;
      continue;
    }
    if (CONTINUATION_ONLY_RE.test(line)) continue;
    const family = studySubjectFamily(line);
    if (family && (responseFamilies.length === 0 || responseFamilies.includes(family))) return line;
  }

  return latest;
}

/**
 * The active concept, not arbitrary words inside generated prose, owns the
 * subject family used for automatic diagrams.
 */
export function studyTopicVisualFamily(topic = '') {
  const label = normalizedTopic(topic);
  if (isStudyTopicSelection(label)) return null;
  const subject = studySubjectFamily(label);
  if (subject === 'optics') return 'optics';
  if (subject === 'mechanics') return 'physics-motion';
  if (subject === 'geometry') return 'geometry-construction';
  if (subject === 'algebra') return 'algebra-balance';
  if (subject === 'biology') return 'biology-cell';
  if (subject === 'chemistry') return 'chemistry-bond';
  return studyVisualKind(label);
}

/**
 * The legacy automatic fallback remains available only for an established,
 * non-optics concept. Optics uses its narrower subject-aware renderer below.
 */
export function studyAllowsAutomaticTeachingVisual(topic = '') {
  const family = studyTopicVisualFamily(topic);
  return Boolean(family && family !== 'optics');
}

/**
 * Diagram form and subject are separate concerns. A chemistry process-flow or
 * biology timeline is legitimate even though its renderer kind differs from the
 * subject's default illustration. Strong cross-subject pictures are rejected;
 * structured neutral diagrams are allowed. Graphs require explicit graph intent
 * and, inside a recognized subject, enough caption context to tie them to it.
 */
export function studyPictureFitsTopic(caption = '', topic = '') {
  const label = String(caption || '').trim();
  if (!label || isStudyTopicSelection(topic)) return false;

  const captionKind = studyVisualKind(label);
  if (!captionKind) return false;
  if (captionKind === 'graph' && !EXPLICIT_GRAPH_RE.test(label)) return false;

  const topicSubject = studySubjectFamily(topic);
  const captionSubject = studySubjectFamily(label);
  const rendererSubject = KIND_SUBJECT[captionKind] || null;
  const effectiveCaptionSubject = captionSubject || rendererSubject;

  if (topicSubject && effectiveCaptionSubject && effectiveCaptionSubject !== topicSubject) return false;
  if (STRUCTURED_VISUAL_KINDS.has(captionKind)) return true;

  if (captionKind === 'graph' && topicSubject) {
    return captionSubject === topicSubject;
  }

  if (topicSubject) {
    return !rendererSubject || rendererSubject === topicSubject;
  }

  const family = studyTopicVisualFamily(topic);
  if (!family) return true;
  return captionKind === family;
}

/**
 * First optics contract: a concave-mirror inverted real-image example. The
 * fixed diagram is shown only when the lesson explicitly establishes that the
 * object is beyond the focal distance. Inside-F and unknown-region lessons fail
 * closed rather than showing contradictory ray geometry.
 */
export function studyOpticsVisualSpec(text = '', topic = '') {
  if (studyTopicVisualFamily(topic) !== 'optics') return null;
  const hay = `${normalizedTopic(topic)}\n${String(text || '')}`;
  if (!CONCAVE_RE.test(hay) || INSIDE_F_RE.test(hay) || !BEYOND_F_RE.test(hay)) return null;
  return {
    kind: 'concave-mirror',
    caption: 'Example: when an object is beyond the focal distance F of a concave mirror, reflected rays cross and form an inverted real image.',
  };
}
