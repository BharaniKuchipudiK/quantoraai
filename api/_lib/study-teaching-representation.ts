import type { StudyLearnerModel } from './study-learner-model.js';
import { evaluateStudyLearningIntervention, type StudyLearningIntervention } from './study-learning-intervention.js';
import {
  resolveStudyRepresentationCapability,
  type StudyRepresentationRendererKind,
} from './study-representation-capabilities.js';

export const STUDY_TEACHING_REPRESENTATION_VERSION = 'study-teaching-representation-2026-09-03.9';

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
  rendererKind: StudyRepresentationRendererKind | null;
  fallback: StudyTeachingRepresentationFallback;
  reason: 'explicit_request' | 'struggle_repair' | 'verified_learner_state' | 'default_teaching';
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };
type StudyRepresentationCapability = NonNullable<ReturnType<typeof resolveStudyRepresentationCapability>>;

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

/**
 * Project the one authoritative verified learner model into a representation.
 * This is deliberately a pure projection: it creates no learner state and
 * writes nothing. Current explicit requests and fresh struggle signals are
 * handled first; verified state changes the otherwise-stable teaching path.
 */
function planForVerifiedLearnerState(
  learnerModel: StudyLearnerModel,
  capability: StudyRepresentationCapability | null,
): StudyTeachingRepresentationPlan {
  const common = {
    version: STUDY_TEACHING_REPRESENTATION_VERSION,
    requestedMode: null,
    fallback: 'none',
    reason: 'verified_learner_state',
  } as const;

  switch (learnerModel.nextLearningMove.type) {
    case 'diagnose_misconception':
    case 'confirm_misconception':
      return {
        ...common,
        primaryRepresentation: 'comparison',
        learnerAction: 'compare',
        rendererRequired: false,
        rendererKind: null,
      };
    case 'guided_repair':
      return capability
        ? {
            ...common,
            primaryRepresentation: capability.representation,
            learnerAction: 'predict',
            rendererRequired: true,
            rendererKind: capability.rendererKind,
          }
        : {
            ...common,
            primaryRepresentation: 'worked_example',
            learnerAction: 'calculate',
            rendererRequired: false,
            rendererKind: null,
          };
    case 'vary_evidence':
      return {
        ...common,
        primaryRepresentation: 'worked_example',
        learnerAction: 'calculate',
        rendererRequired: false,
        rendererKind: null,
      };
    case 'retention_probe':
      return {
        ...common,
        primaryRepresentation: 'governed_assessment',
        learnerAction: 'retrieve',
        rendererRequired: false,
        rendererKind: null,
      };
    case 'transfer_task':
      return {
        ...common,
        primaryRepresentation: 'governed_assessment',
        learnerAction: 'explain',
        rendererRequired: false,
        rendererKind: null,
      };
    case 'independent_retrieval':
    default:
      return {
        ...common,
        primaryRepresentation: 'interactive_probe',
        learnerAction: 'retrieve',
        rendererRequired: false,
        rendererKind: null,
      };
  }
}

export function planStudyTeachingRepresentation(input: {
  message?: string | null;
  contextText?: string | null;
  history?: HistoryItem[];
  intervention?: StudyLearningIntervention | null;
  learnerModel?: StudyLearnerModel | null;
}): StudyTeachingRepresentationPlan {
  const message = String(input.message || '').trim();
  const contextText = String(input.contextText || '').trim();
  const context = `${contextText}\n${message}`.trim();
  const requested = requestedMode(message);
  const capability = resolveStudyRepresentationCapability(context);

  if (requested === 'graph') {
    // The request word "graph" is not evidence that a graph is semantically
    // appropriate. Require graph semantics from established lesson context or
    // from additional semantic words in the current learner message.
    const contextCapability = resolveStudyRepresentationCapability(contextText);
    const graphCapability = contextCapability?.representation === 'graph' ? contextCapability : null;
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

  if (input.learnerModel) {
    return planForVerifiedLearnerState(input.learnerModel, capability);
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
