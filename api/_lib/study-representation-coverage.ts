import {
  resolveStudyRepresentationCapability,
  STUDY_REPRESENTATION_CAPABILITY_VERSION,
  type StudyRepresentationDeliveryClass,
  type StudyRepresentationRendererKind,
} from './study-representation-capabilities.js';

export const STUDY_REPRESENTATION_COVERAGE_VERSION = 'study-representation-coverage-2026-09-10.2';

export type StudyRepresentationCoverageOutcome = 'renderer_available' | 'renderer_unavailable';

export type StudyRepresentationCoverageRequestClass =
  | 'visual_mechanics'
  | 'visual_newton_animation'
  | 'visual_linear_function_lab'
  | 'visual_circuit_lab'
  | 'visual_electricity'
  | 'visual_field'
  | 'visual_geometry'
  | 'visual_algebra'
  | 'visual_graph'
  | 'visual_biology'
  | 'visual_chemistry'
  | 'visual_process'
  | 'visual_timeline'
  | 'visual_number_line'
  | 'visual_fraction'
  | 'visual_before_after'
  | 'visual_unsupported';

export type StudyRepresentationCoverageRow = {
  requestClass: StudyRepresentationCoverageRequestClass;
  rendererKind: StudyRepresentationRendererKind | null;
  deliveryClass: StudyRepresentationDeliveryClass | null;
  outcome: StudyRepresentationCoverageOutcome;
};

export type StudyRepresentationCoverageReport = {
  version: typeof STUDY_REPRESENTATION_COVERAGE_VERSION;
  capabilityVersion: typeof STUDY_REPRESENTATION_CAPABILITY_VERSION;
  source: 'capability_catalog';
  rows: StudyRepresentationCoverageRow[];
};

/**
 * Closed probes for the operator catalog. Context strings stay server-side;
 * the report emits only request class, renderer family, delivery class and
 * availability. This is capability coverage, not learner traffic.
 */
const COVERAGE_PROBES = Object.freeze([
  { requestClass: 'visual_mechanics', context: 'Newton second law and friction' },
  { requestClass: 'visual_newton_animation', context: "Animate Newton's third law of motion as an interactive simulation" },
  { requestClass: 'visual_linear_function_lab', context: 'interactive lab for the linear function y = mx + b with slope and intercept' },
  { requestClass: 'visual_circuit_lab', context: 'Animate a battery and lamp circuit with an open return wire' },
  { requestClass: 'visual_electricity', context: 'EMF, terminal potential difference, battery and circuit' },
  { requestClass: 'visual_field', context: 'magnetic field direction with right-hand rule' },
  { requestClass: 'visual_geometry', context: 'Find side x in this right triangle using Pythagoras' },
  { requestClass: 'visual_algebra', context: 'Solve the algebra equation x + 3 = 5' },
  { requestClass: 'visual_graph', context: 'velocity-time graph and slope' },
  { requestClass: 'visual_biology', context: 'Label the cell membrane and nucleus' },
  { requestClass: 'visual_chemistry', context: 'Show a covalent bond between two atoms' },
  { requestClass: 'visual_process', context: 'process: input -> change -> result' },
  { requestClass: 'visual_timeline', context: 'timeline of events in 1914 and 1918' },
  { requestClass: 'visual_number_line', context: 'number line from -3 to 5, mark 2' },
  { requestClass: 'visual_fraction', context: 'show equivalent fractions 2/3 and 4/6 visually' },
  { requestClass: 'visual_before_after', context: 'Before/after: ice -> liquid water' },
  { requestClass: 'visual_unsupported', context: 'Explain opportunity cost in simple terms' },
] as const satisfies ReadonlyArray<{ requestClass: StudyRepresentationCoverageRequestClass; context: string }>);

/**
 * Operator-visible renderer coverage. This is the capability catalog, not live
 * traffic counts. Live representation_coverage events remain privacy-safe log
 * lines; this report is what an operator can read without grepping learner text.
 */
export function reportStudyRepresentationCoverage(): StudyRepresentationCoverageReport {
  return {
    version: STUDY_REPRESENTATION_COVERAGE_VERSION,
    capabilityVersion: STUDY_REPRESENTATION_CAPABILITY_VERSION,
    source: 'capability_catalog',
    rows: COVERAGE_PROBES.map((probe) => {
      const capability = resolveStudyRepresentationCapability(probe.context);
      return {
        requestClass: probe.requestClass,
        rendererKind: capability?.rendererKind || null,
        deliveryClass: capability?.deliveryClass || null,
        outcome: capability ? 'renderer_available' : 'renderer_unavailable',
      };
    }),
  };
}
