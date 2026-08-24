import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAVEL_DEGRADED_NOTICE,
  createGenerationToken,
  createMessageId,
  isActiveGeneration,
  withTravelDegradedNotice,
} from "./chat-turn-safety.js";

test("createMessageId returns unique non-empty ids", () => {
  const a = createMessageId("m");
  const b = createMessageId("m");
  assert.match(a, /^m_/);
  assert.notEqual(a, b);
});

test("generation tokens distinguish active turns", () => {
  const token = createGenerationToken();
  assert.equal(isActiveGeneration(token, token), true);
  assert.equal(isActiveGeneration(createGenerationToken(), token), false);
  assert.equal(isActiveGeneration(null, token), false);
});

test("withTravelDegradedNotice appends once", () => {
  const once = withTravelDegradedNotice("Fly via SIN.", true);
  assert.match(once, /Fly via SIN/);
  assert.match(once, new RegExp(TRAVEL_DEGRADED_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const twice = withTravelDegradedNotice(once, true);
  assert.equal(twice, once);
  assert.equal(withTravelDegradedNotice("ok", false), "ok");
});
