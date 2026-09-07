/*
 * Quantora Learning Compass — deterministic learning-priority engine.
 *
 * WHY THIS EXISTS
 *
 * A learner rarely has one obviously-correct thing to study next. They have a
 * frontier: a concept whose mastery is thin, a prerequisite that is quietly
 * blocking three later ideas, a misconception that keeps resurfacing, a durable
 * fact that is about to be forgotten, an exam-heavy objective they have never
 * touched. The Compass ranks that frontier so the runtime can offer the "next
 * best learning action" with a reason a human can read and argue with.
 *
 * WHAT THIS IS NOT
 *
 * It is NOT a learner model. It never estimates mastery, never admits evidence,
 * never decides whether a misconception is present. Those are owned, once, by
 * the existing Study contracts — study-mastery-estimator (StudyMasteryEstimate)
 * and study-learner-model (StudyLearnerModel) — and this engine only READS
 * their already-computed projections. There is exactly one learner truth in the
 * platform and this file is not a second one.
 *
 * It is NOT a probability. `score` is a bounded, normalized PRIORITY, not a
 * probability of mastery and not an "expected gain". Every factor is a
 * deterministic urgency signal derived from an inspectable input; none is a
 * fabricated likelihood. `retentionRisk` in particular is grounded in the
 * learner model's own due/overdue dates and retention state, never in an
 * invented forgetting curve.
 *
 * HONESTY PROPERTIES (each is tested)
 *
 *   - Deterministic: the same request produces the same result, byte for byte.
 *     Wall-clock time never enters; callers inject `asOf`.
 *   - Bounded: every factor value is clamped to [0, 1]; every count is folded
 *     through a saturating transform so no input can dominate without bound.
 *   - Read-only: no writes, no I/O, no model call. Type-only imports mean this
 *     module has zero runtime dependency on the Study data layer.
 *   - Insufficient evidence is said, not guessed: a concept with no admitted
 *     evidence reports confidence 'insufficient' and dataSufficiency
 *     'insufficient_evidence', and its mastery-gap factor is flagged unknown
 *     rather than invented.
 *   - Stable ordering: ties break through a fully specified total order, so the
 *     ranking is reproducible regardless of input order.
 *   - Explainable: every recommendation carries its per-factor breakdown
 *     (value, weight, direction, contribution, reason codes), the reused next
 *     move, a confidence band, the inputs that were missing, and a suggested
 *     learning duration.
 */

import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import type { StudyMasteryEstimate } from './study-mastery-estimator.js';
import type { StudyMisconceptionCode } from './study-misconception-taxonomy.js';
import type { StudyConceptEdge, StudyCurriculumMapping } from './study-truth-layer.js';

export const STUDY_LEARNING_PRIORITY_ENGINE_VERSION = 'study-learning-priority-2026-09-07.1';

/* ─── the factors ────────────────────────────────────────────────────────── */

export type StudyLearningFactorKey =
  | 'masteryGap'
  | 'prerequisiteLeverage'
  | 'misconceptionSeverity'
  | 'retentionRisk'
  | 'curriculumImportance'
  | 'evidenceConfidence'
  | 'availableTimeFit'
  | 'recentPracticePenalty';

/**
 * Canonical factor order. It fixes the breakdown order in every result and the
 * iteration order of weight resolution, so two runs cannot disagree on layout.
 */
const FACTOR_KEYS: readonly StudyLearningFactorKey[] = [
  'masteryGap',
  'prerequisiteLeverage',
  'misconceptionSeverity',
  'retentionRisk',
  'curriculumImportance',
  'evidenceConfidence',
  'availableTimeFit',
  'recentPracticePenalty',
];

/**
 * +1 factors raise priority (urgency); -1 factors lower it (a penalty). Only the
 * recent-practice factor is a penalty: something practised minutes ago is a poor
 * "next" even when everything else about it is urgent.
 */
const FACTOR_DIRECTION: Record<StudyLearningFactorKey, 1 | -1> = {
  masteryGap: 1,
  prerequisiteLeverage: 1,
  misconceptionSeverity: 1,
  retentionRisk: 1,
  curriculumImportance: 1,
  evidenceConfidence: 1,
  availableTimeFit: 1,
  recentPracticePenalty: -1,
};

const FACTOR_LABEL: Record<StudyLearningFactorKey, string> = {
  masteryGap: 'Mastery gap',
  prerequisiteLeverage: 'Prerequisite leverage (downstream blocked)',
  misconceptionSeverity: 'Misconception severity',
  retentionRisk: 'Retention / forgetting risk',
  curriculumImportance: 'Curriculum / exam importance',
  evidenceConfidence: 'Evidence confidence (diagnostic need)',
  availableTimeFit: 'Available-time fit',
  recentPracticePenalty: 'Recent-practice penalty',
};

/**
 * Default weights. The seven urgency weights sum to exactly 1.0 so a fully
 * urgent, un-penalised concept scores 1.0 under the default profile; the
 * normaliser below recomputes the bounds from whatever weights are actually in
 * force, so callers may override any weight without breaking the [0, 1] range.
 */
export const STUDY_LEARNING_PRIORITY_DEFAULT_WEIGHTS: Readonly<
  Record<StudyLearningFactorKey, number>
> = Object.freeze({
  masteryGap: 0.2,
  prerequisiteLeverage: 0.2,
  misconceptionSeverity: 0.16,
  retentionRisk: 0.16,
  curriculumImportance: 0.12,
  evidenceConfidence: 0.06,
  availableTimeFit: 0.1,
  recentPracticePenalty: 0.14,
});

/* ─── tuning constants (named so the reasoning is inspectable) ───────────── */

/** Neutral value used when a signal is genuinely unknown, never a guess of 0/1. */
const NEUTRAL_UNKNOWN = 0.5;
/** Saturation constant for downstream-blocked leverage: leverage = w / (w + k). */
const LEVERAGE_SATURATION = 2;
/** Canonical high-confidence edge threshold, mirroring the prerequisite loader. */
const HIGH_CONFIDENCE_EDGE = 0.8;
/** Days within which repeating the same concept is treated as cramming. */
const PRACTICE_SPACING_WINDOW_DAYS = 3;
/** Floor on a suggested session so a tiny time budget never suggests 0 minutes. */
const MIN_SESSION_MINUTES = 3;
/** Hard cap on any duration so a malformed override cannot suggest a day. */
const MAX_SESSION_MINUTES = 480;
const MILLIS_PER_DAY = 86_400_000;

/**
 * Deterministic base duration per recommended move. This is the reused move
 * vocabulary from the learner model, so the Compass never invents an action the
 * rest of the platform does not already speak.
 */
const BASE_DURATION_BY_MOVE: Record<StudyNextLearningMove, number> = {
  independent_retrieval: 5,
  diagnose_misconception: 10,
  confirm_misconception: 8,
  guided_repair: 15,
  vary_evidence: 10,
  retention_probe: 5,
  transfer_task: 20,
};
const DEFAULT_MOVE_DURATION = 10;

/* ─── inputs ─────────────────────────────────────────────────────────────── */

/**
 * Curriculum / exam importance for one concept, distilled from a
 * {@link StudyCurriculumMapping}. `examWeight` MUST be normalised to [0, 1] by
 * the caller (the mapping's raw weight divided by its framework maximum); it is
 * clamped defensively here, and `null` is treated as "importance unknown"
 * rather than "unimportant".
 */
export type StudyLearningCurriculumSignal = {
  /** Normalised exam/curriculum weight in [0, 1], or null when not mapped. */
  examWeight?: number | null;
  /** Objective depth from the mapping (>= 1); deeper is a more specific target. */
  depth?: number | null;
  /** Confidence of the curriculum mapping itself, in [0, 1]. */
  confidence?: number | null;
};

/**
 * One downstream concept that depends on the candidate as a prerequisite. This
 * is the target end of a canonical `prerequisite_of` {@link StudyConceptEdge}
 * whose source is the candidate concept; `edgeConfidence` is that edge's
 * confidence. The caller supplies the traversal (it reads the graph); the engine
 * only decides what the structure means for priority.
 */
export type StudyLearningDownstreamConcept = {
  conceptId: string;
  edgeConfidence: number;
};

/**
 * One concept on the frontier, described entirely by reused projections plus
 * canonical-graph and curriculum metadata. The engine recomputes none of it.
 */
export type StudyLearningPriorityCandidate = {
  conceptId: string;
  conceptKey?: string | null;
  /** Owns understanding / misconception / retention / transfer / next move. */
  learnerModel: StudyLearnerModel;
  /** Owns mastery / confidence / retention / misconception risk / status. */
  masteryEstimate: StudyMasteryEstimate;
  /** Curriculum importance, or null/omitted when the concept is not mapped. */
  curriculum?: StudyLearningCurriculumSignal | null;
  /**
   * Downstream concepts gated by this one. `undefined`/`null` means the graph
   * was not consulted (recorded as a missing input); `[]` means it was
   * consulted and the concept is a genuine leaf.
   */
  downstream?: StudyLearningDownstreamConcept[] | null;
  /** ISO time the concept was last practised; defaults to observedThrough. */
  lastPracticedAt?: string | null;
  /** Caller override of the base session length in minutes. */
  estimatedDurationMinutes?: number | null;
};

export type StudyLearningPriorityRequest = {
  candidates: StudyLearningPriorityCandidate[];
  /** Injected reference time (ISO). Replay must never read the wall clock. */
  asOf: string;
  /** The learner's current session budget in minutes, for time-fit. */
  availableMinutes?: number | null;
  /** Optional per-factor weight overrides, each clamped to [0, 1]. */
  weights?: Partial<Record<StudyLearningFactorKey, number>>;
  /** Optional cap on how many recommendations to return (ranking is full). */
  limit?: number | null;
};

/* ─── outputs ────────────────────────────────────────────────────────────── */

export type StudyLearningPriorityFactor = {
  key: StudyLearningFactorKey;
  label: string;
  /** Bounded [0, 1] urgency magnitude for this factor. */
  value: number;
  /** +1 urgency, -1 penalty. */
  direction: 1 | -1;
  /** Resolved weight in force for this run. */
  weight: number;
  /** direction * weight * value, rounded. The signed push on the score. */
  contribution: number;
  reasonCodes: string[];
};

export type StudyLearningConfidenceBand = 'insufficient' | 'low' | 'moderate' | 'high';
export type StudyLearningDataSufficiency = 'sufficient' | 'insufficient_evidence';

export type StudyLearningPriorityRecommendation = {
  conceptId: string;
  conceptKey: string | null;
  /** 1-based position in the full ranking (before any `limit` slice). */
  rank: number;
  /** Bounded [0, 1] priority. Not a probability, not an expected gain. */
  score: number;
  /** Reused from the learner model; the platform's own action vocabulary. */
  recommendedActionType: StudyNextLearningMove;
  factors: StudyLearningPriorityFactor[];
  reasonCodes: string[];
  /** Evidence-grounded confidence in the learner-state inputs, in [0, 1]. */
  confidence: number;
  confidenceBand: StudyLearningConfidenceBand;
  dataSufficiency: StudyLearningDataSufficiency;
  /** Inputs that were absent, so a thin recommendation is legible as thin. */
  missingInputs: string[];
  suggestedDurationMinutes: number;
  baseDurationMinutes: number;
  /** null when availableMinutes was not supplied. */
  fitsAvailableTime: boolean | null;
};

export type StudyLearningPriorityResult = {
  version: string;
  asOf: string;
  availableMinutes: number | null;
  /** The weights actually used (defaults with any valid overrides applied). */
  weights: Record<StudyLearningFactorKey, number>;
  recommendations: StudyLearningPriorityRecommendation[];
  /** Candidates dropped before ranking, each with a reason. */
  skipped: Array<{ conceptId: string; reasonCode: string }>;
};

/* ─── small deterministic numeric helpers ────────────────────────────────── */

function clamp01(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

function round4(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
}

/** Monotonic, bounded fold of a non-negative magnitude into [0, 1). */
function saturate(magnitude: number, k: number): number {
  if (!Number.isFinite(magnitude) || magnitude <= 0) return 0;
  return magnitude / (magnitude + k);
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return (to - from) / MILLIS_PER_DAY;
}

function clampMinutes(value: number): number {
  return Math.max(1, Math.min(MAX_SESSION_MINUTES, Math.round(value)));
}

/* ─── weight resolution and score normalisation ──────────────────────────── */

function resolveWeights(
  overrides?: Partial<Record<StudyLearningFactorKey, number>>,
): Record<StudyLearningFactorKey, number> {
  const resolved = { ...STUDY_LEARNING_PRIORITY_DEFAULT_WEIGHTS };
  if (overrides) {
    for (const key of FACTOR_KEYS) {
      const candidate = overrides[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        resolved[key] = clamp01(candidate);
      }
    }
  }
  return resolved;
}

/**
 * Affine map of the signed weighted sum into [0, 1], with bounds recomputed from
 * the weights in force. maxScore is every urgency factor at 1 and every penalty
 * at 0; minScore is the reverse. A degenerate all-zero weighting scores 0.
 */
function normaliseScore(rawScore: number, weights: Record<StudyLearningFactorKey, number>): number {
  let maxScore = 0;
  let minScore = 0;
  for (const key of FACTOR_KEYS) {
    if (FACTOR_DIRECTION[key] === 1) maxScore += weights[key];
    else minScore -= weights[key];
  }
  const denom = maxScore - minScore;
  if (denom <= 0) return 0;
  return clamp01((rawScore - minScore) / denom);
}

/* ─── per-factor value functions ─────────────────────────────────────────── */

type FactorReading = { value: number; reasonCodes: string[] };

function masteryGapFactor(estimate: StudyMasteryEstimate): FactorReading {
  if (estimate.status === 'insufficient_evidence' || estimate.mastery == null) {
    return { value: NEUTRAL_UNKNOWN, reasonCodes: ['mastery_gap_unknown_insufficient_evidence'] };
  }
  const gap = clamp01(1 - estimate.mastery);
  const band = gap >= 0.6 ? 'large_mastery_gap' : gap >= 0.3 ? 'moderate_mastery_gap' : 'small_mastery_gap';
  return { value: gap, reasonCodes: [band] };
}

function prerequisiteLeverageFactor(
  candidate: StudyLearningPriorityCandidate,
): FactorReading {
  const downstream = candidate.downstream;
  if (downstream == null) {
    return { value: 0, reasonCodes: ['downstream_graph_not_consulted'] };
  }
  if (!downstream.length) {
    return { value: 0, reasonCodes: ['leaf_concept_no_downstream'] };
  }
  const verified = candidate.learnerModel.understanding.state === 'verified';
  if (verified) {
    return { value: 0, reasonCodes: ['concept_verified_blocks_nothing'] };
  }
  let blockedWeight = 0;
  let highConfidenceCount = 0;
  for (const edge of downstream) {
    const confidence = clamp01(edge.edgeConfidence);
    blockedWeight += confidence;
    if (confidence >= HIGH_CONFIDENCE_EDGE) highConfidenceCount += 1;
  }
  return {
    value: clamp01(saturate(blockedWeight, LEVERAGE_SATURATION)),
    reasonCodes: [
      `downstream_blocked:${downstream.length}`,
      `high_confidence_downstream:${highConfidenceCount}`,
      `understanding:${candidate.learnerModel.understanding.state}`,
    ],
  };
}

function misconceptionSeverityFactor(
  learnerModel: StudyLearnerModel,
  estimate: StudyMasteryEstimate,
): FactorReading {
  const misconception = learnerModel.misconception;
  const risk = clamp01(estimate.misconceptionRisk);
  const diagnosisConfidence = clamp01(misconception.confidence ?? 0);
  const strength = Math.max(risk, diagnosisConfidence);
  const code: StudyMisconceptionCode | 'none' = misconception.code ?? 'none';

  if (misconception.state === 'signal_observed') {
    return {
      value: clamp01(0.7 + 0.3 * strength),
      reasonCodes: [`active_misconception:${code}`],
    };
  }
  if (misconception.state === 'needs_confirmation') {
    return {
      value: clamp01(0.4 + 0.3 * strength),
      reasonCodes: [`misconception_needs_confirmation:${code}`],
    };
  }
  if (risk > 0) {
    return { value: clamp01(0.3 * risk), reasonCodes: ['residual_misconception_risk'] };
  }
  return { value: 0, reasonCodes: ['no_misconception_signal'] };
}

function retentionRiskFactor(
  learnerModel: StudyLearnerModel,
  asOf: string,
): FactorReading {
  const retention = learnerModel.retention;
  const verifiedUnderstanding = learnerModel.understanding.state === 'verified';

  // Overdue magnitude, grounded strictly in the model's own scheduled dates.
  let overdueRatio = 0;
  const targetDelay = retention.targetDelayDays ?? null;
  const overdueDays = daysBetween(retention.dueAt ?? null, asOf);
  if (overdueDays != null && targetDelay && targetDelay > 0) {
    overdueRatio = clamp01(Math.max(0, overdueDays) / targetDelay);
  }

  if (retention.state === 'needs_support') {
    return { value: clamp01(0.8 + 0.2 * overdueRatio), reasonCodes: ['retention_needs_support'] };
  }
  if (retention.state === 'supported') {
    if (targetDelay == null) {
      return { value: 0.05, reasonCodes: ['retention_fully_durable'] };
    }
    if (retention.due === true) {
      return { value: clamp01(0.5 + 0.5 * overdueRatio), reasonCodes: ['retention_probe_overdue'] };
    }
    return { value: 0.1, reasonCodes: ['retention_supported_scheduled'] };
  }
  // untested
  if (verifiedUnderstanding) {
    return { value: 0.4, reasonCodes: ['retention_untested_after_verification'] };
  }
  return { value: 0.05, reasonCodes: ['retention_untested_pre_verification'] };
}

function curriculumImportanceFactor(
  curriculum: StudyLearningCurriculumSignal | null | undefined,
): FactorReading {
  if (!curriculum || curriculum.examWeight == null) {
    return { value: NEUTRAL_UNKNOWN, reasonCodes: ['curriculum_importance_unknown'] };
  }
  const weight = clamp01(curriculum.examWeight);
  const band = weight >= 0.66 ? 'high_exam_weight' : weight >= 0.33 ? 'moderate_exam_weight' : 'low_exam_weight';
  const reasonCodes = [band];
  if (typeof curriculum.confidence === 'number' && clamp01(curriculum.confidence) < 0.5) {
    reasonCodes.push('low_confidence_curriculum_mapping');
  }
  return { value: weight, reasonCodes };
}

function evidenceConfidenceFactor(estimate: StudyMasteryEstimate): FactorReading {
  const confidence = clamp01(estimate.confidence);
  const need = clamp01(1 - confidence);
  const reason = estimate.status === 'insufficient_evidence'
    ? 'insufficient_evidence_needs_gathering'
    : estimate.status === 'provisional'
      ? 'provisional_evidence_more_useful'
      : 'established_evidence';
  return { value: need, reasonCodes: [reason] };
}

function availableTimeFitFactor(
  baseDuration: number,
  availableMinutes: number | null,
): FactorReading {
  if (availableMinutes == null) {
    return { value: NEUTRAL_UNKNOWN, reasonCodes: ['available_time_unspecified'] };
  }
  if (baseDuration <= availableMinutes) {
    return { value: 1, reasonCodes: [`fits_available_time:${baseDuration}<=${availableMinutes}`] };
  }
  return {
    value: clamp01(availableMinutes / baseDuration),
    reasonCodes: [`exceeds_available_time:${baseDuration}>${availableMinutes}`],
  };
}

function recentPracticePenaltyFactor(
  candidate: StudyLearningPriorityCandidate,
  asOf: string,
): FactorReading {
  const last = validIso(candidate.lastPracticedAt)
    ?? validIso(candidate.learnerModel.understanding.observedThrough);
  if (!last) {
    return { value: 0, reasonCodes: ['never_practiced'] };
  }
  const days = daysBetween(last, asOf);
  if (days == null || days < 0) {
    // A future or unreadable timestamp is treated as no penalty rather than a
    // negative one, and said out loud.
    return { value: 0, reasonCodes: ['practice_time_not_before_as_of'] };
  }
  const proximity = clamp01(1 - days / PRACTICE_SPACING_WINDOW_DAYS);
  const reason = proximity >= 0.999
    ? 'practiced_moments_ago'
    : proximity > 0
      ? `practiced_within_${PRACTICE_SPACING_WINDOW_DAYS}d`
      : 'practice_spacing_satisfied';
  return { value: proximity, reasonCodes: [reason] };
}

/* ─── duration, confidence, and a single candidate's scoring ─────────────── */

function baseDurationFor(candidate: StudyLearningPriorityCandidate): number {
  const override = candidate.estimatedDurationMinutes;
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return clampMinutes(override);
  }
  const move = candidate.learnerModel.nextLearningMove.type;
  return clampMinutes(BASE_DURATION_BY_MOVE[move] ?? DEFAULT_MOVE_DURATION);
}

function suggestedDurationFor(baseDuration: number, availableMinutes: number | null): number {
  if (availableMinutes == null || availableMinutes >= baseDuration) return baseDuration;
  return clampMinutes(Math.max(MIN_SESSION_MINUTES, Math.min(baseDuration, availableMinutes)));
}

function confidenceOf(estimate: StudyMasteryEstimate): {
  confidence: number;
  band: StudyLearningConfidenceBand;
  dataSufficiency: StudyLearningDataSufficiency;
} {
  const confidence = round4(clamp01(estimate.confidence));
  if (estimate.status === 'insufficient_evidence') {
    return { confidence, band: 'insufficient', dataSufficiency: 'insufficient_evidence' };
  }
  const band: StudyLearningConfidenceBand = confidence >= 0.66 ? 'high' : confidence >= 0.33 ? 'moderate' : 'low';
  return { confidence, band, dataSufficiency: 'sufficient' };
}

function scoreCandidate(
  candidate: StudyLearningPriorityCandidate,
  weights: Record<StudyLearningFactorKey, number>,
  asOf: string,
  availableMinutes: number | null,
): StudyLearningPriorityRecommendation {
  const baseDuration = baseDurationFor(candidate);

  const readings: Record<StudyLearningFactorKey, FactorReading> = {
    masteryGap: masteryGapFactor(candidate.masteryEstimate),
    prerequisiteLeverage: prerequisiteLeverageFactor(candidate),
    misconceptionSeverity: misconceptionSeverityFactor(candidate.learnerModel, candidate.masteryEstimate),
    retentionRisk: retentionRiskFactor(candidate.learnerModel, asOf),
    curriculumImportance: curriculumImportanceFactor(candidate.curriculum),
    evidenceConfidence: evidenceConfidenceFactor(candidate.masteryEstimate),
    availableTimeFit: availableTimeFitFactor(baseDuration, availableMinutes),
    recentPracticePenalty: recentPracticePenaltyFactor(candidate, asOf),
  };

  const factors: StudyLearningPriorityFactor[] = [];
  let rawScore = 0;
  for (const key of FACTOR_KEYS) {
    const direction = FACTOR_DIRECTION[key];
    const weight = weights[key];
    const value = round4(clamp01(readings[key].value));
    const contribution = round4(direction * weight * value);
    rawScore += direction * weight * value;
    factors.push({
      key,
      label: FACTOR_LABEL[key],
      value,
      direction,
      weight: round4(weight),
      contribution,
      reasonCodes: readings[key].reasonCodes,
    });
  }

  const score = round4(normaliseScore(rawScore, weights));
  const { confidence, band, dataSufficiency } = confidenceOf(candidate.masteryEstimate);

  const missingInputs: string[] = [];
  if (candidate.downstream == null) missingInputs.push('downstream_graph');
  if (!candidate.curriculum || candidate.curriculum.examWeight == null) missingInputs.push('curriculum_exam_weight');
  if (availableMinutes == null) missingInputs.push('available_minutes');
  if (
    !validIso(candidate.lastPracticedAt)
    && !validIso(candidate.learnerModel.understanding.observedThrough)
  ) {
    missingInputs.push('practice_recency');
  }

  const move = candidate.learnerModel.nextLearningMove;
  const topFactors = [...factors]
    .filter((factor) => factor.contribution > 0)
    .sort((left, right) => right.contribution - left.contribution
      || FACTOR_KEYS.indexOf(left.key) - FACTOR_KEYS.indexOf(right.key))
    .slice(0, 2)
    .map((factor) => `top_factor:${factor.key}`);

  const reasonCodes = [
    `next_move:${move.type}`,
    move.reasonCode,
    ...topFactors,
    ...(dataSufficiency === 'insufficient_evidence' ? ['insufficient_evidence'] : []),
    ...missingInputs.map((input) => `missing_input:${input}`),
  ];

  return {
    conceptId: candidate.conceptId,
    conceptKey: candidate.conceptKey ?? null,
    rank: 0,
    score,
    recommendedActionType: move.type,
    factors,
    reasonCodes,
    confidence,
    confidenceBand: band,
    dataSufficiency,
    missingInputs,
    suggestedDurationMinutes: suggestedDurationFor(baseDuration, availableMinutes),
    baseDurationMinutes: baseDuration,
    fitsAvailableTime: availableMinutes == null ? null : baseDuration <= availableMinutes,
  };
}

/* ─── deterministic total order over recommendations ─────────────────────── */

function leverageValue(recommendation: StudyLearningPriorityRecommendation): number {
  return recommendation.factors.find((factor) => factor.key === 'prerequisiteLeverage')?.value ?? 0;
}

function penaltyValue(recommendation: StudyLearningPriorityRecommendation): number {
  return recommendation.factors.find((factor) => factor.key === 'recentPracticePenalty')?.value ?? 0;
}

function orderKey(recommendation: StudyLearningPriorityRecommendation): string {
  return recommendation.conceptKey || recommendation.conceptId;
}

/**
 * A fully specified total order, so equal scores never leave ordering to input
 * position. Higher score, then higher confidence, then more downstream leverage,
 * then a less-recently-practised concept, then a lexicographic key, then id.
 */
function compareRecommendations(
  left: StudyLearningPriorityRecommendation,
  right: StudyLearningPriorityRecommendation,
): number {
  return (
    right.score - left.score
    || right.confidence - left.confidence
    || leverageValue(right) - leverageValue(left)
    || penaltyValue(left) - penaltyValue(right)
    || orderKey(left).localeCompare(orderKey(right))
    || left.conceptId.localeCompare(right.conceptId)
  );
}

/* ─── the one public entry point ─────────────────────────────────────────── */

/**
 * Rank a frontier of candidate concepts into an explainable "next best learning
 * action" ordering. Pure and deterministic: no I/O, no model call, no writes,
 * and no wall-clock read. See the module header for the honesty properties this
 * upholds.
 *
 * @throws when `asOf` is not a parseable timestamp — replay cannot proceed
 *   without a fixed reference time, and silently substituting `now` would make
 *   the result non-deterministic.
 */
export function rankStudyLearningPriorities(
  request: StudyLearningPriorityRequest,
): StudyLearningPriorityResult {
  const asOf = validIso(request?.asOf);
  if (!asOf) throw new Error('study_learning_priority_invalid_as_of');

  const weights = resolveWeights(request?.weights);
  const availableMinutes = typeof request?.availableMinutes === 'number'
    && Number.isFinite(request.availableMinutes)
    && request.availableMinutes > 0
    ? Math.round(request.availableMinutes)
    : null;

  const candidates = Array.isArray(request?.candidates) ? request.candidates : [];
  const skipped: Array<{ conceptId: string; reasonCode: string }> = [];
  const seen = new Set<string>();
  const scored: StudyLearningPriorityRecommendation[] = [];

  for (const candidate of candidates) {
    const conceptId = typeof candidate?.conceptId === 'string' ? candidate.conceptId.trim() : '';
    if (!conceptId) {
      skipped.push({ conceptId: '', reasonCode: 'missing_concept_id' });
      continue;
    }
    if (!candidate.learnerModel || !candidate.masteryEstimate) {
      skipped.push({ conceptId, reasonCode: 'missing_projection' });
      continue;
    }
    if (seen.has(conceptId)) {
      skipped.push({ conceptId, reasonCode: 'duplicate_concept' });
      continue;
    }
    seen.add(conceptId);
    scored.push(scoreCandidate({ ...candidate, conceptId }, weights, asOf, availableMinutes));
  }

  scored.sort(compareRecommendations);
  for (let index = 0; index < scored.length; index += 1) scored[index].rank = index + 1;

  const limit = typeof request?.limit === 'number' && Number.isFinite(request.limit) && request.limit >= 0
    ? Math.trunc(request.limit)
    : null;
  const recommendations = limit == null ? scored : scored.slice(0, limit);

  return {
    version: STUDY_LEARNING_PRIORITY_ENGINE_VERSION,
    asOf,
    availableMinutes,
    weights,
    recommendations,
    skipped,
  };
}

/*
 * Type-only re-exports of the canonical Study contracts this engine consumes.
 * They document, at the type level, that the Compass reuses the platform's
 * single learner truth rather than defining a competing one. They are erased at
 * runtime and add no dependency.
 */
export type { StudyLearnerModel, StudyNextLearningMove, StudyMasteryEstimate, StudyConceptEdge, StudyCurriculumMapping };
