export const STUDY_REPRESENTATION_CAPABILITY_VERSION = 'study-representation-capability-2026-09-04.2';

export type StudyRepresentationRendererKind =
  | 'physics-motion'
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
  representation: 'annotated_diagram' | 'graph' | 'process_flow' | 'timeline' | 'number_line';
  rendererKind: StudyRepresentationRendererKind;
  reason: 'mechanics' | 'electricity' | 'field' | 'algebra' | 'geometry' | 'biology' | 'chemistry' | 'graph_semantics' | 'process' | 'timeline' | 'number_line';
};

const MECHANICS = /\b(?:newton|force|motion|velocity|acceleration|friction|gravity|projectile|inertia|free[- ]?body|momentum)\b/i;
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

/**
 * Returns a renderer capability only when the current Study client has a
 * subject-native visual family that can honestly represent the concept.
 *
 * Null is deliberate: unsupported concepts must not be converted into a
 * generic decorative diagram. Adding a new family is a renderer capability
 * change, not a prompt trick.
 */
export function resolveStudyRepresentationCapability(contextText?: string | null): StudyRepresentationCapability | null {
  const context = String(contextText || '').trim();
  if (!context) return null;

  if (NUMBER_LINE.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'number_line', rendererKind: 'number-line', reason: 'number_line' };
  }
  if (GRAPH.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'graph', rendererKind: 'graph', reason: 'graph_semantics' };
  }
  if (MECHANICS.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'physics-motion', reason: 'mechanics' };
  }
  if (FIELD.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'field-lines', reason: 'field' };
  }
  if (ELECTRICITY.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'electricity-circuit', reason: 'electricity' };
  }
  if (GEOMETRY.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'geometry-construction', reason: 'geometry' };
  }
  if (ALGEBRA.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'algebra-balance', reason: 'algebra' };
  }
  if (BIOLOGY.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'biology-cell', reason: 'biology' };
  }
  if (CHEMISTRY.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'annotated_diagram', rendererKind: 'chemistry-bond', reason: 'chemistry' };
  }
  if (PROCESS.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'process_flow', rendererKind: 'process-flow', reason: 'process' };
  }
  if (TIMELINE.test(context)) {
    return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation: 'timeline', rendererKind: 'timeline', reason: 'timeline' };
  }
  return null;
}
