import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RESTRAINT,
  inQuietHours,
  newlyChangedWatches,
  pruneNotified,
  restraintVerdict,
  watchNotificationText,
} from "./watch-policy.ts";

test("only watches flagged now and not yet notified are new", () => {
  const current = [
    { question: "A", changed: true },
    { question: "B", changed: false },
    { question: "C", changed: true },
  ];
  assert.deepEqual(newlyChangedWatches(current, new Set()), ["A", "C"]);
  assert.deepEqual(newlyChangedWatches(current, new Set(["A"])), ["C"]);
  assert.deepEqual(newlyChangedWatches([], new Set(["A"])), []);
});

test("a notified watch may notify again only after it was acknowledged (stops being flagged)", () => {
  const notified = new Set(["A", "C"]);
  const pruned = pruneNotified([{ question: "A", changed: true }, { question: "C", changed: false }], notified);
  assert.deepEqual([...pruned], ["A"]);
  assert.deepEqual(newlyChangedWatches([{ question: "C", changed: true }], pruned), ["C"]);
});

test("quiet hours wrap midnight and an empty window is never quiet", () => {
  assert.equal(inQuietHours(DEFAULT_RESTRAINT, 23), true);
  assert.equal(inQuietHours(DEFAULT_RESTRAINT, 3), true);
  assert.equal(inQuietHours(DEFAULT_RESTRAINT, 8), false);
  assert.equal(inQuietHours(DEFAULT_RESTRAINT, 12), false);
  assert.equal(inQuietHours({ quietHours: { start: 9, end: 17 }, perHour: 3 }, 12), true);
  assert.equal(inQuietHours({ quietHours: { start: 9, end: 9 }, perHour: 3 }, 9), false);
  assert.equal(inQuietHours({ quietHours: null, perHour: 3 }, 3), false);
});

test("the budget counts only the last rolling hour", () => {
  const now = 10_000_000;
  const policy = { quietHours: null, perHour: 2 };
  assert.deepEqual(restraintVerdict(policy, now, []), { allow: true });
  assert.deepEqual(restraintVerdict(policy, now, [now - 1000]), { allow: true });
  assert.deepEqual(restraintVerdict(policy, now, [now - 1000, now - 2000]), { allow: false, reason: "budget" });
  assert.deepEqual(restraintVerdict(policy, now, [now - 61 * 60 * 1000, now - 2000]), { allow: true }, "an old send has aged out");
});

test("quiet hours win over an available budget", () => {
  assert.deepEqual(restraintVerdict(DEFAULT_RESTRAINT, 0, [], 23), { allow: false, reason: "quiet-hours" });
  assert.deepEqual(restraintVerdict(DEFAULT_RESTRAINT, 0, [], 10), { allow: true });
});

test("notification copy names the change and truncates a long question", () => {
  const short = watchNotificationText("Is the Fed cutting in September?");
  assert.match(short.title, /Evidence changed/);
  assert.equal(short.body, "Is the Fed cutting in September?");
  const long = watchNotificationText("q".repeat(200));
  assert.equal(long.body.length, 118);
  assert.ok(long.body.endsWith("…"));
});
