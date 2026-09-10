import { readStudySupabaseRows } from './study-supabase.js';
import { loadVerifiedStudyLearnerProjection } from './study-learner-projection-loader.js';
import { summarizeStudyReturnContext } from '../../src/lib/study-return-context.js';
const defaults = { readRows: readStudySupabaseRows, loadProjection: loadVerifiedStudyLearnerProjection, now: Date.now };
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function loadStudyReturnContext(userSub: string, deps = defaults) {
  const asOf = new Date(deps.now()).toISOString();
  // This bounded query discovers concepts only. Its rows are NOT learning truth.
  // Every displayed state comes from the existing verified evidence replay seam.
  const rows = await deps.readRows(
    `study_mastery_events?select=concept_id&user_sub=eq.${encodeURIComponent(userSub)}&order=observed_at.desc,id.desc&limit=501`,
    { operation: 'study_return_discovery' },
  );
  if (rows === null) return null;
  const ids = [...new Set(rows.slice(0, 500).map((row) => row.concept_id).filter(uuid))];
  let partial = rows.length > 500 || ids.length > 12;
  if (!ids.length) return summarizeStudyReturnContext([], { asOf, partial });
  const concepts = await deps.readRows(
    `study_concepts?select=id,canonical_key,label&id=in.(${ids.slice(0, 12).map(encodeURIComponent).join(',')})&limit=12`,
    { operation: 'study_return_concepts' },
  );
  if (concepts === null) return null;
  if (concepts.length !== Math.min(ids.length, 12)) partial = true;
  const entries = [];
  // Bound database concurrency; a history panel never starts inference or checks.
  for (let offset = 0; offset < concepts.length; offset += 3) {
    const batch = await Promise.all(concepts.slice(offset, offset + 3).map(async (concept) => {
      if (!uuid(concept.id) || typeof concept.canonical_key !== 'string' || typeof concept.label !== 'string') return null;
      const loaded = await deps.loadProjection({ userSub, conceptId: concept.id,
        conceptKey: concept.canonical_key, asOf }).catch(() => null);
      return loaded ? { concept: { id: concept.id, canonicalKey: concept.canonical_key, label: concept.label },
        projection: loaded.projection } : null;
    }));
    if (batch.some((entry) => !entry)) partial = true;
    entries.push(...batch.filter(Boolean));
  }
  return summarizeStudyReturnContext(entries, { asOf, partial });
}
