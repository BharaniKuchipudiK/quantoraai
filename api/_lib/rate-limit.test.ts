import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDurableCostBearingGuard,
  degradedRateLimit,
  isRateLimited,
} from "./rate-limit.js";

test("degradedRateLimit is about one-third of the normal budget", () => {
  assert.equal(degradedRateLimit(30), 10);
  assert.equal(degradedRateLimit(6), 2);
  assert.equal(degradedRateLimit(1), 1);
  assert.equal(degradedRateLimit(2), 1);
});

test("applyDurableCostBearingGuard respects durable limited", () => {
  const result = applyDurableCostBearingGuard("cost:user:a", 30, {
    limited: true,
    hits: 31,
    resetsAt: "2026-08-24T12:00:00.000Z",
    unavailable: false,
  });
  assert.equal(result.limited, true);
  assert.equal(result.degraded, false);
  assert.equal(result.resetsAt, "2026-08-24T12:00:00.000Z");
});

test("applyDurableCostBearingGuard tightens when durable store is unavailable", () => {
  const key = `cost:degraded-test:${Date.now()}`;
  const normalLimit = 9;
  const degraded = degradedRateLimit(normalLimit);

  let limitedCount = 0;
  for (let i = 0; i < degraded + 2; i += 1) {
    const result = applyDurableCostBearingGuard(key, normalLimit, {
      limited: false,
      hits: null,
      resetsAt: null,
      unavailable: true,
    });
    if (result.limited) {
      limitedCount += 1;
      assert.equal(result.degraded, true);
    }
  }
  assert.ok(limitedCount >= 1, "degraded guard should trip after the tighter burst");
});

test("applyDurableCostBearingGuard does not trip when durable is healthy", () => {
  const key = `cost:healthy:${Date.now()}`;
  for (let i = 0; i < 5; i += 1) {
    const result = applyDurableCostBearingGuard(key, 30, {
      limited: false,
      hits: i + 1,
      resetsAt: null,
      unavailable: false,
    });
    assert.equal(result.limited, false);
    assert.equal(result.degraded, false);
  }
  // Warm path still has the normal in-memory limiter available to callers.
  assert.equal(isRateLimited(key, 30, 60_000), false);
});
