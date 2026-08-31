import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import type { StudyAssessmentItem } from './study-assessment-items.js';
import type { StudyLearnerModel } from './study-learner-model.js';
import type { StudyMisconceptionCode } from './study-misconception-taxonomy.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_ASSESSMENT_SELECTOR_VERSION = 'study-assessment-selector-2026-08-31.1';

function coversMisconception(item: StudyAssessmentItem, code: StudyMisconceptionCode): boolean {
  return Object.values(item.misconceptionByOptionId).includes(code);
}

/**
 * Pick the next server-owned reviewed item without allowing the browser to
 * choose an answer key or diagnosis. Prefer a fresh item that explicitly tests
 * the active misconception; otherwise prefer any fresh reviewed item.
 */
export function selectStudyAssessmentItem(input: {
  items: StudyAssessmentItem[];
  evidence?: StudyMasteryEvidenceEvent[] | null;
  learnerModel?: StudyLearnerModel | null;
}): StudyAssessmentItem | null {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return null;

  const usedItemRefs = new Set(
    admittedStudyMasteryEvidence(input.evidence || [])
      .map((event) => event.itemRef)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const isFresh = (item: StudyAssessmentItem) => !usedItemRefs.has(`${item.key}@${item.version}`);
  const activeCode = input.learnerModel?.misconception.code || null;

  if (activeCode) {
    const targetedFresh = items.find((item) => isFresh(item) && coversMisconception(item, activeCode));
    if (targetedFresh) return targetedFresh;
  }

  return items.find(isFresh) || items[0] || null;
}
