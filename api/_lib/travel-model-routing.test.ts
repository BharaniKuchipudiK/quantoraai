import { describe, expect, it } from "vitest";
import {
  isLiveTravelToolTurn,
  routeTravelConversationBody,
  shouldPreferTravelConversationProvider,
  TRAVEL_CONVERSATION_MODEL_ID,
} from "./travel-model-routing.js";

describe("travel model routing", () => {
  it("routes ordinary Travel conversation away from a Gemini-only path", () => {
    const body = {
      studioDomain: "travel",
      modelId: "gemini-flash-latest",
      modelName: "Gemini Flash",
      message: "I like beaches",
    };

    expect(shouldPreferTravelConversationProvider(body)).toBe(true);
    expect(routeTravelConversationBody(body)).toMatchObject({
      modelId: TRAVEL_CONVERSATION_MODEL_ID,
      modelName: "Quantora Travel Advisor",
      fallbackFrom: "gemini-flash-latest",
    });
  });

  it("keeps live flight and hotel turns on the tool-capable path", () => {
    const body = {
      studioDomain: "travel",
      modelId: "gemini-flash-latest",
      message: "Show me live flight options from Singapore to Bali",
    };

    expect(isLiveTravelToolTurn(body)).toBe(true);
    expect(shouldPreferTravelConversationProvider(body)).toBe(false);
  });

  it("does not rewrite a user supplied Gemini key", () => {
    const body = {
      studioDomain: "travel",
      modelId: "gemini-flash-latest",
      userKey: "user-owned-key",
      message: "I like beaches",
    };

    expect(shouldPreferTravelConversationProvider(body)).toBe(false);
  });

  it("does not affect non-Travel Studio requests", () => {
    const body = {
      studioDomain: "finance",
      modelId: "gemini-flash-latest",
      message: "Help me budget",
    };

    expect(routeTravelConversationBody(body)).toBe(body);
  });
});
