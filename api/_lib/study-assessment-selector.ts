import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import type { StudyAssessmentItem } from './study-assessment-items.js';
import type { StudyLearnerModel } from './study-learner-model.js';
import type { StudyMisconceptionCode } from './study-misconception-taxonomy.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

export const STUDY_ASSESSMENT_SELECTOR_VERSION = 'study-assessment-selector-2026-09-01.1';

function coversMisconception(item: StudyAssessmentItem, code: StudyMisconceptionCode): boolean {
  return Object.values(item.misconceptionByOptionId).includes(code);
}

function isReleased(item: StudyAssessmentItem): boolean {
  return verifyStudyAssessmentRelease(item).canIssueVerifiedAttempt;
}

/**
 * Translate already-reviewed cognitive-operation metadata into an evidence
 * purpose. This never upgrades an unreviewed item: release governance is still
 * checked separately, and retention/transfer are never inferred here.
 */
export function studyEvidenceKindForAssessmentItem(item: StudyAssessmentItem): Extract<StudyEvidenceKind,
  'assessment_item' | 'retrieval' | 'application'> {
  if (item.cognitiveOperation === 'recall') return 'retrieval';
  if (item.cognitiveOperation === 'application') return 'application';
  return 'assessment_item';
}

/**
 * Pick the next server-owned governed item without allowing the browser to
 * choose an answer key, evidence purpose or diagnosis.
 *
 * - Unreleased candidates are never eligible.
 * - Freshness follows the grading RPC's learner-global item/version boundary,
 *   with concept-local admitted evidence retained as a second defensive source.
 * - An active diagnosis may receive only a fresh item that explicitly tests
 *   that misconception; an unrelated or repeated item cannot masquerade as a
 *   confirmation probe.
 * - During evidence variation, prefer a fresh reviewed item whose reviewed
 *   cognitive operation contributes a genuinely new evidence kind.
 * - Exhaustion returns null rather than issuing non-independent evidence as if
 *   it could advance verified learning.
 */
export function selectStudyAssessmentItem(input: {
  items: StudyAssessmentItem[];
  evidence?: StudyMasteryEvidenceEvent[] | null;
  learnerModel?: StudyLearnerModel | null;
  usedItemRefs?: ReadonlySet<string> | null;
}): StudyAssessmentItem | null {
  const releasedItems = (Array.isArray(input.items) ? input.items : []).filter(isReleased);
  if (!releasedItems.length) return null;

  const admitted = admittedStudyMasteryEvidence(input.evidence || []);
  const usedItemRefs = new Set<string>(input.usedItemRefs || []);
  for (const event of admitted) {
    if (typeof event.itemRef === 'string' && event.itemRef.length > 0) usedItemRefs.add(event.itemRef);
  }
  const isFresh = (item: StudyAssessmentItem) => !usedItemRefs.has(`${item.key}@${item.version}`);
  const activeCode = input.learnerModel?.misconception.code || null;

  if (activeCode) {
    return releasedItems.find((item) => isFresh(item) && coversMisconception(item, activeCode)) || null;
  }

  const fresh = releasedItems.filter(isFresh);
  if (!fresh.length) return null;

  if (input.learnerModel?.nextLearningMove.type === 'vary_evidence') {
    const existingKinds = new Set(input.learnerModel.understanding.evidenceKinds);
    const novel = fresh.find((item) => !existingKinds.has(studyEvidenceKindForAssessmentItem(item)));
    if (novel) return novel;
  }

  return fresh[0] || null;
}
