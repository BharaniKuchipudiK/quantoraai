/**
 * Deterministic market-data gateway (ADR-025, P2) — the Finance analog of
 * handleAffordabilityDecision. On a Finance turn that asks for an FX rate or a
 * stock quote, it answers from the stored, sourced market data (or refuses when
 * the data is missing/stale) BEFORE the language model runs, so the figure is
 * grounded, not hallucinated.
 *
 * Isolation: it returns false immediately unless the turn is studioDomain
 * 'finance' AND carries a market-data lookup intent. Every other domain and
 * every ordinary finance message flow through normal chat untouched — this
 * cannot affect Travel, Study, Research, or coding.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseMarketDataIntent, isFxIntent, isPriceIntent } from "./market-data-intent.js";
import { fxLookupResult, priceLookupResult } from "./market-data-lookup.js";
import {
  isMarketDataStoreConfigured,
  readLatestFxRate,
  readLatestPrice,
  readInstrument,
} from "./market-data-store.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";

const MARKET_DATA_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string, deterministic = true): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Market Data",
    modelId: "quantora-market-data-v1",
    requestId,
    liveConnected: true,
    deterministic,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export async function handleMarketDataLookup(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  // Isolation gate: Finance workspace only.
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseMarketDataIntent(req.body?.message);
  if (intent.kind === null) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `mktdata:user:${session.sub}` : `mktdata:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, MARKET_DATA_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many market-data lookups. Please wait a minute and try again." });
    return true;
  }

  if (!isMarketDataStoreConfigured()) {
    /*
     * No market-data store means no sourced figure, and inventing one is never
     * acceptable. But consuming the turn made every FX/quote question a dead end
     * on this deployment. Fall through to chat, which can answer without
     * quoting a live number.
     */
    return false;
  }

  if (isFxIntent(intent)) {
    const direct = await readLatestFxRate(intent.base, intent.quote);
    const inverse = direct ? null : await readLatestFxRate(intent.quote, intent.base);
    sendStream(res, requestId, fxLookupResult(intent, direct, inverse).text);
    return true;
  }

  if (isPriceIntent(intent)) {
    const bar = await readLatestPrice(`${intent.symbol}.US`);
    const instrument = bar ? null : await readInstrument(`${intent.symbol}.US`);
    sendStream(res, requestId, priceLookupResult(intent, bar, instrument).text);
    return true;
  }

  return false;
}
