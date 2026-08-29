export const TRAVEL_CONVERSATION_MODEL_ID = "openai/gpt-4o-mini";
export const TRAVEL_CONVERSATION_MODEL_NAME = "Quantora Travel Advisor";

const LIVE_TRAVEL_TOOL_INTENT = /\b(?:book|booking|reserve|reservation|live\s+(?:flight|fare|hotel|rate|availability)|(?:find|search|show|check)\s+(?:me\s+)?(?:live\s+)?(?:flights?|fares?|hotels?|hotel\s+rates?)|flight\s+(?:prices?|fares?|options?)|hotel\s+(?:availability|prices?|rates?))\b/i;
/*
 * Travel words only. "days" and "nights" used to be in this list on their own,
 * which meant ANY prompt containing them was routed to the Travel Advisor:
 *
 *   "A horizontal timeline (14 days, one column per day)... show the total
 *    project duration in days"
 *
 * That is a production scheduling board, and it was answered by a travel model
 * — which is also why a build got offered "Add dates / itinerary" chips.
 *
 * A duration is only a travel signal NEXT TO a travel noun ("3 nights in
 * Bali"), so it is handled by TRAVEL_DURATION below rather than on its own.
 * Bare city codes went the same way: "sin" matched inside ordinary prose.
 */
const TRAVEL_CONTEXT_SIGNAL = /\b(?:travel(?:ling|ing)?|trips?|holidays?|vacations?|destinations?|flights?|airfares?|airports?|hotels?|resorts?|itinerar(?:y|ies)|visas?|passports?|layovers?|boarding pass|bali|kyoto)\b/i;

/** A duration counts only when a travel word is nearby. */
const TRAVEL_DURATION = /\b\d+\s*(?:nights?|days?)\b[^.\n]{0,40}\b(?:in|at|to|around|across)\b[^.\n]{0,30}\b(?:[A-Z][a-z]+|beach|island|resort|city)\b/;

function textOf(message: any): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  return "";
}

export function hasTravelConversationContext(body: any): boolean {
  if (body?.studioDomain === "travel") return true;

  const transcript = [
    textOf(body?.message),
    ...(Array.isArray(body?.history) ? body.history.slice(-8).map(textOf) : []),
  ].filter(Boolean).join("\n");

  return TRAVEL_CONTEXT_SIGNAL.test(transcript) || TRAVEL_DURATION.test(transcript);
}

export function isLiveTravelToolTurn(body: any): boolean {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  return LIVE_TRAVEL_TOOL_INTENT.test(message);
}

/**
 * Server-owned Travel must never depend on the model identifier shape sent by
 * the browser. Some clients send `gemini-*`, others `google/gemini-*`, and a
 * stale UI can send another selected model entirely. If Quantora owns the
 * credentials and the turn is Travel, route it through the independent Travel
 * conversation provider. BYOK remains the one explicit opt-out.
 */
export function shouldPreferTravelConversationProvider(
  body: any,
  options?: { hasGeminiByok?: boolean },
): boolean {
  // Explicit BYOK (header-resolved or legacy body flag in tests) opts out of
  // server-owned Travel conversation routing.
  if (!hasTravelConversationContext(body) || body?.userKey || options?.hasGeminiByok) return false;
  /*
   * A build is never a travel turn. Even if travel words appear, someone asking
   * for a runnable artifact wants the Coding Desk — hijacking it to a travel
   * model produces an answer about itineraries and no code.
   */
  if (body?.buildMode === true || body?.taskCategory === "coding") return false;
  return body?.modelId !== TRAVEL_CONVERSATION_MODEL_ID;
}

export function routeTravelConversationBody(body: any) {
  if (!shouldPreferTravelConversationProvider(body)) return body;
  return {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: TRAVEL_CONVERSATION_MODEL_NAME,
    fallbackFrom: body?.modelId || null,
    // The Gemini function-call continuation path is currently unsafe for
    // Travel: quota/model roulette plus missing thought signatures can leave
    // the UI frozen after a provider tool has already run. Until the direct
    // provider gateway owns execution end-to-end, keep every Travel turn on
    // the stable conversational provider instead of re-entering that loop.
    travelToolExecutionDeferred: isLiveTravelToolTurn(body),
  };
}

/** True when the request body asks chat to skip live Gemini travel tools. */
export function isTravelToolExecutionDeferred(body: any): boolean {
  return body?.travelToolExecutionDeferred === true;
}

export const TRAVEL_DEGRADED_DIRECTIVE = `

TRAVEL DEGRADED MODE
Live travel tools (flights/hotels via Gemini function calling) are unavailable for this turn.
- Do not invent live fares, seat maps, PNRs, hotel nightly rates, or availability.
- Give high-level trip advice, itinerary structure, and clarifying questions only.
- Tell the traveller plainly that live lookup is temporarily unavailable and they can retry shortly.
`;

