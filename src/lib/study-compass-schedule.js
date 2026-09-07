const ACTION_LABELS = Object.freeze({
  independent_retrieval: 'Recall it independently',
  diagnose_misconception: 'Find the exact misconception',
  confirm_misconception: 'Confirm the tricky distinction',
  guided_repair: 'Repair the foundation',
  vary_evidence: 'Try a different kind of example',
  retention_probe: 'Refresh your recall',
  transfer_task: 'Apply it in a new situation',
});

const FACTOR_COPY = Object.freeze({
  masteryGap: 'There is a verified gap to strengthen.',
  prerequisiteLeverage: 'Strengthening it can unlock later concepts.',
  misconceptionSeverity: 'A misconception needs a focused repair.',
  retentionRisk: 'Your recall may be ready for a refresh.',
  curriculumImportance: 'It matters in the current curriculum.',
  evidenceConfidence: 'A short diagnostic can reduce uncertainty.',
  availableTimeFit: 'The activity fits the time you have.',
});

function boundedDuration(value, fallback = 20) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(24 * 60, parsed));
}

export function studyCompassActionLabel(recommendation = {}) {
  return ACTION_LABELS[recommendation?.recommendedActionType] || 'Strengthen this concept';
}

export function studyCompassExplanation(recommendation = {}) {
  if (recommendation?.dataSufficiency === 'insufficient_evidence') {
    return 'Quantora needs a little more verified evidence, so this starts with a short diagnostic.';
  }
  const reasons = [...(recommendation?.factors || [])]
    .filter((factor) => factor?.contribution > 0 && FACTOR_COPY[factor.key])
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 2)
    .map((factor) => FACTOR_COPY[factor.key]);
  return reasons.join(' ') || 'This is the strongest next step supported by your verified Study evidence.';
}

/**
 * Convert a deterministic Learning Compass recommendation into planning data.
 * Deliberately omit date/time and learner-truth fields: Schedule owns when the
 * work happens, and planning must never become mastery or evidence.
 */
export function studyCompassSchedulePrefill(recommendation = {}) {
  const concept = String(recommendation?.label || '').trim().slice(0, 200);
  if (!concept) return null;

  const activity = studyCompassActionLabel(recommendation);
  const reason = studyCompassExplanation(recommendation);
  const duration = boundedDuration(recommendation?.suggestedDurationMinutes);

  return {
    subject: '',
    topic: concept,
    title: `${activity}: ${concept}`.slice(0, 200),
    duration,
    kind: 'study',
    status: 'planned',
    notes: `Learning Compass recommendation — ${activity}. ${reason}`.slice(0, 2_000),
  };
}
