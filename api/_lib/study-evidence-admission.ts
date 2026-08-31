import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_EVIDENCE_ADMISSION_VERSION = 'study-evidence-admission-2026-08-31.4';

const VERIFIED_KINDS = new Set<StudyEvidenceKind>([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'teach_back',
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
  conceptId: string;
  conceptKey: string;
  itemKey: string;
  itemVersion: string;
  submittedOptionId: string;
  correct: boolean;
  score: number;
  submittedAt: string;
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

/**
 * Brand one assessment event only after the server has read the authoritative
 * submitted attempt for the same learner/concept. Raw ledger strings cannot
 * manufacture this module-private attestation marker.
 */
export function attestStudyAssessmentEvidence(
  event: StudyMasteryEvidenceEvent,
  receipt: StudyAssessmentAttemptReceipt,
): StudyMasteryEvidenceEvent {
  if (event?.kind !== 'assessment_item') return event;
  const item = findStudyAssessmentItem(receipt.itemKey, receipt.itemVersion);
  if (!item || item.conceptKey !== receipt.conceptKey) return event;
  const release = verifyStudyAssessmentRelease(item);
  if (!release.canIssueVerifiedAttempt) return event;
  if (!item.options.some((option) => option.id === receipt.submittedOptionId)) return event;

  const expectedItemRef = `${receipt.itemKey}@${receipt.itemVersion}`;
  const expectedMisconception = receipt.correct === false
    && item.misconceptionOptionIds.includes(receipt.submittedOptionId);
  if (event.conceptId !== receipt.conceptId
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
  ATTESTED_RECEIPTS.set(event, { ...receipt });
  return event;
}

/**
 * Return the authoritative submitted-attempt receipt only for evidence that
 * passed the private V4/V5 attestation boundary. This is intentionally not
 * serialized into the learner ledger or browser payload.
 */
export function studyAssessmentReceiptForAttestedEvidence(
  event: StudyMasteryEvidenceEvent,
): StudyAssessmentAttemptReceipt | null {
  if ((event as AttestedStudyEvidence)?.[REVIEWED_ASSESSMENT_ATTESTED] !== true) return null;
  const receipt = ATTESTED_RECEIPTS.get(event);
  return receipt ? { ...receipt } : null;
}

function reviewedAssessmentEvidence(event: StudyMasteryEvidenceEvent): boolean {
  if ((event as AttestedStudyEvidence)[REVIEWED_ASSESSMENT_ATTESTED] !== true
    || event.provenance !== 'quantora_authored'
    || event.sourceRef !== 'quantora:study-assessment-bank'
    || typeof event.assessmentRef !== 'string'
    || !ATTEMPT_REF.test(event.assessmentRef)
    || typeof event.itemRef !== 'string'
    || !ITEM_REF.test(event.itemRef)) {
    return false;
  }

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
  if (event.kind === 'assessment_item') {
    return reviewedAssessmentEvidence(event)
      ? { admitted: true, reasonCode: 'reviewed_assessment_evidence' }
      : { admitted: false, reasonCode: 'authoritative_assessment_receipt_required' };
  }

  // Still fail-closed: V5 diagnoses reviewed assessment evidence only.
  return { admitted: false, reasonCode: 'verified_observation_receipt_required' };
}

/**
 * One canonical evidence set for both mastery estimation and learner-state
 * projection. Rows are chronological and repeated assessment-item versions
 * contribute at most their first independent observation.
 */
export function admittedStudyMasteryEvidence(
  events: StudyMasteryEvidenceEvent[] | null | undefined,
): StudyMasteryEvidenceEvent[] {
  const chronological = [...(Array.isArray(events) ? events : [])]
    .filter((event) => evaluateStudyEvidenceAdmission(event).admitted)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  const seenAssessmentItems = new Set<string>();
  return chronological.filter((event) => {
    if (event.kind !== 'assessment_item' || !event.itemRef) return true;
    if (seenAssessmentItems.has(event.itemRef)) return false;
    seenAssessmentItems.add(event.itemRef);
    return true;
  });
}
