import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import type { StudyLedgerAppendCursor } from './study-replay-checkpoint.js';
import {
  readStudySupabaseRows,
  readStudySupabaseRowsPaged,
} from './study-supabase.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const MIN_TRANSFER_CONFIDENCE = 0.8;
const MAX_CHECKPOINT_DELTA_ROWS = 500;
const RECEIPT_CHUNK_SIZE = 100;
const ATTEMPT_REF = /^attempt:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const ASSESSMENT_BACKED_KINDS = new Set<StudyEvidenceKind>([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'retention_probe',
  'misconception_probe',
]);

type AttemptRow = {
  id: string;
  concept_id: string;
  evidence_concept_id?: string | null;
  evidence_kind?: StudyEvidenceKind | null;
  retention_anchor_at?: string | null;
  item_key: string;
  item_version: string;
  submitted_option_id: string;
  submitted_at: string;
  correct: boolean;
  score: number;
};

type MasteryRow = {
  id: string;
  event_key: string;
  event_kind: StudyEvidenceKind;
  correct: boolean | null;
  score: number | null;
  difficulty: number | null;
  hints_used: number | null;
  response_ms: number | null;
  self_confidence: number | null;
  independent: boolean;
  misconception_signal: boolean;
  delay_days: number | null;
  provenance: string;
  source_ref: string | null;
  assessment_ref: string | null;
  item_ref: string | null;
  observed_at: string;
  created_at: string;
};

export type StudyVerifiedEvidenceWithCursor = {
  evidence: StudyMasteryEvidenceEvent[];
  cursor: StudyLedgerAppendCursor | null;
};

export type StudyVerifiedEvidenceDeltaResult =
  | { status: 'complete'; evidence: StudyMasteryEvidenceEvent[]; cursor: StudyLedgerAppendCursor }
  | { status: 'requires_full_replay'; reasonCode: string }
  | { status: 'unavailable' };

function normalizedEvidenceKind(value: unknown): StudyEvidenceKind {
  return typeof value === 'string' && ASSESSMENT_BACKED_KINDS.has(value as StudyEvidenceKind)
    ? value as StudyEvidenceKind
    : 'assessment_item';
}

function retentionDelayDays(anchorAt: string | null | undefined, observedAt: string): number | null {
  const anchor = typeof anchorAt === 'string' ? Date.parse(anchorAt) : Number.NaN;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(anchor) || !Number.isFinite(observed) || observed <= anchor) return null;
  return Math.max(0, Math.floor((observed - anchor) / 86_400_000));
}

function attemptReceipt(
  row: AttemptRow,
  evidenceConceptId: string,
  evidenceConceptKey: string,
): StudyAssessmentAttemptReceipt | null {
  if (!row
    || typeof row.id !== 'string'
    || typeof row.concept_id !== 'string'
    || typeof row.item_key !== 'string'
    || typeof row.item_version !== 'string'
    || typeof row.submitted_option_id !== 'string'
    || !row.submitted_option_id
    || typeof row.submitted_at !== 'string'
    || !Number.isFinite(Date.parse(row.submitted_at))
    || typeof row.correct !== 'boolean'
    || typeof row.score !== 'number'
    || !Number.isFinite(row.score)) {
    return null;
  }

  const item = findStudyAssessmentItem(row.item_key, row.item_version);
  if (!item) return null;
  const kind = normalizedEvidenceKind(row.evidence_kind);
  const rowEvidenceConceptId = typeof row.evidence_concept_id === 'string' && row.evidence_concept_id
    ? row.evidence_concept_id
    : row.concept_id;
  if (rowEvidenceConceptId !== evidenceConceptId) return null;
  const delayDays = kind === 'retention_probe'
    ? retentionDelayDays(row.retention_anchor_at, row.submitted_at)
    : null;

  return {
    attemptId: row.id,
    conceptId: evidenceConceptId,
    conceptKey: evidenceConceptKey,
    evidenceKind: kind,
    evidenceConceptId,
    itemConceptId: row.concept_id,
    itemConceptKey: item.conceptKey,
    itemKey: row.item_key,
    itemVersion: row.item_version,
    submittedOptionId: row.submitted_option_id,
    correct: row.correct,
    score: row.score,
    submittedAt: row.submitted_at,
    retentionAnchorAt: row.retention_anchor_at || null,
    delayDays,
  };
}

function masteryEvent(row: MasteryRow, conceptId: string): StudyMasteryEvidenceEvent {
  return {
    id: String(row.event_key || ''),
    conceptId,
    kind: row.event_kind,
    correct: typeof row.correct === 'boolean' ? row.correct : null,
    score: typeof row.score === 'number' ? row.score : null,
    difficulty: typeof row.difficulty === 'number' ? row.difficulty : null,
    hintsUsed: Number(row.hints_used) || 0,
    responseMs: typeof row.response_ms === 'number' ? row.response_ms : null,
    selfConfidence: typeof row.self_confidence === 'number' ? row.self_confidence : null,
    independent: row.independent === true,
    misconceptionSignal: row.misconception_signal === true,
    delayDays: typeof row.delay_days === 'number' ? row.delay_days : null,
    provenance: row.provenance,
    sourceRef: row.source_ref,
    assessmentRef: row.assessment_ref,
    itemRef: row.item_ref,
    observedAt: String(row.observed_at || ''),
  } as StudyMasteryEvidenceEvent;
}

function appendCursor(row: MasteryRow | null | undefined): StudyLedgerAppendCursor | null {
  if (!row || typeof row.id !== 'string' || !row.id || typeof row.created_at !== 'string') return null;
  const millis = Date.parse(row.created_at);
  return Number.isFinite(millis)
    ? { createdAt: new Date(millis).toISOString(), id: row.id }
    : null;
}

function masterySelect() {
  return 'id,event_key,event_kind,correct,score,difficulty,hints_used,response_ms,self_confidence,independent,misconception_signal,delay_days,provenance,source_ref,assessment_ref,item_ref,observed_at,created_at';
}

async function readCompleteMasteryRows(
  userSub: string,
  conceptId: string,
): Promise<MasteryRow[] | null> {
  const result = await readStudySupabaseRowsPaged(
    `study_mastery_events?select=${masterySelect()}&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&order=created_at.asc,id.asc`,
    { operation: 'mastery_evidence_full_replay' },
  );
  if (!result) return null;
  if (result.status === 'overflow') {
    console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'mastery_evidence_full_replay' });
    return null;
  }
  return result.rows as MasteryRow[];
}

async function readMasteryRowsAfterCursor(
  userSub: string,
  conceptId: string,
  cursor: StudyLedgerAppendCursor,
): Promise<{ rows: MasteryRow[]; cursor: StudyLedgerAppendCursor } | 'overflow' | null> {
  const createdAt = encodeURIComponent(cursor.createdAt);
  const id = encodeURIComponent(cursor.id);
  const keyset = `or=(created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id}))`;
  const result = await readStudySupabaseRowsPaged(
    `study_mastery_events?select=${masterySelect()}&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&${keyset}&order=created_at.asc,id.asc`,
    {
      operation: 'mastery_evidence_checkpoint_delta',
      pageSize: MAX_CHECKPOINT_DELTA_ROWS,
      maxRows: MAX_CHECKPOINT_DELTA_ROWS,
    },
  );
  if (!result) return null;
  if (result.status === 'overflow') return 'overflow';
  const rows = result.rows as MasteryRow[];
  return { rows, cursor: appendCursor(rows[rows.length - 1]) || cursor };
}

async function validatedTransferTargets(
  sourceConceptId: string,
  targetConceptIds: string[],
): Promise<Set<string> | null> {
  const uniqueTargets = [...new Set(targetConceptIds.filter(Boolean))];
  if (!uniqueTargets.length) return new Set();
  const targetFilter = uniqueTargets.length === 1
    ? `target_concept_id=eq.${encodeURIComponent(uniqueTargets[0])}`
    : `target_concept_id=in.(${uniqueTargets.map((id) => encodeURIComponent(id)).join(',')})`;
  const rows = await readStudySupabaseRows(
    `study_concept_edges?select=target_concept_id,confidence&relation=eq.supports_transfer_to&source_concept_id=eq.${encodeURIComponent(sourceConceptId)}&${targetFilter}&confidence=gte.${MIN_TRANSFER_CONFIDENCE}&limit=${uniqueTargets.length}`,
    { operation: 'transfer_edge_validation' },
  );
  if (rows === null) return null;
  return new Set(rows
    .filter((row: any) => typeof row?.target_concept_id === 'string'
      && typeof row?.confidence === 'number'
      && row.confidence >= MIN_TRANSFER_CONFIDENCE)
    .map((row: any) => row.target_concept_id));
}

async function attestAssessmentBackedEvents(
  events: StudyMasteryEvidenceEvent[],
  rows: AttemptRow[],
  conceptId: string,
  conceptKey: string,
): Promise<boolean> {
  const receipts = new Map<string, StudyAssessmentAttemptReceipt>();
  const transferReceipts: StudyAssessmentAttemptReceipt[] = [];
  for (const row of rows) {
    const receipt = attemptReceipt(row, conceptId, conceptKey);
    if (!receipt) continue;
    if (receipt.evidenceKind === 'transfer') transferReceipts.push(receipt);
    else receipts.set(receipt.attemptId.toLowerCase(), receipt);
  }

  if (transferReceipts.length) {
    const validTargets = await validatedTransferTargets(
      conceptId,
      transferReceipts.map((receipt) => receipt.itemConceptId || '').filter(Boolean),
    );
    if (validTargets === null) return false;
    for (const receipt of transferReceipts) {
      if (receipt.itemConceptId && validTargets.has(receipt.itemConceptId)) {
        receipts.set(receipt.attemptId.toLowerCase(), receipt);
      }
    }
  }

  for (const event of events.filter((event) => ASSESSMENT_BACKED_KINDS.has(event.kind))) {
    const match = typeof event.assessmentRef === 'string' ? ATTEMPT_REF.exec(event.assessmentRef) : null;
    if (!match) continue;
    const receipt = receipts.get(match[1].toLowerCase());
    if (receipt) attestStudyAssessmentEvidence(event, receipt);
  }
  return true;
}

async function readFullAttemptRows(
  userSub: string,
  conceptId: string,
): Promise<AttemptRow[] | null> {
  const v7Path = `study_assessment_attempts?select=id,concept_id,evidence_concept_id,evidence_kind,retention_anchor_at,item_key,item_version,submitted_option_id,submitted_at,correct,score,issued_at&user_sub=eq.${encodeURIComponent(userSub)}&or=(concept_id.eq.${encodeURIComponent(conceptId)},evidence_concept_id.eq.${encodeURIComponent(conceptId)})&submitted_at=not.is.null&order=issued_at.asc,id.asc`;
  let pagedRows = await readStudySupabaseRowsPaged(v7Path, { operation: 'assessment_receipt_validation_v7' });
  if (pagedRows?.status === 'overflow') {
    console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'assessment_receipt_validation_v7' });
    return null;
  }
  if (pagedRows) return pagedRows.rows as AttemptRow[];

  const legacyPath = `study_assessment_attempts?select=id,concept_id,item_key,item_version,submitted_option_id,submitted_at,correct,score,issued_at&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&submitted_at=not.is.null&order=issued_at.asc,id.asc`;
  pagedRows = await readStudySupabaseRowsPaged(legacyPath, { operation: 'assessment_receipt_validation_legacy' });
  if (!pagedRows) {
    console.warn('Study assessment receipt validation unavailable.');
    return null;
  }
  if (pagedRows.status === 'overflow') {
    console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'assessment_receipt_validation_legacy' });
    return null;
  }
  return pagedRows.rows as AttemptRow[];
}

async function readAttemptRowsByIds(userSub: string, attemptIds: string[]): Promise<AttemptRow[] | null> {
  const uniqueIds = [...new Set(attemptIds.map((id) => id.toLowerCase()))];
  const rows: AttemptRow[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += RECEIPT_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + RECEIPT_CHUNK_SIZE);
    const path = `study_assessment_attempts?select=id,concept_id,evidence_concept_id,evidence_kind,retention_anchor_at,item_key,item_version,submitted_option_id,submitted_at,correct,score&user_sub=eq.${encodeURIComponent(userSub)}&id=in.(${chunk.map(encodeURIComponent).join(',')})&submitted_at=not.is.null&limit=${chunk.length}`;
    const page = await readStudySupabaseRows(path, { operation: 'assessment_receipt_checkpoint_delta' });
    if (page === null) return null;
    rows.push(...page as AttemptRow[]);
  }
  return rows;
}

async function verifyEvents(
  events: StudyMasteryEvidenceEvent[],
  userSub: string,
  conceptId: string,
  conceptKey: string,
  mode: 'full' | 'delta',
): Promise<boolean> {
  const backed = events.filter((event) => ASSESSMENT_BACKED_KINDS.has(event.kind));
  if (!backed.length) return true;
  let rows: AttemptRow[] | null;
  if (mode === 'full') {
    rows = await readFullAttemptRows(userSub, conceptId);
  } else {
    const attemptIds = backed
      .map((event) => typeof event.assessmentRef === 'string' ? ATTEMPT_REF.exec(event.assessmentRef)?.[1] || '' : '')
      .filter(Boolean);
    rows = await readAttemptRowsByIds(userSub, attemptIds);
  }
  if (!rows) return false;
  return attestAssessmentBackedEvents(events, rows, conceptId, conceptKey);
}

/** Read the complete bounded, receipt-verified learner ledger plus its append cursor. */
export async function readVerifiedStudyMasteryEvidenceWithCursor(
  userSub: string,
  conceptId: string,
  conceptKey: string,
): Promise<StudyVerifiedEvidenceWithCursor | null> {
  const rows = await readCompleteMasteryRows(userSub, conceptId);
  if (!rows) return null;
  const evidence = rows.map((row) => masteryEvent(row, conceptId));
  if (!await verifyEvents(evidence, userSub, conceptId, conceptKey, 'full')) return null;
  return { evidence, cursor: appendCursor(rows[rows.length - 1]) };
}

/** Backward-compatible full replay reader. */
export async function readVerifiedStudyMasteryEvidence(
  userSub: string,
  conceptId: string,
  conceptKey: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const result = await readVerifiedStudyMasteryEvidenceWithCursor(userSub, conceptId, conceptKey);
  return result?.evidence || null;
}

/**
 * Read only ledger rows appended after a trusted server-owned checkpoint cursor.
 * A delta larger than the bounded window or an unavailable validation store does
 * not permit stale snapshot use; callers must fall back to authoritative full replay.
 */
export async function readVerifiedStudyMasteryEvidenceDelta(
  userSub: string,
  conceptId: string,
  conceptKey: string,
  cursor: StudyLedgerAppendCursor,
): Promise<StudyVerifiedEvidenceDeltaResult> {
  const result = await readMasteryRowsAfterCursor(userSub, conceptId, cursor);
  if (result === null) return { status: 'unavailable' };
  if (result === 'overflow') return { status: 'requires_full_replay', reasonCode: 'checkpoint_delta_overflow' };
  const evidence = result.rows.map((row) => masteryEvent(row, conceptId));
  if (!await verifyEvents(evidence, userSub, conceptId, conceptKey, 'delta')) {
    return { status: 'unavailable' };
  }
  return { status: 'complete', evidence, cursor: result.cursor };
}
