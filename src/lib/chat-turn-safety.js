/**
 * Client turn safety helpers: collision-resistant message IDs and generation
 * tokens so a project switch or Stop cannot apply a stale SSE stream.
 */

export function createMessageId(prefix = "msg") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createGenerationToken() {
  return createMessageId("gen");
}

export function isActiveGeneration(activeToken, token) {
  return Boolean(token) && activeToken === token;
}

export const TRAVEL_DEGRADED_NOTICE =
  "Live travel lookup was temporarily unavailable for this turn. The reply above is conversational advice only — not live fares, seats, or hotel availability. Retry shortly for live search.";

export function withTravelDegradedNotice(text, travelDegraded) {
  if (!travelDegraded) return text;
  const body = String(text || "").trim();
  if (!body) return `⚠️ **Travel tools unavailable**\n\n${TRAVEL_DEGRADED_NOTICE}`;
  if (body.includes(TRAVEL_DEGRADED_NOTICE)) return body;
  return `${body}\n\n_${TRAVEL_DEGRADED_NOTICE}_`;
}
