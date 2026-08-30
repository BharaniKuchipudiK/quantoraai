/**
 * Ticker resolution — turns what a person actually typed into a US symbol we
 * can quote, or an honest "I don't know that one" with the nearest real
 * candidate named.
 *
 * Why this exists: asking for "APL" (one keystroke off AAPL) used to produce
 * "I don't have APL in my market data … run the Market Data Ingestion
 * workflow" — a refusal that blamed a data pipeline for what was a typo, and
 * pointed the person at a CI job they cannot run. The refusal was honest about
 * the number but wrong about the cause, and it left the actual question — what
 * is Apple worth — unanswered with the answer one character away.
 *
 * Two lookups, both pure and network-free:
 *   - a spoken company name ("apple", "tesla") → its ticker
 *   - a near-miss ticker (edit distance 1 against known symbols) → a suggestion
 *
 * A suggestion is never silently substituted. The caller quotes the suggested
 * symbol only while SAYING it did so, because quoting a different asset than
 * the one asked for, unannounced, is exactly the sort of quiet swap that makes
 * a finance tool untrustworthy.
 */

/**
 * Well-known US-listed names. Deliberately a curated shortlist rather than a
 * scraped universe: every entry here is a company whose ticker people type from
 * memory (and therefore mistype). The nearest-match search below is only as
 * safe as this list is unambiguous, so keep it small and famous.
 */
const KNOWN: Array<{ symbol: string; name: string; aliases?: string[] }> = [
  { symbol: "AAPL", name: "Apple", aliases: ["apple", "apple inc"] },
  { symbol: "MSFT", name: "Microsoft", aliases: ["microsoft"] },
  { symbol: "GOOGL", name: "Alphabet (Google)", aliases: ["google", "alphabet"] },
  { symbol: "AMZN", name: "Amazon", aliases: ["amazon"] },
  { symbol: "NVDA", name: "Nvidia", aliases: ["nvidia"] },
  { symbol: "TSLA", name: "Tesla", aliases: ["tesla"] },
  { symbol: "META", name: "Meta (Facebook)", aliases: ["meta", "facebook"] },
  { symbol: "NFLX", name: "Netflix", aliases: ["netflix"] },
  { symbol: "AMD", name: "AMD", aliases: ["amd"] },
  { symbol: "INTC", name: "Intel", aliases: ["intel"] },
  { symbol: "IBM", name: "IBM", aliases: ["ibm"] },
  { symbol: "ORCL", name: "Oracle", aliases: ["oracle"] },
  { symbol: "CRM", name: "Salesforce", aliases: ["salesforce"] },
  { symbol: "ADBE", name: "Adobe", aliases: ["adobe"] },
  { symbol: "PYPL", name: "PayPal", aliases: ["paypal"] },
  { symbol: "UBER", name: "Uber", aliases: ["uber"] },
  { symbol: "DIS", name: "Disney", aliases: ["disney"] },
  { symbol: "KO", name: "Coca-Cola", aliases: ["coca cola", "coca-cola", "coke"] },
  { symbol: "JPM", name: "JPMorgan Chase", aliases: ["jpmorgan", "jp morgan"] },
  { symbol: "V", name: "Visa", aliases: ["visa"] },
  { symbol: "WMT", name: "Walmart", aliases: ["walmart"] },
  { symbol: "BA", name: "Boeing", aliases: ["boeing"] },
  { symbol: "SBUX", name: "Starbucks", aliases: ["starbucks"] },
  { symbol: "PFE", name: "Pfizer", aliases: ["pfizer"] },
  { symbol: "SPY", name: "S&P 500 ETF", aliases: ["s&p 500", "sp500", "s and p 500"] },
];

const BY_SYMBOL = new Map(KNOWN.map((e) => [e.symbol, e]));

/** Company/product name → ticker, for "how much is Apple". */
const BY_NAME = new Map<string, string>();
for (const entry of KNOWN) {
  BY_NAME.set(entry.name.toLowerCase(), entry.symbol);
  for (const alias of entry.aliases || []) BY_NAME.set(alias.toLowerCase(), entry.symbol);
}

/** Levenshtein distance, capped — we only ever care whether it is 0, 1, or more. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2; // beyond our threshold; exact value irrelevant
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export type TickerResolution =
  /** A symbol we recognise — quote it as asked. */
  | { status: "known"; symbol: string; name: string }
  /** Not recognised, but exactly one near-miss. Quote it only while saying so. */
  | { status: "did-you-mean"; symbol: string; name: string; typed: string }
  /** Not a name or near-miss we know. Still worth trying the feed. */
  | { status: "unknown"; typed: string };

/**
 * Resolve a typed symbol or company name against the known universe.
 *
 * "unknown" is not a refusal: the curated list above is far smaller than the US
 * market, so an unrecognised symbol may still be perfectly real. The caller
 * should still ask the feed — this only decides what to SAY when the feed comes
 * back empty.
 */
export function resolveTicker(raw: string): TickerResolution {
  const typed = String(raw || "").trim();
  if (!typed) return { status: "unknown", typed };

  const upper = typed.toUpperCase();
  const exact = BY_SYMBOL.get(upper);
  if (exact) return { status: "known", symbol: exact.symbol, name: exact.name };

  const byName = BY_NAME.get(typed.toLowerCase());
  if (byName) {
    const entry = BY_SYMBOL.get(byName)!;
    return { status: "known", symbol: entry.symbol, name: entry.name };
  }

  // Exactly one near-miss makes a confident suggestion; two or more is a guess,
  // and guessing which company someone meant is worse than saying we don't know.
  const near = KNOWN.filter((e) => editDistance(upper, e.symbol) === 1);
  if (near.length === 1) {
    return { status: "did-you-mean", symbol: near[0].symbol, name: near[0].name, typed: upper };
  }

  return { status: "unknown", typed: upper };
}

/** Company name → ticker, for intent detection ("how much is Apple"). */
export function tickerForName(name: string): string | null {
  return BY_NAME.get(String(name || "").trim().toLowerCase()) || null;
}

/**
 * The first company or ticker named anywhere in a sentence.
 *
 * `resolveTicker` answers "what is this token?"; an investment question does
 * not hand you the token — it buries it in prose ("thinking about putting some
 * money into Apple"). This scans for a known name or an explicit ticker.
 *
 * Aliases are matched longest-first so "coca cola" wins over a bare "coke", and
 * the free-text ticker scan requires at least two characters: a lone capital
 * letter in ordinary prose is far more likely to be a word than Visa.
 *
 * `matchedAs` matters to the caller: an explicit ticker ("should I buy AAPL")
 * is unambiguously about the security, while a company NAME ("should I buy an
 * Apple Watch") is very often about the product. The caller uses this to demand
 * more context before treating a bare name as an investment question.
 */
export type TextTickerMatch = {
  symbol: string;
  matchedAs: "ticker" | "name";
  /** Where the mention starts, so the caller can read the words around it. */
  index: number;
  /** The literal text that matched, for the same reason. */
  matchedText: string;
};

export function findTickerInText(message: string): TextTickerMatch | null {
  const text = String(message || "");
  if (!text.trim()) return null;

  // An explicit uppercase ticker is the least ambiguous signal available.
  for (const match of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const entry = BY_SYMBOL.get(match[1]);
    if (entry) {
      return { symbol: entry.symbol, matchedAs: "ticker", index: match.index ?? 0, matchedText: match[1] };
    }
  }

  const lower = text.toLowerCase();
  let best: { symbol: string; index: number; length: number } | null = null;
  for (const [alias, symbol] of BY_NAME) {
    const at = lower.indexOf(alias);
    if (at < 0) continue;
    // Word boundaries by hand: aliases contain spaces, dots and ampersands that
    // \b handles inconsistently.
    const before = at === 0 ? " " : lower[at - 1];
    const after = at + alias.length >= lower.length ? " " : lower[at + alias.length];
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
    // Earliest mention wins; on a tie the longer alias is the more specific one.
    if (!best || at < best.index || (at === best.index && alias.length > best.length)) {
      best = { symbol, index: at, length: alias.length };
    }
  }
  if (!best) return null;
  return {
    symbol: best.symbol,
    matchedAs: "name",
    index: best.index,
    matchedText: text.slice(best.index, best.index + best.length),
  };
}
