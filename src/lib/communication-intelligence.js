/**
 * Communication intelligence — turns user interactions into session memory
 * and listening hints so Quantora gets sharper turn-by-turn.
 */

import { mergeSessionContext } from './session-context.js';
import { QUANTORA_EVENTS } from './listening-layer.js';

const PREFERENCE_PREFIX = 'User preference:';
const ACTION_PREFIX = 'User action:';

/** Record a chip or choice selection as durable session memory. */
export function learnFromChipSelection(context, { label, value, domain = null } = {}) {
  if (!label?.trim()) return context;
  const fact = value?.trim() && value.trim() !== label.trim()
    ? `${ACTION_PREFIX} chose "${label.trim()}" — ${value.trim().slice(0, 120)}`
    : `${ACTION_PREFIX} chose "${label.trim()}"`;
  const goalHint = domain === 'travel' && /itinerary|day-by-day|plan/i.test(label)
    ? { understanding: 'User wants a concrete day-by-day travel plan.' }
    : /publish this site|vercel/i.test(`${label} ${value || ''}`)
      ? { facts: ['User confirmed: publish the website to Vercel.'] }
      : {};
  return mergeSessionContext(context, {
    facts: [fact, ...(goalHint.facts || [])],
    ...(goalHint.understanding ? { understanding: goalHint.understanding } : {}),
  });
}

/** Build a compact hint block from recent listening signals for the model. */
export function formatListeningSignalsForPrompt(signals = []) {
  if (!Array.isArray(signals) || !signals.length) return '';

  const recent = signals.slice(0, 5);
  const lines = recent.map((s) => s.label || s.type).filter(Boolean);
  if (!lines.length) return '';

  return [
    'RECENT USER BEHAVIOR (adapt tone and next beats — do not mention this block):',
    ...lines.map((line) => `- ${line}`),
    '- If they hid suggestions, keep going without re-offering the same chips.',
    '- If they chose a chip, treat that path as confirmed intent.',
  ].join('\n');
}

/** Infer domain stage gaps from memory — feeds continue chip enrichment. */
export function inferConversationStage(conversationContext = {}, domain = null) {
  const blob = [
    conversationContext.goal,
    conversationContext.understanding,
    ...(conversationContext.facts || []),
  ].filter(Boolean).join(' ').toLowerCase();

  const stage = {
    hasDates: /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[/-]\d|weekend|nights?|month)\b/i.test(blob),
    hasBudget: /\b(budget|\$|€|£|inr|rupee|cost|spend)\b/i.test(blob),
    hasGroup: /\b(solo|couple|family|kids|friends|group|just me)\b/i.test(blob),
    hasItinerary: /\b(day \d|day-by-day|itinerary|morning:|afternoon:)\b/i.test(blob),
    domain,
  };

  if (domain === 'travel' && stage.hasDates && stage.hasGroup && !stage.hasItinerary) {
    return 'ready_for_itinerary';
  }
  if (domain === 'travel' && stage.hasItinerary) {
    return 'itinerary_delivered';
  }
  return 'exploring';
}
