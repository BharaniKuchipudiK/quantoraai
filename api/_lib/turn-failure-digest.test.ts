/**
 * THE DIGEST'S OWN GATE.
 *
 * This exists because the platform's failures were legible only to whoever
 * held a reference id, which people learn from screenshots. A summary that is
 * wrong, or that buries the one thing worth acting on, puts the owner back
 * there while looking like progress.
 *
 * Two properties decide whether it is worth reading:
 *
 *   1. A REFUSAL IS NOT AN OUTAGE. Rate limits and spent budgets are Quantora
 *      declining on purpose — expected, self-clearing, and evidence the guards
 *      work. Mixed in with faults they dominate the counts on a busy day and
 *      teach the reader to skim. Counted, never ranked above a real fault.
 *   2. REACH BEATS VOLUME. A reason that hit four people outranks one that
 *      fired twenty times for the same person: the first is the platform, the
 *      second is one person having a bad afternoon.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeTurnFailures, reasonWords, FAILURE_WINDOW_HOURS } from "./turn-failure-digest.js";

const row = (detailCode: string, userSub: string, extra: Record<string, unknown> = {}) => ({
  detailCode, userSub, correlationId: `studio-${detailCode}-${userSub}`, at: "2026-09-08T08:00:00Z", ...extra,
});

test("an empty window says so plainly rather than printing an empty table", () => {
  const digest = summarizeTurnFailures([]);
  assert.equal(digest.total, 0);
  assert.equal(digest.faults, 0);
  assert.match(digest.headline, /No failed turns in the last 24h/);
  assert.deepEqual(digest.groups, []);
});

test("[the point] a fault outranks refusals however many refusals there are", () => {
  /*
   * The failure mode this gate exists for. Twenty honest refusals and one dead
   * provider: if the digest ranked by volume the outage would be at the bottom
   * of the list, under twenty rows saying the budgets worked.
   */
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => row("turn-budget", `student-${i % 5}`, { statusCode: 429 })),
    row("provider-failure", "student-9", { statusCode: 503, modelId: "gemini-2.5-flash" }),
  ];
  const digest = summarizeTurnFailures(rows);

  assert.equal(digest.total, 21);
  assert.equal(digest.refusals, 20);
  assert.equal(digest.faults, 1);
  assert.equal(digest.groups[0].detailCode, "provider-failure", "a real fault must lead, whatever the counts");
  assert.match(digest.headline, /1 fault\(s\)/);
  assert.match(digest.headline, /20 refusal\(s\) counted separately/);
});

test("among faults, the one touching more people leads", () => {
  const rows = [
    ...Array.from({ length: 12 }, () => row("compile-failed", "one-unlucky-person")),
    ...["a", "b", "c", "d"].map((u) => row("silent-turn", u)),
  ];
  const groups = summarizeTurnFailures(rows).groups;
  assert.equal(groups[0].detailCode, "silent-turn", "4 users beats 12 hits on one user");
  assert.equal(groups[0].users, 4);
  assert.equal(groups[1].count, 12);
});

test("a quiet day of refusals reads as the budgets working, not as breakage", () => {
  const digest = summarizeTurnFailures([row("turn-budget", "x", { statusCode: 429 }), row("rate-limited", "y", { statusCode: 429 })]);
  assert.equal(digest.faults, 0);
  assert.match(digest.headline, /no faults — the budgets did their job/);
});

test("every group carries what an operator needs to act, including a reference to pull", () => {
  const digest = summarizeTurnFailures([
    row("provider-failure", "a", { statusCode: 503, modelId: "gemini-2.5-flash", correlationId: "studio-aaa" }),
    row("provider-failure", "b", { statusCode: 500, modelId: "openai/gpt-5", correlationId: "studio-bbb" }),
  ]);
  const group = digest.groups[0];
  assert.equal(group.users, 2);
  assert.deepEqual(group.statuses, [500, 503]);
  assert.deepEqual(group.engines, ["gemini-2.5-flash", "openai/gpt-5"]);
  assert.deepEqual(group.sampleReferences, ["studio-aaa", "studio-bbb"]);
  assert.match(group.words, /engine returned an error/);
});

test("sample references are capped, so the digest never becomes the log", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row("silent-turn", `u${i}`, { correlationId: `studio-${i}` }));
  assert.equal(summarizeTurnFailures(rows).groups[0].sampleReferences.length, 3);
});

test("[was-red] no user identity ever reaches the digest — only how many", () => {
  /*
   * The one thing that would make this unsafe to look at. Counts decide
   * urgency; naming people adds nothing an operator can act on, and the
   * boundary schema's whole privacy guarantee is that it holds no content.
   * A serialised digest must not contain a sub anywhere.
   */
  const rows = [
    // Real correlation ids are random; the first draft of this fixture derived
    // them from the sub and the assertion caught ITSELF leaking, which is a
    // fair demonstration that it is load-bearing.
    { detailCode: "silent-turn", userSub: "auth0|super-secret-user-id", correlationId: "studio-3f9a1c22", at: "2026-09-08T08:00:00Z" },
    { detailCode: "silent-turn", userSub: "google|another-person", correlationId: "studio-77b0de41", at: "2026-09-08T08:01:00Z" },
  ];
  const digest = summarizeTurnFailures(rows);
  const serialised = JSON.stringify(digest);
  assert.doesNotMatch(serialised, /super-secret-user-id|another-person/, "a digest must count users, never name them");
  assert.equal(digest.usersAffected, 2);

  /* Structural, not just textual: a future field holding the set itself would
   * pass a string search on today's fixture and leak on tomorrow's data. */
  for (const group of digest.groups) {
    assert.equal(typeof group.users, "number", "a group reports HOW MANY users, never which");
    for (const value of Object.values(group)) {
      assert.ok(!(value instanceof Set), "no raw identity set may survive into the digest");
    }
  }
});

test("an unmapped reason prints as itself rather than as nothing", () => {
  /*
   * §8: a report that says "" for a reason nobody has written words for yet is
   * one an operator cannot act on. The raw code is worse prose and better
   * evidence.
   */
  assert.equal(reasonWords("some-new-code"), "some-new-code");
  assert.equal(reasonWords(""), "no reason recorded");
  assert.equal(reasonWords(null), "no reason recorded");
  assert.equal(summarizeTurnFailures([row("", "a")]).groups[0].reason, "(unrecorded)");
});

test("the window is stated in the digest, so a count is never read against the wrong period", () => {
  assert.equal(summarizeTurnFailures([], FAILURE_WINDOW_HOURS).windowHours, 24);
  assert.match(summarizeTurnFailures([], 6).headline, /last 6h/);
});

test("[was-red] the digest is actually wired to something an operator can read", () => {
  /*
   * A summariser nothing calls is the exact class `npm run test:wiring` exists
   * for, and this repo has shipped that shape twice this week: a function that
   * is correct, tested, and reachable by nobody. The whole point of this change
   * is that the telemetry already worked and could not be LOOKED AT, so a
   * digest that stops at a pure function repeats the defect it fixes.
   */
  const handler = readFileSync(new URL("./handlers/admin-metrics.ts", import.meta.url), "utf8");
  assert.match(handler, /readRecentFailures\(/, "the window query must be called");
  assert.match(handler, /summarizeTurnFailures\(failureRows \?\? \[\], FAILURE_WINDOW_HOURS\)/, "and summarised over the stated window, with an unanswered read treated as no rows for the summary but NOT for the source");
  assert.match(handler, /turnFailures: \{ \.\.\.failures, source: failureSource \}/, "and returned to the dashboard");

  /*
   * "No failures recorded" and "the store never answered" are an empty list
   * either way and mean opposite things. Reading zero without knowing which is
   * how a silent outage reads as a clean day.
   */
  /*
   * Three of the four states arrive as an empty list. `sourceOf` is what tells
   * them apart, and it is shared by both ledgers on this screen so they cannot
   * describe the same silence in different words.
   */
  assert.match(handler, /const failureSource = sourceOf\(failureRows\)/, "the source must be classified, not assumed");
  assert.match(handler, /if \(!isStoreConfigured\(\)\) return 'not_configured'/, "an unconfigured store must not read as a quiet one");
  assert.match(handler, /if \(rows === null\) return 'unavailable'/, "nor must a query that never came back — that is the reading that looks like a good day");
  assert.match(handler, /const turnPlanSource = sourceOf\(turnPlanRows\)/, "and the ledger beside it must use the same classifier");

  /*
   * The last hop, and the easiest to lose: the dashboard has to hand the
   * digest to the panel. Delete this one line and the panel renders nothing
   * while its own render test still passes green, because that test supplies
   * the prop directly. Every layer proved, and the operator sees an empty box.
   */
  const dashboard = readFileSync(new URL("../../src/components/AdminDashboard.jsx", import.meta.url), "utf8");
  assert.match(dashboard, /turnFailures=\{metrics\.turnFailures\}/, "the dashboard must pass the digest to the panel that draws it");

  const panel = readFileSync(new URL("../../src/components/TechnicalAnalyticsPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /<TurnFailureSection turnFailures=\{turnFailures\}/, "and the panel must actually place the section");

  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /state=eq\.failed/, "the query must select failures, not every boundary event");
  assert.match(store, /export async function readRecentFailures/);

  /*
   * Scoped to the reader's own body, not the file. `T[]` is assignable to
   * `T[] | null`, so a body that quietly goes back to returning [] on a fault
   * still type-checks against the honest signature -- the compiler cannot see
   * this one, and neither can a whole-file scan that would match the sibling
   * reader's identical line twenty lines away.
   */
  const start = store.indexOf("export async function readRecentFailures");
  const body = store.slice(start, store.indexOf("\n}", start));
  assert.match(body, /if \(!response\) return null;/, "an unanswered store must return null, never an empty list that reads as a quiet day");
  assert.doesNotMatch(body, /return \[\]/, "no fault path in this reader may fabricate an empty result");
});
