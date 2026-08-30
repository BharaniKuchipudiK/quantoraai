/**
 * Signal Read desk (Finance) — answers an INVESTMENT question with computed
 * facts before the language model gets a turn.
 *
 * The gap this closes: "how much is Apple" reached the deterministic desk and
 * returned a live, sourced price; "when is the best time to invest in Apple"
 * did not, and came back as a generic essay containing no fact about Apple.
 * Same company, same session, opposite answers — decided by phrasing alone.
 *
 * Isolation: returns false immediately unless the turn is studioDomain
 * 'finance' AND carries an investment intent naming a company we can resolve.
 * Travel, Study, Research and coding are untouched.
 *
 * Degrades honestly. The price comes from the live quote path; everything else
 * needs the daily history feed. If that feed is unreachable the card shrinks to
 * the price and says why — it never fills the gap with an estimate.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseSignalIntent, isSignalIntent } from "./equity-signal-intent.js";
import { buildSignalRead, isSignalEmpty, formatSignalRead, formatSignalUnavailable } from "./equity-signal.js";
import { realtimeQuote } from "./market-data/finnhub-provider.js";
import { liveStockQuoteOutcome, stooqDailyHistory } from "./market-data/stooq-provider.js";
import { resolveTicker } from "./market-data/ticker-resolve.js";
import { priceLookupResult, feedUnreachableText } from "./market-data-lookup.js";
import { isBarStale, type PriceBar } from "./market-data-store.js";
import { withNextMoves } from "./deterministic-turn.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";

const SIGNAL_RATE_LIMIT_PER_MINUTE = 20;

/**
 * Five years, so there are enough completed 12-month windows for the base-rate
 * block to mean anything. One year yields zero windows and the block correctly
 * refuses — which reads as a broken feature rather than an honest limit.
 */
const HISTORY_DAYS = 5 * 365;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Signal Read",
    modelId: "quantora-signal-read-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export function handleSignalRead(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("signal-read", res, () => runSignalRead(req, res));
}

/**
 * The freshest USABLE price, preferring intraday over end-of-day.
 *
 * "The feed answered" and "the answer is usable" are different facts. A stale
 * intraday bar used to win outright, which both blocked a fresher stored close
 * from being reached and — worse — fed a price the desk was about to refuse
 * into the analysis below.
 */
async function latestPrice(symbol: string): Promise<{ bar: PriceBar | null; feedDown: boolean }> {
  const realtime = await realtimeQuote(symbol);
  const realtimeBar = realtime.status === "ok" ? realtime.bar : null;
  if (realtimeBar && !isBarStale(realtimeBar)) return { bar: realtimeBar, feedDown: false };

  const eod = await liveStockQuoteOutcome(symbol);
  if (eod.status === "ok" && !isBarStale(eod.bar)) return { bar: eod.bar, feedDown: false };

  // Nothing fresh. Hand back the best bar there is so the caller can name the
  // date it is refusing, rather than claiming to have no price at all.
  const fallback = realtimeBar || (eod.status === "ok" ? eod.bar : null);
  if (fallback) return { bar: fallback, feedDown: false };

  // Only an outage counts as the feed being down; "no-data" is a verdict on the
  // symbol and the caller should say so rather than blaming the plumbing.
  const feedDown = realtime.status === "unreachable" || eod.status === "unreachable";
  return { bar: null, feedDown };
}

async function runSignalRead(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;

  const intent = parseSignalIntent(req.body?.message);
  if (!isSignalIntent(intent)) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `signal:user:${session.sub}` : `signal:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, SIGNAL_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many signal reads. Please wait a minute and try again." });
    return true;
  }

  const { symbol, thresholdPct } = intent;
  const { bar, feedDown } = await latestPrice(symbol);

  if (!bar) {
    sendStream(res, requestId, feedDown
      ? feedUnreachableText(symbol)
      : `I don't have a usable price for **${symbol}** right now, and I won't estimate one.`);
    return true;
  }

  /*
   * A stale bar is REFUSED by the price desk, and that refusal has to end the
   * turn. Taking only `.text` and carrying on produced a reply that declined to
   * quote the price and then described where "today sits" using it — the desk
   * contradicting itself inside one message.
   */
  const price = priceLookupResult({ kind: "price", symbol }, bar, null);
  if (!price.resolved) {
    sendStream(res, requestId, price.text);
    return true;
  }
  const priceLine = price.text;

  /*
   * History is a separate call and a separate failure. A thrown request here
   * must cost the analysis, never the price — the person still gets a real,
   * sourced figure and an honest account of what is missing.
   */
  let series: PriceBar[] = [];
  try {
    series = await stooqDailyHistory(symbol, { windowDays: HISTORY_DAYS });
  } catch {
    series = [];
  }

  const read = buildSignalRead(symbol, series, bar.close as number, thresholdPct);
  if (isSignalEmpty(read)) {
    sendStream(res, requestId, formatSignalUnavailable(symbol, priceLine));
    return true;
  }

  const resolution = resolveTicker(symbol);
  const companyName = resolution.status === "known" ? resolution.name : undefined;

  /*
   * One question, then stop — the discipline the Study tutor established. The
   * moves offer the two follow-ups that actually change the analysis rather
   * than a menu of everything the desk can do.
   */
  sendStream(res, requestId, withNextMoves({
    text: formatSignalRead(read, priceLine, companyName),
    question: "What's your horizon on this — years, or sooner?",
    moves: [
      {
        id: "signal_horizon",
        title: "It's a long hold",
        description: "Five years or more",
        value: `I'm holding ${symbol} for five years or more. What matters most at that horizon?`,
      },
      {
        id: "signal_monthly",
        title: "Model a monthly amount",
        description: "See the spread of outcomes",
        value: `If I put a fixed amount into ${symbol} every month, what range of outcomes should I expect?`,
      },
    ],
    facts: [`Asked about investing in ${symbol}`],
  }));
  return true;
}
