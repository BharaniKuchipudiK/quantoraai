/**
 * Deterministic historical-FX-analytics gateway (ADR-025) — the Finance analog
 * of handleMarketDataLookup, for "how has this pair performed?" turns. It reads
 * the stored ECB series and answers with descriptive statistics (change, range,
 * average, volatility, trend) BEFORE the language model runs, so the analysis is
 * grounded in real history — and it explicitly refuses to forecast.
 *
 * Isolation: returns false immediately unless the turn is studioDomain 'finance'
 * AND carries a history/performance intent. Every other domain and every
 * ordinary finance message flow through normal chat untouched.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseFxAnalyticsIntent, isFxAnalyticsIntent } from "./fx-analytics-intent.js";
import { fxAnalyticsResult } from "./fx-analytics.js";
import { isMarketDataStoreConfigured, readFxHistory, type FxRate } from "./market-data-store.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";

const FX_ANALYTICS_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Market Data",
    modelId: "quantora-fx-analytics-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Invert a quote→base series into base→quote (rate = 1/rate), keeping provenance. */
function invertSeries(rows: FxRate[], base: string, quote: string): FxRate[] {
  return rows
    .filter((r) => typeof r.rate === "number" && r.rate > 0)
    .map((r) => ({
      base_currency: base,
      quote_currency: quote,
      rate_date: r.rate_date,
      rate: 1 / r.rate,
      source: r.source,
      as_of: r.as_of,
    }));
}

export function handleFxAnalytics(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("fx-analytics", res, () => runFxAnalytics(req, res));
}

async function runFxAnalytics(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  // Isolation gate: Finance workspace only.
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseFxAnalyticsIntent(req.body?.message);
  if (!isFxAnalyticsIntent(intent)) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `fxanalytics:user:${session.sub}` : `fxanalytics:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, FX_ANALYTICS_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many market-data lookups. Please wait a minute and try again." });
    return true;
  }

  if (!isMarketDataStoreConfigured()) {
    sendStream(
      res,
      requestId,
      "Market data isn't connected on this deployment yet, so I can't analyze a real series — and I won't invent one. Once the market-data store is configured and the ingestion has run, I'll answer from stored, sourced history.",
    );
    return true;
  }

  const to = isoDate(Date.now());
  const from = isoDate(Date.now() - intent.days * 24 * 60 * 60 * 1000);
  let series = await readFxHistory(intent.base, intent.quote, from, to);
  if (!series.length) {
    const inverse = await readFxHistory(intent.quote, intent.base, from, to);
    if (inverse.length) series = invertSeries(inverse, intent.base, intent.quote);
  }

  sendStream(res, requestId, fxAnalyticsResult(intent, series).text);
  return true;
}
