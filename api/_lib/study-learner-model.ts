import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import {
  assessmentConfirmsMisconceptionRepair,
  diagnoseStudyMisconception,
} from './study-misconception-intelligence.js';
import type {
  StudyMisconceptionCode,
  StudyMisconceptionRemediation,
} from './study-misconception-taxonomy.js';
import type { StudyMasteryEstimate } from './study-mastery-estimator.js';
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
    /** V7 schedule fields are optional for compatibility with older fixtures. */
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

function eventScore(event: StudyMasteryEvidenceEvent): number | null {
  if (typeof event.score === 'number' && Number.isFinite(event.score)) return Math.max(0, Math.min(1, event.score));
  if (typeof event.correct === 'boolean') return event.correct ? 1 : 0;
  return null;
}

function validDate(value: unknown): string | null {
  const text = typeof value === 'string' ? value : '';
  const millis = Date.parse(text);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function verifiedRows(events: StudyMasteryEvidenceEvent[]) {
  return admittedStudyMasteryEvidence(events)
    .map((event) => ({ event, score: eventScore(event), observedAt: validDate(event.observedAt) }))
    .filter((row): row is { event: StudyMasteryEvidenceEvent; score: number; observedAt: string } => row.score !== null && row.observedAt !== null);
}

function misconceptionProjection(rows: ReturnType<typeof verifiedRows>): StudyLearnerModel['misconception'] {
  const diagnosed = rows
    .map((row) => ({ row, diagnosis: diagnoseStudyMisconception(row.event) }))
    .filter((entry): entry is { row: (typeof rows)[number]; diagnosis: NonNullable<ReturnType<typeof diagnoseStudyMisconception>> } => entry.diagnosis !== null);
  const latest = diagnosed[diagnosed.length - 1] || null;
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

  const laterRows = rows.filter((row) => Date.parse(row.observedAt) > Date.parse(latest.row.observedAt));
  const targetedCorrection = laterRows.some((row) =>
    row.score >= 0.75 && assessmentConfirmsMisconceptionRepair(row.event, latest.diagnosis.code));
  if (targetedCorrection) {
    return {
      state: 'none_observed',
      signalCount: diagnosed.length,
      latestSignalAt: latest.row.observedAt,
      code: null,
      confidence: null,
      reasonCodes: ['targeted_independent_correction'],
      remediation: null,
      lastResolvedCode: latest.diagnosis.code,
    };
  }

  const laterSuccess = laterRows.some((row) => row.score >= 0.75 && !row.event.misconceptionSignal);
  const state: StudyMisconceptionState = laterSuccess ? 'needs_confirmation' : 'signal_observed';
  return {
    state,
    signalCount: diagnosed.length,
    latestSignalAt: latest.row.observedAt,
    code: latest.diagnosis.code,
    confidence: latest.diagnosis.confidence,
    reasonCodes: latest.diagnosis.reasonCodes,
    remediation: latest.diagnosis.remediation,
    lastResolvedCode: null,
  };
}

function addDays(iso: string | null, days: number | null): string | null {
  if (!iso || days == null) return null;
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis + days * 86_400_000).toISOString();
}

function retentionProjection(rows: ReturnType<typeof verifiedRows>, asOf: string) {
  const retentionRows = rows.filter((row) => row.event.kind === 'retention_probe');
  const latestRetention = retentionRows[retentionRows.length - 1] || null;
  const laterSuccessfulLearning = latestRetention
    ? rows.some((row) => row.event.kind !== 'retention_probe'
      && row.score >= 0.75
      && Date.parse(row.observedAt) > Date.parse(latestRetention.observedAt))
    : false;
  const effectiveRetention = laterSuccessfulLearning ? null : latestRetention;
  const successfulRows = rows.filter((row) => row.score >= 0.75);
  const latestSuccessful = successfulRows[successfulRows.length - 1] || null;

  let state: 'untested' | 'needs_support' | 'supported' = 'untested';
  let targetDelayDays: number | null = 1;
  let anchorAt = latestSuccessful?.observedAt || null;

  if (effectiveRetention) {
    if (effectiveRetention.score >= 0.75) {
      state = 'supported';
      const observedDelay = typeof effectiveRetention.event.delayDays === 'number'
        ? effectiveRetention.event.delayDays
        : 1;
      targetDelayDays = observedDelay >= 30 ? null : observedDelay >= 7 ? 30 : 7;
      anchorAt = effectiveRetention.observedAt;
    } else {
      state = 'needs_support';
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
    state,
    evidenceCount: retentionRows.length,
    anchorAt,
    targetDelayDays,
    dueAt,
    due,
  };
}

function transferProjection(rows: ReturnType<typeof verifiedRows>) {
  const transferRows = rows.filter((row) => row.event.kind === 'transfer');
  const latest = transferRows[transferRows.length - 1] || null;
  if (!latest) {
    return { state: 'untested' as const, evidenceCount: 0, latestObservedAt: null };
  }
  const laterRepair = latest.score < 0.75 && rows.some((row) =>
    row.event.kind !== 'transfer'
    && row.score >= 0.75
    && Date.parse(row.observedAt) > Date.parse(latest.observedAt));
  if (laterRepair) {
    return { state: 'untested' as const, evidenceCount: transferRows.length, latestObservedAt: latest.observedAt };
  }
  return {
    state: latest.score >= 0.75 ? 'supported' as const : 'needs_support' as const,
    evidenceCount: transferRows.length,
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
  rows: ReturnType<typeof verifiedRows>;
  estimate: StudyMasteryEstimate;
  misconception: StudyLearnerModel['misconception'];
  retention: ReturnType<typeof retentionProjection>;
  transfer: ReturnType<typeof transferProjection>;
}): StudyLearnerModel['nextLearningMove'] {
  const { rows, estimate, misconception, retention, transfer } = input;
  if (!rows.length) {
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
  const latest = rows[rows.length - 1];
  if (latest.score < 0.75) {
    return { type: 'guided_repair', reasonCode: 'latest_verified_attempt_incorrect', instruction: 'Repair the first material error with the smallest prerequisite step, then retry with a new item.', learnerFacingText: 'Next: repair the first error, then try a changed example.' };
  }
  const kinds = new Set(rows.map((row) => row.event.kind));
  if (estimate.status !== 'established' || rows.length < 4 || kinds.size < 2) {
    return { type: 'vary_evidence', reasonCode: 'diverse_evidence_incomplete', instruction: 'Collect a different independent governed evidence kind, preferably retrieval or application, instead of repeating the same item.', learnerFacingText: 'Next: show the idea in a different governed way—retrieval or application.' };
  }

  // A retention deadline that is actually due outranks transfer. While waiting
  // for the clock, transfer can proceed instead of manufacturing immediate
  // "retention" evidence.
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
  if (retention.targetDelayDays !== null) {
    return retentionInstruction(retention);
  }
  return {
    type: 'transfer_task',
    reasonCode: 'retention_and_transfer_supported',
    instruction: 'Durability and one governed transfer are supported. Use another genuinely novel governed transfer only if it adds independent evidence; otherwise advance the learning plan.',
    learnerFacingText: 'Next: stretch the idea only with a genuinely new application.',
  };
}

/** Evidence-backed, read-only projection over the single admitted evidence set. */
export function buildStudyLearnerModel(input: {
  conceptId: string;
  conceptKey?: string | null;
  evidence?: StudyMasteryEvidenceEvent[] | null;
  estimate: StudyMasteryEstimate;
  /** Injectable clock keeps retention scheduling deterministic in tests/replay. */
  asOf?: string;
}): StudyLearnerModel {
  const rows = verifiedRows(input.evidence || []);
  const misconception = misconceptionProjection(rows);
  const asOf = validDate(input.asOf) || new Date().toISOString();
  const retention = retentionProjection(rows, asOf);
  const transfer = transferProjection(rows);
  const evidenceKinds = [...new Set(rows.map((row) => row.event.kind))].sort();
  const verified = input.estimate.status === 'established' && misconception.state === 'none_observed';
  const understanding: StudyUnderstandingState = verified ? 'verified' : rows.length ? 'emerging' : 'unverified';

  return {
    version: STUDY_LEARNER_MODEL_VERSION,
    concept: { id: String(input.conceptId || ''), key: input.conceptKey || null },
    understanding: {
      state: understanding,
      evidenceCount: rows.length,
      evidenceKinds,
      observedThrough: rows[rows.length - 1]?.observedAt || null,
    },
    misconception,
    retention,
    transfer,
    nextLearningMove: chooseNextMove({ rows, estimate: input.estimate, misconception, retention, transfer }),
  };
}
