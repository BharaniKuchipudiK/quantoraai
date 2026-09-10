// Presentation only: consume fresh server grades, never interaction events or
// generated prose. These bounded snapshots are not another learner model.
const EVIDENCE_KINDS = new Set(['assessment_item', 'retrieval', 'application', 'transfer', 'retention_probe', 'misconception_probe']);
const MAX_FEEDBACK_ATTEMPTS = 128;

function key(value, max = 220) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : '';
}

function gradeConcept(result) {
  return key(result?.evidenceConcept?.key, 160);
}

function isRecordedGrade(result) {
  return result?.recorded === true && result.duplicate === false
    && typeof result.correct === 'boolean' && EVIDENCE_KINDS.has(result.evidenceKind)
    && Boolean(gradeConcept(result));
}

function snapshot(result) {
  const model = result?.learnerModel;
  const evidenceCount = model?.understanding?.evidenceCount;
  const observedAt = Date.parse(model?.understanding?.observedThrough || '');
  if (!model || model.concept?.key !== gradeConcept(result)
    || !Number.isSafeInteger(evidenceCount) || evidenceCount < 1 || !Number.isFinite(observedAt)) return null;
  return {
    conceptKey: model.concept.key,
    evidenceCount,
    observedAt,
    understanding: model.understanding.state,
    misconceptionState: model.misconception?.state,
    misconceptionCode: key(model.misconception?.code, 64),
    misconceptionSignals: model.misconception?.signalCount,
    resolvedCode: key(model.misconception?.lastResolvedCode, 64),
    targetedCorrection: Array.isArray(model.misconception?.reasonCodes)
      && model.misconception.reasonCodes.includes('targeted_independent_correction'),
  };
}

/** Fixed learner-facing copy; a historical resolved code alone is not a repair. */
export function deriveStudyReinforcement(result, { previous = null, hintDepth = null, correctRun = 0 } = {}) {
  if (!isRecordedGrade(result) || result.correct !== true) return null;
  const current = snapshot(result);
  const advanced = current && previous && current.conceptKey === previous.conceptKey
    && current.evidenceCount > previous.evidenceCount && current.observedAt >= previous.observedAt;

  // The canonical server projection clears the active code, not the state enum.
  if (advanced && current.misconceptionState === 'none_observed'
    && !current.misconceptionCode && current.targetedCorrection && previous.misconceptionCode
    && previous.misconceptionSignals >= 2 && current.resolvedCode === previous.misconceptionCode
    && ['signal_observed', 'needs_confirmation'].includes(previous.misconceptionState)) {
    return {
      kind: 'repair',
      title: 'You repaired the earlier mix-up.',
      detail: 'A fresh reviewed check supports the correction.',
    };
  }

  // Missing hint provenance is not evidence of independence. Receiving support
  // is never penalized; it simply does not earn a no-hint acknowledgement.
  if (hintDepth === 0 && result.evidenceKind === 'retention_probe'
    && Number.isSafeInteger(result.delayDays) && result.delayDays > 0 && result.delayDays <= 36500) {
    const days = result.delayDays;
    return {
      kind: 'return',
      title: 'It held.',
      detail: `You recalled this after ${days} delayed day${days === 1 ? '' : 's'}.`,
    };
  }

  if (hintDepth === 0 && result.evidenceKind === 'transfer'
    && key(result.transferTarget, 160) && result.transferTarget !== gradeConcept(result)) {
    return {
      kind: 'transfer',
      title: 'You transferred it.',
      detail: 'You used the same understanding successfully in a new context.',
    };
  }

  if (advanced && previous.understanding !== 'verified' && current.understanding === 'verified'
    && !current.misconceptionCode && result.masteryUpdated === true
    && result.mastery?.status === 'established' && result.mastery?.learningState === 'verified_understanding') {
    return {
      kind: 'understanding',
      title: 'Your understanding is now verified.',
      detail: 'The reviewed evidence supports this step. Retention is checked separately.',
    };
  }

  if (hintDepth === 0 && correctRun === 3) {
    return {
      kind: 'continuation',
      title: 'Three fresh checks in a row.',
      detail: 'Three different reviewed questions answered correctly in this session—not a mastery score.',
    };
  }

  if (hintDepth === 0 && result.evidenceKind === 'retrieval') {
    return {
      kind: 'retrieval',
      title: 'You recalled it without hints.',
      detail: 'This fresh retrieval check is correct. Keep building on the reasoning.',
    };
  }
  return null;
}

export function createStudyReinforcementState(scopeKey = '') {
  return { scopeKey, attempts: [], items: [], previous: null, correctRun: 0, feedback: null };
}

/**
 * Ephemeral display bookkeeping, scoped to the mounted Study session/concept.
 * Consume even hidden grades: closing an at-end assessment must not replay praise.
 * At the cap, stop producing feedback rather than evicting ids and replaying them.
 */
export function advanceStudyReinforcement(state, event) {
  const scopeKey = key(event?.scopeKey, 400);
  const current = state?.scopeKey === scopeKey ? state : createStudyReinforcementState(scopeKey);
  const clear = () => current.feedback ? { ...current, feedback: null } : current;
  if (!scopeKey || event?.resultScopeKey !== scopeKey || !isRecordedGrade(event?.result)) return clear();
  const attemptId = key(event.attemptId, 64);
  const itemRef = key(event.itemRef);
  if (!attemptId || !itemRef) return clear();
  if (current.attempts.includes(attemptId) || current.items.includes(itemRef)) {
    return event.suppressed || current.feedback?.attemptId !== attemptId || current.feedback?.itemRef !== itemRef
      ? clear() : current;
  }
  if (current.attempts.length >= MAX_FEEDBACK_ATTEMPTS) return clear();

  const result = event.result;
  const next = snapshot(result);
  const sameConcept = current.previous?.conceptKey === gradeConcept(result);
  const previous = sameConcept ? current.previous : null;
  // A delayed response with an older projection cannot rewind display history.
  if (next && previous && (next.observedAt < previous.observedAt || next.evidenceCount < previous.evidenceCount)) return clear();
  const correctRun = result.correct && event.hintDepth === 0
    ? Math.min((sameConcept ? current.correctRun : 0) + 1, 4) : 0;
  const reinforcement = event.suppressed ? null : deriveStudyReinforcement(result, {
    previous, hintDepth: event.hintDepth, correctRun,
  });
  return {
    scopeKey,
    attempts: [...current.attempts, attemptId],
    items: [...current.items, itemRef],
    previous: next,
    correctRun,
    feedback: reinforcement ? { ...reinforcement, attemptId, itemRef } : null,
  };
}

export function shouldSuppressStudyReinforcement(session) {
  return session?.feedback === 'at_end'
    && session.phase !== 'setup' && session.phase !== 'summary';
}
