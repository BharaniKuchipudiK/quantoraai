import { admittedStudyMasteryEvidence } from './study-evidence-admission.js';
import { readStudyUsedAssessmentItemRefs } from './study-assessment-evidence-runtime.js';
import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import {
  studyAssessmentItemsForConcept,
  type StudyAssessmentItem,
} from './study-assessment-items.js';
import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';

export const STUDY_TRANSFER_INTELLIGENCE_VERSION = 'study-transfer-intelligence-2026-09-01.2';

const REQUEST_TIMEOUT_MS = 4_000;
const MIN_TRANSFER_CONFIDENCE = 0.8;
const MAX_TRANSFER_TARGETS = 8;

type StudyConceptRef = {
  id: string;
  canonicalKey: string;
  label: string;
};

export type StudyTransferAttemptPlan = {
  sourceConcept: StudyConceptRef;
  targetConcept: StudyConceptRef;
  item: StudyAssessmentItem;
  edgeConfidence: number;
};

export type StudyTransferResolution =
  | { status: 'ready'; plan: StudyTransferAttemptPlan }
  | { status: 'none' }
  | { status: 'unavailable' };

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function readRows(path: string): Promise<any[] | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function conceptRecord(row: any): StudyConceptRef | null {
  const id = typeof row?.id === 'string' ? row.id : '';
  const canonicalKey = typeof row?.canonical_key === 'string' ? row.canonical_key : '';
  const label = typeof row?.label === 'string' ? row.label : '';
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}

/**
 * Resolve a defensible transfer check from the canonical graph.
 *
 * V7 deliberately requires all of the following:
 * - an active supports_transfer_to edge with confidence >= 0.80;
 * - an active target concept;
 * - no prior admitted evidence for that target (avoids mistaking known target
 *   knowledge for transfer from the source);
 * - a released reviewed target item whose reviewed cognitive operation is
 *   application;
 * - the target item/version has not already been submitted anywhere by this
 *   learner, matching the grading RPC's global independence boundary.
 *
 * If current reviewed content cannot satisfy those constraints, transfer stays
 * transparently unavailable rather than manufacturing a high-confidence claim.
 */
export async function resolveStudyTransferAttempt(input: {
  userSub: string;
  sourceConcept: StudyConceptRef;
}): Promise<StudyTransferResolution> {
  const edges = await readRows(
    `study_concept_edges?select=target_concept_id,confidence&relation=eq.supports_transfer_to&source_concept_id=eq.${encodeURIComponent(input.sourceConcept.id)}&confidence=gte.${MIN_TRANSFER_CONFIDENCE}&order=confidence.desc&limit=${MAX_TRANSFER_TARGETS}`,
  );
  if (edges === null) return { status: 'unavailable' };

  const candidates = edges
    .map((row: any) => ({
      targetId: typeof row?.target_concept_id === 'string' ? row.target_concept_id : '',
      confidence: typeof row?.confidence === 'number' && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : 0,
    }))
    .filter((row) => row.targetId && row.targetId !== input.sourceConcept.id && row.confidence >= MIN_TRANSFER_CONFIDENCE);
  if (!candidates.length) return { status: 'none' };

  const targetIds = [...new Set(candidates.map((candidate) => candidate.targetId))];
  const targetFilter = targetIds.length === 1
    ? `id=eq.${encodeURIComponent(targetIds[0])}`
    : `id=in.(${targetIds.map((id) => encodeURIComponent(id)).join(',')})`;
  const conceptRows = await readRows(
    `study_concepts?select=id,canonical_key,label&${targetFilter}&status=eq.active&limit=${targetIds.length}`,
  );
  if (conceptRows === null) return { status: 'unavailable' };
  const concepts = new Map<string, StudyConceptRef>();
  for (const row of conceptRows) {
    const concept = conceptRecord(row);
    if (concept) concepts.set(concept.id, concept);
  }

  for (const candidate of candidates) {
    const targetConcept = concepts.get(candidate.targetId);
    if (!targetConcept) continue;

    const targetEvidence = await readVerifiedStudyMasteryEvidence(
      input.userSub,
      targetConcept.id,
      targetConcept.canonicalKey,
    );
    if (targetEvidence === null) return { status: 'unavailable' };
    if (admittedStudyMasteryEvidence(targetEvidence).length > 0) continue;

    const applicationItems = studyAssessmentItemsForConcept(targetConcept.canonicalKey)
      .filter((candidateItem) => candidateItem.cognitiveOperation === 'application'
        && verifyStudyAssessmentRelease(candidateItem).canIssueVerifiedAttempt);
    if (!applicationItems.length) continue;

    const usedItemRefs = await readStudyUsedAssessmentItemRefs(
      input.userSub,
      applicationItems.map((candidateItem) => `${candidateItem.key}@${candidateItem.version}`),
    );
    if (usedItemRefs === null) return { status: 'unavailable' };
    const item = applicationItems.find(
      (candidateItem) => !usedItemRefs.has(`${candidateItem.key}@${candidateItem.version}`),
    );
    if (!item) continue;

    return {
      status: 'ready',
      plan: {
        sourceConcept: { ...input.sourceConcept },
        targetConcept,
        item,
        edgeConfidence: candidate.confidence,
      },
    };
  }

  return { status: 'none' };
}
