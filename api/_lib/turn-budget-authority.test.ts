/**
 * One budget owns the turn. The server plans inside it; it does not keep a
 * second one.
 *
 * THE DEFECT. The browser plans its escalation against a 175s turn deadline
 * that does NOT restart between attempts. This handler planned against
 * TOTAL_CHAT_BUDGET_MS, a constant that DID restart on every request. So after
 * a first attempt burned 100s, the browser had ~75s left and the server planned
 * as though it had a fresh 165s — funding a primary rung of up to 110s whose
 * result nobody would still be waiting for.
 *
 * Two planners, one wall clock, neither aware of the other. That is exit answer
 * #6's duplicate authority, and unlike the reporting half that #517 closed, this
 * one costs real tokens on every retry.
 *
 * The measurements below are the actual constants, so the arithmetic that makes
 * this matter cannot quietly stop being true.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { maxViableBuildAttempts, resolveTurnBudgetMs } from "./inference-control-plane.js";

const CEILING = 165_000;

test("[was-red] a retry's real remainder shortens the server's plan", () => {
  /*
   * The concrete case: attempt 1 spent 100s of the browser's 175s deadline, so
   * 75s remain. Before this, the server planned against 165s.
   */
  const remainingAfterFirstAttempt = 75_000;
  const budget = resolveTurnBudgetMs(remainingAfterFirstAttempt, CEILING);

  assert.equal(budget, 75_000, 'the server must plan inside what the turn actually has left');
  assert.ok(
    maxViableBuildAttempts(budget) <= maxViableBuildAttempts(CEILING),
    'a shorter budget can never fund MORE rungs than the full one',
  );
});

test('[was-red] the client may only shorten the budget, never extend it', () => {
  /*
   * The safety property. A buggy or hostile body must not be able to buy itself
   * more of the platform's time than the platform allows.
   */
  for (const overreach of [CEILING + 1, 600_000, 10_000_000, Number.MAX_SAFE_INTEGER, Infinity]) {
    assert.equal(
      resolveTurnBudgetMs(overreach, CEILING),
      CEILING,
      `a request asking for ${overreach}ms must be capped at the ceiling`,
    );
  }
});

test('no information means the full ceiling, so an older client is unchanged', () => {
  /*
   * turnRemainingMs is new. A client that does not send it — or sends something
   * unusable — must behave exactly as before, never worse.
   */
  for (const missing of [undefined, null, '', 0, -1, -60_000, NaN, 'soon', {}, []]) {
    assert.equal(
      resolveTurnBudgetMs(missing, CEILING),
      CEILING,
      `absent or unusable input (${JSON.stringify(missing) ?? String(missing)}) must yield the full budget`,
    );
  }
});

test('a fractional remainder is floored, never rounded up past what is left', () => {
  assert.equal(resolveTurnBudgetMs(74_999.9, CEILING), 74_999);
});

test('[was-red] the handler plans and asserts against the turn budget, not the constant', () => {
  /*
   * A unit cannot watch a 2,000-line handler revert one site. What it can see is
   * the constant reappearing at a planning or assertion site — which is exactly
   * the bug, because a single missed site restores the second planner.
   */
  const handler = fs.readFileSync(new URL("./chat-handler.ts", import.meta.url), "utf8");

  assert.match(
    handler,
    /const turnBudgetMs = resolveTurnBudgetMs\(req\.body\?\.turnRemainingMs, TOTAL_CHAT_BUDGET_MS\)/,
    'the handler must resolve one budget for the turn',
  );
  assert.doesNotMatch(
    handler,
    /remainingBudgetMs\(startTime, TOTAL_CHAT_BUDGET_MS\)/,
    'planning must not read the restarting constant',
  );
  assert.doesNotMatch(
    handler,
    /assertBudget\(startTime, TOTAL_CHAT_BUDGET_MS/,
    'the abort check must not outlive the turn the browser is actually waiting on',
  );

  /*
   * The constant itself stays — it is the CEILING the client is clamped to. It
   * may appear exactly twice: its declaration and the resolver call.
   */
  assert.equal(
    (handler.match(/TOTAL_CHAT_BUDGET_MS/g) || []).length,
    2,
    'TOTAL_CHAT_BUDGET_MS should survive only as the declared ceiling and the clamp',
  );
});

test('[was-red] the client sends the remainder from the planner that owns it', () => {
  /*
   * A second calculation of "how much is left" would drift from
   * planTurnEscalation, and then the two halves of one budget would disagree —
   * which is the defect this whole change removes, reintroduced one level down.
   */
  const hook = fs.readFileSync(new URL("../../src/hooks/useChatStream.js", import.meta.url), "utf8");
  assert.match(
    hook,
    /turnRemainingMs: escalation\.remainingMs/,
    'the request must carry the escalation planner\'s own remainder, not a fresh subtraction',
  );
});
