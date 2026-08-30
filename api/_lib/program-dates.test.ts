import assert from "node:assert/strict";
import test from "node:test";

import { monthLabel } from "./program-dates.js";

const AUG_2026 = new Date(Date.UTC(2026, 7, 30));

test("names the current month at zero months ahead", () => {
  assert.equal(monthLabel(AUG_2026, 0), "August 2026");
});

test("rolls the year over", () => {
  assert.equal(monthLabel(AUG_2026, 5), "January 2027");
  assert.equal(monthLabel(AUG_2026, 17), "January 2028");
});

test("handles multi-year horizons", () => {
  assert.equal(monthLabel(AUG_2026, 120), "August 2036");
});

/*
 * The reason this is a fixed table and not toLocaleString: a date on a program
 * is a commitment, and a commitment that reads differently depending on the
 * server's locale is not one.
 */
test("is independent of the day within the month", () => {
  for (const day of [1, 15, 28, 31]) {
    assert.equal(monthLabel(new Date(Date.UTC(2026, 0, day)), 1), "February 2026", `day ${day}`);
  }
});

test("does not drift across a 31-to-30 day month boundary", () => {
  // Adding a month to 31 January must not land in March.
  assert.equal(monthLabel(new Date(Date.UTC(2026, 0, 31)), 1), "February 2026");
});
