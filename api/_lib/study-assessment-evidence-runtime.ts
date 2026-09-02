import { randomUUID } from 'node:crypto';
import { emitStudyLearningFlowMetric } from './study-learning-flow-telemetry.js';
import { withStudyTelemetryScope } from './study-observability.js';
import { issueStudyAssessmentAttempt } from './store.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';
import type { StudyEvidenceKind } from './study-truth-layer.js';

export type StudyAssessmentEvidenceKind = Extract<StudyEvidenceKind,
  | 'assessment_item'
  | 'retrieval'
  | 'application'
  | 'transfer'
  | 'retention_probe'
  | 'misconception_probe'
>;

const EVIDENCE_KINDS = new Set<StudyAssessmentEvidenceKind>([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'retention_probe',
  'misconception_probe',
]);

function splitItemRef(itemRef: string): { itemKey: string; itemVersion: string } | null {
  const separator = itemRef.lastIndexOf('@');
  if (separator <= 0 || separator === itemRef.length - 1) return null;
  return {
    itemKey: itemRef.slice(0, separator),
    itemVersion: itemRef.slice(separator + 1),
  };
}

/**
 * Return which candidate item/version refs this learner has already submitted
 * through the authoritative assessment-attempt boundary, regardless of which
 * concept ultimately received the evidence.
 */
export async function readStudyUsedAssessmentItemRefs(
  userSub: string,
  candidateItemRefs: Iterable<string>,
): Promise<Set<string> | null> {
  if (!userSub) return null;
  const refs = [...new Set(Array.from(candidateItemRefs).filter((value) => typeof value === 'string' && value.length > 0))];
  if (!refs.length) return new Set();

  const parsed = refs.map((itemRef) => ({ itemRef, parsed: splitItemRef(itemRef) }));
  if (parsed.some((entry) => !entry.parsed)) return null;

  const itemKeys = [...new Set(parsed.map((entry) => entry.parsed!.itemKey))];
  const itemVersions = [...new Set(parsed.map((entry) => entry.parsed!.itemVersion))];
  const keyFilter = itemKeys.map((value) => encodeURIComponent(value)).join(',');
  const versionFilter = itemVersions.map((value) => encodeURIComponent(value)).join(',');
  const rows = await readStudySupabaseRows(
    `study_assessment_attempts?select=item_key,item_version&user_sub=eq.${encodeURIComponent(userSub)}&item_key=in.(${keyFilter})&item_version=in.(${versionFilter})&submitted_at=not.is.null`,
    { operation: 'assessment_item_freshness' },
  );
  if (rows === null) return null;

  const candidates = new Set(refs);
  const used = new Set<string>();
  for (const row of rows) {
    const itemKey = typeof row?.item_key === 'string' ? row.item_key : '';
    const itemVersion = typeof row?.item_version === 'string' ? row.item_version : '';
    if (!itemKey || !itemVersion) continue;
    const itemRef = `${itemKey}@${itemVersion}`;
    if (candidates.has(itemRef)) used.add(itemRef);
  }
  return used;
}

export type StudyEvidenceAttemptIssueConflict = 'already_submitted' | 'already_active';

export type StudyEvidenceAttemptIssueResult =
  | { status: 'issued'; attemptId: string; evidenceKind: StudyAssessmentEvidenceKind; legacyFallback: boolean }
  | { status: 'conflict'; reason: StudyEvidenceAttemptIssueConflict }
  | { status: 'unavailable' };

function studyIssueConflict(detail: string): StudyEvidenceAttemptIssueConflict | null {
  if (detail.includes('study_assessment_item_already_submitted')) return 'already_submitted';
  if (detail.includes('study_assessment_item_already_active')) return 'already_active';
  return null;
}

function isMissingStudyV7Schema(response: Response, detail: string): boolean {
  if (response.status !== 400) return false;
  return detail.includes('PGRST204')
    || (/schema cache/i.test(detail) && /evidence_kind|evidence_concept_id|retention_anchor_at/i.test(detail));
}

async function issueStudyEvidenceAttemptInsideScope(entry: {
  userSub: string;
  sessionId: string;
  conceptId: string;
  itemKey: string;
  itemVersion: string;
  optionIds: string[];
  correctOptionId: string;
  misconceptionOptionIds: string[];
  difficulty: number;
  expiresAt: string;
  evidenceKind: StudyAssessmentEvidenceKind;
  evidenceConceptId?: string | null;
  retentionAnchorAt?: string | null;
}): Promise<StudyEvidenceAttemptIssueResult> {
  if (!EVIDENCE_KINDS.has(entry.evidenceKind)) return { status: 'unavailable' };
  if (entry.evidenceKind === 'retention_probe' && !entry.retentionAnchorAt) return { status: 'unavailable' };
  if (entry.evidenceKind === 'transfer'
    && (!entry.evidenceConceptId || entry.evidenceConceptId === entry.conceptId)) {
    return { status: 'unavailable' };
  }

  const attemptId = randomUUID();
  const response = await studySupabaseRequest('study_assessment_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      id: attemptId,
      user_sub: entry.userSub,
      session_id: entry.sessionId,
      concept_id: entry.conceptId,
      item_key: entry.itemKey,
      item_version: entry.itemVersion,
      option_ids: entry.optionIds,
      correct_option_id: entry.correctOptionId,
      misconception_option_ids: entry.misconceptionOptionIds,
      difficulty: entry.difficulty,
      expires_at: entry.expiresAt,
      evidence_kind: entry.evidenceKind,
      evidence_concept_id: entry.evidenceConceptId || null,
      retention_anchor_at: entry.retentionAnchorAt || null,
    }]),
  }, { operation: 'assessment_attempt_issue' });
  if (response?.ok) {
    emitStudyLearningFlowMetric({
      metric: 'assessment_availability',
      outcome: 'assessment_issued',
      evidenceKind: entry.evidenceKind,
    });
    return { status: 'issued', attemptId, evidenceKind: entry.evidenceKind, legacyFallback: false };
  }
  if (!response) return { status: 'unavailable' };

  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }
  const conflict = studyIssueConflict(detail);
  if (conflict) {
    emitStudyLearningFlowMetric({ metric: 'evidence_guard', outcome: 'freshness_conflict', evidenceKind: entry.evidenceKind });
    return { status: 'conflict', reason: conflict };
  }

  const canUseLegacyFallback = entry.evidenceKind !== 'retention_probe'
    && entry.evidenceKind !== 'transfer'
    && isMissingStudyV7Schema(response, detail);
  if (!canUseLegacyFallback) {
    console.warn(`Study V7 evidence issuance unavailable -> ${response.status}`);
    return { status: 'unavailable' };
  }

  const legacy = await issueStudyAssessmentAttempt({
    userSub: entry.userSub,
    sessionId: entry.sessionId,
    conceptId: entry.conceptId,
    itemKey: entry.itemKey,
    itemVersion: entry.itemVersion,
    optionIds: entry.optionIds,
    correctOptionId: entry.correctOptionId,
    misconceptionOptionIds: entry.misconceptionOptionIds,
    difficulty: entry.difficulty,
    expiresAt: entry.expiresAt,
  });
  if (legacy.status === 'issued') {
    emitStudyLearningFlowMetric({ metric: 'assessment_availability', outcome: 'assessment_issued', evidenceKind: 'assessment_item' });
    return { status: 'issued', attemptId: legacy.attemptId, evidenceKind: 'assessment_item', legacyFallback: true };
  }
  return { status: 'unavailable' };
}

/** Issue one server-owned governed assessment attempt under a correlation scope. */
export async function issueStudyEvidenceAttempt(entry: {
  userSub: string;
  sessionId: string;
  conceptId: string;
  itemKey: string;
  itemVersion: string;
  optionIds: string[];
  correctOptionId: string;
  misconceptionOptionIds: string[];
  difficulty: number;
  expiresAt: string;
  evidenceKind: StudyAssessmentEvidenceKind;
  evidenceConceptId?: string | null;
  retentionAnchorAt?: string | null;
}): Promise<StudyEvidenceAttemptIssueResult> {
  return withStudyTelemetryScope('study_assessment', () => issueStudyEvidenceAttemptInsideScope(entry));
}

export type StudyEvidenceGradeRecord = {
  status: 'graded' | 'already_submitted' | 'expired' | 'not_found' | 'invalid_option';
  correct: boolean | null;
  score: number | null;
  conceptId: string | null;
  itemKey: string | null;
  itemVersion: string | null;
  misconception: boolean | null;
  evidenceKind: StudyAssessmentEvidenceKind;
  evidenceConceptId: string | null;
  delayDays: number | null;
};

async function completeStudyEvidenceAttemptInsideScope(entry: {
  userSub: string;
  attemptId: string;
  optionId: string;
  observedAt: string;
}): Promise<StudyEvidenceGradeRecord | 'unavailable'> {
  const response = await studySupabaseRequest('rpc/complete_study_assessment_attempt', {
    method: 'POST',
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_attempt_id: entry.attemptId,
      p_option_id: entry.optionId,
      p_observed_at: entry.observedAt,
    }),
  }, { operation: 'assessment_attempt_grade' });
  if (!response?.ok) {
    if (response) console.warn(`Study V7 grade RPC -> ${response.status}`);
    return 'unavailable';
  }

  try {
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    const status = row?.result_status as StudyEvidenceGradeRecord['status'];
    if (!['graded', 'already_submitted', 'expired', 'not_found', 'invalid_option'].includes(status)) {
      return 'unavailable';
    }
    const rawKind = row?.result_evidence_kind;
    const evidenceKind: StudyAssessmentEvidenceKind = EVIDENCE_KINDS.has(rawKind)
      ? rawKind
      : 'assessment_item';
    const conceptId = typeof row?.result_concept_id === 'string' ? row.result_concept_id : null;
    if (status === 'graded') {
      emitStudyLearningFlowMetric({ metric: 'evidence_guard', outcome: 'evidence_graded', evidenceKind });
    } else if (status === 'already_submitted') {
      emitStudyLearningFlowMetric({ metric: 'evidence_guard', outcome: 'duplicate_evidence_blocked', evidenceKind });
    }
    return {
      status,
      correct: typeof row?.result_correct === 'boolean' ? row.result_correct : null,
      score: typeof row?.result_score === 'number' ? row.result_score : null,
      conceptId,
      itemKey: typeof row?.result_item_key === 'string' ? row.result_item_key : null,
      itemVersion: typeof row?.result_item_version === 'string' ? row.result_item_version : null,
      misconception: typeof row?.result_misconception === 'boolean' ? row.result_misconception : null,
      evidenceKind,
      evidenceConceptId: typeof row?.result_evidence_concept_id === 'string'
        ? row.result_evidence_concept_id
        : conceptId,
      delayDays: typeof row?.result_delay_days === 'number' && Number.isFinite(row.result_delay_days)
        ? Math.max(0, Math.round(row.result_delay_days))
        : null,
    };
  } catch {
    return 'unavailable';
  }
}

/** Grade through the atomic RPC under the same privacy-safe telemetry contract. */
export async function completeStudyEvidenceAttempt(entry: {
  userSub: string;
  attemptId: string;
  optionId: string;
  observedAt: string;
}): Promise<StudyEvidenceGradeRecord | 'unavailable'> {
  return withStudyTelemetryScope('study_assessment', () => completeStudyEvidenceAttemptInsideScope(entry));
}
