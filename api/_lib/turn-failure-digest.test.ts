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
    row("provider-failure", "a", { statusCode: 503, correlationId: "studio-aaa" }),
    row("provider-failure", "b", { statusCode: 500, correlationId: "studio-bbb" }),
  ]);
  const group = digest.groups[0];
  assert.equal(group.users, 2);
  assert.deepEqual(group.statuses, [500, 503]);
  assert.deepEqual(group.sampleReferences, ["studio-aaa", "studio-bbb"]);
  /*
   * No engine here, deliberately. The digest reads terminal api.chat rows,
   * which carry no model id -- the engine a turn tried lives in that
   * correlation's own trace, one lookup from the reference above. A field
   * that can never be populated is worse than an absent one: it reads as
   * "no engine involved" rather than "not recorded at this boundary".
   */
  assert.ok(!("engines" in group), "a field the terminal rows can never fill must not be advertised");
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

test("[was-red] a fault's reach counts the people who hit the fault, not everyone", () => {
  /*
   * Found by review, not by this file. The headline said "N fault(s) across M
   * user(s)" while M counted refusal users too -- in the same sentence that
   * claims refusals are counted separately.
   *
   * The shape below is the ordinary one, not a corner: one engine breaks for
   * one person while twenty students hit their daily budget. Reported as
   * "1 fault across 21 users", a single broken turn reads like a platform-wide
   * outage, and reach is the number this digest RANKS by.
   */
  const rows = [
    row("provider-failure", "victim", { statusCode: 503 }),
    ...Array.from({ length: 20 }, (_, i) => row("turn-budget", `student-${i}`, { statusCode: 429 })),
  ];
  const digest = summarizeTurnFailures(rows);

  assert.equal(digest.faults, 1);
  assert.equal(digest.faultUsers, 1, "one person hit the fault");
  assert.equal(digest.usersAffected, 21, "twenty-one people hit something, and that number still exists");
  assert.match(digest.headline, /1 fault\(s\) across 1 user\(s\)/);
  assert.doesNotMatch(digest.headline, /across 21 user/, "the refusals' reach must never be borrowed by the faults");
  assert.match(digest.headline, /20 refusal\(s\) counted separately/);
});

test("[was-red] a window cut at the row cap says so, instead of reporting a floor as a total", () => {
  /*
   * The read asks for one row past the cap purely to learn it was cut. If a
   * flood of refusals fills the window, the outage underneath them is simply
   * absent -- and a faults-first digest that silently lost its faults is worse
   * than none, because it is the screen someone checks to decide nothing is
   * wrong.
   */
  const rows = [row("provider-failure", "a", { statusCode: 500 })];
  assert.equal(summarizeTurnFailures(rows, 24, false).truncated, false);

  const cut = summarizeTurnFailures(rows, 24, true);
  assert.equal(cut.truncated, true);
  assert.match(cut.headline, /floors/, "a cut window must be stated in the sentence an operator reads");

  /* An empty read is not a cut one; saying "floors" over nothing is noise. */
  assert.equal(summarizeTurnFailures([], 24, true).truncated, false);
  assert.doesNotMatch(summarizeTurnFailures([], 24, true).headline, /floors/);
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
  assert.match(handler, /summarizeTurnFailures\(failureRead\?\.rows \?\? \[\], FAILURE_WINDOW_HOURS, failureRead\?\.truncated \?\? false\)/, "summarised over the stated window, and told when the window was cut");
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
  /*
   * sourceOf(failureRead ? failureRead.rows : null), NOT sourceOf(rows ?? []).
   * An unanswered read is null all the way to the classifier; flattening it to
   * [] first is how "the store is dead" became "nothing failed today".
   */
  assert.match(handler, /const failureSource = sourceOf\(failureRead \? failureRead\.rows : null\)/, "the source must be classified from the read, not from a flattened empty list");
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
  /*
   * The boundary filter is the difference between counting TURNS and counting
   * ATTEMPTS. chat-handler traces an inference.provider failure before it
   * decides to fall back, so without this a recovered failover -- a turn the
   * user saw succeed -- is reported as a fault, and a turn that really failed
   * is counted twice, once at its provider and once at api.chat.
   */
  assert.match(store, /boundary=eq\.api\.chat&state=eq\.failed/, "only the terminal api.chat outcome counts as a failed turn");
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
