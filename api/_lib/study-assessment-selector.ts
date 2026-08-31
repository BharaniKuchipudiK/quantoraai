import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import type { StudyAssessmentItem } from './study-assessment-items.js';
import type { StudyLearnerModel } from './study-learner-model.js';
import type { StudyMisconceptionCode } from './study-misconception-taxonomy.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_ASSESSMENT_SELECTOR_VERSION = 'study-assessment-selector-2026-08-31.2';

function coversMisconception(item: StudyAssessmentItem, code: StudyMisconceptionCode): boolean {
  return Object.values(item.misconceptionByOptionId).includes(code);
}

function isReleased(item: StudyAssessmentItem): boolean {
  return verifyStudyAssessmentRelease(item).canIssueVerifiedAttempt;
}

/**
 * Pick the next server-owned governed item without allowing the browser to
 * choose an answer key or diagnosis.
 *
 * - Unreleased candidates are never eligible.
 * - An active diagnosis may receive only a fresh item that explicitly tests
 *   that misconception; an unrelated or repeated item cannot masquerade as a
 *   confirmation probe.
 * - Without an active diagnosis, only fresh governed items are eligible.
 * - Exhaustion returns null rather than issuing non-independent evidence as if
 *   it could advance verified learning.
 */
export function selectStudyAssessmentItem(input: {
  items: StudyAssessmentItem[];
  evidence?: StudyMasteryEvidenceEvent[] | null;
  learnerModel?: StudyLearnerModel | null;
}): StudyAssessmentItem | null {
  const releasedItems = (Array.isArray(input.items) ? input.items : []).filter(isReleased);
  if (!releasedItems.length) return null;

  const usedItemRefs = new Set(
    admittedStudyMasteryEvidence(input.evidence || [])
      .map((event) => event.itemRef)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const isFresh = (item: StudyAssessmentItem) => !usedItemRefs.has(`${item.key}@${item.version}`);
  const activeCode = input.learnerModel?.misconception.code || null;

  if (activeCode) {
    return releasedItems.find((item) => isFresh(item) && coversMisconception(item, activeCode)) || null;
  }

  return releasedItems.find(isFresh) || null;
}
