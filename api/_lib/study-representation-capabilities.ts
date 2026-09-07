export const STUDY_REPRESENTATION_CAPABILITY_VERSION = 'study-representation-capability-2026-09-07.1';

export type StudyRepresentationRendererKind =
  | 'physics-motion'
  | 'newton-lab'
  | 'electricity-circuit'
  | 'field-lines'
  | 'algebra-balance'
  | 'geometry-construction'
  | 'biology-cell'
  | 'chemistry-bond'
  | 'graph'
  | 'process-flow'
  | 'timeline'
  | 'number-line';

export type StudyRepresentationCapability = {
  version: typeof STUDY_REPRESENTATION_CAPABILITY_VERSION;
  representation: 'annotated_diagram' | 'graph' | 'process_flow' | 'timeline' | 'number_line' | 'simulation_or_lab';
  rendererKind: StudyRepresentationRendererKind;
  reason: 'mechanics' | 'newton_animation' | 'electricity' | 'field' | 'algebra' | 'geometry' | 'biology' | 'chemistry' | 'graph_semantics' | 'process' | 'timeline' | 'number_line';
};

const MECHANICS = /\b(?:newton|force|motion|velocity|acceleration|friction|gravity|projectile|inertia|free[- ]?body|momentum)\b/i;
const NEWTON_THIRD = /\b(?:newton(?:'s|’s)?\s+third\s+law|third\s+law\s+of\s+motion|action\s+and\s+reaction)\b/i;
const ANIMATION = /\b(?:animation|animate|animated|simulation|interactive)\b/i;
const ELECTRICITY = /\b(?:electric(?:ity|al)?|circuit|battery|emf|electromotive force|terminal (?:potential difference|voltage)|potential difference|internal resistance|resistor|ampere|voltage|volt|ohm(?:'s)? law|conventional current|electric(?:al)? current|current (?:flows?|through|in|around|of|is|=))\b/i;
const FIELD = /\b(?:electric field|field lines?|equipotential|electrostatic field|magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i;
const GEOMETRY = /\b(?:pythagoras|pythagorean|right[- ]angled triangle|right triangle|hypotenuse|geometry)\b/i;
const ALGEBRA = /\b(?:algebra|equation|variable|unknown|polynomial|quadratic|factoris(?:e|ation)|factoriz(?:e|ation))\b|\bx\b/i;
const BIOLOGY = /\b(?:biology|cell|nucleus|membrane|organelle|mitosis|meiosis|photosynthesis|respiration|genetics?|dna|chromosome)\b/i;
const CHEMISTRY = /\b(?:chemistry|chemical|atom|molecule|bond|electron|reaction|reactant|product|acid|base|salt|periodic)\b/i;
const GRAPH = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution|velocity[- ]time|displacement[- ]time|distance[- ]time|acceleration[- ]time|function|curve|coordinates?|coordinate plane|quadrant|unit circle|trigonometry|trig|sine|cosine|tangent|vector components?)\b/i;
const PROCESS = /\b(?:process|cycle|flow|pathway|sequence|step|stage)\b/i;
const TIMELINE = /\b(?:timeline|chronolog|year|era|history)\b/i;
const NUMBER_LINE = /\bnumber line\b/i;

function capability(representation: StudyRepresentationCapability['representation'], rendererKind: StudyRepresentationRendererKind, reason: StudyRepresentationCapability['reason']): StudyRepresentationCapability {
  return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation, rendererKind, reason };
}

/**
 * Text resolver retained as a discovery/bootstrap fallback. Downstream planners
 * should prefer resolveStudyRepresentationCapabilityForConcept() so the same
 * free-text transcript is not reinterpreted at every layer.
 */
export function resolveStudyRepresentationCapability(contextText?: string | null): StudyRepresentationCapability | null {
  const context = String(contextText || '').trim();
  if (!context) return null;

  if (NEWTON_THIRD.test(context) && ANIMATION.test(context)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation');
  if (NUMBER_LINE.test(context)) return capability('number_line', 'number-line', 'number_line');
  if (GRAPH.test(context)) return capability('graph', 'graph', 'graph_semantics');
  if (MECHANICS.test(context)) return capability('annotated_diagram', 'physics-motion', 'mechanics');
  if (FIELD.test(context)) return capability('annotated_diagram', 'field-lines', 'field');
  if (ELECTRICITY.test(context)) return capability('annotated_diagram', 'electricity-circuit', 'electricity');
  if (GEOMETRY.test(context)) return capability('annotated_diagram', 'geometry-construction', 'geometry');
  if (ALGEBRA.test(context)) return capability('annotated_diagram', 'algebra-balance', 'algebra');
  if (BIOLOGY.test(context)) return capability('annotated_diagram', 'biology-cell', 'biology');
  if (CHEMISTRY.test(context)) return capability('annotated_diagram', 'chemistry-bond', 'chemistry');
  if (PROCESS.test(context)) return capability('process_flow', 'process-flow', 'process');
  if (TIMELINE.test(context)) return capability('timeline', 'timeline', 'timeline');
  return null;
}

/**
 * Canonical concept identity is the primary semantic control plane. Known
 * canonical-key families map directly to renderer capabilities. Label/free text
 * is used only when the concept graph has not yet supplied enough identity.
 */
export function resolveStudyRepresentationCapabilityForConcept(input: {
  conceptKey?: string | null;
  conceptLabel?: string | null;
  fallbackText?: string | null;
}): StudyRepresentationCapability | null {
  const key = String(input.conceptKey || '').trim().toLowerCase();
  const label = String(input.conceptLabel || '').trim();
  const fallback = String(input.fallbackText || '').trim();
  const discoveryText = `${label}\n${fallback}`.trim();

  if (NEWTON_THIRD.test(discoveryText) && ANIMATION.test(discoveryText)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation');

  if (key) {
    if (/number[-_. ]?line|inequalit/.test(key)) return capability('number_line', 'number-line', 'number_line');
    if (/motion[-_. ]?graph|kinematics.*graph|coordinate|quadrant|trig|unit[-_. ]?circle|function[-_. ]?graph/.test(key)) return capability('graph', 'graph', 'graph_semantics');
    if (/electric[-_. ]?field|magnetic[-_. ]?field|electromagnet.*field/.test(key)) return capability('annotated_diagram', 'field-lines', 'field');
    if (/electric|circuit|emf|potential[-_. ]?difference|voltage|resistance/.test(key)) return capability('annotated_diagram', 'electricity-circuit', 'electricity');
    if (/newton|mechanic|dynamics|kinematics|force|momentum|projectile|inertia/.test(key)) return capability('annotated_diagram', 'physics-motion', 'mechanics');
    if (/pythag|geometry|triangle|circle[-_. ]?theorem/.test(key)) return capability('annotated_diagram', 'geometry-construction', 'geometry');
    if (/algebra|equation|polynomial|quadratic|factor/.test(key)) return capability('annotated_diagram', 'algebra-balance', 'algebra');
    if (/biology|cell|mitosis|meiosis|genetic|photosynth|respiration/.test(key)) return capability('annotated_diagram', 'biology-cell', 'biology');
    if (/chemistry|atom|molecule|bond|reaction|periodic|acid|base/.test(key)) return capability('annotated_diagram', 'chemistry-bond', 'chemistry');
  }

  return resolveStudyRepresentationCapability(discoveryText);
}
