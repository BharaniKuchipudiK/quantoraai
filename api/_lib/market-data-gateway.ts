/**
 * Deterministic market-data gateway (ADR-025, P2) — the Finance analog of
 * handleAffordabilityDecision. On a Finance turn that asks for an FX rate or a
 * stock quote, it answers from real, sourced market data — the live ECB feed
 * for FX, the ingested table for everything else — or refuses when the data is
 * missing or stale, BEFORE the language model runs, so the figure is grounded
 * and not hallucinated.
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
import { liveFxRate } from "./market-data/frankfurter-provider.js";
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

  /*
   * FX is answered LIVE first, and from the store only if the live call fails.
   *
   * Answering from the store alone made conversion depend on a workflow that
   * has never run on a schedule: the stored rate ages past the four-day window
   * and the desk refuses every conversion until somebody clicks "Run workflow".
   * That is a feature that breaks every four days by construction, and it is
   * what "the real time conversion is no longer happening" looks like.
   *
   * Two independent paths now. Frankfurter is free and keyless and serves the
   * same ECB reference rates the ingestion pulls, so the two sources cannot
   * disagree about what a rate IS — only about how recent it is, and the live
   * one is always at least as recent. Note this runs BEFORE the store-not-
   * configured refusal below, because FX no longer needs a store at all.
   */
  if (isFxIntent(intent)) {
    const storeReady = isMarketDataStoreConfigured();
    const direct = (await liveFxRate(intent.base, intent.quote))
      || (storeReady ? await readLatestFxRate(intent.base, intent.quote) : null);
    const inverse = direct || !storeReady ? null : await readLatestFxRate(intent.quote, intent.base);
    sendStream(res, requestId, fxLookupResult(intent, direct, inverse).text);
    return true;
  }

  if (!isMarketDataStoreConfigured()) {
    /*
     * This one must NOT fall through. Every other refusal in this file consumes
     * the turn precisely so an unsourced figure is never produced; letting an
     * FX/quote question reach the LLM instead invites an invented rate stated as
     * fact. Refusing and saying so is the correct answer here, not a dead end -
     * the reply names the reason and does not pretend a number exists.
     */
    sendStream(
      res,
      requestId,
      "Market data isn't connected on this deployment yet, so I can't quote a real figure \u2014 and I won't guess one. Ask me anything else about this, or start a new chat for a non-market question.",
    );
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
