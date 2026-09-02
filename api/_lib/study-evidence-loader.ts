import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import {
  readStudySupabaseRows,
  readStudySupabaseRowsPaged,
} from './study-supabase.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const MIN_TRANSFER_CONFIDENCE = 0.8;
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

function masteryEvent(row: any, conceptId: string): StudyMasteryEvidenceEvent {
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

async function readCompleteMasteryEvidence(
  userSub: string,
  conceptId: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const result = await readStudySupabaseRowsPaged(
    `study_mastery_events?select=id,event_key,event_kind,correct,score,difficulty,hints_used,response_ms,self_confidence,independent,misconception_signal,delay_days,provenance,source_ref,assessment_ref,item_ref,observed_at,created_at&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&order=created_at.asc,id.asc`,
    { operation: 'mastery_evidence_full_replay' },
  );
  if (!result) return null;
  if (result.status === 'overflow') {
    console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'mastery_evidence_full_replay' });
    return null;
  }
  return result.rows.map((row) => masteryEvent(row, conceptId));
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

/**
 * Read the complete bounded learner ledger and cross-check every assessment-
 * backed event against the authoritative submitted-attempt table before it can
 * carry the private admission attestation.
 *
 * H3.3 removes the old silent 500-row truncation. Both evidence and receipt
 * history are append-ordered and paged. If the bounded full-replay ceiling is
 * exceeded or validation storage is unavailable, this function returns null so
 * callers preserve prior learner truth rather than projecting from a prefix.
 */
export async function readVerifiedStudyMasteryEvidence(
  userSub: string,
  conceptId: string,
  conceptKey: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const events = await readCompleteMasteryEvidence(userSub, conceptId);
  if (!events) return null;
  const assessmentBackedEvents = events.filter((event) => ASSESSMENT_BACKED_KINDS.has(event.kind));
  if (!assessmentBackedEvents.length) return events;

  // Prefer the V7 receipt shape. If the migration has not landed yet, fall back
  // to the legacy assessment-only shape so ordinary verified checks keep
  // working while retention/transfer remain fail-closed.
  const v7Path = `study_assessment_attempts?select=id,concept_id,evidence_concept_id,evidence_kind,retention_anchor_at,item_key,item_version,submitted_option_id,submitted_at,correct,score,issued_at&user_sub=eq.${encodeURIComponent(userSub)}&or=(concept_id.eq.${encodeURIComponent(conceptId)},evidence_concept_id.eq.${encodeURIComponent(conceptId)})&submitted_at=not.is.null&order=issued_at.asc,id.asc`;
  let pagedRows = await readStudySupabaseRowsPaged(
    v7Path,
    { operation: 'assessment_receipt_validation_v7' },
  );
  if (pagedRows?.status === 'overflow') {
    console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'assessment_receipt_validation_v7' });
    return null;
  }

  let rows = pagedRows?.rows as AttemptRow[] | undefined;
  if (!pagedRows) {
    const legacyPath = `study_assessment_attempts?select=id,concept_id,item_key,item_version,submitted_option_id,submitted_at,correct,score,issued_at&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&submitted_at=not.is.null&order=issued_at.asc,id.asc`;
    pagedRows = await readStudySupabaseRowsPaged(
      legacyPath,
      { operation: 'assessment_receipt_validation_legacy' },
    );
    if (!pagedRows) {
      console.warn('Study assessment receipt validation unavailable.');
      return null;
    }
    if (pagedRows.status === 'overflow') {
      console.warn('Study full replay exceeded bounded history ceiling.', { operation: 'assessment_receipt_validation_legacy' });
      return null;
    }
    rows = pagedRows.rows as AttemptRow[];
  }

  const receipts = new Map<string, StudyAssessmentAttemptReceipt>();
  const transferReceipts: StudyAssessmentAttemptReceipt[] = [];
  for (const row of rows || []) {
    const receipt = attemptReceipt(row, conceptId, conceptKey);
    if (!receipt) continue;
    if (receipt.evidenceKind === 'transfer') transferReceipts.push(receipt);
    else receipts.set(receipt.attemptId.toLowerCase(), receipt);
  }

  if (transferReceipts.length) {
    const validTargets = await validatedTransferTargets(
      conceptId,
      transferReceipts
        .map((receipt) => receipt.itemConceptId || '')
        .filter(Boolean),
    );
    if (validTargets === null) return null;
    for (const receipt of transferReceipts) {
      if (receipt.itemConceptId && validTargets.has(receipt.itemConceptId)) {
        receipts.set(receipt.attemptId.toLowerCase(), receipt);
      }
    }
  }

  for (const event of assessmentBackedEvents) {
    const match = typeof event.assessmentRef === 'string' ? ATTEMPT_REF.exec(event.assessmentRef) : null;
    if (!match) continue;
    const receipt = receipts.get(match[1].toLowerCase());
    if (receipt) attestStudyAssessmentEvidence(event, receipt);
  }

  return events;
}
