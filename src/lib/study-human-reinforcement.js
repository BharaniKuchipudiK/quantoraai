const REINFORCEMENT_RULES = Object.freeze({
  misconception_confirmation_needed: Object.freeze({
    kind: 'repair',
    label: 'You corrected the distinction that caused trouble earlier.',
  }),
  retention_untested: Object.freeze({
    kind: 'progress',
    label: 'You showed this idea independently in more than one way.',
  }),
  understanding_and_retention_supported: Object.freeze({
    kind: 'mastery',
    label: 'You brought this idea back and used it successfully.',
  }),
});

/**
 * Presentation-only projection of a server-issued learner-model milestone.
 *
 * This layer never derives mastery, records evidence, or trusts free-form
 * acknowledgement copy from the response. Unknown and ordinary outcomes are
 * exact no-ops so reinforcement remains meaningful rather than repetitive.
 */
export function studyHumanReinforcement(outcome) {
  if (!outcome || outcome.recorded !== true || outcome.duplicate === true || outcome.correct !== true) return null;
  const model = outcome.learnerModel;
  if (!model || typeof model !== 'object') return null;

  const reasonCode = String(model?.nextLearningMove?.reasonCode || '');
  const rule = REINFORCEMENT_RULES[reasonCode];
  if (!rule) return null;

  const understanding = String(model?.understanding?.state || '');
  const misconception = String(model?.misconception?.state || '');
  const retention = String(model?.retention?.state || '');
  const consistent = reasonCode === 'misconception_confirmation_needed'
    ? misconception === 'needs_confirmation'
    : reasonCode === 'retention_untested'
      ? understanding === 'verified' && retention === 'untested'
      : understanding === 'verified' && retention === 'supported';

  return consistent ? rule : null;
}
