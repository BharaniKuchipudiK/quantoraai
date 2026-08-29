import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTravelConversationContext,
  isLiveTravelToolTurn,
  isTravelToolExecutionDeferred,
  routeTravelConversationBody,
  shouldPreferTravelConversationProvider,
  TRAVEL_CONVERSATION_MODEL_ID,
  TRAVEL_DEGRADED_DIRECTIVE,
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

test("routes Google-prefixed Gemini IDs used by the production UI", () => {
  const body = {
    studioDomain: "travel",
    modelId: "google/gemini-3-flash-preview",
    modelName: "Gemini Flash",
    message: "Help me book flights to Bali from Singapore on 31 August",
  };

  assert.equal(hasTravelConversationContext(body), true);
  assert.equal(isLiveTravelToolTurn(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
  const routed = routeTravelConversationBody(body);
  assert.equal(routed.modelId, TRAVEL_CONVERSATION_MODEL_ID);
  assert.equal(routed.fallbackFrom, "google/gemini-3-flash-preview");
  assert.equal(routed.travelToolExecutionDeferred, true);
});

test("server-owned Travel routing is independent of the currently selected UI model", () => {
  const body = {
    studioDomain: "travel",
    modelId: "deepseek/deepseek-chat",
    modelName: "DeepSeek",
    message: "Plan Bali for three nights",
  };

  assert.equal(shouldPreferTravelConversationProvider(body), true);
  assert.equal(routeTravelConversationBody(body).modelId, TRAVEL_CONVERSATION_MODEL_ID);
});

test("recovers Travel context from conversation history when client omits studioDomain", () => {
  const body = {
    modelId: "google/gemini-3-flash-preview",
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
    modelId: "google/gemini-3-flash-preview",
    message: "Help me plan a trip to Bali for 3 nights",
    history: [],
  };

  assert.equal(hasTravelConversationContext(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
});

test("keeps live flight and hotel intent out of the broken Gemini tool loop", () => {
  const body = {
    studioDomain: "travel",
    modelId: "google/gemini-3-flash-preview",
    message: "Show me live flight options from Singapore to Bali",
  };

  assert.equal(isLiveTravelToolTurn(body), true);
  assert.equal(shouldPreferTravelConversationProvider(body), true);
  assert.deepEqual(routeTravelConversationBody(body), {
    ...body,
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    modelName: "Quantora Travel Advisor",
    fallbackFrom: "google/gemini-3-flash-preview",
    travelToolExecutionDeferred: true,
  });
});

test("does not rewrite a user supplied provider key", () => {
  const body = {
    studioDomain: "travel",
    modelId: "google/gemini-3-flash-preview",
    userKey: "user-owned-key",
    message: "I like beaches",
  };

  assert.equal(shouldPreferTravelConversationProvider(body), false);
});

test("does not reroute an already-routed Travel request", () => {
  const body = {
    studioDomain: "travel",
    modelId: TRAVEL_CONVERSATION_MODEL_ID,
    message: "I like beaches",
  };

  assert.equal(shouldPreferTravelConversationProvider(body), false);
  assert.equal(routeTravelConversationBody(body), body);
});

test("does not affect clearly non-Travel Studio requests", () => {
  const body = {
    studioDomain: "finance",
    modelId: "google/gemini-3-flash-preview",
    message: "Help me budget my monthly expenses",
    history: [],
  };

  assert.equal(hasTravelConversationContext(body), false);
  assert.equal(routeTravelConversationBody(body), body);
});

test("isTravelToolExecutionDeferred reads the routed flag", () => {
  assert.equal(isTravelToolExecutionDeferred({ travelToolExecutionDeferred: true }), true);
  assert.equal(isTravelToolExecutionDeferred({ travelToolExecutionDeferred: false }), false);
  assert.equal(isTravelToolExecutionDeferred({}), false);
});

test("TRAVEL_DEGRADED_DIRECTIVE tells the model not to invent live fares", () => {
  assert.match(TRAVEL_DEGRADED_DIRECTIVE, /Do not invent live fares/i);
  assert.match(TRAVEL_DEGRADED_DIRECTIVE, /temporarily unavailable/i);
});

/*
 * A SCHEDULING BOARD WAS ANSWERED BY THE TRAVEL ADVISOR.
 *
 * "days" and "nights" were travel signals on their own, so:
 *
 *   "A horizontal timeline (14 days, one column per day)... show the total
 *    project duration in days"
 *
 * routed to Travel. It is also why a build was offered "Add dates / itinerary"
 * chips. And because TRAVEL_CONVERSATION_MODEL_ID had just been dropped from
 * the approved roster, the turn died outright:
 *
 *   Request failed: The model "Quantora Travel Advisor" is not approved.
 */
test('a build that mentions days is not a travel turn', () => {
  const scheduler = 'A horizontal timeline (14 days, one column per day) with a row per bench. '
    + 'Compute the critical path and show the total project duration in days.';
  assert.equal(hasTravelConversationContext({ message: scheduler }), false);
  assert.equal(hasTravelConversationContext({ message: 'Build a production scheduling board with a 14 day timeline' }), false);
  assert.equal(hasTravelConversationContext({ message: 'Give the team 3 days to review' }), false);
});

test('real travel is still travel', () => {
  for (const message of [
    'Find me flights to Singapore',
    'Plan a trip to Kyoto',
    '7 nights in Bali with a beach resort',
    'Show hotel availability for next month',
    'Do I need a visa for Japan?',
  ]) {
    assert.equal(hasTravelConversationContext({ message }), true, `missed travel: ${message}`);
  }
});

test('a build is never hijacked to travel, whatever words it uses', () => {
  // Someone asking for a runnable artifact wants the Coding Desk. Routing it to
  // a travel model produces an answer about itineraries and no code.
  const body = { message: 'Build a hotel booking site with flight search', buildMode: true };
  assert.equal(shouldPreferTravelConversationProvider(body), false);
  assert.equal(shouldPreferTravelConversationProvider({ ...body, buildMode: false, taskCategory: 'coding' }), false);
});

test('an explicit travel domain is still honoured', () => {
  assert.equal(hasTravelConversationContext({ studioDomain: 'travel', message: 'what next?' }), true);
});
