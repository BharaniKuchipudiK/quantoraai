export function deriveStudyReinforcement(result) {
  if (!result || result.duplicate === true || result.correct !== true) return null;

  if (result.evidenceKind === 'transfer') {
    return {
      kind: 'transfer',
      title: 'You transferred it.',
      detail: 'You used the same understanding successfully in a new context.',
    };
  }

  if (result.evidenceKind === 'retention_probe') {
    const days = Number(result.delayDays);
    return {
      kind: 'return',
      title: 'It held.',
      detail: Number.isFinite(days) && days > 0
        ? `You recalled this after ${days} delayed day${days === 1 ? '' : 's'}.`
        : 'You recalled this on a delayed no-hint check.',
    };
  }

  const resolvedCode = result.learnerModel?.misconception?.lastResolvedCode;
  if (typeof resolvedCode === 'string' && resolvedCode) {
    return {
      kind: 'repair',
      title: 'You repaired the earlier mix-up.',
      detail: 'This check directly corrected the misconception that was blocking the concept.',
    };
  }

  return null;
}
