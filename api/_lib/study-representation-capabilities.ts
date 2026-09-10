export const STUDY_REPRESENTATION_CAPABILITY_VERSION = 'study-representation-capability-2026-09-10.1';

export type StudyRepresentationRendererKind =
  | 'physics-motion' | 'newton-lab' | 'linear-function-lab' | 'circuit-lab'
  | 'electricity-circuit' | 'field-lines' | 'algebra-balance' | 'geometry-construction'
  | 'biology-cell' | 'chemistry-bond' | 'graph' | 'process-flow' | 'timeline'
  | 'number-line' | 'fraction-model' | 'before-after';

export type StudyRepresentationDeliveryClass =
  | 'static_diagram' | 'micro_visual' | 'interactive_lab' | 'timed_animation';

export type StudyRepresentationCapability = {
  version: typeof STUDY_REPRESENTATION_CAPABILITY_VERSION;
  representation: 'annotated_diagram' | 'graph' | 'process_flow' | 'timeline' | 'number_line' | 'simulation_or_lab';
  rendererKind: StudyRepresentationRendererKind;
  reason: 'mechanics' | 'newton_animation' | 'linear_function_lab' | 'circuit_lab' | 'electricity' | 'field' | 'algebra' | 'geometry' | 'biology' | 'chemistry' | 'graph_semantics' | 'process' | 'timeline' | 'number_line' | 'fraction' | 'state_change';
  deliveryClass: StudyRepresentationDeliveryClass;
  renderCaption: string | null;
};

const MECHANICS = /\b(?:newton|force|friction|gravity|projectile|inertia|free[- ]?body|momentum|vector components?)\b/i;
const NEWTON_THIRD = /\b(?:newton(?:'s|’s)?\s+third\s+law|third\s+law\s+of\s+motion|action\s+and\s+reaction)\b/i;
const NEWTON_THIRD_KEY = /(?:newton(?:s)?[-_. ]*third[-_. ]*law|third[-_. ]*law)/i;
const LINEAR_FUNCTION = /\b(?:linear function|slope[- ]intercept|gradient[- ]intercept|straight[- ]line graph|y[- ]intercept)\b|\by\s*=\s*m\s*\*?\s*x\s*(?:[+-]\s*b)?\b/i;
const LINEAR_FUNCTION_KEY = /(?:linear[-_. ]*function|slope[-_. ]*intercept|gradient[-_. ]*intercept)/i;
const ANIMATION_REQUEST = /\b(?:animation|animate|animated|simulation|interactive(?:\s+(?:animation|demonstration|simulation|lab))?)\b/i;
const LAB_REQUEST = /\b(?:lab|experiment)\b/i;
const DIRECT_VISUAL_REQUEST = /\b(?:show|draw|sketch)\b.{0,80}\b(?:image|picture|diagram|visual(?:ly)?)\b|\bexplain\b.{0,60}\bvisually\b/i;
const ELECTRICITY = /\b(?:electric(?:ity|al)?|circuit|battery|emf|electromotive force|terminal (?:potential difference|voltage)|potential difference|internal resistance|resistor|ampere|voltage|volt|ohm(?:'s)? law|conventional current|electric(?:al)? current|current (?:flows?|through|in|around|of|is|=))\b/i;
const FIELD = /\b(?:electric field|field lines?|equipotential|electrostatic field|magnetic field|magnetic flux|north pole|south pole|right[- ]hand rule)\b/i;
const GEOMETRY = /\b(?:pythagoras|pythagorean|right[- ]angled triangle|right triangle|hypotenuse)\b/i;
const ALGEBRA = /\b(?:algebra|equation|variable|unknown|polynomial|quadratic|factoris(?:e|ation)|factoriz(?:e|ation))\b|\bx\b/i;
const CELL_DIAGRAM = /\b(?:cell membrane|cell nucleus|nucleus|membrane|organelle|organelles|biology cell|animal cell|plant cell)\b/i;
const BOND_DIAGRAM = /\b(?:covalent bond|shared electrons?|electron pair|bond between|bonding pair|chemical bond)\b/i;
const GRAPH = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution|velocity[- ]time|displacement[- ]time|distance[- ]time|acceleration[- ]time|function|curve|coordinates?|coordinate plane|quadrant|unit circle|trigonometry|trig|sine|cosine|tangent)\b/i;
const PROCESS = /\b(?:process|cycle|flow|pathway|sequence|step|stage)\b/i;
const TIMELINE = /\b(?:timeline|chronolog|year|era|history)\b/i;
const NUMBER_LINE = /\bnumber line\b/i;
const FRACTION = /\b(?:fraction|fractions|fractional|numerator|denominator|equivalent fractions?|proportion|proportions)\b/i;
const BEFORE_AFTER = /\bbefore\s*(?:\/|and)\s*after\b|\bstate[- ]change\b|\bchanges?\s+from\b.{0,60}\bto\b/i;
const SIMPLE_DC = /\b(?:battery|batteries|circuits?|return (?:wire|path)|direct current|conventional current|ohm(?:'s|’s)? law|internal resistance|terminal voltage)\b/i;
const SIMPLE_DC_KEY = /(?:^|[._ -])(?:electricity|circuits?|dc|emf|current|resistance|voltage)(?:[._ -]|$)/i;
const OUTSIDE_DC_MODEL = /\b(?:ac|alternating|capacitors?|capacitance|inductors?|inductance|rlc|rc|rl|transients?|parallel|series circuits?|networks?|coils?|magnetic|electromagnetic|propagation|transmission|antennas?|neural|neurons?|logic|digital|diodes?|transistors?|semiconductors?|electrochemistry|electrolysis|charging|discharging)\b/i;
const EMF_VISUAL = /\b(?:emf|electromotive force|terminal (?:potential difference|voltage)|internal resistance|lost volts?|energy per coulomb)\b/i;
const VECTOR_VISUAL = /\b(?:vector components?|resultant|x[- ]?axis|y[- ]?axis)\b/i;
const BRAKING_VISUAL = /\b(?:passenger|vehicle|car|bus)\b[\s\S]*\b(?:brak|stop)|\b(?:brak|stop)[\s\S]*\b(?:passenger|vehicle|car|bus)\b/i;
const ALGEBRA_TRANSFORM = /\b(?:both sides|same operation|undo|isolat(?:e|ing)|transform(?:ation)?)\b/i;

function compact(value = '', max = 150): string {
  return String(value || '').replace(/[<>"\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function deliveryClassFor(kind: StudyRepresentationRendererKind): StudyRepresentationDeliveryClass {
  if (kind === 'newton-lab' || kind === 'circuit-lab') return 'timed_animation';
  if (kind === 'linear-function-lab') return 'interactive_lab';
  if (kind === 'fraction-model' || kind === 'before-after') return 'micro_visual';
  return 'static_diagram';
}

function fractionCaption(context = ''): string | null {
  if (!FRACTION.test(context)) return null;
  const parts = [...String(context).matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)].slice(0, 2)
    .map((m) => ({ n: Number(m[1]), d: Number(m[2]) }));
  if (!parts.length || parts.some((p) => !Number.isSafeInteger(p.n) || !Number.isSafeInteger(p.d) || p.d < 1 || p.d > 12 || p.n < 0 || p.n > p.d)) return null;
  const [a, b] = parts;
  if (b && a.n * b.d === b.n * a.d && /\b(?:equivalent|equals?|equal to|same (?:value|amount|fraction)|proportion)\b|=/i.test(context)) {
    return `Proportion model: ${a.n}/${a.d} = ${b.n}/${b.d}`;
  }
  return `Fraction model: ${a.n}/${a.d}`;
}

function beforeAfterCaption(context = ''): string | null {
  const source = compact(context, 180);
  let match = /before\s*(?:\/\s*after|and\s+after)\s*:\s*(.+?)\s*(?:->|→|⇒|\bbecomes?\b|\bchanges?\s+to\b)\s*(.+?)(?:[.;]|$)/i.exec(source);
  if (!match) match = /\bchanges?\s+from\s+(.+?)\s+to\s+(.+?)(?:[.;]|$)/i.exec(source);
  if (!match) return null;
  const before = compact(match[1], 52);
  const after = compact(match[2], 52);
  return before && after && before.toLowerCase() !== after.toLowerCase() ? `Before/after: ${before} -> ${after}` : null;
}

function processCaption(context = ''): string | null {
  const source = compact(context, 180);
  if (!PROCESS.test(source) || !/(?:->|→|⇒)/.test(source)) return null;
  const body = source.includes(':') ? source.slice(source.indexOf(':') + 1) : source;
  const steps = body.split(/\s*(?:->|→|⇒)\s*/).map((p) => compact(p.replace(/[.;]+$/g, ''), 34)).filter(Boolean);
  return steps.length >= 2 ? `Process: ${steps.slice(0, 4).join(' -> ')}` : null;
}

function timelineCaption(context = ''): string | null {
  if (!TIMELINE.test(context)) return null;
  const years = [...new Set([...String(context).matchAll(/\b((?:1[0-9]{3}|20[0-9]{2}|2100))\b/g)].map((m) => m[1]))].sort((a, b) => Number(a) - Number(b)).slice(0, 5);
  return years.length >= 2 ? `Timeline: ${years.join(' -> ')}` : null;
}

function numberLineCaption(context = ''): string | null {
  if (!NUMBER_LINE.test(context)) return null;
  const source = compact(context, 180);
  const range = /number line\s+from\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/i.exec(source);
  if (!range) return null;
  const a = Number(range[1]); const b = Number(range[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  const low = Math.min(a, b); const high = Math.max(a, b);
  const markMatch = /\bmark\s+(-?\d+(?:\.\d+)?)/i.exec(source);
  const mark = markMatch ? Number(markMatch[1]) : null;
  const markPart = Number.isFinite(mark) && Number(mark) >= low && Number(mark) <= high ? `, mark ${mark}` : '';
  return `Number line from ${low} to ${high}${markPart}`;
}

function staticCaption(kind: StudyRepresentationRendererKind, context = ''): string | null {
  const text = String(context || '');
  switch (kind) {
    case 'physics-motion':
      if (VECTOR_VISUAL.test(text)) return 'Resolve vector components into x-axis and y-axis components';
      if (BRAKING_VISUAL.test(text)) return 'Passenger in a braking car: velocity continues while the seatbelt force changes motion';
      return 'Free-body diagram: normal force, weight, applied force and friction on one object';
    case 'electricity-circuit': return EMF_VISUAL.test(text)
      ? 'EMF and terminal potential difference: battery internal resistance and external load'
      : 'Battery circuit: cell, resistor load and conventional current';
    case 'field-lines': return /\b(?:magnetic field|magnetic flux|right[- ]hand rule|north pole|south pole)\b/i.test(text)
      ? 'Magnetic field around a current-carrying wire: right-hand rule for current I and field B'
      : 'Electric field lines from a positive charge toward a negative charge';
    case 'geometry-construction': return 'Right triangle: legs a and b, hypotenuse c, so Pythagoras gives a squared plus b squared equals c squared';
    case 'algebra-balance': return ALGEBRA_TRANSFORM.test(text)
      ? 'Equation transformation: apply the same operation to both sides to isolate x'
      : 'Algebra equation balance: keep both sides equal while solving for x';
    case 'biology-cell': return 'Biology cell: cell membrane, nucleus and organelles';
    case 'chemistry-bond': return 'Covalent bond between two atoms: a shared electron pair';
    case 'graph':
      if (/\bquadrant\b|\bcoordinate plane\b/i.test(text)) return 'Coordinate plane graph: quadrant II has x negative and y positive';
      if (/\bunit circle\b|\btrigonometr|\b(?:sine|cosine|tangent)\b/i.test(text)) return 'Unit circle graph: sine and cosine on the coordinate axes';
      if (/\b(?:displacement[- ]time|position[- ]time)\b/i.test(text)) return 'Displacement-time graph: slope is velocity';
      if (/\bvelocity[- ]time\b/i.test(text)) return 'Velocity-time graph: slope is acceleration';
      if (LINEAR_FUNCTION.test(text)) return 'Linear function graph: slope m and y-intercept b on coordinate axes';
      return 'Graph: slope and axes show how one quantity changes with another';
    case 'process-flow': return processCaption(text);
    case 'timeline': return timelineCaption(text);
    case 'number-line': return numberLineCaption(text);
    case 'fraction-model': return fractionCaption(text);
    case 'before-after': return beforeAfterCaption(text);
    default: return null;
  }
}

function capability(representation: StudyRepresentationCapability['representation'], rendererKind: StudyRepresentationRendererKind, reason: StudyRepresentationCapability['reason'], context = ''): StudyRepresentationCapability {
  return { version: STUDY_REPRESENTATION_CAPABILITY_VERSION, representation, rendererKind, reason, deliveryClass: deliveryClassFor(rendererKind), renderCaption: staticCaption(rendererKind, context) };
}

function requestsNewtonThirdLawLab(context = '', conceptKey = ''): boolean {
  const text = String(context); const key = String(conceptKey).trim().toLowerCase();
  return (NEWTON_THIRD.test(text) || NEWTON_THIRD_KEY.test(key)) && (ANIMATION_REQUEST.test(text) || DIRECT_VISUAL_REQUEST.test(text));
}
function requestsLinearFunctionLab(context = '', conceptKey = ''): boolean {
  const text = String(context); const key = String(conceptKey).trim().toLowerCase();
  return (LINEAR_FUNCTION.test(text) || LINEAR_FUNCTION_KEY.test(key)) && (ANIMATION_REQUEST.test(text) || LAB_REQUEST.test(text));
}
function requestsSimpleDcLab(context = '', conceptKey = ''): boolean {
  const key = String(conceptKey).trim().toLowerCase(); const text = String(context);
  if (key && !SIMPLE_DC_KEY.test(key)) return false;
  if (OUTSIDE_DC_MODEL.test(`${key.replace(/[_.-]+/g, ' ')} ${text}`) || FIELD.test(text)) return false;
  return (ANIMATION_REQUEST.test(text) || LAB_REQUEST.test(text)) && (key ? SIMPLE_DC_KEY.test(key) : SIMPLE_DC.test(text));
}

export function resolveStudyRepresentationCapability(contextText?: string | null): StudyRepresentationCapability | null {
  const context = String(contextText || '').trim();
  if (!context) return null;
  if (requestsSimpleDcLab(context)) return capability('simulation_or_lab', 'circuit-lab', 'circuit_lab', context);
  if (requestsNewtonThirdLawLab(context)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation', context);
  if (requestsLinearFunctionLab(context)) return capability('simulation_or_lab', 'linear-function-lab', 'linear_function_lab', context);
  if (NUMBER_LINE.test(context)) { const c = numberLineCaption(context); if (c) return capability('number_line', 'number-line', 'number_line', c); }
  if (BEFORE_AFTER.test(context)) { const c = beforeAfterCaption(context); if (c) return capability('annotated_diagram', 'before-after', 'state_change', c); }
  if (FRACTION.test(context)) { const c = fractionCaption(context); if (c) return capability('annotated_diagram', 'fraction-model', 'fraction', c); }
  if (VECTOR_VISUAL.test(context)) return capability('annotated_diagram', 'physics-motion', 'mechanics', context);
  if (GRAPH.test(context)) return capability('graph', 'graph', 'graph_semantics', context);
  if (MECHANICS.test(context)) return capability('annotated_diagram', 'physics-motion', 'mechanics', context);
  if (FIELD.test(context)) return capability('annotated_diagram', 'field-lines', 'field', context);
  if (ELECTRICITY.test(context)) return capability('annotated_diagram', 'electricity-circuit', 'electricity', context);
  if (GEOMETRY.test(context)) return capability('annotated_diagram', 'geometry-construction', 'geometry', context);
  if (ALGEBRA.test(context)) return capability('annotated_diagram', 'algebra-balance', 'algebra', context);
  if (CELL_DIAGRAM.test(context)) return capability('annotated_diagram', 'biology-cell', 'biology', context);
  if (BOND_DIAGRAM.test(context)) return capability('annotated_diagram', 'chemistry-bond', 'chemistry', context);
  if (PROCESS.test(context)) { const c = processCaption(context); if (c) return capability('process_flow', 'process-flow', 'process', c); }
  if (TIMELINE.test(context)) { const c = timelineCaption(context); if (c) return capability('timeline', 'timeline', 'timeline', c); }
  return null;
}

export function resolveStudyRepresentationCapabilityForConcept(input: { conceptKey?: string | null; conceptLabel?: string | null; fallbackText?: string | null }): StudyRepresentationCapability | null {
  const key = String(input.conceptKey || '').trim().toLowerCase();
  const label = String(input.conceptLabel || '').trim();
  const fallback = String(input.fallbackText || '').trim();
  const discoveryText = `${label}\n${fallback}`.trim();
  if (requestsSimpleDcLab(discoveryText, key)) return capability('simulation_or_lab', 'circuit-lab', 'circuit_lab', discoveryText);
  if (requestsNewtonThirdLawLab(discoveryText, key)) return capability('simulation_or_lab', 'newton-lab', 'newton_animation', discoveryText);
  if (requestsLinearFunctionLab(discoveryText, key)) return capability('simulation_or_lab', 'linear-function-lab', 'linear_function_lab', discoveryText);
  if (key) {
    if (/number[-_. ]?line|inequalit/.test(key)) { const c = numberLineCaption(discoveryText); if (c) return capability('number_line', 'number-line', 'number_line', c); }
    if (/state[-_. ]?change|phase[-_. ]?change/.test(key)) { const c = beforeAfterCaption(discoveryText); if (c) return capability('annotated_diagram', 'before-after', 'state_change', c); }
    if (/fraction|proportion/.test(key)) { const c = fractionCaption(discoveryText); if (c) return capability('annotated_diagram', 'fraction-model', 'fraction', c); }
    if (/vector/.test(key)) return capability('annotated_diagram', 'physics-motion', 'mechanics', `${key} ${discoveryText}`);
    if (/linear[-_. ]?function|slope[-_. ]?intercept|gradient[-_. ]?intercept|motion[-_. ]?graph|kinematics.*graph|coordinate|quadrant|trig|unit[-_. ]?circle|function[-_. ]?graph/.test(key)) return capability('graph', 'graph', 'graph_semantics', `${key} ${discoveryText}`);
    if (/electric[-_. ]?field|magnetic[-_. ]?field|electromagnet.*field/.test(key)) return capability('annotated_diagram', 'field-lines', 'field', `${key} ${discoveryText}`);
    if (/electric|circuit|emf|potential[-_. ]?difference|voltage|resistance/.test(key)) return capability('annotated_diagram', 'electricity-circuit', 'electricity', `${key} ${discoveryText}`);
    if (/newton|mechanic|dynamics|force|momentum|projectile|inertia/.test(key)) return capability('annotated_diagram', 'physics-motion', 'mechanics', `${key} ${discoveryText}`);
    if (/pythag|right[-_. ]?triangle/.test(key)) return capability('annotated_diagram', 'geometry-construction', 'geometry', `${key} ${discoveryText}`);
    if (/algebra|equation|polynomial|quadratic|factor/.test(key)) return capability('annotated_diagram', 'algebra-balance', 'algebra', `${key} ${discoveryText}`);
    if (/cell|nucleus|membrane|organelle/.test(key)) return capability('annotated_diagram', 'biology-cell', 'biology', `${key} ${discoveryText}`);
    if (/covalent|bond/.test(key)) return capability('annotated_diagram', 'chemistry-bond', 'chemistry', `${key} ${discoveryText}`);
  }
  const discovered = resolveStudyRepresentationCapability(discoveryText);
  return key && discovered?.rendererKind === 'circuit-lab' ? null : discovered;
}
