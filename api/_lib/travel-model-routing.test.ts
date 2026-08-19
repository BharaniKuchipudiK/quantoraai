import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTravelConversationContext,
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

test("recovers Travel context from conversation history when client omits studioDomain", () => {
  const body = {
    modelId: "gemini-flash-latest",
    modelName: "Gemini Flash",
    message: "Singapore (SIN)",
    history: [
      { sender: "user", text: "Help me plan a trip to Bali for 3 nights" },
      { sender: "ai", text: "Which city will you be flying out from?" },
    ],
  };

  assert.equal(hasTravelConversationContext(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
  assert.equal(routeTravelConversationBody(body).modelId, TRAVEL_CONVERSATION_MODEL_ID);
});

test("recognizes a Travel first turn even before specialist metadata arrives", () => {
  const body = {
    modelId: "gemini-flash-latest",
    message: "Help me plan a trip to Bali for 3 nights",
    history: [],
  };

  assert.equal(hasTravelConversationContext(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
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

test("does not affect clearly non-Travel Studio requests", () => {
  const body = {
    studioDomain: "finance",
    modelId: "gemini-flash-latest",
    message: "Help me budget my monthly expenses",
    history: [],
  };

  assert.equal(hasTravelConversationContext(body), false);
  assert.equal(routeTravelConversationBody(body), body);
});
