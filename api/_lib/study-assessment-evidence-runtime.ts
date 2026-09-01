import { randomUUID } from 'node:crypto';
import { issueStudyAssessmentAttempt } from './store.js';
import type { StudyEvidenceKind } from './study-truth-layer.js';

const REQUEST_TIMEOUT_MS = 4_000;

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

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function requestRaw(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const cfg = config();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    console.warn(`Study V7 evidence ${init.method || 'GET'} ${path} failed:`, error?.message || error);
    return null;
  }
}

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
 * concept ultimately received the evidence. V7's grading RPC enforces
 * independence at this same learner + item/version scope, so issuance must use
 * the same scope or it can present a "fresh" check that the database later
 * (correctly) refuses to count as independent evidence.
 *
 * Queries are candidate-scoped existence checks instead of a capped history
 * scan, so freshness remains exact as a learner accumulates years of attempts.
 * These columns all predate V7, preserving ordinary-check rollout compatibility.
 */
export async function readStudyUsedAssessmentItemRefs(
  userSub: string,
  candidateItemRefs: Iterable<string>,
): Promise<Set<string> | null> {
  if (!userSub) return null;
  const refs = [...new Set(Array.from(candidateItemRefs).filter((value) => typeof value === 'string' && value.length > 0))];
  if (!refs.length) return new Set();

  const checks = await Promise.all(refs.map(async (itemRef) => {
    const parsed = splitItemRef(itemRef);
    if (!parsed) return { status: 'invalid' as const, itemRef };
    const response = await requestRaw(
      `study_assessment_attempts?select=id&user_sub=eq.${encodeURIComponent(userSub)}&item_key=eq.${encodeURIComponent(parsed.itemKey)}&item_version=eq.${encodeURIComponent(parsed.itemVersion)}&submitted_at=not.is.null&limit=1`,
      { method: 'GET' },
    );
    if (!response?.ok) {
      if (response) console.warn(`Study V7 used-item validation -> ${response.status}`);
      return { status: 'unavailable' as const, itemRef };
    }
    try {
      const rows = await response.json();
      if (!Array.isArray(rows)) return { status: 'unavailable' as const, itemRef };
      return { status: rows.length > 0 ? 'used' as const : 'fresh' as const, itemRef };
    } catch {
      return { status: 'unavailable' as const, itemRef };
    }
  }));

  if (checks.some((check) => check.status === 'unavailable' || check.status === 'invalid')) return null;
  return new Set(checks.filter((check) => check.status === 'used').map((check) => check.itemRef));
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

/**
 * Issue one server-owned governed assessment attempt with an immutable evidence
 * purpose. Once the V7 migration is active, a database trigger serializes issue
 * and grade on the same learner + item/version advisory-lock key. A concurrent
 * stale selection is surfaced as a conflict instead of silently creating an
 * attempt that can never contribute new independent evidence.
 *
 * A pre-V7 database may safely downgrade ordinary evidence only when PostgREST
 * positively reports that the V7 columns are not installed yet. Network errors,
 * constraint failures, and other database faults fail closed; retention/transfer
 * always fail closed until V7 schema is present.
 */
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
  if (!EVIDENCE_KINDS.has(entry.evidenceKind)) return { status: 'unavailable' };
  if (entry.evidenceKind === 'retention_probe' && !entry.retentionAnchorAt) return { status: 'unavailable' };
  if (entry.evidenceKind === 'transfer'
    && (!entry.evidenceConceptId || entry.evidenceConceptId === entry.conceptId)) {
    return { status: 'unavailable' };
  }

  const attemptId = randomUUID();
  const response = await requestRaw('study_assessment_attempts', {
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
  });
  if (response?.ok) {
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
  if (conflict) return { status: 'conflict', reason: conflict };

  // During rollout, a code deploy can briefly precede the Supabase migration.
  // Only a positive missing-schema signal may use the legacy ordinary path.
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
  return legacy.status === 'issued'
    ? { status: 'issued', attemptId: legacy.attemptId, evidenceKind: 'assessment_item', legacyFallback: true }
    : { status: 'unavailable' };
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

/** Grade through the same atomic RPC used by the existing assessment path. */
export async function completeStudyEvidenceAttempt(entry: {
  userSub: string;
  attemptId: string;
  optionId: string;
  observedAt: string;
}): Promise<StudyEvidenceGradeRecord | 'unavailable'> {
  const response = await requestRaw('rpc/complete_study_assessment_attempt', {
    method: 'POST',
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_attempt_id: entry.attemptId,
      p_option_id: entry.optionId,
      p_observed_at: entry.observedAt,
    }),
  });
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
