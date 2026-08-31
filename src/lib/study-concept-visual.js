import { studyVisualKind } from './study-pictures.js';

const TOPIC_SELECTION_RE = /\b(?:suggest|recommend|choose|pick)\b[\s\S]{0,48}\b(?:topic|subject)\b|\bwhat should i study\b/i;
const BROAD_TOPIC_RE = /^\s*(?:science|math(?:ematics)?|maths|physics|chemistry|biology|study)\s*[?.!]*\s*$/i;
const OPTICS_TOPIC_RE = /\b(?:light|reflection|refraction|mirror|lens|optics|concave|convex)\b/i;
const EXPLICIT_GRAPH_RE = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution)\b/i;
const CONCAVE_RE = /\bconcave\b|\bbowl side\b|\binside (?:of )?(?:a |the )?spoon\b|\bspoon\b[\s\S]{0,40}\b(?:bowl|inside)\b/i;

function normalizedTopic(topic = '') {
  return String(topic || '').replace(/\s+/g, ' ').trim();
}

export function isStudyTopicSelection(topic = '') {
  const label = normalizedTopic(topic);
  return !label || TOPIC_SELECTION_RE.test(label) || BROAD_TOPIC_RE.test(label);
}

/**
 * The topic, not arbitrary words inside the generated prose, owns the visual
 * family. This is the guard that stops a science-topic list containing the word
 * "equations" from earning an Algebra balance, and stops "curves inward" in an
 * optics explanation from earning a slope graph.
 */
export function studyTopicVisualFamily(topic = '') {
  const label = normalizedTopic(topic);
  if (isStudyTopicSelection(label)) return null;
  if (OPTICS_TOPIC_RE.test(label)) return 'optics';
  return studyVisualKind(label);
}

/**
 * The legacy automatic fallback is useful for established deterministic
 * diagrams, but only when the active topic itself resolves to that diagram.
 * Optics is handled by its own subject-aware renderer below.
 */
export function studyAllowsAutomaticTeachingVisual(topic = '') {
  const family = studyTopicVisualFamily(topic);
  return Boolean(family && family !== 'optics');
}

/**
 * Model-authored picture tags remain welcome when they agree with the active
 * topic. A known topic may never silently switch subjects because a caption
 * happened to contain a broad keyword.
 */
export function studyPictureFitsTopic(caption = '', topic = '') {
  const label = String(caption || '').trim();
  if (!label || isStudyTopicSelection(topic)) return false;

  const captionKind = studyVisualKind(label);
  if (!captionKind) return false;
  if (captionKind === 'graph' && !EXPLICIT_GRAPH_RE.test(label)) return false;

  const family = studyTopicVisualFamily(topic);
  if (!family) return true;
  if (family === 'optics') return false;
  return captionKind === family;
}

/**
 * First optics contract: concave-mirror image inversion. It is intentionally
 * narrow. If the current explanation is merely about "light" or "refraction",
 * no mirror diagram is invented.
 */
export function studyOpticsVisualSpec(text = '', topic = '') {
  if (studyTopicVisualFamily(topic) !== 'optics') return null;
  const hay = `${normalizedTopic(topic)}\n${String(text || '')}`;
  if (!CONCAVE_RE.test(hay)) return null;
  return {
    kind: 'concave-mirror',
    caption: 'Concave mirror ray diagram: when the object is beyond F, reflected rays cross and form an inverted real image.',
  };
}
