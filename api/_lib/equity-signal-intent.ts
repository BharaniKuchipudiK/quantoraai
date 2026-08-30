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
 * Deliberately narrower than "any message mentioning a company". It must carry
 * an investment/timing verb AND name something resolvable, so ordinary finance
 * conversation ("I work at Apple", "Tesla was in the news") flows through chat
 * untouched. Pure and network-free.
 */

import { findTickerInText } from "./market-data/ticker-resolve.js";

export type SignalIntent = { kind: "signal"; symbol: string; thresholdPct: number };
export type NoIntent = { kind: null };

/**
 * Phrasings that mean "help me decide about holding this", rather than "what
 * does it cost". The price desk already owns the second.
 */
const INVEST_ASK = [
  /\b(?:best|right|good|ideal)\s+time\s+to\s+(?:invest|buy|enter|get\s+in)\b/i,
  /\bshould\s+(?:i|we)\s+(?:buy|invest|put\s+money)\b/i,
  /\b(?:is|are)\s+(?:it|they|this|that)?\s*(?:a\s+)?good\s+(?:investment|buy|bet|stock)\b/i,
  /\bgood\s+(?:investment|buy|bet)\b/i,
  /\bworth\s+(?:investing|buying|holding|a\s+punt)\b/i,
  /\bwhen\s+(?:should\s+(?:i|we)\s+)?(?:buy|invest|enter)\b/i,
  /\bthinking\s+(?:of|about)\s+(?:investing|buying)\b/i,
  /\b(?:invest|investing)\s+in\b/i,
  /\bshall\s+(?:i|we)\s+(?:buy|invest)\b/i,
  /\b(?:buy|hold|sell)\s+or\s+(?:buy|hold|sell)\b/i,
];

/**
 * A return target stated in the question ("can I get 10% back", "20% returns").
 * It becomes the bar the historical base rates are counted against, so the
 * answer addresses the number actually asked about rather than a house default.
 */
const TARGET_RETURN = /\b(\d{1,3}(?:\.\d+)?)\s*%\s*(?:returns?|gains?|profit|back|up|growth)?/i;

const DEFAULT_THRESHOLD_PCT = 10;
const MAX_THRESHOLD_PCT = 500;

export function parseSignalIntent(message: unknown): SignalIntent | NoIntent {
  if (typeof message !== "string" || !message.trim()) return { kind: null };
  if (!INVEST_ASK.some((re) => re.test(message))) return { kind: null };

  const symbol = findTickerInText(message);
  if (!symbol) return { kind: null };

  return { kind: "signal", symbol, thresholdPct: targetReturnPct(message) };
}

/** The return the person asked about, or the house default when none is named. */
function targetReturnPct(message: string): number {
  const match = message.match(TARGET_RETURN);
  if (!match) return DEFAULT_THRESHOLD_PCT;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct > MAX_THRESHOLD_PCT) return DEFAULT_THRESHOLD_PCT;
  return pct;
}

export function isSignalIntent(intent: SignalIntent | NoIntent): intent is SignalIntent {
  return intent.kind === "signal";
}
