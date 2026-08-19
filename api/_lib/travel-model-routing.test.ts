import assert from "node:assert/strict";
import test from "node:test";
import {
  isLiveTravelToolTurn,
  routeTravelConversationBody,
  shouldPreferTravelConversationProvider,
  TRAVEL_CONVERSATION_MODEL_ID,
} from "./travel-model-routing.js";

test("routes ordinary Travel conversation away from a Gemini-only path", () => {
  const body = {
    studioDomain: "travel",
    modelId: "gemini-flash-latest",
    modelName: "Gemini Flash",
    message: "I like beaches",
  };

  assert.equal(shouldPreferTravelConversationProvider(body), true);
  assert.deepEqual(routeTravelConversationBody(body), {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: "Quantora Travel Advisor",
    fallbackFrom: "gemini-flash-latest",
    travelToolExecutionDeferred: false,
  });
});

test("keeps live flight and hotel intent out of the broken Gemini tool loop", () => {
  const body = {
    studioDomain: "travel",
    modelId: "gemini-flash-latest",
    message: "Show me live flight options from Singapore to Bali",
  };

  assert.equal(isLiveTravelToolTurn(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
  assert.deepEqual(routeTravelConversationBody(body), {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: "Quantora Travel Advisor",
    fallbackFrom: "gemini-flash-latest",
    travelToolExecutionDeferred: true,
  });
});

test("does not rewrite a user supplied Gemini key", () => {
  const body = {
    studioDomain: "travel",
    modelId: "gemini-flash-latest",
    userKey: "user-owned-key",
    message: "I like beaches",
  };

  assert.equal(shouldPreferTravelConversationProvider(body), false);
});

test("does not affect non-Travel Studio requests", () => {
  const body = {
    studioDomain: "finance",
    modelId: "gemini-flash-latest",
    message: "Help me budget",
  };

  assert.equal(routeTravelConversationBody(body), body);
});
