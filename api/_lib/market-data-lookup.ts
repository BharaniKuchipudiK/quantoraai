/**
 * Pure formatting + decision logic for the market-data gateway (ADR-025, P2).
 *
 * The one job here is the grounding contract: quote a figure ONLY from a stored,
 * sourced, fresh row, and otherwise REFUSE with an honest reason — never invent a
 * number. Every branch carries `as_of` + `source`. Pure and network-free so it is
 * fully unit-testable, mirroring evaluateAffordability.
 */

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
  return `As of ${date} · source: ${source}. This is a stored, sourced figure — not a model estimate.`;
}

/** Resolve base→quote from a direct row, or invert a quote→base row. */
export function resolveFxRate(
  base: string,
  quote: string,
  direct: FxRate | null,
  inverse: FxRate | null,
): { rate: number; source: string; as_of: string; rate_date: string; inverted: boolean } | null {
  if (direct && typeof direct.rate === "number" && direct.rate > 0) {
    return { rate: direct.rate, source: direct.source, as_of: direct.as_of, rate_date: direct.rate_date, inverted: false };
  }
  if (inverse && typeof inverse.rate === "number" && inverse.rate > 0) {
    return { rate: 1 / inverse.rate, source: inverse.source, as_of: inverse.as_of, rate_date: inverse.rate_date, inverted: true };
  }
  return null;
}

export function fxLookupResult(
  intent: FxIntent,
  direct: FxRate | null,
  inverse: FxRate | null,
  now: Date = new Date(),
): LookupResult {
  const { base, quote, amount } = intent;
  const resolved = resolveFxRate(base, quote, direct, inverse);

  if (!resolved) {
    return {
      resolved: false,
      stale: false,
      text: `I don't have a stored **${base}→${quote}** rate yet. Quantora only quotes rates it has ingested from a real source (the ECB feed) — it will not invent one. Run the **Market Data Ingestion** workflow to populate FX, then ask again.`,
    };
  }

  if (isBarStale({ as_of: resolved.as_of }, undefined, now.getTime())) {
    return {
      resolved: false,
      stale: true,
      text: `I have a **${base}→${quote}** rate, but it is from **${resolved.rate_date}**, which is older than I'll rely on. I won't quote a stale rate as if it were current — re-run the **Market Data Ingestion** workflow to refresh it.`,
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
        text: `I have a price for **${sym}**, but its last bar is from **${bar.price_date}**, which is stale. I won't present a stale close as the current price — refresh the market-data ingestion first.`,
      };
    }
    const cur = bar.currency || "";
    return {
      resolved: true,
      stale: false,
      text: `**${sym} — ${fmt(bar.close)} ${cur}** (last close)\n\n${asOfLine(bar.source, bar.as_of)}`,
    };
  }

  if (instrument) {
    return {
      resolved: false,
      stale: false,
      text: `**${sym}** is in the reference universe (${instrument.name || sym}), but I have **no price data** for it yet. The free tier covers the equity list and FX, not live prices — connect a price feed (e.g. Marketstack) to quote it. I won't guess a price.`,
    };
  }

  return {
    resolved: false,
    stale: false,
    text: `I don't have **${sym}** in my market data, so I can't quote it — and I won't invent a number. If it's a US-listed symbol, run the **Market Data Ingestion** workflow to load the reference universe.`,
  };
}
