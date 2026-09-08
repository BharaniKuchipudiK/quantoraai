import { HISTORY_BYTE_BUDGET } from './history-budget.js';
import { normalizeSessionContext, SESSION_CONTEXT_FACT_LIMIT } from './session-context.js';

export const SESSION_CONTINUITY_VERSION = 1;
export const SESSION_MESSAGE_LIMIT = 100;
export const CONTEXT_PRESSURE_WATCH_RATIO = 0.7;
export const CONTEXT_PRESSURE_HANDOVER_RATIO = 0.85;

const MAX_RECENT_INTENTS = 3;
const MAX_INTENT_CHARS = 280;

/*
 * Facts and intents share one budget, because they end up in one list. Taking
 * eight facts here — half of what the child session can hold — quietly halved
 * what survived a handover, and the loss was invisible: the packet looked
 * complete because it was never compared against the capacity receiving it.
 */
const MAX_HANDOVER_FACTS = SESSION_CONTEXT_FACT_LIMIT - MAX_RECENT_INTENTS;

function serializedBytes(value) {
  try { return JSON.stringify(value).length; } catch { return 0; }
}

function boundedText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/*
 * Once this many turns have been folded into the digest, the session is old
 * enough that a fresh chat seeded with its goal, facts and desk answers
 * better than a request that opens with forty one-line summaries. Below it,
 * compaction is the platform doing its job, not a reason to move.
 */
export const COMPACTED_HANDOVER_TURNS = 40;

function pressureLevel(ratio, { trimmed = 0, compacted = 0 } = {}) {
  if (ratio >= CONTEXT_PRESSURE_HANDOVER_RATIO || compacted >= COMPACTED_HANDOVER_TURNS) {
    return 'handover_recommended';
  }
  if (ratio >= CONTEXT_PRESSURE_WATCH_RATIO || trimmed > 0 || compacted > 0) return 'watch';
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
  /*
   * Measured on what the next request would carry, AFTER the budget has
   * trimmed and folded — compaction is what relieves pressure, so a measure
   * taken before it would recommend leaving a chat the platform can still run.
   */
  const sentBytes = Number.isFinite(historyResult?.bytes) && historyResult.bytes > 0 ? historyResult.bytes : rawBytes;
  const sentItems = Array.isArray(historyResult?.history) ? historyResult.history.length : transcript.length;
  const trimmed = Number(historyResult?.trimmed) || 0;
  const compacted = Number(historyResult?.compacted ?? historyResult?.dropped) || 0;
  const byteRatio = sentBytes / HISTORY_BYTE_BUDGET;
  const itemRatio = sentItems / SESSION_MESSAGE_LIMIT;
  const pressureRatio = Math.max(byteRatio, itemRatio);
  const level = pressureLevel(pressureRatio, { trimmed, compacted });
  const reasons = [];

  if (byteRatio >= CONTEXT_PRESSURE_WATCH_RATIO) reasons.push('history_bytes');
  if (itemRatio >= CONTEXT_PRESSURE_WATCH_RATIO) reasons.push('history_items');
  if (trimmed > 0) reasons.push('history_trimmed');
  if (compacted > 0) reasons.push('history_compacted');
  if (compacted >= COMPACTED_HANDOVER_TURNS) reasons.push('history_long');

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
      trimmedItems: trimmed,
      // Kept under its old name for readers of earlier contracts: these turns
      // were folded into the digest, not thrown away.
      droppedItems: compacted,
      compactedItems: compacted,
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

/*
 * Session exhaustion has TWO causes, and only one was ever wired.
 *
 * assessSessionContinuity measures CONTEXT pressure — the transcript growing
 * past what the window can carry. But the way a long session actually dies in
 * practice is the other one: the route runs out (quota exhausted, every gateway
 * refusing), and the turn ends on "Quantora could not reach a healthy AI route"
 * with no offer to continue anywhere. The handover machinery — summary, facts,
 * recent intents, a seeded child chat — sat right there and was never reachable
 * from that path, which is why the transition never felt smooth: for this
 * failure it did not exist.
 *
 * This synthesizes the pressure record for a route/quota exhaustion so the same
 * contract builder can seed a fresh chat from a dead one. It is a real trigger
 * with its own reason, not a pretend context-pressure reading.
 */
export function providerExhaustionPressure(detail = '') {
  return {
    level: 'handover',
    recommendHandover: true,
    reasons: [detail ? `provider-exhausted: ${detail}` : 'provider-exhausted'],
    metrics: { providerExhausted: 1, pressureRatio: 1 },
  };
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

/**
 * What a handover would actually carry, as lines a person can read before they
 * agree to it. The chip used to be one click with no preview: the work moved
 * and the user never saw the packet, which is the opposite of keeping a human
 * in the loop on their own conversation.
 */
/**
 * WHAT A PERSON READS WHEN A CHAT IS HANDED OVER.
 *
 * describeSessionHandover below returns every carried line, and the new chat
 * used to print all of them. On 2026-09-08 that was nineteen bullets, several
 * of them near-duplicates of each other ("Services: Blouse stitching, Saree
 * draping, Fall stitching, Mehndi" three times in slightly different words),
 * opening a chat with a wall of receipts instead of the work.
 *
 * Nothing is lost by shortening it: the model does not read this text. It
 * reads contract.summary, which is structured and stays whole. This is the
 * human's two-line version of the same thing.
 */
export function handoverHeadline(contract, { maxDetail = 2 } = {}) {
  const summary = contract?.summary || {};
  const goal = String(summary.goal || '').trim();
  const understanding = String(summary.understanding || '').trim();

  /*
   * Near-duplicates are collapsed before counting, or the tail reads "and 14
   * more" when the same three facts were restated in four ways -- which makes
   * the handover look lossier than it is.
   */
  const detail = dedupeFacts([
    ...(Array.isArray(summary.facts) ? summary.facts : []),
    ...(Array.isArray(summary.recentIntents) ? summary.recentIntents : []),
  ]);

  const shown = detail.slice(0, Math.max(0, maxDetail));
  const hidden = Math.max(0, detail.length - shown.length);
  return {
    goal,
    understanding,
    shown,
    hidden,
    /* The full set still travels; this only says how much is not on screen. */
    carried: detail.length + (goal ? 1 : 0) + (understanding ? 1 : 0),
  };
}

/**
 * Facts that say the same thing count once.
 *
 * Compared on letters and digits only, lowercased: "Services: Blouse
 * stitching, Saree draping, Fall stitching, Mehndi" and "Services: Blouse
 * stitching, Draping, Fall stitching, Mehndi" are the same fact restated, and
 * a reader gains nothing from both. The longest wording of a group is kept,
 * because it is the one carrying the most detail.
 */
export function dedupeFacts(facts = []) {
  const kept = [];
  for (const raw of Array.isArray(facts) ? facts : []) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const tokens = significantTokens(text);
    if (!tokens.size) continue;
    const twinIndex = kept.findIndex((entry) => overlap(entry.tokens, tokens) >= 0.8);
    if (twinIndex === -1) {
      kept.push({ text, tokens });
      continue;
    }
    /* Keep the fuller wording of a restated fact: it carries the most. */
    if (text.length > kept[twinIndex].text.length) kept[twinIndex] = { text, tokens };
  }
  return kept.map((entry) => entry.text);
}

/*
 * 0.8 rather than exact, because the summariser restates facts in slightly
 * different words -- "Saree draping" and "Draping" in the same list. Rather
 * than a similarity score over whole strings, this compares the SMALLER set
 * against the larger: a short restatement fully contained in a longer one is a
 * duplicate, while two facts that merely share a subject are not.
 */
function overlap(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return 0;
  let shared = 0;
  for (const token of small) if (large.has(token)) shared += 1;
  return shared / small.size;
}

/* Words that carry meaning: short filler matches everything and would collapse
 * unrelated facts into one. */
const FILLER = new Set(['the', 'and', 'for', 'with', 'are', 'was', 'you', 'your', 'that', 'this', 'all', 'its']);
function significantTokens(text) {
  return new Set(
    String(text).toLowerCase().split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !FILLER.has(word)),
  );
}

export function describeSessionHandover(contract) {
  const summary = contract?.summary || {};
  const lines = [];
  if (summary.goal) lines.push(`Goal: ${summary.goal}`);
  if (summary.understanding) lines.push(`Where things stand: ${summary.understanding}`);
  for (const fact of summary.facts || []) lines.push(fact);
  for (const intent of summary.recentIntents || []) lines.push(`You asked: ${intent}`);

  const metrics = contract?.trigger?.metrics || {};
  const dropped = Number(metrics.droppedItems) || 0;
  const trimmed = Number(metrics.trimmedItems) || 0;
  return {
    lines,
    carried: lines.length,
    // Said plainly, because a handover offered after a trim means the current
    // chat has ALREADY lost detail — that is the reason to move, not a footnote.
    reason: dropped || trimmed
      ? `This chat has grown past what one request can carry, so ${dropped ? `${dropped} older turn${dropped === 1 ? '' : 's'} ${dropped === 1 ? 'is' : 'are'} already folded into one-line summaries` : 'older output was already shortened'} to keep it working.`
      : 'This chat is close to the size where older turns start getting folded into summaries.',
  };
}
