/**
 * Pure formatting + decision logic for the market-data gateway (ADR-025, P2).
 *
 * The one job here is the grounding contract: quote a figure ONLY from a stored,
 * sourced, fresh row, and otherwise REFUSE with an honest reason — never invent a
 * number. Every branch carries `as_of` + `source`. Pure and network-free so it is
 * fully unit-testable, mirroring evaluateAffordability.
 */

import { FINNHUB_SOURCE } from "./market-data/finnhub-provider.js";
import { isBarStale, type FxRate, type PriceBar, type Instrument } from "./market-data-store.js";
import type { FxIntent, PriceIntent } from "./market-data-intent.js";

export type LookupResult = {
  text: string;
  resolved: boolean; // true only when a fresh, sourced figure was quoted
  stale: boolean;
};

function fmt(n: number, dp = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function asOfLine(source: string, asOf: string): string {
  const date = asOf.slice(0, 10);
  // "stored" was true when every figure came from the ingested table. FX is now
  // answered live first, so the word would be false half the time — and the
  // sentence exists to be trusted. "Real" carries the same promise for both.
  return `As of ${date} · source: ${source}. This is a real, sourced figure — not a model estimate.`;
}

/**
 * The most recently published of several candidate rows, ignoring the ones that
 * carry no usable date. Used to choose between a live rate and a stored one
 * rather than trusting whichever was fetched first — which is not a fact about
 * the rate at all, only about the order of two awaits.
 */
export function freshestFxRate(...candidates: Array<FxRate | null | undefined>): FxRate | null {
  let best: FxRate | null = null;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.rate !== "number" || !(candidate.rate > 0)) continue;
    const when = Date.parse(candidate.as_of || "");
    if (!Number.isFinite(when)) continue;
    if (!best || when > Date.parse(best.as_of)) best = candidate;
  }
  return best;
}

function usable(row: FxRate | null): boolean {
  return Boolean(row) && typeof row!.rate === "number" && row!.rate > 0;
}

/** Resolve base→quote from a direct row, or invert a quote→base row. */
export function resolveFxRate(
  base: string,
  quote: string,
  direct: FxRate | null,
  inverse: FxRate | null,
  now: number = Date.now(),
): { rate: number; source: string; as_of: string; rate_date: string; inverted: boolean } | null {
  const asDirect = (row: FxRate) =>
    ({ rate: row.rate, source: row.source, as_of: row.as_of, rate_date: row.rate_date, inverted: false });
  const asInverse = (row: FxRate) =>
    ({ rate: 1 / row.rate, source: row.source, as_of: row.as_of, rate_date: row.rate_date, inverted: true });

  /*
   * Direct is preferred, but only while it is USABLE. It used to win
   * unconditionally, so a stale base→quote row shadowed a fresh quote→base one
   * and the turn was refused with a good rate available — the same masking
   * defect as a stale live row hiding a fresh stored one, one hop over.
   */
  const directFresh = usable(direct) && !isBarStale({ as_of: direct!.as_of }, undefined, now);
  if (directFresh) return asDirect(direct!);

  const inverseFresh = usable(inverse) && !isBarStale({ as_of: inverse!.as_of }, undefined, now);
  if (inverseFresh) return asInverse(inverse!);

  // Nothing fresh. Still return the best row there is, so the caller can say
  // WHICH date it is refusing rather than "I have no rate for this pair".
  if (usable(direct)) return asDirect(direct!);
  if (usable(inverse)) return asInverse(inverse!);
  return null;
}

export function fxLookupResult(
  intent: FxIntent,
  direct: FxRate | null,
  inverse: FxRate | null,
  now: Date = new Date(),
): LookupResult {
  const { base, quote, amount } = intent;
  const resolved = resolveFxRate(base, quote, direct, inverse, now.getTime());

  if (!resolved) {
    return {
      resolved: false,
      stale: false,
      text: `I couldn't reach a real source for **${base}→${quote}** just now — the live ECB feed didn't answer and I have nothing stored for this pair. I quote only rates I hold from a real source, so I won't invent one. This is usually momentary: try again shortly.`,
    };
  }

  if (isBarStale({ as_of: resolved.as_of }, undefined, now.getTime())) {
    return {
      resolved: false,
      stale: true,
      text: `The most recent **${base}→${quote}** rate I hold is from **${resolved.rate_date}**, which is older than I'll rely on. I won't present a stale rate as today's. Try again shortly — the live feed usually recovers on its own.`,
    };
  }

  const rate = resolved.rate;
  const lines: string[] = [`**1 ${base} = ${fmt(rate, 4)} ${quote}**`];
  if (amount !== null && amount > 0) {
    lines.unshift(`**${fmt(amount)} ${base} = ${fmt(amount * rate)} ${quote}**`);
  }
  lines.push("", asOfLine(resolved.source === "ecb" ? "ECB (Frankfurter)" : resolved.source, resolved.as_of));
  return { resolved: true, stale: false, text: lines.join("\n") };
}

export function priceLookupResult(
  intent: PriceIntent,
  bar: PriceBar | null,
  instrument: Instrument | null,
  now: Date = new Date(),
): LookupResult {
  const sym = intent.symbol;

  if (bar && typeof bar.close === "number") {
    if (isBarStale(bar, undefined, now.getTime())) {
      return {
        resolved: false,
        stale: true,
        text: `I have a price for **${sym}**, but its last bar is from **${bar.price_date}**, which is stale. I won't present a stale close as the current price. Try again shortly.`,
      };
    }
    const cur = bar.currency || "";
    /*
     * "(last close)" was hardcoded, which was true while every bar came from an
     * end-of-day feed and became a lie the moment a real-time one was added.
     * A live intraday price labelled "last close" understates its freshness; a
     * settled close labelled "live" overstates it, and that direction is the
     * dangerous one. The label follows the bar's actual source.
     */
    const live = bar.source === FINNHUB_SOURCE;
    const label = live ? "live" : "last close";
    const stamp = live
      ? `As of ${bar.as_of.slice(11, 16)} UTC · source: ${bar.source}. This is a real, sourced figure — not a model estimate.`
      : asOfLine(bar.source, bar.as_of);
    return {
      resolved: true,
      stale: false,
      text: `**${sym} — ${fmt(bar.close)} ${cur}** (${label})\n\n${stamp}`,
    };
  }

  if (instrument) {
    return {
      resolved: false,
      stale: false,
      text: `I know **${sym}** (${instrument.name || sym}), but I don't hold a price for it yet. I won't guess one. Try again shortly, or ask me about a widely-held US name.`,
    };
  }

  return {
    resolved: false,
    stale: false,
    text: unknownSymbolText(sym),
  };
}

/**
 * What to say when nothing could be quoted for a symbol.
 *
 * Split by CAUSE, because the previous single message ("I don't have SYM in my
 * market data … run the Market Data Ingestion workflow") described a typo as a
 * coverage gap and answered it with a CI job the reader cannot run. Each branch
 * below names the real reason and offers a step the person can actually take.
 */
export function unknownSymbolText(symbol: string, suggestion?: { symbol: string; name: string }): string {
  if (suggestion) {
    return `I don't recognise **${symbol}** as a US ticker — did you mean **${suggestion.symbol}** (${suggestion.name})? Ask me for ${suggestion.symbol} and I'll quote it.`;
  }
  return `I don't recognise **${symbol}** as a US-listed ticker, so I can't quote it — and I won't invent a number. Check the symbol, or give me the company name and I'll find it.`;
}

/** The feed itself was unreachable — this says nothing about whether the symbol is real. */
export function feedUnreachableText(symbol: string): string {
  return `I couldn't reach the price feed for **${symbol}** just now, so I have no figure I'd stand behind — and I won't estimate one. This is usually momentary: try again shortly.`;
}
