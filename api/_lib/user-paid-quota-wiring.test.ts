/**
 * The quota must be CONSULTED, not merely written.
 *
 * This repository has already shipped a complete, tested cost-control
 * subsystem that nothing called: recordModelSpend, readMonthlySpend,
 * canOfferPaidLastResort and decidePaidSpend all had zero callers, so the
 * platform could not refuse a paid call when the float was gone, and every
 * budget conversation was unenforceable. `paid-route-gate.ts` says so in its
 * own header. A per-user quota is the same shape of thing and fails the same
 * silent way: the module passes its unit tests, the dashboard shows a limit,
 * and one user still takes the whole allowance because the decision never
 * reached the router.
 *
 * Unit tests cannot see that. They exercise the module in isolation, which is
 * exactly the state the dead subsystem was in. So this gate reads the handler
 * and asserts the three joins that make the quota real:
 *
 *   1. the share is asked about on the turn,
 *   2. its answer reaches the routing decision, at EVERY site that plans the
 *      paid rung — one updated call site and one forgotten one is the same
 *      bug with a smaller blast radius,
 *   3. a call taken against the share is recorded, at the attempt.
 *
 * It reads source rather than running a turn because the alternative is a live
 * model call, and a gate that costs money to run is a gate that gets muted.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const HANDLER = join(here, "chat-handler.ts");

function handlerSource(): string {
  const source = readFileSync(HANDLER, "utf8");
  /*
   * Fails closed on its own subject (CLAUDE.md §4): if chat-handler.ts is
   * renamed or moved, every assertion below would pass vacuously against an
   * empty string and report a clean run over nothing.
   */
  assert.ok(source.length > 5000, `chat-handler.ts read as ${source.length} bytes; this gate cannot check what it cannot find`);
  return source;
}

test("the turn asks what share this person has left", () => {
  const source = handlerSource();
  assert.match(
    source,
    /userPaidQuotaAllowed\(/,
    "chat-handler no longer asks userPaidQuotaAllowed, so every account shares one first-come-first-served allowance again",
  );
});

test("every site that plans the paid rung uses the composed decision, not the spend meter alone", () => {
  const source = handlerSource();
  const sites = source.match(/paidLastResortAllowed:\s*([A-Za-z0-9_.?]+)/g) || [];
  assert.ok(sites.length >= 2, `expected at least 2 paid-rung planning sites, found ${sites.length}`);
  for (const site of sites) {
    assert.doesNotMatch(
      site,
      /paidVerdict\.allowed/,
      `"${site}" plans the paid rung from the platform meter alone, so this account's own share is not consulted there`,
    );
  }
  assert.ok(
    sites.every((site) => /paidAllowedForUser/.test(site)),
    `every paid-rung site must read the composed decision; found: ${sites.join(", ")}`,
  );
});

test("the composed decision is both brakes, and a quota that could not be measured does not hold the turn", () => {
  const source = handlerSource();
  const line = (source.match(/const paidAllowedForUser =.*/) || [])[0] || "";
  assert.ok(line, "paidAllowedForUser is gone; the two brakes are no longer composed in one place");
  assert.match(line, /paidVerdict\.allowed/, "the platform spend brake must still be able to refuse");
  assert.match(
    line,
    /!==\s*false/,
    "the quota must hold the turn only on an explicit refusal, so an unmeasured share stays permissive",
  );
});

test("a call taken against the share is recorded at the attempt, and only for the paid rung", () => {
  const source = handlerSource();
  assert.match(
    source,
    /route\.paid === true && sessionUser\?\.sub\) recordPaidCallEvent\(/,
    "the paid attempt no longer records the call, so the share never fills and the quota can never bind",
  );
  const recordings = source.match(/recordPaidCallEvent\(/g) || [];
  assert.equal(
    recordings.length,
    1,
    `recordPaidCallEvent is called ${recordings.length} times; a second call site double-counts one person's share`,
  );
});

test("the hold the person is shown is the one that actually held the turn", () => {
  const source = handlerSource();
  assert.match(
    source,
    /quotaHold: describeUserQuotaHold\(/,
    "a spent personal share must be explained as itself, not as the platform's OpenRouter ceiling",
  );
  assert.match(source, /spendHold: describePaidHold\(/, "the platform spend sentence must survive alongside it");
});
