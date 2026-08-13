import { normalizeSessionContext } from './session-context.js';

function dedupe(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item).trim().toLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function outcomeStateToConversationContext(state) {
  if (!state || typeof state !== 'object') return {};
  return normalizeSessionContext({
    goal: state.goal?.statement,
    understanding: state.understanding?.statement,
    facts: [
      ...(state.decisions || []).map((item) => item.value),
      ...(state.constraints || []).filter((item) => item.confidence >= 0.8).map((item) => item.value),
      ...(state.assumptions || []).filter((item) => item.status === 'confirmed').map((item) => item.value),
    ],
  });
}

/**
 * Translate legacy UI notes into the trusted schema. Model-authored notes stay
 * inferred. Only direct user answers, choices, or edits set confirmed=true.
 */
export function contextToOutcomeState(context, {
  existingState = {}, sourceTurn = null, confirmed = false, consented = true,
} = {}) {
  const ctx = normalizeSessionContext(context);
  const existingAssumptions = Array.isArray(existingState.assumptions) ? existingState.assumptions : [];
  const newAssumptions = (ctx.facts || []).map((value) => ({
    value,
    status: confirmed ? 'confirmed' : 'inferred',
    sourceTurn,
  }));

  return {
    ...existingState,
    ...(ctx.goal ? { goal: {
      statement: ctx.goal,
      status: confirmed ? 'confirmed' : (existingState.goal?.status || 'draft'),
      sourceTurn: sourceTurn || existingState.goal?.sourceTurn || null,
    } } : {}),
    ...(ctx.understanding ? { understanding: {
      statement: ctx.understanding,
      status: confirmed ? 'confirmed' : 'inferred',
      sourceTurn: sourceTurn || existingState.understanding?.sourceTurn || null,
    } } : {}),
    definitionOfDone: existingState.definitionOfDone || [],
    constraints: existingState.constraints || [],
    assumptions: dedupe([...newAssumptions, ...existingAssumptions], (item) => item.value).slice(0, 40),
    openQuestions: existingState.openQuestions || [],
    decisions: existingState.decisions || [],
    artifacts: existingState.artifacts || [],
    nextActions: existingState.nextActions || [],
    memory: { scope: existingState.memory?.scope || 'session', consented },
    safety: existingState.safety || { unresolvedFlags: [] },
  };
}

async function outcomeRequest(payload) {
  const response = await fetch('/api/outcomes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStage: 'outcome-state', ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Outcome Memory request failed.');
    error.status = response.status;
    error.conflict = data.conflict === true;
    throw error;
  }
  return data;
}

export function loadOutcomeState(sessionId) {
  return outcomeRequest({ action: 'get', sessionId });
}

export function persistOutcomeState({ sessionId, expectedVersion, state, sourceTurn }) {
  return outcomeRequest({ action: 'save', sessionId, expectedVersion, state, sourceTurn });
}

export function forgetOutcomeState(sessionId) {
  return outcomeRequest({ action: 'delete', sessionId });
}
