/**
 * Detects a forward-looking FX question in a Finance turn — "when will SGD hit
 * 80 INR?", "what are the odds the pound reaches 1.30 against the dollar this
 * year?". It captures the pair, the target level, its direction, and the horizon
 * so the projection engine can answer with odds and a range (never a date).
 *
 * Deliberately narrower than the spot-conversion and descriptive-analytics
 * intents: it fires only on a TARGET LEVEL plus a forward/likelihood framing, so
 * "how much is X in Y" (spot) and "how has X moved" (history) are left to those.
 */

import { KNOWN_CURRENCIES, currencyMentions } from "./market-data-intent.js";

export type FxForecastIntent = {
  kind: "fx_forecast";
  base: string;
  quote: string;
  target: number;
  horizonMonths: number;
};

const DEFAULT_HORIZON_MONTHS = 12;

// A forward/likelihood framing — the thing that separates a projection from a
// spot conversion or a "how did it do" history read.
const FORECAST_TRIGGER =
  /\b(?:when\s+will|will\s+it|reach(?:es|ed)?|hit(?:s|ting)?|gets?\s+to|get\s+to|touch(?:es|ing)?|climbs?\s+to|falls?\s+to|drops?\s+to|rises?\s+to|becomes?\s+|forecast|outlook|project(?:ion|ed)?|\bodds\b|\bchances?\b|probability|likelihood|how\s+likely|how\s+long\s+(?:until|till|before))\b/i;

// Connectors that mean "X <numerator> per 1 <denominator>": the currency before
// the connector is the quote, the one after is the base. Detected only BETWEEN
// the two currency mentions.
const PER_CONNECTOR = /\b(?:per|a|each|to\s+the|to\s+a|to\s+one|to\s+1)\b|\//i;

const CUR_TOKEN = new RegExp(`\\b(?:${KNOWN_CURRENCIES.join("|")})\\b`, "i");

function parseHorizon(message: string): { months: number; span: [number, number] | null } {
  const m =
    message.match(/\b(?:in|within|over|next|after)\s+(\d{1,3})\s*(year|yr|month|mo)s?\b/i) ||
    message.match(/\b(\d{1,3})[-\s]*(year|yr|month|mo)s?\b/i);
  if (!m || m.index == null) return { months: DEFAULT_HORIZON_MONTHS, span: null };
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return { months: DEFAULT_HORIZON_MONTHS, span: null };
  const months = /year|yr/i.test(m[2]) ? n * 12 : n;
  return { months: Math.min(120, months), span: [m.index, m.index + m[0].length] };
}

function inSpan(index: number, span: [number, number] | null): boolean {
  return span != null && index >= span[0] && index < span[1];
}

/** The target rate level — a number (never the unit "1", never the horizon). */
function parseTarget(
  message: string,
  horizonSpan: [number, number] | null,
  currencyIndexes: number[],
): number | null {
  const candidates: Array<{ value: number; index: number }> = [];
  for (const m of message.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)) {
    if (m.index == null) continue;
    if (inSpan(m.index, horizonSpan)) continue;
    const value = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value === 1) continue; // "per 1 SGD" / "to 1 dollar" — a unit, not a target
    candidates.push({ value, index: m.index });
  }
  if (!candidates.length) return null;
  // Prefer the number nearest a currency mention (targets sit beside the unit,
  // "reach 80 INR"); fall back to the largest.
  candidates.sort((a, b) => {
    const da = Math.min(...currencyIndexes.map((i) => Math.abs(i - a.index)));
    const db = Math.min(...currencyIndexes.map((i) => Math.abs(i - b.index)));
    return da - db || b.value - a.value;
  });
  return candidates[0].value;
}

export function parseFxForecastIntent(message: unknown): FxForecastIntent | null {
  if (typeof message !== "string" || !message.trim()) return null;
  if (!FORECAST_TRIGGER.test(message)) return null;

  const mentions = currencyMentions(message);
  if (mentions.length !== 2) return null;

  const { months, span } = parseHorizon(message);
  const target = parseTarget(message, span, mentions.map((m) => m.index));
  if (target === null) return null;

  // Direction: reading order is base→quote (target = quote per base). A "per"-
  // style connector BETWEEN the two currencies flips it ("80 INR per 1 SGD" and
  // "80 rupees to the dollar" both mean base=the denominator).
  let [base, quote] = [mentions[0].code, mentions[1].code];
  const between = message.slice(mentions[0].index, mentions[1].index);
  // Only treat a connector as directional when it sits after the first currency
  // token (i.e. "<cur> per <cur>"), not merely anywhere in the gap.
  const afterFirst = between.replace(CUR_TOKEN, "");
  if (PER_CONNECTOR.test(afterFirst)) {
    [base, quote] = [mentions[1].code, mentions[0].code];
  }
  if (base === quote) return null;

  return { kind: "fx_forecast", base, quote, target, horizonMonths: months };
}
