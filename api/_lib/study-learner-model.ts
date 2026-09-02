import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import {
  assessmentConfirmsMisconceptionRepair,
  diagnoseStudyMisconception,
  type StudyMisconceptionDiagnosis,
} from './study-misconception-intelligence.js';
import type {
  StudyMisconceptionCode,
  StudyMisconceptionRemediation,
} from './study-misconception-taxonomy.js';
import type { StudyMasteryEstimate } from './study-mastery-estimator.js';
import { studyMasteryEventScore } from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_LEARNER_MODEL_VERSION = 'study-learner-model-2026-08-31.4';

export type StudyUnderstandingState = 'unverified' | 'emerging' | 'verified';
export type StudyMisconceptionState = 'none_observed' | 'signal_observed' | 'needs_confirmation';
export type StudyNextLearningMove =
  | 'independent_retrieval'
  | 'diagnose_misconception'
  | 'confirm_misconception'
  | 'guided_repair'
  | 'vary_evidence'
  | 'retention_probe'
  | 'transfer_task';

export type StudyLearnerModel = {
  version: string;
  concept: { id: string; key: string | null };
  understanding: {
    state: StudyUnderstandingState;
    evidenceCount: number;
    evidenceKinds: string[];
    observedThrough: string | null;
  };
  misconception: {
    state: StudyMisconceptionState;
    signalCount: number;
    latestSignalAt: string | null;
    code: StudyMisconceptionCode | null;
    confidence: number | null;
    reasonCodes: string[];
    remediation: StudyMisconceptionRemediation | null;
    lastResolvedCode: StudyMisconceptionCode | null;
  };
  retention: {
    state: 'untested' | 'needs_support' | 'supported';
    evidenceCount: number;
    anchorAt?: string | null;
    targetDelayDays?: number | null;
    dueAt?: string | null;
    due?: boolean;
  };
  transfer?: {
    state: 'untested' | 'needs_support' | 'supported';
    evidenceCount: number;
    latestObservedAt: string | null;
  };
  nextLearningMove: {
    type: StudyNextLearningMove;
    reasonCode: string;
    instruction: string;
    learnerFacingText: string;
  };
};

type ReplayRow = {
  score: number;
  kind: string;
  observedAt: string;
  misconceptionSignal: boolean;
};

type RetentionReplay = {
  score: number;
  observedAt: string;
  delayDays: number | null;
};

type TransferReplay = {
  score: number;
  observedAt: string;
};

export type StudyLearnerModelAccumulator = {
  evidenceCount: number;
  evidenceKinds: string[];
  observedThrough: string | null;
  latestRow: ReplayRow | null;
  misconception: {
    signalCount: number;
    latestDiagnosis: StudyMisconceptionDiagnosis | null;
    targetedCorrection: boolean;
    laterSuccess: boolean;
  };
  retention: {
    evidenceCount: number;
    latest: RetentionReplay | null;
    laterSuccessfulLearning: boolean;
    latestSuccessfulAt: string | null;
  };
  transfer: {
    evidenceCount: number;
    latest: TransferReplay | null;
    laterRepair: boolean;
  };
};

function validDate(value: unknown): string | null {
  const text = typeof value === 'string' ? value : '';
  const millis = Date.parse(text);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

export function createStudyLearnerModelAccumulator(): StudyLearnerModelAccumulator {
  return {
    evidenceCount: 0,
    evidenceKinds: [],
    observedThrough: null,
    latestRow: null,
    misconception: {
      signalCount: 0,
      latestDiagnosis: null,
      targetedCorrection: false,
      laterSuccess: false,
    },
    retention: {
      evidenceCount: 0,
      latest: null,
      laterSuccessfulLearning: false,
      latestSuccessfulAt: null,
    },
    transfer: {
      evidenceCount: 0,
      latest: null,
      laterRepair: false,
    },
  };
}

/** Append one already-admitted event in chronological observation order. */
export function appendStudyLearnerModelAccumulator(
  current: StudyLearnerModelAccumulator,
  event: StudyMasteryEvidenceEvent,
): StudyLearnerModelAccumulator {
  const observedAt = validDate(event.observedAt);
  const score = studyMasteryEventScore(event);
  if (!observedAt || score === null) return current;

  const kinds = new Set(current.evidenceKinds);
  kinds.add(event.kind);
  const next: StudyLearnerModelAccumulator = {
    evidenceCount: current.evidenceCount + 1,
    evidenceKinds: [...kinds].sort(),
    observedThrough: observedAt,
    latestRow: {
      score,
      kind: event.kind,
      observedAt,
      misconceptionSignal: event.misconceptionSignal === true,
    },
    misconception: { ...current.misconception },
    retention: { ...current.retention },
    transfer: { ...current.transfer },
  };

  const diagnosis = diagnoseStudyMisconception(event);
  if (diagnosis) {
    next.misconception = {
      signalCount: current.misconception.signalCount + 1,
      latestDiagnosis: diagnosis,
      targetedCorrection: false,
      laterSuccess: false,
    };
  } else if (current.misconception.latestDiagnosis
    && Date.parse(observedAt) > Date.parse(current.misconception.latestDiagnosis.observedAt)) {
    const code = current.misconception.latestDiagnosis.code;
    next.misconception.targetedCorrection = current.misconception.targetedCorrection
      || (score >= 0.75 && assessmentConfirmsMisconceptionRepair(event, code));
    next.misconception.laterSuccess = current.misconception.laterSuccess
      || (score >= 0.75 && !event.misconceptionSignal);
  }

  if (event.kind === 'retention_probe') {
    next.retention = {
      evidenceCount: current.retention.evidenceCount + 1,
      latest: {
        score,
        observedAt,
        delayDays: typeof event.delayDays === 'number' ? event.delayDays : null,
      },
      laterSuccessfulLearning: false,
      latestSuccessfulAt: score >= 0.75 ? observedAt : current.retention.latestSuccessfulAt,
    };
  } else {
    next.retention.laterSuccessfulLearning = current.retention.laterSuccessfulLearning
      || Boolean(current.retention.latest && score >= 0.75
        && Date.parse(observedAt) > Date.parse(current.retention.latest.observedAt));
    if (score >= 0.75) next.retention.latestSuccessfulAt = observedAt;
  }

  if (event.kind === 'transfer') {
    next.transfer = {
      evidenceCount: current.transfer.evidenceCount + 1,
      latest: { score, observedAt },
      laterRepair: false,
    };
  } else if (current.transfer.latest
    && current.transfer.latest.score < 0.75
    && score >= 0.75
    && Date.parse(observedAt) > Date.parse(current.transfer.latest.observedAt)) {
    next.transfer.laterRepair = true;
  }

  return next;
}

function misconceptionProjection(state: StudyLearnerModelAccumulator): StudyLearnerModel['misconception'] {
  const latest = state.misconception.latestDiagnosis;
  if (!latest) {
    return {
      state: 'none_observed',
      signalCount: 0,
      latestSignalAt: null,
      code: null,
      confidence: null,
      reasonCodes: [],
      remediation: null,
      lastResolvedCode: null,
    };
  }
  if (state.misconception.targetedCorrection) {
    return {
      state: 'none_observed',
      signalCount: state.misconception.signalCount,
      latestSignalAt: latest.observedAt,
      code: null,
      confidence: null,
      reasonCodes: ['targeted_independent_correction'],
      remediation: null,
      lastResolvedCode: latest.code,
    };
  }
  const status: StudyMisconceptionState = state.misconception.laterSuccess
    ? 'needs_confirmation'
    : 'signal_observed';
  return {
    state: status,
    signalCount: state.misconception.signalCount,
    latestSignalAt: latest.observedAt,
    code: latest.code,
    confidence: latest.confidence,
    reasonCodes: latest.reasonCodes,
    remediation: latest.remediation,
    lastResolvedCode: null,
  };
}

function addDays(iso: string | null, days: number | null): string | null {
  if (!iso || days == null) return null;
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis + days * 86_400_000).toISOString();
}

function retentionProjection(state: StudyLearnerModelAccumulator, asOf: string) {
  const latestRetention = state.retention.latest;
  const effectiveRetention = state.retention.laterSuccessfulLearning ? null : latestRetention;
  let retentionState: 'untested' | 'needs_support' | 'supported' = 'untested';
  let targetDelayDays: number | null = 1;
  let anchorAt = state.retention.latestSuccessfulAt;

  if (effectiveRetention) {
    if (effectiveRetention.score >= 0.75) {
      retentionState = 'supported';
      const observedDelay = effectiveRetention.delayDays ?? 1;
      targetDelayDays = observedDelay >= 30 ? null : observedDelay >= 7 ? 30 : 7;
      anchorAt = effectiveRetention.observedAt;
    } else {
      retentionState = 'needs_support';
      targetDelayDays = 1;
    }
  }

  const dueAt = addDays(anchorAt, targetDelayDays);
  const asOfMillis = Date.parse(asOf);
  const dueAtMillis = dueAt ? Date.parse(dueAt) : Number.NaN;
  const due = targetDelayDays !== null
    && Number.isFinite(asOfMillis)
    && Number.isFinite(dueAtMillis)
    && asOfMillis >= dueAtMillis;

  return {
    state: retentionState,
    evidenceCount: state.retention.evidenceCount,
    anchorAt,
    targetDelayDays,
    dueAt,
    due,
  };
}

function transferProjection(state: StudyLearnerModelAccumulator) {
  const latest = state.transfer.latest;
  if (!latest) {
    return { state: 'untested' as const, evidenceCount: 0, latestObservedAt: null };
  }
  if (state.transfer.laterRepair) {
    return {
      state: 'untested' as const,
      evidenceCount: state.transfer.evidenceCount,
      latestObservedAt: latest.observedAt,
    };
  }
  return {
    state: latest.score >= 0.75 ? 'supported' as const : 'needs_support' as const,
    evidenceCount: state.transfer.evidenceCount,
    latestObservedAt: latest.observedAt,
  };
}

function retentionInstruction(retention: ReturnType<typeof retentionProjection>): StudyLearnerModel['nextLearningMove'] {
  const target = retention.targetDelayDays || 1;
  if (retention.due === false && retention.dueAt) {
    return {
      type: 'retention_probe',
      reasonCode: `retention_probe_scheduled:${target}d`,
      instruction: `Do not administer the retention probe yet. Schedule a fresh no-hint reviewed check for ${retention.dueAt}; delayed evidence must remain genuinely delayed.`,
      learnerFacingText: `Next retention check: ${retention.dueAt}.`,
    };
  }
  return {
    type: 'retention_probe',
    reasonCode: retention.state === 'needs_support'
      ? 'retention_needs_support'
      : `retention_probe_due:${target}d`,
    instruction: `Use one fresh independent reviewed item as a no-hint retention probe after at least ${target} delayed day${target === 1 ? '' : 's'}.`,
    learnerFacingText: 'Next: try a delayed no-hint check.',
  };
}

function chooseNextMove(input: {
  state: StudyLearnerModelAccumulator;
  estimate: StudyMasteryEstimate;
  misconception: StudyLearnerModel['misconception'];
  retention: ReturnType<typeof retentionProjection>;
  transfer: ReturnType<typeof transferProjection>;
}): StudyLearnerModel['nextLearningMove'] {
  const { state, estimate, misconception, retention, transfer } = input;
  if (!state.evidenceCount) {
    return { type: 'independent_retrieval', reasonCode: 'no_verified_evidence', instruction: 'Ask for one independent answer without hints before adapting the lesson.', learnerFacingText: 'Next: try one independent answer without hints.' };
  }
  if (misconception.state === 'signal_observed' && misconception.code && misconception.remediation) {
    return {
      type: 'diagnose_misconception',
      reasonCode: `active_misconception:${misconception.code}`,
      instruction: misconception.remediation.instruction,
      learnerFacingText: misconception.remediation.learnerFacingText,
    };
  }
  if (misconception.state === 'needs_confirmation' && misconception.code) {
    return {
      type: 'confirm_misconception',
      reasonCode: `misconception_confirmation_needed:${misconception.code}`,
      instruction: `Use a fresh independent reviewed item that explicitly tests ${misconception.code}; do not treat unrelated correctness as repair evidence.`,
      learnerFacingText: 'Next: try one fresh check that targets the same earlier mistake.',
    };
  }
  const latest = state.latestRow;
  if (latest && latest.score < 0.75) {
    return { type: 'guided_repair', reasonCode: 'latest_verified_attempt_incorrect', instruction: 'Repair the first material error with the smallest prerequisite step, then retry with a new item.', learnerFacingText: 'Next: repair the first error, then try a changed example.' };
  }
  if (estimate.status !== 'established' || state.evidenceCount < 4 || state.evidenceKinds.length < 2) {
    return { type: 'vary_evidence', reasonCode: 'diverse_evidence_incomplete', instruction: 'Collect a different independent governed evidence kind, preferably retrieval or application, instead of repeating the same item.', learnerFacingText: 'Next: show the idea in a different governed way—retrieval or application.' };
  }
  if (retention.targetDelayDays !== null && retention.due) {
    return retentionInstruction(retention);
  }
  if (transfer.state !== 'supported') {
    return {
      type: 'transfer_task',
      reasonCode: transfer.state === 'needs_support' ? 'transfer_needs_support' : 'transfer_untested',
      instruction: 'Use a governed novel-context transfer item reached through a canonical supports_transfer_to edge. Do not count generic target-concept correctness as transfer.',
      learnerFacingText: 'Next: try the idea in a genuinely new context.',
    };
  }
  if (retention.targetDelayDays !== null) return retentionInstruction(retention);
  return {
    type: 'transfer_task',
    reasonCode: 'retention_and_transfer_supported',
    instruction: 'Durability and one governed transfer are supported. Use another genuinely novel governed transfer only if it adds independent evidence; otherwise advance the learning plan.',
    learnerFacingText: 'Next: stretch the idea only with a genuinely new application.',
  };
}

export function buildStudyLearnerModelFromAccumulator(input: {
  conceptId: string;
  conceptKey?: string | null;
  state: StudyLearnerModelAccumulator;
  estimate: StudyMasteryEstimate;
  asOf?: string;
}): StudyLearnerModel {
  const misconception = misconceptionProjection(input.state);
  const asOf = validDate(input.asOf) || new Date().toISOString();
  const retention = retentionProjection(input.state, asOf);
  const transfer = transferProjection(input.state);
  const verified = input.estimate.status === 'established' && misconception.state === 'none_observed';
  const understanding: StudyUnderstandingState = verified ? 'verified' : input.state.evidenceCount ? 'emerging' : 'unverified';

  return {
    version: STUDY_LEARNER_MODEL_VERSION,
    concept: { id: String(input.conceptId || ''), key: input.conceptKey || null },
    understanding: {
      state: understanding,
      evidenceCount: input.state.evidenceCount,
      evidenceKinds: input.state.evidenceKinds,
      observedThrough: input.state.observedThrough,
    },
    misconception,
    retention,
    transfer,
    nextLearningMove: chooseNextMove({ state: input.state, estimate: input.estimate, misconception, retention, transfer }),
  };
}

/** Evidence-backed, read-only projection over the single admitted evidence set. */
export function buildStudyLearnerModel(input: {
  conceptId: string;
  conceptKey?: string | null;
  evidence?: StudyMasteryEvidenceEvent[] | null;
  estimate: StudyMasteryEstimate;
  asOf?: string;
}): StudyLearnerModel {
  let state = createStudyLearnerModelAccumulator();
  for (const event of admittedStudyMasteryEvidence(input.evidence || [])) {
    state = appendStudyLearnerModelAccumulator(state, event);
  }
  return buildStudyLearnerModelFromAccumulator({
    conceptId: input.conceptId,
    conceptKey: input.conceptKey,
    state,
    estimate: input.estimate,
    asOf: input.asOf,
  });
}
