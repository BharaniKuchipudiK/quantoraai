export const STUDY_REPRESENTATION_CAPABILITY_VERSION = 'study-representation-capability-2026-09-10.2';

export type StudyRepresentationRendererKind =
  | 'physics-motion'
  | 'newton-lab'
  | 'linear-function-lab'
  | 'circuit-lab'
  | 'electricity-circuit'
  | 'field-lines'
  | 'algebra-balance'
  | 'geometry-construction'
  | 'biology-cell'
  | 'chemistry-bond'
  | 'graph'
  | 'process-flow'
  | 'timeline'
  | 'number-line'
  | 'fraction-model'
  | 'before-after';

export type StudyRepresentationCapability = {
  version: typeof STUDY_REPRESENTATION_CAPABILITY_VERSION;
  representation: 'annotated_diagram' | 'graph' | 'process_flow' | 'timeline' | 'number_line' | 'simulation_or_lab';
  rendererKind: StudyRepresentationRendererKind;
  reason: 'mechanics' | 'newton_animation' | 'linear_function_lab' | 'circuit_lab' | 'electricity' | 'field' | 'algebra' | 'geometry' | 'biology' | 'chemistry' | 'graph_semantics' | 'process' | 'timeline' | 'number_line' | 'fraction' | 'state_change';
};

const MECHANICS = /\b(?:newton|force|motion|velocity|acceleration|friction|gravity|projectile|inertia|free[- ]?body|momentum)\b/i;
const NEWTON_THIRD = /\b(?:newton(?:'s|’s)?\s+(?:third|3rd)\s+law|(?:third|3rd)\s+law\s+of\s+motion|action\s+and\s+reaction)\b/i;
const NEWTON_THIRD_KEY = /(?:newton(?:s)?[-_. ]*third[-_. ]*law|third[-_. ]*law)/i;
const LINEAR_FUNCTION = /\b(?:linear functions?|slope[- ]intercept|gradient[- ]intercept|straight[- ]line graphs?|y[- ]intercept)\b|\by\s*=\s*m\s*\*?\s*x\s*(?:[+-]\s*b)?\b/i;
const LINEAR_FUNCTION_KEY = /(?:linear[-_. ]*function|slope[-_. ]*intercept|gradient[-_. ]*intercept)/i;
const ANIMATION_REQUEST = /\b(?:animation|animate|animated|simulation|interactive(?:\s+(?:animation|demonstration|simulation|lab))?)\b/i;
const LAB_REQUEST = /\b(?:lab|experiment)\b/i;
const DIRECT_VISUAL_REQUEST = /\b(?:show|draw|sketch)\b.{0,80}\b(?:image|picture|diagram|visual(?:ly)?)\b|\bexplain\b.{0,60}\bvisually\b/i;
const ELECTRICITY = /\b(?:electric(?:ity|al)?|circuit(?:s|ry)?|battery|emf|electromotive force|terminal (?:potential difference|voltage)|potential difference|internal resistance|resistor|ampere|voltage|volt|ohm(?:'s)? law|conventional current|electric(?:al)? current|current (?:flows?|through|in|around|of|is|=))\b/i;
const FIELD = /\b(?:electric field|field lines?|equipotential|electrostatic field|magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i;
const GEOMETRY = /\b(?:pythagoras|pythagorean|right[- ]angled triangle|right triangle|hypotenuse|geometry)\b/i;
const ALGEBRA = /\b(?:algebra|equation|variable|unknown|polynomial|quadratic|factoris(?:e|ation)|factoriz(?:e|ation))\b|\bx\b/i;
const BIOLOGY = /\b(?:biology|cell|nucleus|membrane|organelle|mitosis|meiosis|photosynthesis|respiration|genetics?|dna|chromosome)\b/i;
const CHEMISTRY = /\b(?:chemistry|chemical|atom|molecule|bond|electron|reaction|reactant|product|acid|base|salt|periodic)\b/i;
const GRAPH = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution|velocity[- ]time|displacement[- ]time|distance[- ]time|acceleration[- ]time|function|curve|coordinates?|coordinate plane|quadrant|unit circle|trigonometry|trig|sine|cosine|tangent|vector components?)\b/i;
const PROCESS = /\b(?:process|cycle|flow|pathway|sequence|step|stage)\b/i;
const TIMELINE = /\b(?:timeline|chronolog|year|era|history)\b/i;
const NUMBER_LINE = /\bnumber line\b/i;
const FRACTION = /\b(?:fraction|fractions|fractional|numerator|denominator|equivalent fractions?|proportion|proportions)\b/i;
const BEFORE_AFTER = /\bbefore\s*(?:\/|and)\s*after\b|\bstate[- ]change\b|\bchanges?\s+from\b.{0,60}\bto\b/i;
const SIMPLE_DC = /\b(?:battery|batteries|circuit(?:s|ry)?|return (?:wire|path)|direct current|conventional current|ohm(?:'s|’s)? law|internal resistance|terminal voltage)\b/i;
const SIMPLE_DC_KEY = /(?:^|[._ -])(?:electricity|circuit(?:s|ry)?|dc|emf|current|resistance|voltage)(?:[._ -]|$)/i;
const OUTSIDE_DC_MODEL = /\b(?:ac|alternating|capacitors?|capacitance|inductors?|inductance|rlc|rc|rl|transients?|parallel|series circuit(?:s|ry)?|networks?|coils?|magnetic|electromagnetic|propagation|transmission|antennas?|neural|neurons?|logic|digital|diodes?|transistors?|semiconductors?|electrochemistry|electrolysis|charging|discharging)\b/i;

function capability(representation: StudyRepresentationCapability['representation'], rendererKind: StudyRepresentationRendererKind, reason: StudyRepresentationCapability['reason']): StudyRepresentationCapability {
  return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation, rendererKind, reason };
}

function requestsNewtonThirdLawLab(context = '', conceptKey = ''): boolean {
  const text = String(context || '');
  const key = String(conceptKey || '').trim().toLowerCase();
  const isThirdLaw = NEWTON_THIRD.test(text) || NEWTON_THIRD_KEY.test(key);
  const directlyRequestsLabCapableVisual = ANIMATION_REQUEST.test(text) || DIRECT_VISUAL_REQUEST.test(text);
  return isThirdLaw && directlyRequestsLabCapableVisual;
}

function requestsLinearFunctionLab(context = '', conceptKey = ''): boolean {
  const text = String(context || '');
  const key = String(conceptKey || '').trim().toLowerCase();
  const isLinearFunction = LINEAR_FUNCTION.test(text) || LINEAR_FUNCTION_KEY.test(key);
  const directlyRequestsLab = ANIMATION_REQUEST.test(text) || LAB_REQUEST.test(text);
  return isLinearFunction && directlyRequestsLab;
}

function requestsSimpleDcLab(context = '', conceptKey = ''): boolean {
  // The native circuit is one resistive DC loop, not a general circuit solver.
  // A canonical identity cannot be overridden by an unrelated free-text label.
  const key = String(conceptKey || '').trim().toLowerCase();
  const text = String(context || '');
  if (key && !SIMPLE_DC_KEY.test(key)) return false;
  if (OUTSIDE_DC_MODEL.test(`${key.replace(/[_.-]+/g, ' ')} ${text}`) || FIELD.test(text)) return false;
  return (ANIMATION_REQUEST.test(text) || LAB_REQUEST.test(text))
    && (key ? SIMPLE_DC_KEY.test(key) : SIMPLE_DC.test(text));
}

/**
 * Text resolver retained as a discovery/bootstrap fallback. Downstream planners
 * should prefer resolveStudyRepresentationCapabilityForConcept() so the same
 * free-text transcript is not reinterpreted at every layer.
 */
export function resolveStudyRepresentationCapability(contextText?: string | null): StudyRepresentationCapability | null {
  const context = String(contextText || '').trim();
  if (!context) return null;

  if (requestsSimpleDcLab(context)) return capability('simulation_or_lab', 'circuit-lab', 'circuit_lab');
  if (requestsNewtonThirdLawLab(context)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation');
  if (requestsLinearFunctionLab(context)) return capability('simulation_or_lab', 'linear-function-lab', 'linear_function_lab');
  if (NUMBER_LINE.test(context)) return capability('number_line', 'number-line', 'number_line');
  if (BEFORE_AFTER.test(context)) return capability('annotated_diagram', 'before-after', 'state_change');
  if (FRACTION.test(context)) return capability('annotated_diagram', 'fraction-model', 'fraction');
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

  if (requestsSimpleDcLab(discoveryText, key)) return capability('simulation_or_lab', 'circuit-lab', 'circuit_lab');
  if (requestsNewtonThirdLawLab(discoveryText, key)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation');
  if (requestsLinearFunctionLab(discoveryText, key)) return capability('simulation_or_lab', 'linear-function-lab', 'linear_function_lab');

  if (key) {
    if (/number[-_. ]?line|inequalit/.test(key)) return capability('number_line', 'number-line', 'number_line');
    if (/state[-_. ]?change|phase[-_. ]?change/.test(key)) return capability('annotated_diagram', 'before-after', 'state_change');
    if (/fraction|proportion/.test(key)) return capability('annotated_diagram', 'fraction-model', 'fraction');
    if (/linear[-_. ]?function|slope[-_. ]?intercept|gradient[-_. ]?intercept|motion[-_. ]?graph|kinematics.*graph|coordinate|quadrant|trig|unit[-_. ]?circle|function[-_. ]?graph/.test(key)) return capability('graph', 'graph', 'graph_semantics');
    if (/electric[-_. ]?field|magnetic[-_. ]?field|electromagnet.*field/.test(key)) return capability('annotated_diagram', 'field-lines', 'field');
    if (/electric|circuit|emf|potential[-_. ]?difference|voltage|resistance/.test(key)) return capability('annotated_diagram', 'electricity-circuit', 'electricity');
    if (/newton|mechanic|dynamics|kinematics|force|momentum|projectile|inertia/.test(key)) return capability('annotated_diagram', 'physics-motion', 'mechanics');
    if (/pythag|geometry|triangle|circle[-_. ]?theorem/.test(key)) return capability('annotated_diagram', 'geometry-construction', 'geometry');
    if (/algebra|equation|polynomial|quadratic|factor/.test(key)) return capability('annotated_diagram', 'algebra-balance', 'algebra');
    if (/biology|cell|mitosis|meiosis|genetic|photosynth|respiration/.test(key)) return capability('annotated_diagram', 'biology-cell', 'biology');
    if (/chemistry|atom|molecule|bond|reaction|periodic|acid|base/.test(key)) return capability('annotated_diagram', 'chemistry-bond', 'chemistry');
  }

  const discovered = resolveStudyRepresentationCapability(discoveryText);
  return key && discovered?.rendererKind === 'circuit-lab' ? null : discovered;
}
