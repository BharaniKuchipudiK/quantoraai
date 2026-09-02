import { evaluateStudyLearningIntervention, type StudyLearningIntervention } from './study-learning-intervention.js';
import { resolveStudyRepresentationCapability } from './study-representation-capabilities.js';

export const STUDY_TEACHING_REPRESENTATION_VERSION = 'study-teaching-representation-2026-09-02.6';

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
  | 'simulation_or_lab'
  | 'reference';

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
  rendererKind: string | null;
  fallback: StudyTeachingRepresentationFallback;
  reason: 'explicit_request' | 'struggle_repair' | 'default_teaching';
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };

const VISUAL_REQUEST = /\b(?:image|images|picture|pictures|diagram|diagrams|visual|visually|show me|draw|sketch)\b/i;
const GRAPH_REQUEST = /\b(?:graph|plot|chart)\b/i;
const WORKED_EXAMPLE_REQUEST = /\b(?:worked example|example|show me how|step[- ]by[- ]step)\b/i;
const STORY_REQUEST = /\b(?:story|storytelling|analogy|metaphor)\b/i;
const COMPARISON_REQUEST = /\b(?:compare|comparison|difference between|versus|\bvs\b)\b/i;
const CONCISE_REQUEST = /\b(?:make it easy|simplify|simple|simply|short|concise|in plain english)\b/i;
const STRUGGLE = /\b(?:i\s+(?:still\s+)?(?:don'?t|do not)\s+(?:understand|get(?:\s+it)?|know)|confused|lost|not getting it)\b/i;
const GRAPH_SEMANTICS = /\b(?:slope|axis|axes|trend|correlation|distribution|velocity[- ]time|displacement[- ]time|distance[- ]time|acceleration[- ]time|function|curve|coordinates?)\b/i;

function requestedMode(message: string): StudyTeachingRequestedMode {
  if (GRAPH_REQUEST.test(message)) return 'graph';
  if (VISUAL_REQUEST.test(message)) return 'visual';
  if (WORKED_EXAMPLE_REQUEST.test(message)) return 'worked_example';
  if (STORY_REQUEST.test(message)) return 'story';
  if (COMPARISON_REQUEST.test(message)) return 'comparison';
  if (CONCISE_REQUEST.test(message)) return 'concise';
  return null;
}

export function planStudyTeachingRepresentation(input: {
  message?: string | null;
  contextText?: string | null;
  history?: HistoryItem[];
  intervention?: StudyLearningIntervention | null;
}): StudyTeachingRepresentationPlan {
  const message = String(input.message || '').trim();
  const contextText = String(input.contextText || '').trim();
  const context = `${contextText}\n${message}`.trim();
  const requested = requestedMode(message);
  const capability = resolveStudyRepresentationCapability(context);

  if (requested === 'graph') {
    const graphCapability = capability?.representation === 'graph' ? capability : null;
    const graphAvailable = Boolean(graphCapability) || GRAPH_SEMANTICS.test(message);
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: graphAvailable ? 'graph' : 'concise_text',
      learnerAction: 'explain',
      rendererRequired: graphAvailable,
      rendererKind: graphCapability?.rendererKind || (graphAvailable ? 'graph' : null),
      fallback: graphAvailable ? 'none' : 'renderer_unavailable',
      reason: 'explicit_request',
    };
  }

  if (requested === 'visual') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: requested,
      primaryRepresentation: capability?.representation || 'concise_text',
      learnerAction: 'predict',
      rendererRequired: Boolean(capability),
      rendererKind: capability?.rendererKind || null,
      fallback: capability ? 'none' : (context ? 'renderer_unavailable' : 'concept_ambiguous'),
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
      rendererKind: null,
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
      rendererKind: null,
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
      rendererKind: null,
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
      rendererKind: null,
      fallback: 'none',
      reason: 'explicit_request',
    };
  }

  const intervention = input.intervention || evaluateStudyLearningIntervention({
    message,
    history: Array.isArray(input.history) ? input.history : [],
  });

  if (intervention.action === 'guided_reconstruction') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: null,
      primaryRepresentation: 'interactive_probe',
      learnerAction: 'predict',
      rendererRequired: false,
      rendererKind: null,
      fallback: 'none',
      reason: 'struggle_repair',
    };
  }

  if (intervention.action === 'change_representation') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: null,
      primaryRepresentation: capability?.representation || 'worked_example',
      learnerAction: capability ? 'predict' : 'calculate',
      rendererRequired: Boolean(capability),
      rendererKind: capability?.rendererKind || null,
      fallback: 'none',
      reason: 'struggle_repair',
    };
  }

  if (intervention.action === 'offer_reference') {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: null,
      primaryRepresentation: 'reference',
      learnerAction: 'retrieve',
      rendererRequired: false,
      rendererKind: null,
      fallback: 'none',
      reason: 'struggle_repair',
    };
  }

  if (intervention.action === 'compress' || STRUGGLE.test(message)) {
    return {
      version: STUDY_TEACHING_REPRESENTATION_VERSION,
      requestedMode: null,
      primaryRepresentation: 'concise_text',
      learnerAction: 'explain',
      rendererRequired: false,
      rendererKind: null,
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
    rendererKind: null,
    fallback: 'none',
    reason: 'default_teaching',
  };
}
