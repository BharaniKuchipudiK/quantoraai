/**
 * What this gate does when the bug is present (CLAUDE.md §4).
 *
 * Every case below names a defect that would otherwise reach production
 * looking exactly like working code, because a quota that is too permissive
 * raises no error, produces no log line, and is discovered only when one
 * pilot user has taken the whole allowance.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_USER_PAID_CALL_LIMIT,
  USER_PAID_WINDOW_HOURS,
  decideUserPaidQuota,
  describeUserQuotaHold,
  userPaidCallLimit,
  userPaidQuotaAllowed,
} from "./user-paid-quota.js";

/*
 * THE DEFECT THIS REPO HAS ALREADY SHIPPED ONCE.
 *
 * OPENROUTER_SPEND_CEILING_USD was never set on the deployment, so the
 * platform brake ran with no ceiling of its own for weeks. A quota whose
 * unset value means "unlimited" repeats that failure exactly, and looks
 * identical to a working quota in every test that sets the variable.
 */
test("an unset limit is a real number, never unlimited", () => {
  const limit = userPaidCallLimit({});
  assert.equal(limit, DEFAULT_USER_PAID_CALL_LIMIT);
  assert.ok(Number.isFinite(limit), "the default limit must be finite");
  assert.ok(limit > 0, "the default limit must actually limit something");
});

test("a limit that fails to express an allowance falls back to the default, not to infinity", () => {
  for (const raw of ["0", "-5", "banana", "  ", "Infinity", "NaN"]) {
    const limit = userPaidCallLimit({ QUANTORA_USER_PAID_CALL_LIMIT: raw });
    assert.equal(limit, DEFAULT_USER_PAID_CALL_LIMIT, `"${raw}" must not disable the quota`);
  }
});

test("an operator's own limit is honoured", () => {
  assert.equal(userPaidCallLimit({ QUANTORA_USER_PAID_CALL_LIMIT: "40" }), 40);
  assert.equal(userPaidCallLimit({ QUANTORA_USER_PAID_CALL_LIMIT: "12.9" }), 12);
});

test("a share that is spent is refused, and one with room is not", () => {
  const spent = decideUserPaidQuota(250, 250);
  assert.equal(spent.allowed, false);
  assert.equal(spent.remainingCalls, 0);
  assert.equal(spent.unmeasured, false);
  assert.match(spent.reason, /250 of 250/);

  const over = decideUserPaidQuota(600, 250);
  assert.equal(over.allowed, false, "past the limit is still past the limit");

  const room = decideUserPaidQuota(249, 250);
  assert.equal(room.allowed, true);
  assert.equal(room.remainingCalls, 1);
  assert.equal(room.unmeasured, false);
});

/*
 * THE INVERSION THAT WOULD LOOK LIKE HARDENING.
 *
 * The spend gate fails closed, and this file sits beside it, so the obvious
 * "fix" is to make this one fail closed too. That would turn a Supabase blip
 * into a platform-wide premium outage nobody could attribute, to prevent an
 * overrun the dollar ceiling already bounds. If someone makes that change,
 * this test is what stops it.
 */
test("an unreadable ledger allows the turn and says the share was not measured", () => {
  const verdict = decideUserPaidQuota(null, 250);
  assert.equal(verdict.allowed, true, "a quota outage must not deny every user the paid rung");
  assert.equal(verdict.unmeasured, true);
  assert.equal(verdict.usedCalls, null, "an unread count must never be reported as a count");
  assert.equal(verdict.remainingCalls, null);
  assert.match(verdict.reason, /could not be read/);
});

/*
 * The quieter half of the same defect: allowing on an unreadable ledger is
 * correct, but reporting it as "0 of 250 used" is a lie that would make an
 * outage indistinguishable from an idle account on the dashboard.
 */
test("an unreadable ledger is never reported as an unused allowance", () => {
  const unread = decideUserPaidQuota(null, 250);
  const idle = decideUserPaidQuota(0, 250);
  assert.notEqual(unread.usedCalls, idle.usedCalls, "an outage must not read as an idle account");
  assert.equal(idle.unmeasured, false);
  assert.equal(unread.unmeasured, true);
});

test("the window asked for is the configured rolling window", async () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  let askedSince = "";
  await userPaidQuotaAllowed("sub-1", {
    now,
    env: {},
    count: async (_sub, sinceIso) => {
      askedSince = sinceIso;
      return 0;
    },
  });
  const expected = new Date(now - USER_PAID_WINDOW_HOURS * 3_600_000).toISOString();
  assert.equal(askedSince, expected, "counting the wrong window silently changes the allowance");
});

test("the person asked about is the person on the turn", async () => {
  let askedSub = "";
  await userPaidQuotaAllowed("sub-abc", {
    env: {},
    count: async (sub) => {
      askedSub = sub;
      return 1;
    },
  });
  assert.equal(askedSub, "sub-abc");
});

test("a ledger that throws is treated as unread, never as an empty share", async () => {
  const verdict = await userPaidQuotaAllowed("sub-1", {
    env: {},
    count: async () => {
      throw new Error("supabase unreachable");
    },
  });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.unmeasured, true);
  assert.equal(verdict.usedCalls, null);
});

test("a turn with no account is unmeasured, not refused", async () => {
  let asked = false;
  const verdict = await userPaidQuotaAllowed(null, {
    env: {},
    count: async () => {
      asked = true;
      return 0;
    },
  });
  assert.equal(verdict.allowed, true, "the quota governs shares between accounts, it is not a sign-in wall");
  assert.equal(verdict.unmeasured, true);
  assert.equal(asked, false, "there is nothing to ask the ledger without a subject");
});

test("a spent share is refused end to end, through the configured limit", async () => {
  const verdict = await userPaidQuotaAllowed("sub-heavy", {
    env: { QUANTORA_USER_PAID_CALL_LIMIT: "10" },
    count: async () => 10,
  });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.limitCalls, 10);
});

/*
 * A hold explained with the wrong remedy is worse than an unexplained one:
 * it sends the operator to raise a ceiling that was never the constraint.
 */
test("the sentence blames the account's share, never the platform's ceiling", () => {
  const held = describeUserQuotaHold(decideUserPaidQuota(250, 250));
  assert.match(held, /this account/i);
  assert.match(held, /Free routes still work/);
  assert.doesNotMatch(held, /OpenRouter/i, "the OpenRouter ceiling is not what is holding this turn");
  assert.doesNotMatch(held, /\$/, "this brake counts calls, and must not imply it counted dollars");

  assert.equal(describeUserQuotaHold(decideUserPaidQuota(1, 250)), "", "nothing held, nothing to explain");
  assert.equal(describeUserQuotaHold(null), "");
  assert.equal(
    describeUserQuotaHold(decideUserPaidQuota(null, 250)),
    "",
    "an unmeasured share holds nothing, so it explains nothing",
  );
});
