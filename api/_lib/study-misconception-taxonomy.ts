export const STUDY_MISCONCEPTION_TAXONOMY_VERSION = 'study-misconception-taxonomy-2026-08-31.1';

export type StudyMisconceptionCode =
  | 'sign_error'
  | 'formula_selection'
  | 'unit_conversion'
  | 'conceptual_inversion'
  | 'rule_outside_domain'
  | 'arithmetic_slip'
  | 'prerequisite_gap'
  | 'representation_misread'
  | 'component_confusion'
  | 'unknown';

export type StudyMisconceptionRemediationStrategy =
  | 'sign_anchor'
  | 'formula_discrimination'
  | 'unit_ladder'
  | 'contrast_cases'
  | 'boundary_case'
  | 'worked_microstep'
  | 'prerequisite_repair'
  | 'representation_bridge'
  | 'component_separation'
  | 'targeted_clarification';

export type StudyMisconceptionRemediation = {
  strategy: StudyMisconceptionRemediationStrategy;
  instruction: string;
  learnerFacingText: string;
};

const CODES = new Set<StudyMisconceptionCode>([
  'sign_error',
  'formula_selection',
  'unit_conversion',
  'conceptual_inversion',
  'rule_outside_domain',
  'arithmetic_slip',
  'prerequisite_gap',
  'representation_misread',
  'component_confusion',
  'unknown',
]);

const REMEDIATION: Record<StudyMisconceptionCode, StudyMisconceptionRemediation> = {
  sign_error: {
    strategy: 'sign_anchor',
    instruction: 'Anchor the sign to one physical or geometric reference, then ask the learner to predict the sign before calculating anything.',
    learnerFacingText: 'Next: anchor the sign first, then predict it before calculating.',
  },
  formula_selection: {
    strategy: 'formula_discrimination',
    instruction: 'Contrast the correct formula with the tempting alternative and ask which quantities the problem actually provides before substituting values.',
    learnerFacingText: 'Next: choose between the two formulas from the quantities you actually have.',
  },
  unit_conversion: {
    strategy: 'unit_ladder',
    instruction: 'Repair only the unit conversion using one dimensional-equivalence step, then return to the original problem.',
    learnerFacingText: 'Next: fix the unit conversion first, then return to the problem.',
  },
  conceptual_inversion: {
    strategy: 'contrast_cases',
    instruction: 'Use one minimal pair where the two concepts produce different outcomes, then ask the learner to state the distinguishing rule.',
    learnerFacingText: 'Next: compare two close cases and state the one distinction that separates them.',
  },
  rule_outside_domain: {
    strategy: 'boundary_case',
    instruction: 'Show one case where the remembered rule works and one where its required condition fails, then ask the learner to name that condition.',
    learnerFacingText: 'Next: find the condition that tells you when this rule is allowed.',
  },
  arithmetic_slip: {
    strategy: 'worked_microstep',
    instruction: 'Keep the concept and formula fixed; redo only the smallest arithmetic step that changed the result.',
    learnerFacingText: 'Next: keep the method and repair just the arithmetic step that changed the answer.',
  },
  prerequisite_gap: {
    strategy: 'prerequisite_repair',
    instruction: 'Step back to the smallest missing prerequisite, verify it independently, then retry the original concept.',
    learnerFacingText: 'Next: repair one prerequisite, then retry this idea.',
  },
  representation_misread: {
    strategy: 'representation_bridge',
    instruction: 'Map each visual feature, axis, or geometric part to its meaning before using any formula; then ask for the same relationship in words.',
    learnerFacingText: 'Next: map what each part of the representation means before calculating.',
  },
  component_confusion: {
    strategy: 'component_separation',
    instruction: 'Separate the independent components explicitly and identify which force or change belongs to each component before recombining them.',
    learnerFacingText: 'Next: separate the components and decide what changes in each one.',
  },
  unknown: {
    strategy: 'targeted_clarification',
    instruction: 'Do not guess the cause. Ask one discriminating question that can separate the most plausible explanations.',
    learnerFacingText: 'Next: one focused check to identify what caused the error.',
  },
};

export function isStudyMisconceptionCode(value: unknown): value is StudyMisconceptionCode {
  return typeof value === 'string' && CODES.has(value as StudyMisconceptionCode);
}

export function studyMisconceptionRemediation(code: StudyMisconceptionCode): StudyMisconceptionRemediation {
  return REMEDIATION[code];
}
