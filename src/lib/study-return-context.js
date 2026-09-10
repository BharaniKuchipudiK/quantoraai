export const STUDY_RETURN_CONTEXT_VERSION = 'study-return-context-v1';
/**
 * Project verified server reconstructions, never saved browser lesson positions.
 * @param {any[]} entries
 * @param {{ asOf?: string, partial?: boolean }} options
 */
export function summarizeStudyReturnContext(entries, { asOf, partial = false } = {}) {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return null;
  const result = { version: STUDY_RETURN_CONTEXT_VERSION, asOf,
    coverage: partial ? 'partial' : 'complete', observedConcepts: 0,
    unresolvedMisconceptions: [], recentMastery: [], retentionDue: [] };
  for (const entry of entries || []) {
    const projection = entry?.projection;
    const model = projection?.learnerModel;
    if (!projection || !model || !entry.concept?.id || !entry.concept?.canonicalKey
      || projection.conceptId !== entry.concept.id || projection.conceptKey !== entry.concept.canonicalKey
      || !Number.isInteger(projection.evidenceCount) || projection.evidenceCount < 1) continue;
    const observed = Date.parse(projection.observedThrough);
    if (!Number.isFinite(observed) || observed > now) continue;
    result.observedConcepts += 1;
    const item = { conceptId: entry.concept.id, conceptKey: entry.concept.canonicalKey,
      label: entry.concept.label, observedThrough: projection.observedThrough,
      recommendedActionType: model.nextLearningMove?.type || 'independent_retrieval',
      suggestedDurationMinutes: 10 };
    if (['signal_observed', 'needs_confirmation'].includes(model.misconception?.state)) {
      result.unresolvedMisconceptions.push({ ...item, state: model.misconception.state });
    }
    if (model.understanding?.state === 'verified' && now - observed <= 7 * 24 * 60 * 60 * 1000) {
      result.recentMastery.push(item);
    }
    const due = Date.parse(model.retention?.dueAt);
    if (model.retention?.due === true && Number.isFinite(due) && due <= now) {
      result.retentionDue.push({ ...item, dueAt: model.retention.dueAt });
    }
  }
  result.retentionDue.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  result.recentMastery.sort((a, b) => Date.parse(b.observedThrough) - Date.parse(a.observedThrough));
  return result;
}
