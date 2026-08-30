const MOVE_RULES = Object.freeze({
  independent_retrieval: {
    label: 'Ready for a quick check',
    instruction: 'Before adding more explanation, prefer one short no-hint question that reveals what the learner can already retrieve independently.',
  },
  diagnose_misconception: {
    label: 'Repairing a mix-up',
    instruction: 'Address the active misconception with one crisp contrast or counterexample, then ask the learner to explain the corrected distinction in their own words.',
  },
  confirm_misconception: {
    label: 'Checking the repair',
    instruction: 'Use a fresh targeted example to verify that the earlier misconception is actually repaired. Do not assume it is resolved because one explanation sounded clear.',
  },
  guided_repair: {
    label: 'Building the missing step',
    instruction: 'Repair only the first material error or missing prerequisite. Use the smallest useful scaffold, then let the learner retry with a changed example.',
  },
  vary_evidence: {
    label: 'Building understanding',
    instruction: 'Change the evidence type instead of repeating the same question. Prefer a short application, teach-back, or representation switch that tests the same idea from another angle.',
  },
  retention_probe: {
    label: 'Needs a later check',
    instruction: 'Prefer a concise no-hint retrieval check over more explanation. Treat current understanding as promising but not yet durable.',
  },
  transfer_task: {
    label: 'Ready to stretch',
    instruction: 'Use a novel transfer task in a different representation or context. Avoid another near-duplicate practice item.',
  },
});

const UNDERSTANDING_LABELS = Object.freeze({
  unverified: 'Getting oriented',
  emerging: 'Building understanding',
  verified: 'Understanding verified',
});

/**
 * Convert the server-issued learner model into a small, allow-listed client
 * contract. We deliberately ignore free-form strings from the payload so a
 * persisted or tampered response cannot become hidden model instructions.
 */
export function studyAdaptiveTutorContext(learnerModel) {
  if (!learnerModel || typeof learnerModel !== 'object') return null;
  const move = String(learnerModel?.nextLearningMove?.type || '');
  const rule = MOVE_RULES[move];
  if (!rule) return null;

  const understanding = String(learnerModel?.understanding?.state || '');
  const misconception = String(learnerModel?.misconception?.state || '');
  const retention = String(learnerModel?.retention?.state || '');

  const stateLabel = misconception === 'signal_observed'
    ? MOVE_RULES.diagnose_misconception.label
    : misconception === 'needs_confirmation'
      ? MOVE_RULES.confirm_misconception.label
      : retention === 'needs_support'
        ? MOVE_RULES.retention_probe.label
        : rule.label || UNDERSTANDING_LABELS[understanding] || null;

  return {
    move,
    stateLabel,
    understanding: UNDERSTANDING_LABELS[understanding] ? understanding : null,
    misconception: ['none_observed', 'signal_observed', 'needs_confirmation'].includes(misconception) ? misconception : null,
    retention: ['untested', 'needs_support', 'supported'].includes(retention) ? retention : null,
    instruction: rule.instruction,
  };
}

export function studyAdaptiveStateLabel(learnerModel) {
  return studyAdaptiveTutorContext(learnerModel)?.stateLabel || null;
}

/**
 * Add evidence-backed adaptation to an existing private Study action prompt.
 * This never invents mastery: the learner model is computed by the verified
 * assessment path, and only an allow-listed next-move type changes the prompt.
 */
export function studyAdaptiveTutorAsk(baseAsk, learnerModel) {
  const ask = String(baseAsk || '').trim();
  const context = studyAdaptiveTutorContext(learnerModel);
  if (!ask || !context) return ask;
  return [
    ask,
    `Evidence-backed adaptation for this turn: ${context.instruction}`,
    'Do not announce a score, mastery percentage, learner label, or internal state. Let the adaptation show through the teaching itself.',
    'Keep the existing one-question-and-wait contract: make one useful move, ask at most one learner question, then STOP.',
  ].join(' ');
}
