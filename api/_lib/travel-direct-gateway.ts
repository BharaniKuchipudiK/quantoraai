import { randomUUID } from 'node:crypto';
import { requireActiveSession } from './authz.js';
import { applyCors, clientIp, isRateLimited } from './rate-limit.js';
import { getSessionUser } from './session.js';
import { hasTravelConversationContext } from './travel-model-routing.js';
import {
  attractionLocation,
  buildFlightSearchDraft,
  buildHotelSearchDraft,
  detectDirectTravelIntent,
} from './travel-intake.js';
import { searchAttractions, searchFlights, searchHotels } from './travel-provider-gateway.js';
import type { AttractionSearchResult, FlightSearchResult, HotelSearchResult } from './travel-contracts.js';

const DIRECT_TRAVEL_RATE_LIMIT_PER_MINUTE = 15;

function beginSse(res: any) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

function sendText(res: any, text: string) {
  beginSse(res);
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  if (res.flush) res.flush();
}

function finish(res: any, metadata: Record<string, unknown> = {}) {
  beginSse(res);
  res.write(`data: ${JSON.stringify({
    provider: 'Quantora Travel Gateway',
    modelId: 'travel-provider-gateway',
    liveConnected: true,
    deterministic: true,
    ...metadata,
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  return res.end();
}

function formatTime(value: string | null): string {
  if (!value) return 'time unavailable';
  const localClock = value.match(/T(\d{2}:\d{2})/)?.[1];
  return localClock || value;
}

export function formatFlightSearchResult(result: FlightSearchResult): string {
  if (result.status !== 'success') {
    return `${result.message}\n\nI haven't substituted estimated or invented fares. Would you like me to retry the live search?`;
  }

  const lines = result.offers.slice(0, 5).map((offer, index) => {
    const first = offer.segments[0];
    const last = offer.segments[offer.segments.length - 1];
    const carrier = first?.carrierName || first?.carrierCode || 'Airline';
    const routeType = offer.direct ? 'Direct' : 'Connecting';
    const times = first && last ? `${formatTime(first.departingAt)} → ${formatTime(last.arrivingAt)}` : 'schedule available in offer';
    return `${index + 1}. **${carrier}** — ${offer.currency} ${offer.totalAmount.toFixed(2)} — ${routeType} — ${times}`;
  });

  return `I found **live flight options** for ${result.origin.name} (${result.origin.iataCode}) → ${result.destination.name} (${result.destination.iataCode}).\n\n${lines.join('\n')}\n\nThese are live provider results and prices can change until an offer is revalidated. **Would you like me to compare the best direct options by baggage, timing and flexibility next?**`;
}

export function formatHotelSearchResult(result: HotelSearchResult): string {
  if (result.status !== 'success') {
    return `${result.message}\n\nI haven't substituted estimated or invented hotel availability. Would you like me to retry the live search?`;
  }
  const lines = result.hotels.slice(0, 5).map((hotel, index) => {
    const rating = hotel.rating ? ` · ${hotel.rating}★` : '';
    return `${index + 1}. **${hotel.name}** — ${hotel.currency} ${hotel.totalAmount.toFixed(2)}${rating}${hotel.address ? ` · ${hotel.address}` : ''}`;
  });
  return `I found **live hotel availability** around ${result.location.name}.\n\n${lines.join('\n')}\n\n**Would you like me to narrow these to beachfront, best-value, or highest-rated options?**`;
}

export function formatAttractionSearchResult(result: AttractionSearchResult): string {
  if (result.status !== 'success') {
    return `${result.message}\n\nI haven't invented attraction availability or prices. Would you like me to retry?`;
  }
  const lines = result.attractions.slice(0, 6).map((item, index) => {
    const price = item.price != null && item.currency ? ` — ${item.currency} ${item.price.toFixed(2)}` : '';
    return `${index + 1}. **${item.name}**${price}${item.description ? ` — ${item.description}` : ''}`;
  });
  return `Here are **live attraction options** around ${result.location.name}.\n\n${lines.join('\n')}\n\n**Would you like me to build these into a day-by-day itinerary based on where you're staying?**`;
}

/**
 * Deterministic Travel execution boundary.
 *
 * The language model may converse and help shape a trip, but provider execution
 * never depends on a model function-call continuation. Explicit live search
 * requests are authenticated, validated and executed here, then normalized
 * before the user sees a result.
 */
export async function handleDirectTravelRequest(req: any, res: any): Promise<boolean> {
  if (!hasTravelConversationContext(req.body)) return false;
  const intent = detectDirectTravelIntent(req.body);
  if (!intent) return false;

  // Let the ordinary chat path own anonymous/BYOK behavior. Server-owned travel
  // inventory calls require a signed-in Quantora session.
  const session = getSessionUser(req);
  if (!session) return false;

  applyCors(req, res, 'POST,OPTIONS');
  const limitKey = `travel-direct:user:${session.sub || clientIp(req)}`;
  if (isRateLimited(limitKey, DIRECT_TRAVEL_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: 'Too many live travel searches. Please wait a minute and try again.' });
    return true;
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;

  const requestId = typeof req.body?.requestId === 'string' && req.body.requestId
    ? req.body.requestId
    : randomUUID();
  const startedAt = Date.now();

  if (intent === 'flight_search') {
    const draft = buildFlightSearchDraft(req.body);
    if (!draft.input) {
      sendText(res, `${draft.question || 'What flight detail should I clarify before searching live fares?'}`);
      finish(res, { requestId, latencyMs: Date.now() - startedAt, action: 'clarification' });
      return true;
    }

    const result = await searchFlights(draft.input);
    if (result.status !== 'success') console.warn('[Travel Gateway] Flight search unavailable:', result.attempts);
    sendText(res, formatFlightSearchResult(result));
    finish(res, {
      requestId,
      latencyMs: Date.now() - startedAt,
      providerUsed: result.status === 'success' ? result.provider : null,
      action: 'flight_search',
    });
    return true;
  }

  if (intent === 'hotel_search') {
    const draft = buildHotelSearchDraft(req.body);
    if (!draft.input) {
      sendText(res, `${draft.question || 'What hotel detail should I clarify before checking live availability?'}`);
      finish(res, { requestId, latencyMs: Date.now() - startedAt, action: 'clarification' });
      return true;
    }

    const result = await searchHotels(draft.input);
    if (result.status !== 'success') console.warn('[Travel Gateway] Hotel search unavailable:', result.attempts);
    sendText(res, formatHotelSearchResult(result));
    finish(res, {
      requestId,
      latencyMs: Date.now() - startedAt,
      providerUsed: result.status === 'success' ? result.provider : null,
      action: 'hotel_search',
    });
    return true;
  }

  const location = attractionLocation(req.body);
  if (!location) {
    sendText(res, 'Which destination should I search for attractions and activities in?');
    finish(res, { requestId, latencyMs: Date.now() - startedAt, action: 'clarification' });
    return true;
  }

  const result = await searchAttractions({ location });
  if (result.status !== 'success') console.warn('[Travel Gateway] Attraction search unavailable:', result.attempts);
  sendText(res, formatAttractionSearchResult(result));
  finish(res, {
    requestId,
    latencyMs: Date.now() - startedAt,
    providerUsed: result.status === 'success' ? result.provider : null,
    action: 'attraction_search',
  });
  return true;
}
