import { readStudySupabaseRows } from './study-supabase.js';

export type StudyActiveConceptRef = {
  id: string;
  canonicalKey: string;
  label: string;
};

/** Exact server-side lookup used when a graded transfer event points back to its source concept. */
export async function readActiveStudyConceptById(
  conceptId: string,
): Promise<StudyActiveConceptRef | null | 'unavailable'> {
  if (!conceptId) return 'unavailable';
  const rows = await readStudySupabaseRows(
    `study_concepts?select=id,canonical_key,label&id=eq.${encodeURIComponent(conceptId)}&status=eq.active&limit=1`,
    { operation: 'active_concept_by_id' },
  );
  if (rows === null) return 'unavailable';
  const row = rows[0] || null;
  const id = typeof row?.id === 'string' ? row.id : '';
  const canonicalKey = typeof row?.canonical_key === 'string' ? row.canonical_key : '';
  const label = typeof row?.label === 'string' ? row.label : '';
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}
