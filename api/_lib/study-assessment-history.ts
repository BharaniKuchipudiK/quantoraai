import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';
import { readStudySupabaseRows } from './study-supabase.js';

const HISTORY_WINDOW_DAYS = 30;
const HISTORY_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StudyAssessmentHistoryEntry = {
  submittedAt: string;
  subject: string | null;
  concept: { key: string | null; label: string | null };
  evidenceKind: string;
  assessmentType: string;
  scorePercent: number;
  correct: boolean;
  difficulty: number;
  evidenceFor: { key: string | null; label: string | null } | null;
};

type AttemptRow = {
  concept_id?: unknown;
  evidence_concept_id?: unknown;
  evidence_kind?: unknown;
  difficulty?: unknown;
  submitted_at?: unknown;
  correct?: unknown;
  score?: unknown;
};

type ConceptRow = {
  id?: unknown;
  canonical_key?: unknown;
  subject?: unknown;
  label?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function learnerAssessmentType(kind: string): string {
  switch (kind) {
    case 'retrieval': return 'Recall check';
    case 'application': return 'Application check';
    case 'transfer': return 'Transfer check';
    case 'retention_probe': return 'Retention check';
    case 'misconception_probe': return 'Understanding check';
    default: return 'Assessment';
  }
}

export function buildStudyAssessmentHistory(
  attempts: AttemptRow[],
  concepts: ConceptRow[],
): StudyAssessmentHistoryEntry[] {
  const conceptById = new Map<string, { key: string | null; subject: string | null; label: string | null }>();
  for (const row of concepts) {
    const id = asString(row.id);
    if (!id) continue;
    conceptById.set(id, {
      key: asString(row.canonical_key),
      subject: asString(row.subject),
      label: asString(row.label),
    });
  }

  return attempts.flatMap((row) => {
    const submittedAt = asString(row.submitted_at);
    const conceptId = asString(row.concept_id);
    const score = boundedNumber(row.score, 0, 1);
    const difficulty = boundedNumber(row.difficulty, 0, 1);
    if (!submittedAt || !conceptId || typeof row.correct !== 'boolean' || score == null || difficulty == null) return [];

    const evidenceKind = asString(row.evidence_kind) || 'assessment_item';
    const concept = conceptById.get(conceptId) || { key: null, subject: null, label: null };
    const evidenceConceptId = asString(row.evidence_concept_id);
    const evidenceConcept = evidenceConceptId ? conceptById.get(evidenceConceptId) : null;

    return [{
      submittedAt,
      subject: concept.subject,
      concept: { key: concept.key, label: concept.label },
      evidenceKind,
      assessmentType: learnerAssessmentType(evidenceKind),
      scorePercent: Math.round(score * 100),
      correct: row.correct,
      difficulty,
      evidenceFor: evidenceConcept
        ? { key: evidenceConcept.key, label: evidenceConcept.label }
        : null,
    }];
  });
}

export default async function studyAssessmentHistoryHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to continue.', requiresAuth: true });

  if (isRateLimited(`study-assessment-history:${userSub}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Too many Study history requests. Please wait a minute and try again.' });
  }

  const generatedAt = new Date();
  const cutoff = new Date(generatedAt.getTime() - HISTORY_WINDOW_DAYS * DAY_MS).toISOString();
  const attempts = await readStudySupabaseRows(
    `study_assessment_attempts?select=concept_id,evidence_concept_id,evidence_kind,difficulty,submitted_at,correct,score&user_sub=eq.${encodeURIComponent(userSub)}&submitted_at=not.is.null&submitted_at=gte.${encodeURIComponent(cutoff)}&order=submitted_at.desc&limit=${HISTORY_LIMIT}`,
    { operation: 'assessment_history_attempts' },
  );
  if (attempts === null) {
    return res.status(503).json({ error: 'Assessment history is temporarily unavailable.' });
  }

  const conceptIds = Array.from(new Set(
    attempts.flatMap((row) => [asString(row?.concept_id), asString(row?.evidence_concept_id)]).filter(Boolean),
  )) as string[];

  let concepts: any[] = [];
  if (conceptIds.length > 0) {
    concepts = await readStudySupabaseRows(
      `study_concepts?select=id,canonical_key,subject,label&id=in.(${conceptIds.join(',')})`,
      { operation: 'assessment_history_concepts' },
    ) || [];
    if (concepts.length === 0 && attempts.length > 0) {
      return res.status(503).json({ error: 'Assessment history topic details are temporarily unavailable.' });
    }
  }

  return res.status(200).json({
    windowDays: HISTORY_WINDOW_DAYS,
    generatedAt: generatedAt.toISOString(),
    assessments: buildStudyAssessmentHistory(attempts, concepts),
  });
}
