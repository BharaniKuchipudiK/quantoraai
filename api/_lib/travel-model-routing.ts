export const TRAVEL_CONVERSATION_MODEL_ID = "openai/gpt-4o-mini";
export const TRAVEL_CONVERSATION_MODEL_NAME = "Quantora Travel Advisor";

const LIVE_TRAVEL_TOOL_INTENT = /\b(?:book|booking|reserve|reservation|live\s+(?:flight|fare|hotel|rate|availability)|(?:find|search|show|check)\s+(?:me\s+)?(?:live\s+)?(?:flights?|fares?|hotels?|hotel\s+rates?)|flight\s+(?:prices?|fares?|options?)|hotel\s+(?:availability|prices?|rates?))\b/i;
const TRAVEL_CONTEXT_SIGNAL = /\b(?:travel|trip|holiday|vacation|destination|flight|fare|airport|hotel|resort|beach|itinerary|visa|passport|departure|departing|arrival|nights?|days?|bali|kyoto|tokyo|singapore|sin|dps|kix|tyo)\b/i;

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

  return TRAVEL_CONTEXT_SIGNAL.test(transcript);
}

export function isLiveTravelToolTurn(body: any): boolean {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  return LIVE_TRAVEL_TOOL_INTENT.test(message);
}

export function shouldPreferTravelConversationProvider(body: any): boolean {
  const modelId = typeof body?.modelId === "string" ? body.modelId : "";
  return hasTravelConversationContext(body)
    && modelId.startsWith("gemini")
    && !body?.userKey;
}

export function routeTravelConversationBody(body: any) {
  if (!shouldPreferTravelConversationProvider(body)) return body;
  return {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: TRAVEL_CONVERSATION_MODEL_NAME,
    fallbackFrom: body.modelId,
    // The Gemini function-call continuation path is currently unsafe for
    // Travel: quota/model roulette plus missing thought signatures can leave
    // the UI frozen after a provider tool has already run. Until the direct
    // provider gateway owns execution end-to-end, keep every Travel turn on
    // the stable conversational provider instead of re-entering that loop.
    travelToolExecutionDeferred: isLiveTravelToolTurn(body),
  };
}
