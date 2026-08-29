/**
 * Detects a request to ANALYZE the history of an FX pair in a Finance-workspace
 * message — "how has USD to SGD performed this year?", "USD/INR trend", "SGD
 * volatility over the last 6 months". This is distinct from a point conversion
 * ("convert 1,000 USD to SGD"): only a message carrying an explicit history/
 * performance cue AND a currency pair matches; everything else returns
 * { kind: null } and flows through untouched.
 *
 * The trigger for the deterministic FX analytics gateway. It must be checked
 * BEFORE the point-lookup gateway, since a trend question also contains a pair.
 */

import { KNOWN_CURRENCIES } from "./market-data-intent.js";

export type FxAnalyticsIntent = { kind: "fx-analytics"; base: string; quote: string; days: number };
export type FxAnalyticsParse = FxAnalyticsIntent | { kind: null };

const CUR = KNOWN_CURRENCIES.join("|");
const FX_PAIR = new RegExp(`\\b(${CUR})\\s*(?:to|in|into|→|->|/|vs\\.?|versus|-|against)\\s*(${CUR})\\b`, "i");

// A history/performance cue — the thing that separates "analyze the series" from
// "quote today's rate". Deliberately excludes bare "rate"/"convert".
const ANALYTICS_HINT =
  /\b(perform(?:ed|ance|ing)?|trend(?:ing|ed)?|history|historical|volatil(?:e|ity)|fluctuat\w*|movement|moved|track record|year[- ]to[- ]date|ytd|over the (?:last|past)|(?:last|past)\s+\d)\b/i;

const DEFAULT_DAYS = 365;

/** Parse an explicit lookback ("last 6 months", "past 90 days", "ytd") → days. */
export function parseLookbackDays(message: string, now: Date = new Date()): number {
  if (/\b(?:ytd|year[- ]to[- ]date)\b/i.test(message)) {
    const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
    const days = Math.round((now.getTime() - jan1) / (24 * 60 * 60 * 1000));
    return Math.max(days, 1);
  }
  const m = message.match(/\b(\d{1,4})\s*(day|week|month|year)s?\b/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const perUnit = unit === "year" ? 365 : unit === "month" ? 30 : unit === "week" ? 7 : 1;
    const days = n * perUnit;
    if (Number.isFinite(days) && days > 0) return Math.min(days, 365 * 5);
  }
  if (/\b(?:last|past|this)\s+year\b/i.test(message)) return 365;
  if (/\b(?:last|past|this)\s+month\b/i.test(message)) return 30;
  return DEFAULT_DAYS;
}

export function parseFxAnalyticsIntent(message: unknown, now: Date = new Date()): FxAnalyticsParse {
  if (typeof message !== "string" || !message.trim()) return { kind: null };
  if (!ANALYTICS_HINT.test(message)) return { kind: null };

  let base: string | null = null;
  let quote: string | null = null;

  const paired = message.match(FX_PAIR);
  if (paired) {
    base = paired[1].toUpperCase();
    quote = paired[2].toUpperCase();
  } else {
    // "how has SGD moved against USD" — currencies not adjacent. With an
    // analytics cue already present, exactly two known currencies is enough;
    // order them by their position in the sentence.
    const upper = message.toUpperCase();
    const found = KNOWN_CURRENCIES.filter((c) => new RegExp(`\\b${c}\\b`).test(upper));
    if (found.length === 2) {
      const order = found.sort((a, b) => upper.indexOf(a) - upper.indexOf(b));
      [base, quote] = order;
    }
  }

  if (!base || !quote || base === quote) return { kind: null };
  return { kind: "fx-analytics", base, quote, days: parseLookbackDays(message, now) };
}

export function isFxAnalyticsIntent(intent: FxAnalyticsParse): intent is FxAnalyticsIntent {
  return intent.kind === "fx-analytics";
}
