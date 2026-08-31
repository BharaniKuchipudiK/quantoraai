import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_EVIDENCE_ADMISSION_VERSION = 'study-evidence-admission-2026-08-31.2';

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

function reviewedAssessmentEvidence(event: StudyMasteryEvidenceEvent): boolean {
  if (event.provenance !== 'quantora_authored'
    || event.sourceRef !== 'quantora:study-assessment-bank'
    || typeof event.assessmentRef !== 'string'
    || !ATTEMPT_REF.test(event.assessmentRef)
    || typeof event.itemRef !== 'string'
    || !ITEM_REF.test(event.itemRef)) {
    return false;
  }

  const attemptId = event.assessmentRef.slice('attempt:'.length);
  if (event.id !== `study.assessment.${attemptId}`) return false;

  const separator = event.itemRef.lastIndexOf('@');
  const key = event.itemRef.slice(0, separator);
  const version = event.itemRef.slice(separator + 1);
  const item = findStudyAssessmentItem(key, version);
  if (!item) return false;

  const release = verifyStudyAssessmentRelease(item);
  return release.canIssueVerifiedAttempt && release.itemRef === event.itemRef;
}

/**
 * Non-assessment evidence is deliberately fail-closed until its server-side
 * writer attaches an explicit verified-source receipt. The prefix is a storage
 * contract, not a client capability: browsers never write mastery evidence.
 */
function governedObservationEvidence(event: StudyMasteryEvidenceEvent): boolean {
  if (event.provenance !== 'quantora_authored' || typeof event.sourceRef !== 'string') return false;
  const prefix = `quantora:study-verified:${event.kind}:`;
  return event.sourceRef.startsWith(prefix) && event.sourceRef.length > prefix.length;
}

/**
 * Decide whether one persisted Study event is allowed to influence mastery.
 * Event kind alone is never a trust signal.
 */
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
      : { admitted: false, reasonCode: 'reviewed_assessment_provenance_required' };
  }
  return governedObservationEvidence(event)
    ? { admitted: true, reasonCode: 'governed_verified_observation' }
    : { admitted: false, reasonCode: 'verified_observation_receipt_required' };
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
