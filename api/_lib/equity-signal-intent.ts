/**
 * Detects an INVESTMENT question about a specific company — the shape that used
 * to slip past the deterministic desk entirely.
 *
 * "how much is Apple" was recognised and grounded. "when is the best time to
 * invest in Apple" was not, so it reached the language model and came back as a
 * generic essay containing no fact about Apple, minutes after the platform had
 * quoted a live price for it. Same company, same session, opposite answers —
 * decided purely by phrasing.
 *
 * Deliberately narrow. It must carry investment intent AND name something
 * resolvable, so ordinary conversation ("I work at Apple") and ordinary
 * SHOPPING ("should I buy an Apple Watch") flow through chat untouched. Pure
 * and network-free.
 */

import { findTickerInText } from "./market-data/ticker-resolve.js";

export type SignalIntent = { kind: "signal"; symbol: string; thresholdPct: number };
export type NoIntent = { kind: null };

/**
 * Unambiguously about holding a security. "Invest" carries the meaning on its
 * own, so a company name alone is enough alongside these.
 */
const EXPLICIT_INVEST = [
  /\b(?:best|right|good|ideal)\s+time\s+to\s+(?:invest|buy\s+in(?:to)?|enter)\b/i,
  /\b(?:invest|investing|invested)\s+in\b/i,
  /\bshould\s+(?:i|we)\s+invest\b/i,
  /\bshall\s+(?:i|we)\s+invest\b/i,
  /\bworth\s+investing\b/i,
  /\bgood\s+(?:investment|stock|bet)\b/i,
  /\bthinking\s+(?:of|about)\s+investing\b/i,
  /\bput\s+money\s+(?:in|into)\b/i,
];

/**
 * "Buy" on its own means shopping at least as often as it means investing.
 * "Should I buy an Apple Watch?" and "should I buy a Visa gift card?" both hit
 * these patterns and both found a company alias — and both were answered with
 * equity analytics. These require a security signal before they count.
 */
const GENERIC_BUY = [
  /\bshould\s+(?:i|we)\s+buy\b/i,
  /\bshall\s+(?:i|we)\s+buy\b/i,
  /\bwhen\s+(?:should\s+(?:i|we)\s+)?buy\b/i,
  /\bworth\s+(?:buying|holding|a\s+punt)\b/i,
  /\bthinking\s+(?:of|about)\s+buying\b/i,
  /\b(?:buy|hold|sell)\s+or\s+(?:buy|hold|sell)\b/i,
];

/**
 * A company name used as a BRAND rather than a security.
 *
 * "Should I buy an Apple Watch" and "shall I buy a Tesla" are shopping; "should
 * I buy Apple" is almost always the stock. The tells are an indefinite article
 * in front of the name, or a product noun right after it. A heuristic, and
 * openly one — but it separates the cases people actually type.
 */
const PRODUCT_NOUN = /^(?:watch|phone|iphone|ipad|laptop|macbook|car|tv|tickets?|gift|card|voucher|keyboard|mouse|headphones|subscription|prime|pass|plus|store|shares?)\b/i;

function looksLikeAProduct(message: string, match: { index: number; matchedText: string }): boolean {
  const before = message.slice(Math.max(0, match.index - 4), match.index);
  if (/\b(?:a|an)\s+$/i.test(before)) return true;
  const after = message.slice(match.index + match.matchedText.length).replace(/^[\s'’]+/, "");
  // "shares" after a name is a security, not a product — handled by the caller's
  // security-context check, so only non-security nouns count here.
  return PRODUCT_NOUN.test(after) && !/^shares?\b/i.test(after);
}

/** Words that make a bare "buy" unmistakably about a security. */
const SECURITY_CONTEXT =
  /\b(?:stocks?|shares?|equit(?:y|ies)|ticker|the\s+dip|position|portfolio|holdings?|dividend|market)\b/i;

/**
 * A return target the person actually ASKED for.
 *
 * The trailing qualifier used to be optional, which made every percentage in
 * the sentence a target: "Apple is down 20%, should I buy?" produced a card
 * headed "Returned 20% or more", a number the reader never requested. Both
 * forms below require the intent to be stated — either a verb of wanting in
 * front, or return language behind.
 */
const TARGET_RETURN = [
  /\b(?:get|make|earn|want|need|targeting|aiming\s+for|looking\s+for|expect)\s+(?:a\s+|an\s+)?(\d{1,3}(?:\.\d+)?)\s*%/i,
  /\b(\d{1,3}(?:\.\d+)?)\s*%\s*(?:returns?|gains?|profit|growth|upside|annually|a\s+year)\b/i,
];

const DEFAULT_THRESHOLD_PCT = 10;
const MAX_THRESHOLD_PCT = 500;

export function parseSignalIntent(message: unknown): SignalIntent | NoIntent {
  if (typeof message !== "string" || !message.trim()) return { kind: null };

  const match = findTickerInText(message);
  if (!match) return { kind: null };

  const explicit = EXPLICIT_INVEST.some((re) => re.test(message));
  const generic = GENERIC_BUY.some((re) => re.test(message));
  if (!explicit && !generic) return { kind: null };

  /*
   * A generic "buy" against a bare company NAME is the ambiguous case. An
   * explicit ticker is never a product, and security context settles it either
   * way; otherwise fall back to whether the name reads as a brand.
   */
  if (!explicit && match.matchedAs === "name" && !SECURITY_CONTEXT.test(message)
      && looksLikeAProduct(message, match)) {
    return { kind: null };
  }

  return { kind: "signal", symbol: match.symbol, thresholdPct: targetReturnPct(message) };
}

/** The return the person asked about, or the house default when none is named. */
function targetReturnPct(message: string): number {
  for (const re of TARGET_RETURN) {
    const found = message.match(re);
    if (!found) continue;
    const pct = Number(found[1]);
    if (Number.isFinite(pct) && pct > 0 && pct <= MAX_THRESHOLD_PCT) return pct;
  }
  return DEFAULT_THRESHOLD_PCT;
}

export function isSignalIntent(intent: SignalIntent | NoIntent): intent is SignalIntent {
  return intent.kind === "signal";
}
