/**
 * Detects an explicit market-data lookup in a Finance-workspace message — an FX
 * rate/conversion or a stock quote. Only clear lookups match; ordinary finance
 * conversation ("what do you think of tech stocks?") returns { kind: null } and
 * flows through normal chat untouched. This is the trigger for the deterministic
 * grounding gateway, the market-data analog of parseAffordabilityIntent.
 */

import { tickerForName } from "./market-data/ticker-resolve.js";

export const KNOWN_CURRENCIES = [
  "USD", "EUR", "GBP", "SGD", "INR", "JPY", "AUD", "CAD", "CHF", "HKD", "CNY",
];

export type FxIntent = { kind: "fx"; base: string; quote: string; amount: number | null };
export type PriceIntent = { kind: "price"; symbol: string };
export type MarketDataIntent = FxIntent | PriceIntent | { kind: null };

const CUR = KNOWN_CURRENCIES.join("|");
// "USD to SGD", "USD in EUR", "USD into INR", "USD->SGD", "EUR/USD", "USD vs SGD", "USD-SGD"
const FX_PAIR = new RegExp(`\\b(${CUR})\\s*(?:to|in|into|→|->|/|vs\\.?|versus|-)\\s*(${CUR})\\b`, "i");
const FX_HINT = /\b(rate|convert|conversion|exchange|worth|fx)\b/i;

// Spoken currency names map to ISO codes, so "how much is one Singapore dollar
// in Indian rupees" grounds on the deterministic FX engine instead of falling
// through to a hand-waved model answer. A bare "dollar" is intentionally left
// out — it is ambiguous across USD/SGD/AUD/CAD/HKD and must be qualified.
const CURRENCY_NAME_ALIASES: Array<{ re: RegExp; code: string }> = [
  { re: /\bsingapore\s+dollars?\b/i, code: "SGD" },
  { re: /\b(?:u\.?\s?s\.?|american)\s+dollars?\b/i, code: "USD" },
  { re: /\b(?:australian|aussie)\s+dollars?\b/i, code: "AUD" },
  { re: /\bcanadian\s+dollars?\b/i, code: "CAD" },
  { re: /\bhong\s*kong\s+dollars?\b/i, code: "HKD" },
  { re: /\b(?:indian\s+)?rupees?\b/i, code: "INR" },
  { re: /\beuros?\b/i, code: "EUR" },
  { re: /\b(?:british\s+|pound\s+)?sterling\b|\b(?:british\s+)?pounds?(?:\s+sterling)?\b/i, code: "GBP" },
  { re: /\b(?:japanese\s+)?yen\b/i, code: "JPY" },
  { re: /\b(?:swiss\s+)?francs?\b/i, code: "CHF" },
  { re: /\b(?:chinese\s+)?yuan\b|\brenminbi\b|\brmb\b/i, code: "CNY" },
];
// A conversion signal — a strong verb/hint or a "how much" ask. Bare "in"/"and"
// are deliberately excluded so "I keep euros and pounds" never fires a lookup.
const FX_CONVERT = /\bhow\s+much\b|\b(?:convert|conversion|exchange|worth|rate|equals?)\b|\b(?:to|into|vs\.?|versus|against)\b|→|->/i;

/** Every known currency mentioned by ISO code or spoken name, in reading order, deduped. */
export function currencyMentions(message: string): Array<{ code: string; index: number }> {
  const upper = message.toUpperCase();
  const earliest = new Map<string, number>();
  const note = (code: string, index: number) => {
    if (index < 0) return;
    const prev = earliest.get(code);
    if (prev == null || index < prev) earliest.set(code, index);
  };
  for (const code of KNOWN_CURRENCIES) {
    const m = new RegExp(`\\b${code}\\b`).exec(upper);
    if (m) note(code, m.index);
  }
  for (const { re, code } of CURRENCY_NAME_ALIASES) {
    const m = re.exec(message);
    if (m) note(code, m.index);
  }
  return [...earliest.entries()]
    .map(([code, index]) => ({ code, index }))
    .sort((a, b) => a.index - b.index);
}
const PRICE_HINT = /\b(price|quote|quotes|share price|stock price|last close|closing price|trading at|how much (?:is|does))\b/i;

function firstAmount(message: string): number | null {
  const m = message.match(/([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*([kKmM])?/);
  if (!m) return null;
  const numeric = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const mult = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Number((numeric * mult).toFixed(2));
}

function detectFx(message: string): MarketDataIntent | null {
  let base: string | null = null;
  let quote: string | null = null;

  const paired = message.match(FX_PAIR);
  if (paired) {
    base = paired[1].toUpperCase();
    quote = paired[2].toUpperCase();
  } else if (FX_HINT.test(message) || FX_CONVERT.test(message)) {
    // No explicit code-to-code connector, but a conversion signal plus exactly
    // two currencies named by code or spoken word ("Singapore dollar to rupees").
    const mentions = currencyMentions(message);
    if (mentions.length === 2) {
      [base, quote] = [mentions[0].code, mentions[1].code];
    }
  }

  if (!base || !quote || base === quote) return null;
  return { kind: "fx", base, quote, amount: firstAmount(message) };
}

function detectPrice(message: string): MarketDataIntent | null {
  if (!PRICE_HINT.test(message)) return null;

  /*
   * A spoken company name is how most people actually ask ("how much is Apple",
   * "Tesla share price") — and it carried no ticker, so the uppercase-only rules
   * below discarded it and the turn fell through to the model. Names resolve
   * first, against a curated list of well-known US issuers.
   */
  const named = message.match(
    /\b(?:price|quote)\s+(?:of|for)\s+([A-Za-z][A-Za-z.&' -]{1,24}?)(?:\s+(?:stock|share|shares))?\s*[?.!]?$/i,
  ) || message.match(
    /\bhow\s+much\s+(?:is|are|does)\s+(?:a\s+|one\s+)?([A-Za-z][A-Za-z.&' -]{1,24}?)(?:\s+(?:stock|share|shares))?\s*[?.!]?$/i,
  ) || message.match(
    /\b([A-Za-z][A-Za-z.&' -]{1,24}?)\s+(?:stock|share)\s+price\b/i,
  );
  if (named) {
    const ticker = tickerForName(named[1]);
    if (ticker) return { kind: "price", symbol: ticker };
  }

  // `upperOnly` patterns match the plain way people ask ("how much is TSLA",
  // "what's NVDA at") but only accept an UPPERCASE ticker in the source, so
  // "how much is my rent" or "what is it" never read as a quote lookup. A `$`
  // prefix ($tsla) is an explicit ticker, so those stay case-insensitive.
  const patterns: Array<{ re: RegExp; upperOnly?: boolean }> = [
    { re: /\b(?:of|for)\s+\$?([A-Za-z]{1,5})\b/i },
    { re: /\$?([A-Za-z]{1,5})\s+(?:price|quote|stock|share)/i },
    { re: /\b(?:price|quote)\s+(?:of|for)?\s*\$?([A-Za-z]{1,5})\b/i },
    { re: /\bhow\s+much\s+(?:is|are|does)\s+\$([A-Za-z]{1,5})\b/i },
    { re: /\bhow\s+much\s+(?:is|are|does)\s+([A-Za-z]{1,5})\b/i, upperOnly: true },
  ];
  for (const { re, upperOnly } of patterns) {
    const m = message.match(re);
    if (!m) continue;
    const raw = m[1];
    if (upperOnly && raw !== raw.toUpperCase()) continue; // ticker must be typed uppercase
    const symbol = raw.toUpperCase();
    // Don't treat a currency code or a bare hint word as a ticker.
    if (KNOWN_CURRENCIES.includes(symbol)) continue;
    if (/^(PRICE|QUOTE|STOCK|SHARE|OF|FOR|IS|ARE|AT|IT|ME|MY|THE)$/.test(symbol)) continue;
    return { kind: "price", symbol };
  }
  return null;
}

export function parseMarketDataIntent(message: unknown): MarketDataIntent {
  if (typeof message !== "string" || !message.trim()) return { kind: null };
  return detectFx(message) || detectPrice(message) || { kind: null };
}

export function isFxIntent(intent: MarketDataIntent): intent is FxIntent {
  return intent.kind === "fx";
}

export function isPriceIntent(intent: MarketDataIntent): intent is PriceIntent {
  return intent.kind === "price";
}
