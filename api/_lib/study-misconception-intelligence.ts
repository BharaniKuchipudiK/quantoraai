import { studyAssessmentReceiptForAttestedEvidence } from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import {
  isStudyMisconceptionCode,
  studyMisconceptionRemediation,
  type StudyMisconceptionCode,
  type StudyMisconceptionRemediation,
} from './study-misconception-taxonomy.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_MISCONCEPTION_INTELLIGENCE_VERSION = 'study-misconception-intelligence-2026-08-31.1';

export type StudyMisconceptionDiagnosis = {
  code: StudyMisconceptionCode;
  confidence: number;
  reasonCodes: string[];
  itemRef: string;
  optionId: string;
  observedAt: string;
  remediation: StudyMisconceptionRemediation;
};

function itemFor(event: StudyMasteryEvidenceEvent) {
  const receipt = studyAssessmentReceiptForAttestedEvidence(event);
  if (!receipt) return null;
  const item = findStudyAssessmentItem(receipt.itemKey, receipt.itemVersion);
  return item ? { item, receipt } : null;
}

/**
 * Diagnose only from an authoritative submitted option plus reviewed distractor
 * metadata. A free-form model explanation is never accepted as diagnosis proof.
 */
export function diagnoseStudyMisconception(
  event: StudyMasteryEvidenceEvent,
): StudyMisconceptionDiagnosis | null {
  const resolved = itemFor(event);
  if (!resolved || resolved.receipt.correct !== false) return null;
  const rawCode = resolved.item.misconceptionByOptionId[resolved.receipt.submittedOptionId];
  if (!isStudyMisconceptionCode(rawCode)) return null;
  return {
    code: rawCode,
    confidence: 1,
    reasonCodes: [
      'reviewed_distractor_mapping',
      `assessment_item:${resolved.item.key}@${resolved.item.version}`,
      `submitted_option:${resolved.receipt.submittedOptionId}`,
    ],
    itemRef: `${resolved.item.key}@${resolved.item.version}`,
    optionId: resolved.receipt.submittedOptionId,
    observedAt: event.observedAt,
    remediation: studyMisconceptionRemediation(rawCode),
  };
}

/**
 * A later correct assessment can clear a diagnosis only when the reviewed item
 * explicitly contains distractors for the same misconception code. Generic
 * correctness is not enough to prove that the earlier misconception is gone.
 */
export function assessmentConfirmsMisconceptionRepair(
  event: StudyMasteryEvidenceEvent,
  code: StudyMisconceptionCode,
): boolean {
  const resolved = itemFor(event);
  if (!resolved || resolved.receipt.correct !== true) return false;
  return Object.values(resolved.item.misconceptionByOptionId)
    .filter(isStudyMisconceptionCode)
    .includes(code);
}
