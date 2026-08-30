/**
 * Probabilistic FX-projection gateway (ADR-025) — Finance-only. On a forward
 * "when/will/odds this pair reaches <level>" turn, it calibrates on the stored
 * ECB series and answers with the ODDS and a range (never a date), before the
 * model runs. With too little stored history it refuses honestly rather than
 * projecting from nothing — the same boundary as the analytics gateway.
 *
 * Isolation: returns false immediately unless studioDomain is 'finance' AND the
 * turn carries a forecast intent. Wired BEFORE the spot-conversion and
 * descriptive-analytics gateways, but its intent is strictly narrower (a target
 * level plus a forward framing), so those keep their own turns.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseFxForecastIntent } from "./fx-forecast-intent.js";
import { forecastFxLevel, formatFxForecast } from "./fx-forecast.js";
import { isMarketDataStoreConfigured, readFxHistory, type FxRate } from "./market-data-store.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";

const FX_FORECAST_RATE_LIMIT_PER_MINUTE = 60;
// One year of daily history is what the ingestion pulls; calibrate on that.
const HISTORY_WINDOW_DAYS = 365;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Market Data",
    modelId: "quantora-fx-projection-v1",
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

export function handleFxForecast(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("fx-forecast", res, () => runFxForecast(req, res));
}

async function runFxForecast(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseFxForecastIntent(req.body?.message);
  if (!intent) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `fxforecast:user:${session.sub}` : `fxforecast:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, FX_FORECAST_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many market-data lookups. Please wait a minute and try again." });
    return true;
  }

  if (!isMarketDataStoreConfigured()) {
    sendStream(
      res,
      requestId,
      "I can only project a rate from real stored history, and market data isn't connected on this deployment yet — so I won't put odds on a number I can't ground. Once the market-data store is configured and the daily ingestion has run, I'll answer from the stored ECB series.",
    );
    return true;
  }

  const to = isoDate(Date.now());
  const from = isoDate(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let series = await readFxHistory(intent.base, intent.quote, from, to);
  if (!series.length) {
    const inverse = await readFxHistory(intent.quote, intent.base, from, to);
    if (inverse.length) series = invertSeries(inverse, intent.base, intent.quote);
  }

  const forecast = forecastFxLevel(intent.base, intent.quote, series, {
    target: intent.target,
    horizonMonths: intent.horizonMonths,
  });

  if (!forecast) {
    sendStream(
      res,
      requestId,
      `I don't have enough stored ${intent.base}/${intent.quote} history yet to model this honestly — a drift-and-volatility estimate needs a real run of daily observations, and projecting from a handful of points would be a guess dressed up as a probability. Once more history has accumulated, ask me again.`,
    );
    return true;
  }

  sendStream(res, requestId, formatFxForecast(forecast));
  return true;
}
