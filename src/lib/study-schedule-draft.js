const VALID_KINDS = new Set(['study', 'exam', 'deadline']);
const VALID_STATUSES = new Set(['planned', 'completed', 'skipped']);

export const STUDY_SCHEDULE_DURATION_CHOICES = Object.freeze([5, 10, 15, 20, 30, 45, 60, 90, 120]);

export function normalizeStudyScheduleDuration(value, fallback = 60) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(24 * 60, parsed));
}

export function studyScheduleDurationOptions(currentDuration) {
  const current = normalizeStudyScheduleDuration(currentDuration);
  return [...new Set([...STUDY_SCHEDULE_DURATION_CHOICES, current])].sort((left, right) => left - right);
}

/**
 * Apply optional planning-only prefill to the Schedule editor's ordinary base
 * draft. Date/time stay owned by Schedule and remain visible for confirmation.
 */
export function applyStudySchedulePrefill(baseDraft = {}, initialDraft = null) {
  if (!initialDraft || typeof initialDraft !== 'object') return { ...baseDraft };

  const subject = String(initialDraft.subject || '').trim().slice(0, 100);
  const topic = String(initialDraft.topic || '').trim().slice(0, 200);
  const title = String(initialDraft.title || '').trim().slice(0, 200);
  const notes = String(initialDraft.notes || '').slice(0, 2_000);
  const kind = VALID_KINDS.has(initialDraft.kind) ? initialDraft.kind : (baseDraft.kind || 'study');
  const status = VALID_STATUSES.has(initialDraft.status) ? initialDraft.status : (baseDraft.status || 'planned');

  return {
    ...baseDraft,
    subject: subject || baseDraft.subject || '',
    topic: topic || baseDraft.topic || '',
    title,
    duration: normalizeStudyScheduleDuration(initialDraft.duration, baseDraft.duration || 60),
    kind,
    status,
    notes,
  };
}
