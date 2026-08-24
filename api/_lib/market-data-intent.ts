/**
 * Detects an explicit market-data lookup in a Finance-workspace message — an FX
 * rate/conversion or a stock quote. Only clear lookups match; ordinary finance
 * conversation ("what do you think of tech stocks?") returns { kind: null } and
 * flows through normal chat untouched. This is the trigger for the deterministic
 * grounding gateway, the market-data analog of parseAffordabilityIntent.
 */

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
  const upper = message.toUpperCase();
  let base: string | null = null;
  let quote: string | null = null;

  const paired = message.match(FX_PAIR);
  if (paired) {
    base = paired[1].toUpperCase();
    quote = paired[2].toUpperCase();
  } else if (FX_HINT.test(message)) {
    // No explicit connector, but a rate/convert hint plus exactly two currencies.
    const found = KNOWN_CURRENCIES.filter((c) => new RegExp(`\\b${c}\\b`).test(upper));
    if (found.length === 2) {
      const order = found.sort((a, b) => upper.indexOf(a) - upper.indexOf(b));
      [base, quote] = order;
    }
  }

  if (!base || !quote || base === quote) return null;
  return { kind: "fx", base, quote, amount: firstAmount(message) };
}

function detectPrice(message: string): MarketDataIntent | null {
  if (!PRICE_HINT.test(message)) return null;
  const patterns = [
    /\b(?:of|for)\s+\$?([A-Za-z]{1,5})\b/i,
    /\$?([A-Za-z]{1,5})\s+(?:price|quote|stock|share)/i,
    /\b(?:price|quote)\s+(?:of|for)?\s*\$?([A-Za-z]{1,5})\b/i,
  ];
  for (const pattern of patterns) {
    const m = message.match(pattern);
    if (!m) continue;
    const symbol = m[1].toUpperCase();
    // Don't treat a currency code or a bare hint word as a ticker.
    if (KNOWN_CURRENCIES.includes(symbol)) continue;
    if (/^(PRICE|QUOTE|STOCK|SHARE|OF|FOR)$/.test(symbol)) continue;
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
