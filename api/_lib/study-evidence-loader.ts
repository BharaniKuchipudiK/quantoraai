import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import { readStudyMasteryEvidence } from './store.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const VALIDATION_TIMEOUT_MS = 4_000;
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

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function readRows(cfg: { url: string; key: string }, path: string): Promise<any[] | null> {
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

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

async function validatedTransferTargets(
  cfg: { url: string; key: string },
  sourceConceptId: string,
  targetConceptIds: string[],
): Promise<Set<string> | null> {
  const uniqueTargets = [...new Set(targetConceptIds.filter(Boolean))];
  if (!uniqueTargets.length) return new Set();
  const targetFilter = uniqueTargets.length === 1
    ? `target_concept_id=eq.${encodeURIComponent(uniqueTargets[0])}`
    : `target_concept_id=in.(${uniqueTargets.map((id) => encodeURIComponent(id)).join(',')})`;
  const rows = await readRows(
    cfg,
    `study_concept_edges?select=target_concept_id,confidence&relation=eq.supports_transfer_to&source_concept_id=eq.${encodeURIComponent(sourceConceptId)}&${targetFilter}&confidence=gte.${MIN_TRANSFER_CONFIDENCE}&limit=${uniqueTargets.length}`,
  );
  if (rows === null) return null;
  return new Set(rows
    .filter((row: any) => typeof row?.target_concept_id === 'string'
      && typeof row?.confidence === 'number'
      && row.confidence >= MIN_TRANSFER_CONFIDENCE)
    .map((row: any) => row.target_concept_id));
}

/**
 * Read learner evidence and cross-check every assessment-backed event against
 * the authoritative submitted-attempt table before it can carry the private
 * admission attestation. V7 also validates transfer against the canonical
 * supports_transfer_to graph and recomputes delayed-retention timing from the
 * server-owned attempt receipt.
 *
 * Validation-store unavailability returns null: callers must not overwrite a
 * prior learner projection with an artificial zero-evidence state.
 */
export async function readVerifiedStudyMasteryEvidence(
  userSub: string,
  conceptId: string,
  conceptKey: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const events = await readStudyMasteryEvidence(userSub, conceptId);
  if (!events) return null;
  const assessmentBackedEvents = events.filter((event) => ASSESSMENT_BACKED_KINDS.has(event.kind));
  if (!assessmentBackedEvents.length) return events;

  const cfg = config();
  if (!cfg) return null;

  // Prefer the V7 receipt shape. If the migration has not landed yet, fall back
  // to the legacy assessment-only shape so ordinary verified checks keep
  // working while retention/transfer remain fail-closed.
  const v7Path = `study_assessment_attempts?select=id,concept_id,evidence_concept_id,evidence_kind,retention_anchor_at,item_key,item_version,submitted_option_id,submitted_at,correct,score&user_sub=eq.${encodeURIComponent(userSub)}&or=(concept_id.eq.${encodeURIComponent(conceptId)},evidence_concept_id.eq.${encodeURIComponent(conceptId)})&submitted_at=not.is.null&order=submitted_at.desc&limit=500`;
  let rows = await readRows(cfg, v7Path) as AttemptRow[] | null;
  if (rows === null) {
    const legacyPath = `study_assessment_attempts?select=id,concept_id,item_key,item_version,submitted_option_id,submitted_at,correct,score&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&submitted_at=not.is.null&order=submitted_at.desc&limit=500`;
    rows = await readRows(cfg, legacyPath) as AttemptRow[] | null;
    if (rows === null) {
      console.warn('Study assessment receipt validation unavailable.');
      return null;
    }
  }

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
      cfg,
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
