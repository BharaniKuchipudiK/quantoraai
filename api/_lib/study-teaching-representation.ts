export const STUDY_TEACHING_REPRESENTATION_VERSION = 'study-teaching-representation-2026-09-02.3';

export type StudyTeachingRepresentation =
  | 'concise_text'
  | 'annotated_diagram'
  | 'graph'
  | 'process_flow'
  | 'comparison'
  | 'worked_example'
  | 'number_line'
  | 'timeline'
  | 'story_analogy'
  | 'interactive_probe'
  | 'governed_assessment'
  | 'simulation_or_lab';

export type StudyTeachingRepresentationFallback =
  | 'none'
  | 'renderer_unavailable'
  | 'concept_ambiguous'
  | 'requested_mode_unsupported';

export type StudyTeachingRequestedMode =
  | 'visual'
  | 'graph'
  | 'worked_example'
  | 'story'
  | 'comparison'
  | 'concise'
  | null;

export type StudyTeachingRepresentationPlan = {
  version: typeof STUDY_TEACHING_REPRESENTATION_VERSION;
  requestedMode: StudyTeachingRequestedMode;
  primaryRepresentation: StudyTeachingRepresentation;
  learnerAction: 'predict' | 'calculate' | 'explain' | 'compare' | 'retrieve';
  rendererRequired: boolean;
  fallback: StudyTeachingRepresentationFallback;
  reason: 'explicit_request' | 'struggle_repair' | 'default_teaching';
};

const VISUAL_REQUEST = /\b(?:image|images|picture|pictures|diagram|diagrams|visual|visually|show me|draw|sketch)\b/i;
const GRAPH_REQUEST = /\b(?:graph|plot|chart)\b/i;
const WORKED_EXAMPLE_REQUEST = /\b(?:worked example|example|show me how|step[- ]by[- ]step)\b/i;
const STORY_REQUEST = /\b(?:story|storytelling|analogy|metaphor)\b/i;
const COMPARISON_REQUEST = /\b(?:compare|comparison|difference between|versus|\bvs\b)\b/i;
const CONCISE_REQUEST = /\b(?:make it easy|simplify|simple|simply|short|concise|in plain english)\b/i;
const STRUGGLE = /\b(?:i\s+(?:still\s+)?(?:don'?t|do not)\s+(?:understand|get(?:\s+it)?|know)|confused|lost|not getting it)\b/i;

const MECHANICS = /\b(?:newton|force|motion|velocity|acceleration|friction|gravity|projectile|inertia|free[- ]?body|momentum)\b/i;
const ALGEBRA = /\b(?:algebra|equation|variable|unknown|polynomial|quadratic|factoris(?:e|ation)|factoriz(?:e|ation))\b|\bx\b/i;
const BIOLOGY = /\b(?:biology|cell|nucleus|membrane|organelle|mitosis|meiosis|photosynthesis|respiration|genetics?|dna|chromosome)\b/i;
const CHEMISTRY = /\b(?:chemistry|chemical|atom|molecule|bond|electron|reaction|reactant|product|acid|base|salt|periodic)\b/i;
const EXPLICIT_GRAPH = /\b(?:graph|slope|axis|axes|plot|trend|correlation|distribution)\b/i;
const GRAPH_SEMANTICS = /\b(?:slope|axis|axes|trend|correlation|distribution|velocity[- ]time|displacement[- ]time|distance[- ]time|acceleration[- ]time|function|curve|coordinates?)\b/i;
const PROCESS = /\b(?:process|cycle|flow|pathway|sequence|step|stage)\b/i;
const TIMELINE = /\b(?:timeline|chronolog|year|era|history)\b/i;

function requestedMode(message: string): StudyTeachingRequestedMode {
  if (GRAPH_REQUEST.test(message)) return 'graph';
  if (VISUAL_REQUEST.test(message)) return 'visual';
  if (WORKED_EXAMPLE_REQUEST.test(message)) return 'worked_example';
  if (STORY_REQUEST.test(message)) return 'story';
  if (COMPARISON_REQUEST.test(message)) return 'comparison';
  if (CONCISE_REQUEST.test(message)) return 'concise';
  return null;
}

function supportedVisual(context: string): StudyTeachingRepresentation | null {
  if (EXPLICIT_GRAPH.test(context)) return 'graph';
  if (MECHANICS.test(context) || ALGEBRA.test(context) || BIOLOGY.test(context) || CHEMISTRY.test(context)) {
    return 'annotated_diagram';
  }
  if (PROCESS.test(context)) return 'process_flow';
  if (TIMELINE.test(context)) return 'timeline';
  return null;
}

export function planStudyTeachingRepresentation(input: {
  message?: string | null;
  contextText?: string | null;
}): StudyTeachingRepresentationPlan {
  const message = String(input.message || '').trim();
  const contextText = String(input.contextText || '').trim();
  const context = `${contextText}\n${message}`.trim();
  const requested = requestedMode(message);

  if (requested === 'graph') {
    // The word "graph" in a request is not evidence that a graph is a valid
    // representation for the concept. Require graph semantics from established
    // context or from concept-bearing words in the current request.
    const graphAvailable = EXPLICIT_GRAPH.test(contextText) || GRAPH_SEMANTICS.test(message);
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: graphAvailable ? 'graph' : 'concise_text',
      learnerAction: 'explain',
      rendererRequired: graphAvailable,
      fallback: graphAvailable ? 'none' : 'renderer_unavailable',
      reason: 'explicit_request',
    };
  }

  if (requested === 'visual') {
    const visual = supportedVisual(context);
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: visual || 'concise_text',
      learnerAction: 'predict',
      rendererRequired: Boolean(visual),
      fallback: visual ? 'none' : (context ? 'renderer_unavailable' : 'concept_ambiguous'),
      reason: 'explicit_request',
    };
  }

  if (requested === 'worked_example') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: 'worked_example',
      learnerAction: 'calculate',
      rendererRequired: false,
      fallback: 'none',
      reason: 'explicit_request',
    };
  }

  if (requested === 'story') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: 'story_analogy',
      learnerAction: 'explain',
      rendererRequired: false,
      fallback: 'none',
      reason: 'explicit_request',
    };
  }

  if (requested === 'comparison') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: 'comparison',
      learnerAction: 'compare',
      rendererRequired: false,
      fallback: 'none',
      reason: 'explicit_request',
    };
  }

  if (requested === 'concise') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: 'concise_text',
      learnerAction: 'explain',
      rendererRequired: false,
      fallback: 'none',
      reason: 'explicit_request',
    };
  }

  if (STRUGGLE.test(message)) {
    const visual = supportedVisual(context);
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: null,
      primaryRepresentation: visual || 'worked_example',
      learnerAction: visual ? 'predict' : 'explain',
      rendererRequired: Boolean(visual),
      fallback: 'none',
      reason: 'struggle_repair',
    };
  }

  return {
    version: STUDY_TEACHING_REPRESENTATION_VERSION,
    requestedMode: null,
    primaryRepresentation: 'concise_text',
    learnerAction: 'retrieve',
    rendererRequired: false,
    fallback: 'none',
    reason: 'default_teaching',
  };
}
