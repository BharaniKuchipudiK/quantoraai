export const TRAVEL_CONVERSATION_MODEL_ID = "openai/gpt-4o-mini";
export const TRAVEL_CONVERSATION_MODEL_NAME = "Quantora Travel Advisor";

const LIVE_TRAVEL_TOOL_INTENT = /\b(?:book|booking|reserve|reservation|live\s+(?:flight|fare|hotel|rate|availability)|(?:find|search|show|check)\s+(?:me\s+)?(?:live\s+)?(?:flights?|fares?|hotels?|hotel\s+rates?)|flight\s+(?:prices?|fares?|options?)|hotel\s+(?:availability|prices?|rates?))\b/i;

export function isLiveTravelToolTurn(body: any): boolean {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  return LIVE_TRAVEL_TOOL_INTENT.test(message);
}

export function shouldPreferTravelConversationProvider(body: any): boolean {
  const modelId = typeof body?.modelId === "string" ? body.modelId : "";
  return body?.studioDomain === "travel"
    && modelId.startsWith("gemini")
    && !body?.userKey
    && !isLiveTravelToolTurn(body);
}

export function routeTravelConversationBody(body: any) {
  if (!shouldPreferTravelConversationProvider(body)) return body;
  return {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: TRAVEL_CONVERSATION_MODEL_NAME,
    fallbackFrom: body.modelId,
  };
}
