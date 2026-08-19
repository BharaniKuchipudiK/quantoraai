export type AffordabilityIntent = {
  matched: boolean;
  proposedCost: number | null;
  currency: string | null;
};

const AFFORDABILITY_PATTERNS = [
  /\bcan\s+(?:i|we)\s+afford\b/i,
  /\bcould\s+(?:i|we)\s+afford\b/i,
  /\bis\s+(?:this|that|it)\s+affordable\b/i,
  /\bwould\s+(?:this|that|it)\s+be\s+affordable\b/i,
];

const CURRENCY_ALIASES: Array<{ regex: RegExp; currency: string }> = [
  { regex: /\bSGD\b|(?<![A-Z])S\$/i, currency: "SGD" },
  { regex: /\bUSD\b|US\$/i, currency: "USD" },
  { regex: /\bAUD\b|(?<![A-Z])A\$/i, currency: "AUD" },
  { regex: /\bGBP\b|£/i, currency: "GBP" },
  { regex: /\bEUR\b|€/i, currency: "EUR" },
  { regex: /\bINR\b|₹/i, currency: "INR" },
  { regex: /\bJPY\b/i, currency: "JPY" },
];

function normalizeAmount(raw: string, multiplierRaw?: string): number | null {
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const multiplier = multiplierRaw?.toLowerCase() === "m"
    ? 1_000_000
    : multiplierRaw?.toLowerCase() === "k"
      ? 1_000
      : 1;
  const amount = numeric * multiplier;
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

function currencyFromMessage(message: string): string | null {
  const matches = CURRENCY_ALIASES.filter(({ regex }) => regex.test(message));
  const currencies = [...new Set(matches.map((match) => match.currency))];
  return currencies.length === 1 ? currencies[0] : null;
}

function amountFromMessage(message: string, currency: string | null): number | null {
  const amountPattern = "([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)(?:\\s*)([kKmM])?";

  if (currency) {
    const aliases = CURRENCY_ALIASES
      .filter((entry) => entry.currency === currency)
      .map((entry) => entry.regex.source);
    const aliasGroup = `(?:${aliases.join("|")})`;
    const before = message.match(new RegExp(`${aliasGroup}\\s*${amountPattern}`, "i"));
    if (before) return normalizeAmount(before[1], before[2]);
    const after = message.match(new RegExp(`${amountPattern}\\s*${aliasGroup}`, "i"));
    if (after) return normalizeAmount(after[1], after[2]);
  }

  // A bare number is accepted only when an ISO/symbol currency was identified
  // elsewhere in the same request. Plain "$" is intentionally not mapped: it
  // is ambiguous across USD, SGD, AUD and several other currencies.
  if (currency) {
    const generic = message.match(new RegExp(amountPattern, "i"));
    if (generic) return normalizeAmount(generic[1], generic[2]);
  }
  return null;
}

export function parseAffordabilityIntent(message: unknown): AffordabilityIntent {
  if (typeof message !== "string" || !message.trim()) {
    return { matched: false, proposedCost: null, currency: null };
  }
  const matched = AFFORDABILITY_PATTERNS.some((pattern) => pattern.test(message));
  if (!matched) return { matched: false, proposedCost: null, currency: null };

  const currency = currencyFromMessage(message);
  return {
    matched: true,
    currency,
    proposedCost: amountFromMessage(message, currency),
  };
}
