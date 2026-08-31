import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { readStudyMasteryEvidence } from './store.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const VALIDATION_TIMEOUT_MS = 4_000;
const ATTEMPT_REF = /^attempt:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

type AttemptRow = {
  id: string;
  concept_id: string;
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

function attemptReceipt(row: AttemptRow, conceptKey: string): StudyAssessmentAttemptReceipt | null {
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
  return {
    attemptId: row.id,
    conceptId: row.concept_id,
    conceptKey,
    itemKey: row.item_key,
    itemVersion: row.item_version,
    submittedOptionId: row.submitted_option_id,
    correct: row.correct,
    score: row.score,
    submittedAt: row.submitted_at,
  };
}

/**
 * Read learner evidence and cross-check every assessment event against the
 * authoritative submitted-attempt table before it can carry the module-private
 * admission attestation. V5 also binds the submitted option so diagnosis can
 * be derived from reviewed distractor metadata rather than model inference.
 *
 * Validation-store unavailability returns null: callers must not overwrite a
 * prior mastery projection with an artificial zero-evidence state.
 */
export async function readVerifiedStudyMasteryEvidence(
  userSub: string,
  conceptId: string,
  conceptKey: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const events = await readStudyMasteryEvidence(userSub, conceptId);
  if (!events) return null;
  const assessmentEvents = events.filter((event) => event.kind === 'assessment_item');
  if (!assessmentEvents.length) return events;

  const cfg = config();
  if (!cfg) return null;

  let response: Response;
  try {
    const path = `study_assessment_attempts?select=id,concept_id,item_key,item_version,submitted_option_id,submitted_at,correct,score&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&submitted_at=not.is.null&order=submitted_at.desc&limit=500`;
    response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
  } catch (error: any) {
    console.warn('Study assessment receipt validation failed:', error?.message || error);
    return null;
  }

  if (!response.ok) {
    console.warn(`Supabase GET study_assessment_attempts receipt validation -> ${response.status}`);
    return null;
  }

  let rows: AttemptRow[];
  try {
    const parsed = await response.json();
    rows = Array.isArray(parsed) ? parsed as AttemptRow[] : [];
  } catch {
    return null;
  }

  const receipts = new Map<string, StudyAssessmentAttemptReceipt>();
  for (const row of rows) {
    const receipt = attemptReceipt(row, conceptKey);
    if (receipt) receipts.set(receipt.attemptId.toLowerCase(), receipt);
  }

  for (const event of assessmentEvents) {
    const match = typeof event.assessmentRef === 'string' ? ATTEMPT_REF.exec(event.assessmentRef) : null;
    if (!match) continue;
    const receipt = receipts.get(match[1].toLowerCase());
    if (receipt) attestStudyAssessmentEvidence(event, receipt);
  }

  return events;
}
