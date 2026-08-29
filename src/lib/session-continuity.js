import { HISTORY_BYTE_BUDGET } from './history-budget.js';
import { normalizeSessionContext } from './session-context.js';

export const SESSION_CONTINUITY_VERSION = 1;
export const SESSION_MESSAGE_LIMIT = 100;
export const CONTEXT_PRESSURE_WATCH_RATIO = 0.7;
export const CONTEXT_PRESSURE_HANDOVER_RATIO = 0.85;

const MAX_HANDOVER_FACTS = 8;
const MAX_RECENT_INTENTS = 3;
const MAX_INTENT_CHARS = 280;

function serializedBytes(value) {
  try { return JSON.stringify(value).length; } catch { return 0; }
}

function boundedText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function pressureLevel(ratio, historyResult) {
  if (historyResult?.trimmed > 0 || historyResult?.dropped > 0 || ratio >= CONTEXT_PRESSURE_HANDOVER_RATIO) {
    return 'handover_recommended';
  }
  if (ratio >= CONTEXT_PRESSURE_WATCH_RATIO) return 'watch';
  return 'stable';
}

/**
 * Detect pressure before the existing history budget removes information.
 * This is deliberately model-neutral: provider context windows can change, but
 * the request and transcript limits are platform invariants owned by Quantora.
 */
export function assessSessionContinuity({ messages = [], historyResult = null } = {}) {
  const transcript = Array.isArray(messages) ? messages : [];
  const rawBytes = serializedBytes(transcript);
  const byteRatio = rawBytes / HISTORY_BYTE_BUDGET;
  const itemRatio = transcript.length / SESSION_MESSAGE_LIMIT;
  const pressureRatio = Math.max(byteRatio, itemRatio);
  const level = pressureLevel(pressureRatio, historyResult);
  const reasons = [];

  if (byteRatio >= CONTEXT_PRESSURE_WATCH_RATIO) reasons.push('history_bytes');
  if (itemRatio >= CONTEXT_PRESSURE_WATCH_RATIO) reasons.push('history_items');
  if (historyResult?.trimmed > 0) reasons.push('history_trimmed');
  if (historyResult?.dropped > 0) reasons.push('history_dropped');

  return Object.freeze({
    version: SESSION_CONTINUITY_VERSION,
    level,
    recommendHandover: level === 'handover_recommended',
    reasons,
    metrics: {
      historyBytes: rawBytes,
      historyByteBudget: HISTORY_BYTE_BUDGET,
      historyItems: transcript.length,
      historyItemLimit: SESSION_MESSAGE_LIMIT,
      pressureRatio: Number(pressureRatio.toFixed(4)),
      trimmedItems: Number(historyResult?.trimmed) || 0,
      droppedItems: Number(historyResult?.dropped) || 0,
    },
  });
}

function recentUserIntents(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.sender === 'user')
    .map((message) => boundedText(message?.text, MAX_INTENT_CHARS))
    .filter(Boolean)
    .slice(-MAX_RECENT_INTENTS);
}

function handoverContextFacts(facts, intents) {
  const seen = new Set();
  const merged = [];
  for (const value of [...facts, ...intents]) {
    const clean = boundedText(value, MAX_INTENT_CHARS);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged;
}

/**
 * A bounded, non-conversational handover packet. Presentation copy is omitted
 * on purpose: UI may render these fields, while an intelligence layer may later
 * choose the human wording without changing the continuity contract.
 */
export function createSessionHandoverContract({
  sourceSessionId,
  projectId = null,
  studioDomain = null,
  conversationContext = {},
  messages = [],
  pressure,
  createdAt = Date.now(),
} = {}) {
  if (!pressure?.recommendHandover || !sourceSessionId) return null;
  const normalized = normalizeSessionContext(conversationContext);
  const facts = (normalized.facts || []).slice(-MAX_HANDOVER_FACTS);
  const intents = recentUserIntents(messages);
  // SessionContext is the actual seed for the child chat. Keep recent unresolved
  // user directions there as well as in summary, otherwise a handover can display
  // the right intent while the next model never receives it.
  const context = normalizeSessionContext({
    ...normalized,
    facts: handoverContextFacts(facts, intents),
  });

  return Object.freeze({
    version: SESSION_CONTINUITY_VERSION,
    kind: 'session_handover',
    id: `handover:${sourceSessionId}:${createdAt}`,
    sourceSessionId: String(sourceSessionId),
    ...(projectId ? { projectId: String(projectId) } : {}),
    ...(studioDomain ? { studioDomain: String(studioDomain) } : {}),
    createdAt,
    trigger: {
      level: pressure.level,
      reasons: [...(pressure.reasons || [])],
      metrics: { ...(pressure.metrics || {}) },
    },
    summary: {
      ...(context.goal ? { goal: context.goal } : {}),
      ...(context.understanding ? { understanding: context.understanding } : {}),
      ...(facts.length ? { facts } : {}),
      ...(intents.length ? { recentIntents: intents } : {}),
    },
    context,
    action: {
      id: 'session.continuity.start_new',
      kind: 'create_session_from_handover',
    },
  });
}

export function shouldOfferSessionHandover(messages = [], pressure = null) {
  /*
   * PRESSURE FIRST, and the reason this line has to be here.
   *
   * Without it this returned TRUE for a brand-new chat on turn one: no prior
   * offers means the `offers` list is empty, `.some()` is false, `previous` is
   * undefined, and the function falls through to `return true`. It is only
   * harmless today because createSessionHandoverContract re-checks
   * recommendHandover and returns null.
   *
   * That is two functions where the second enforces the invariant and the
   * first — exported, and named as though it IS the decision — does not. Any
   * caller trusting the name offers somebody a fresh session before they have
   * typed anything.
   */
  if (!pressure?.recommendHandover) return false;

  const offers = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.sessionContinuity);
  if (offers.some((message) => !message.sessionContinuityDismissed)) return false;
  const previous = offers[offers.length - 1]?.sessionContinuity;
  if (!previous) return true;

  // A dismissal is respected until observable pressure materially worsens.
  const priorMetrics = previous.trigger?.metrics || {};
  const nextMetrics = pressure?.metrics || {};
  return Number(nextMetrics.droppedItems || 0) > Number(priorMetrics.droppedItems || 0)
    || Number(nextMetrics.trimmedItems || 0) > Number(priorMetrics.trimmedItems || 0)
    || Number(nextMetrics.pressureRatio || 0) >= Number(priorMetrics.pressureRatio || 0) + 0.1;
}

/** Prefer user/session data for the compact chip; this is not assistant prose. */
export function sessionHandoverLabel(contract) {
  const summary = contract?.summary || {};
  const focus = boundedText(
    summary.goal
      || summary.understanding
      || summary.recentIntents?.[summary.recentIntents.length - 1]
      || contract?.kind,
    72,
  );
  const action = contract?.studioDomain === 'education'
    ? 'New topic'
    : contract?.studioDomain === 'travel'
      ? 'New trip'
      : 'New chat';
  return focus ? `${action} · ${focus}` : action;
}
