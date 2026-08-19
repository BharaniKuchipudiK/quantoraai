import { contextToOutcomeState } from './outcome-state.js';

/**
 * Deterministic client projection before the server reconciles the authoritative
 * Cognitive Ledger. Assistant continuity remains inferred; a direct answer to a
 * material question can be promoted to confirmed user context.
 */
export function applyPclContinuityToOutcomeState(existingState, {
  assistantContext = null,
  confirmedUserFact = null,
  sourceTurn = null,
} = {}) {
  let state = existingState && typeof existingState === 'object' ? existingState : {};

  if (assistantContext && typeof assistantContext === 'object') {
    state = contextToOutcomeState(assistantContext, {
      existingState: state,
      sourceTurn,
      confirmed: false,
      consented: true,
    });
  }

  if (typeof confirmedUserFact === 'string' && confirmedUserFact.trim()) {
    state = contextToOutcomeState({ facts: [confirmedUserFact.trim()] }, {
      existingState: state,
      sourceTurn,
      confirmed: true,
      consented: true,
    });
  }

  return state;
}
