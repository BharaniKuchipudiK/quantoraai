import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_EVIDENCE_ADMISSION_VERSION = 'study-evidence-admission-2026-08-31.6';

const VERIFIED_KINDS = new Set<StudyEvidenceKind>([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'teach_back',
  'retention_probe',
  'misconception_probe',
]);

const ASSESSMENT_BACKED_KINDS = new Set<StudyEvidenceKind>([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'retention_probe',
  'misconception_probe',
]);

const ATTEMPT_REF = /^attempt:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_REF = /^[a-z0-9][a-z0-9._:-]*@[a-z0-9][a-z0-9._:-]*$/i;
const REVIEWED_ASSESSMENT_ATTESTED = Symbol('study-reviewed-assessment-attested');
const ATTESTED_RECEIPTS = new WeakMap<object, StudyAssessmentAttemptReceipt>();

type AttestedStudyEvidence = StudyMasteryEvidenceEvent & {
  [REVIEWED_ASSESSMENT_ATTESTED]?: true;
};

export type StudyAssessmentAttemptReceipt = {
  attemptId: string;
  /** Concept whose learner state receives this evidence. */
  conceptId: string;
  conceptKey: string;
  itemKey: string;
  itemVersion: string;
  submittedOptionId: string;
  correct: boolean;
  score: number;
  submittedAt: string;
  /** V7 fields are optional so pre-migration assessment receipts stay valid. */
  evidenceKind?: StudyEvidenceKind;
  evidenceConceptId?: string | null;
  itemConceptId?: string | null;
  itemConceptKey?: string | null;
  retentionAnchorAt?: string | null;
  delayDays?: number | null;
};

export type StudyEvidenceAdmission = {
  admitted: boolean;
  reasonCode: string;
};

function hasScore(event: StudyMasteryEvidenceEvent): boolean {
  return (typeof event.score === 'number' && Number.isFinite(event.score))
    || typeof event.correct === 'boolean';
}

function hasValidObservation(event: StudyMasteryEvidenceEvent): boolean {
  return typeof event.observedAt === 'string' && Number.isFinite(Date.parse(event.observedAt));
}

function sameInstant(left: unknown, right: unknown): boolean {
  const a = typeof left === 'string' ? Date.parse(left) : Number.NaN;
  const b = typeof right === 'string' ? Date.parse(right) : Number.NaN;
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function receiptKind(receipt: StudyAssessmentAttemptReceipt): StudyEvidenceKind {
  return receipt.evidenceKind || 'assessment_item';
}

/**
 * Brand one assessment-backed event only after the server has read the
 * authoritative submitted attempt. Raw ledger strings cannot manufacture this
 * module-private attestation marker. V7 extends the same trust boundary to
 * retrieval/application/retention/transfer without creating another store.
 */
export function attestStudyAssessmentEvidence(
  event: StudyMasteryEvidenceEvent,
  receipt: StudyAssessmentAttemptReceipt,
): StudyMasteryEvidenceEvent {
  const kind = receiptKind(receipt);
  if (!event || event.kind !== kind || !ASSESSMENT_BACKED_KINDS.has(kind)) return event;

  const item = findStudyAssessmentItem(receipt.itemKey, receipt.itemVersion);
  const itemConceptKey = receipt.itemConceptKey || receipt.conceptKey;
  if (!item || item.conceptKey !== itemConceptKey) return event;
  const release = verifyStudyAssessmentRelease(item);
  if (!release.canIssueVerifiedAttempt) return event;
  if (!item.options.some((option) => option.id === receipt.submittedOptionId)) return event;

  const optionCorrect = receipt.submittedOptionId === item.correctOptionId;
  if (receipt.correct !== optionCorrect || receipt.score !== (optionCorrect ? 1 : 0)) return event;

  const evidenceConceptId = receipt.evidenceConceptId || receipt.conceptId;
  const expectedItemRef = `${receipt.itemKey}@${receipt.itemVersion}`;
  const diagnosisEligible = kind !== 'retention_probe' && kind !== 'transfer';
  const expectedMisconception = diagnosisEligible
    && !optionCorrect
    && item.misconceptionOptionIds.includes(receipt.submittedOptionId);

  if (kind === 'transfer') {
    if (!receipt.itemConceptId || receipt.itemConceptId === evidenceConceptId) return event;
  }

  if (kind === 'retention_probe') {
    const anchor = typeof receipt.retentionAnchorAt === 'string' ? Date.parse(receipt.retentionAnchorAt) : Number.NaN;
    const observed = Date.parse(receipt.submittedAt);
    if (!Number.isFinite(anchor)
      || !Number.isFinite(observed)
      || observed <= anchor
      || typeof receipt.delayDays !== 'number'
      || !Number.isInteger(receipt.delayDays)
      || receipt.delayDays < 1
      || event.delayDays !== receipt.delayDays) {
      return event;
    }
  }

  if (event.conceptId !== evidenceConceptId
    || event.id !== `study.assessment.${receipt.attemptId}`
    || event.assessmentRef !== `attempt:${receipt.attemptId}`
    || event.itemRef !== expectedItemRef
    || release.itemRef !== expectedItemRef
    || event.correct !== receipt.correct
    || event.misconceptionSignal !== expectedMisconception
    || typeof event.score !== 'number'
    || !Number.isFinite(event.score)
    || event.score !== receipt.score
    || !sameInstant(event.observedAt, receipt.submittedAt)) {
    return event;
  }

  Object.defineProperty(event as AttestedStudyEvidence, REVIEWED_ASSESSMENT_ATTESTED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  ATTESTED_RECEIPTS.set(event, { ...receipt, evidenceKind: kind, evidenceConceptId });
  return event;
}

/**
 * Return the authoritative submitted-attempt receipt only for evidence that
 * passed the private admission boundary. This is intentionally not serialized
 * into the learner ledger or browser payload.
 */
export function studyAssessmentReceiptForAttestedEvidence(
  event: StudyMasteryEvidenceEvent,
): StudyAssessmentAttemptReceipt | null {
  if ((event as AttestedStudyEvidence)?.[REVIEWED_ASSESSMENT_ATTESTED] !== true) return null;
  const receipt = ATTESTED_RECEIPTS.get(event);
  return receipt ? { ...receipt } : null;
}

function reviewedAssessmentBackedEvidence(event: StudyMasteryEvidenceEvent): boolean {
  if ((event as AttestedStudyEvidence)[REVIEWED_ASSESSMENT_ATTESTED] !== true
    || event.provenance !== 'quantora_authored'
    || event.sourceRef !== 'quantora:study-assessment-bank'
    || typeof event.assessmentRef !== 'string'
    || !ATTEMPT_REF.test(event.assessmentRef)
    || typeof event.itemRef !== 'string'
    || !ITEM_REF.test(event.itemRef)) {
    return false;
  }

  const receipt = ATTESTED_RECEIPTS.get(event);
  if (!receipt || receiptKind(receipt) !== event.kind) return false;
  const separator = event.itemRef.lastIndexOf('@');
  const key = event.itemRef.slice(0, separator);
  const version = event.itemRef.slice(separator + 1);
  const item = findStudyAssessmentItem(key, version);
  if (!item) return false;
  const release = verifyStudyAssessmentRelease(item);
  return release.canIssueVerifiedAttempt && release.itemRef === event.itemRef;
}

/** Decide whether one persisted Study event is allowed to influence mastery. */
export function evaluateStudyEvidenceAdmission(event: StudyMasteryEvidenceEvent): StudyEvidenceAdmission {
  if (!event || !VERIFIED_KINDS.has(event.kind)) {
    return { admitted: false, reasonCode: 'unverified_evidence_kind' };
  }
  if (event.independent !== true) {
    return { admitted: false, reasonCode: 'independent_evidence_required' };
  }
  if (!hasValidObservation(event)) {
    return { admitted: false, reasonCode: 'invalid_observation_time' };
  }
  if (!hasScore(event)) {
    return { admitted: false, reasonCode: 'scored_evidence_required' };
  }

  if (ASSESSMENT_BACKED_KINDS.has(event.kind)) {
    if (!reviewedAssessmentBackedEvidence(event)) {
      return {
        admitted: false,
        reasonCode: event.kind === 'assessment_item'
          ? 'authoritative_assessment_receipt_required'
          : 'verified_observation_receipt_required',
      };
    }
    const reasonCode = event.kind === 'assessment_item'
      ? 'reviewed_assessment_evidence'
      : `reviewed_assessment_backed_${event.kind}`;
    return { admitted: true, reasonCode };
  }

  // Teach-back remains fail-closed until it has its own deterministic verifier.
  return { admitted: false, reasonCode: 'verified_observation_receipt_required' };
}

/**
 * One canonical evidence set for both mastery estimation and learner-state
 * projection. Rows are chronological and one reviewed item/version can
 * contribute independent evidence only once, regardless of evidence label.
 */
export function admittedStudyMasteryEvidence(
  events: StudyMasteryEvidenceEvent[] | null | undefined,
): StudyMasteryEvidenceEvent[] {
  const chronological = [...(Array.isArray(events) ? events : [])]
    .filter((event) => evaluateStudyEvidenceAdmission(event).admitted)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  const seenAssessmentItems = new Set<string>();
  return chronological.filter((event) => {
    const receipt = studyAssessmentReceiptForAttestedEvidence(event);
    if (!receipt || !event.itemRef) return true;
    if (seenAssessmentItems.has(event.itemRef)) return false;
    seenAssessmentItems.add(event.itemRef);
    return true;
  });
}
