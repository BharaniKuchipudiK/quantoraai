const REQUEST_TIMEOUT_MS = 4_000;

export type StudyActiveConceptRef = {
  id: string;
  canonicalKey: string;
  label: string;
};

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

/** Exact server-side lookup used when a graded transfer event points back to its source concept. */
export async function readActiveStudyConceptById(
  conceptId: string,
): Promise<StudyActiveConceptRef | null | 'unavailable'> {
  const cfg = config();
  if (!cfg || !conceptId) return 'unavailable';
  try {
    const path = `study_concepts?select=id,canonical_key,label&id=eq.${encodeURIComponent(conceptId)}&status=eq.active&limit=1`;
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return 'unavailable';
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const id = typeof row?.id === 'string' ? row.id : '';
    const canonicalKey = typeof row?.canonical_key === 'string' ? row.canonical_key : '';
    const label = typeof row?.label === 'string' ? row.label : '';
    return id && canonicalKey && label ? { id, canonicalKey, label } : null;
  } catch {
    return 'unavailable';
  }
}
