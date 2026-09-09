import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import type { StudyLearningExperiencePlan } from './study-learning-experience-director.js';
import type { StudyActiveLearningContext } from './study-active-learning-context.js';

export const STUDY_ADAPTIVE_HINT_LADDER_VERSION = 'study-adaptive-hint-ladder-2026-09-09.1';

export type StudyHintLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type StudyHintKind =
  | 'none'
  | 'attention_cue'
  | 'directional_hint'
  | 'structural_hint'
  | 'visual_partial_scaffold'
  | 'worked_step'
  | 'answer';

export type StudyAdaptiveHintPlan = {
  version: typeof STUDY_ADAPTIVE_HINT_LADDER_VERSION;
  requested: boolean;
  level: StudyHintLevel;
  kind: StudyHintKind;
  allowed: boolean;
  mayRevealAnswer: boolean;
  useGovernedVisual: boolean;
  reasonCode:
    | 'not_requested'
    | 'independent_verification_protected'
    | 'director_hints_disabled'
    | 'progressive_hint'
    | 'hint_fade_hold'
    | 'answer_allowed_after_full_scaffold';
  instruction: string;
};

const HINT_REQUEST_RE = /\b(?:hint|clue|nudge|another hint|more help|help me with the next step|give me a little help)\b/i;

const LEVEL_KIND: Record<Exclude<StudyHintLevel, 0>, Exclude<StudyHintKind, 'none'>> = {
  1: 'attention_cue',
  2: 'directional_hint',
  3: 'structural_hint',
  4: 'visual_partial_scaffold',
  5: 'worked_step',
  6: 'answer',
};

const LEVEL_INSTRUCTION: Record<Exclude<StudyHintLevel, 0>, string> = {
  1: 'Give only an attention cue: point to the relevant feature, quantity, relationship, or place to look. Do not state the method, next operation, worked step, or answer.',
  2: 'Give only a directional hint: name the useful principle or direction to take, but do not lay out the structure, perform a worked step, or reveal the answer.',
  3: 'Give a structural hint: break the task into the next useful subproblem or relation and ask the learner to complete it. Do not perform the worked step or reveal the answer.',
  4: 'Give a partial scaffold. If the representation route independently authorizes a native visual/interactive surface, use it; otherwise provide a compact partial textual structure. Leave the decisive reasoning or calculation to the learner.',
  5: 'Work exactly one material step, explain why that step is valid, then stop and ask the learner to continue. Do not finish the problem or reveal the final answer.',
  6: 'The full scaffold has been exhausted and policy permits an answer. Give the answer with a concise explanation, then require a fresh independent check before treating understanding as verified.',
};

function boundedDepth(value: unknown): StudyHintLevel {
  const depth = Math.trunc(Number(value));
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(6, depth)) as StudyHintLevel;
}

export function isStudyHintRequest(message: string | null | undefined): boolean {
  return HINT_REQUEST_RE.test(String(message || ''));
}

export function planStudyAdaptiveHint(input: {
  message?: string | null;
  workingState?: StudyWorkingStateSnapshot | null;
  experiencePlan: StudyLearningExperiencePlan;
  activeLearningContext?: StudyActiveLearningContext | null;
}): StudyAdaptiveHintPlan {
  const requested = isStudyHintRequest(input.message);
  if (!requested) {
    return {
      version: STUDY_ADAPTIVE_HINT_LADDER_VERSION,
      requested: false,
      level: 0,
      kind: 'none',
      allowed: false,
      mayRevealAnswer: false,
      useGovernedVisual: false,
      reasonCode: 'not_requested',
      instruction: '',
    };
  }

  const experience = input.experiencePlan;
  const independent = experience.verificationRequirement === 'fresh_independent'
    || experience.verificationRequirement === 'defer_until_due';
  if (independent) {
    return {
      version: STUDY_ADAPTIVE_HINT_LADDER_VERSION,
      requested: true,
      level: 0,
      kind: 'none',
      allowed: false,
      mayRevealAnswer: false,
      useGovernedVisual: false,
      reasonCode: 'independent_verification_protected',
      instruction: 'Do not provide a hint or answer during an independent governed verification. Ask the learner to attempt it unaided, or offer to exit the verification and return to teaching support.',
    };
  }

  if (experience.hintPolicy === 'none') {
    return {
      version: STUDY_ADAPTIVE_HINT_LADDER_VERSION,
      requested: true,
      level: 0,
      kind: 'none',
      allowed: false,
      mayRevealAnswer: false,
      useGovernedVisual: false,
      reasonCode: 'director_hints_disabled',
      instruction: 'Do not provide a hint for this turn. Preserve the Experience Director verification/teaching boundary.',
    };
  }

  const previousDepth = boundedDepth(input.workingState?.hintDepth);
  const progressiveDepth = Math.min(6, previousDepth + 1) as StudyHintLevel;
  // PR6's `fade` posture means repeated hint dependence must not automatically
  // buy a deeper scaffold. Hold the current rung (or start at rung 1) and ask
  // the learner to do more of the work.
  const nextDepth = experience.hintPolicy === 'fade'
    ? (previousDepth === 0 ? 1 : Math.min(5, previousDepth)) as StudyHintLevel
    : progressiveDepth;
  const answerAllowed = nextDepth === 6
    && experience.hintPolicy === 'progressive'
    && experience.verificationRequirement !== 'fresh_independent';
  const effectiveLevel = nextDepth === 6 && !answerAllowed ? 5 : nextDepth;
  const effectiveKind = LEVEL_KIND[effectiveLevel as Exclude<StudyHintLevel, 0>];
  const capability = input.activeLearningContext?.representationCapability || null;
  const useGovernedVisual = effectiveLevel === 4 && Boolean(capability);

  return {
    version: STUDY_ADAPTIVE_HINT_LADDER_VERSION,
    requested: true,
    level: effectiveLevel,
    kind: effectiveKind,
    allowed: true,
    mayRevealAnswer: effectiveLevel === 6,
    useGovernedVisual,
    reasonCode: effectiveLevel === 6
      ? 'answer_allowed_after_full_scaffold'
      : experience.hintPolicy === 'fade'
        ? 'hint_fade_hold'
        : 'progressive_hint',
    instruction: LEVEL_INSTRUCTION[effectiveLevel as Exclude<StudyHintLevel, 0>],
  };
}
