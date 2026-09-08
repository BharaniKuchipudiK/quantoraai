/**
 * THE FAILURE PANEL RENDERS, AND TELLS THE TWO KINDS APART.
 *
 * The digest is summarised on the server and proved there. This asks the
 * other half of the question, the half that decides whether any of it was
 * worth doing: does an operator actually SEE it?
 *
 * Two reasons this is a render test and not another string scan:
 *
 *   1. A COMPONENT IS ONLY PROVED TO RENDER BY RENDERING IT. On 2026-09-07 a
 *      `useState` declared below a `useCallback` that named it shipped: lint
 *      passed, every unit test passed, and the desk did not mount for anyone.
 *      No amount of grepping the file would have caught it; one render would.
 *
 *   2. A REFUSAL MUST NOT LOOK LIKE A FAULT. A spent budget is Quantora
 *      declining by design; a 500 is Quantora broken. If the panel draws them
 *      the same, a real outage hides inside a busy day of honest limits and
 *      the digest has bought nothing. The server decides `kind`; this proves
 *      the panel obeys it and that the two are told apart on screen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import TechnicalAnalyticsPanel from "./TechnicalAnalyticsPanel.jsx";
import { summarizeTurnFailures, FAILURE_WINDOW_HOURS } from "../../api/_lib/turn-failure-digest.js";

const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

/**
 * Deliberately mixed: a real fault affecting two people, and a larger pile of
 * honest refusals. The refusals outnumber the fault, which is the shape that
 * hides an outage when a panel ranks by volume or draws both the same.
 */
const ROWS = [
  { correlationId: "ref-fault-1", userSub: "u1", detailCode: "upstream-5xx", statusCode: 500, engine: "anthropic", createdAt: at(10) },
  { correlationId: "ref-fault-2", userSub: "u2", detailCode: "upstream-5xx", statusCode: 500, engine: "anthropic", createdAt: at(20) },
  { correlationId: "ref-lim-1", userSub: "u3", detailCode: "turn-budget", statusCode: 429, engine: "anthropic", createdAt: at(5) },
  { correlationId: "ref-lim-2", userSub: "u4", detailCode: "turn-budget", statusCode: 429, engine: "anthropic", createdAt: at(6) },
  { correlationId: "ref-lim-3", userSub: "u5", detailCode: "turn-budget", statusCode: 429, engine: "anthropic", createdAt: at(7) },
];

function render(turnFailures: unknown): string {
  return renderToStaticMarkup(
    // @ts-expect-error -- the panel is untyped .jsx; this test drives only the failure section.
    <TechnicalAnalyticsPanel technical={null} turnFailures={turnFailures} isLight={false} />,
  );
}

test("[was-red] the digest reaches the screen, not just the API response", () => {
  const digest = summarizeTurnFailures(ROWS as never, FAILURE_WINDOW_HOURS);
  const html = render({ ...digest, source: "measured" });

  assert.ok(html.includes("Failed turns"), "the section must be titled");
  assert.ok(html.includes(digest.headline), "the server's headline is what is shown, verbatim");
  assert.ok(html.includes("ref-fault-1"), "a reference id must be shown — it is the key to the full story");
});

test("[was-red] a fault is drawn differently from a refusal", () => {
  const digest = summarizeTurnFailures(ROWS as never, FAILURE_WINDOW_HOURS);
  const html = render({ ...digest, source: "measured" });

  /*
   * Both kinds are present in the fixture, so a panel that renders only one
   * of them, or renders both identically, fails here rather than reading as
   * a clean run over a corpus that never disagreed.
   */
  assert.ok(html.includes('data-quantora-failure-group="fault"'), "the fault must be marked as one");
  assert.ok(html.includes('data-quantora-failure-group="refusal"'), "and the refusal as one");

  const faultAt = html.indexOf('data-quantora-failure-group="fault"');
  const refusalAt = html.indexOf('data-quantora-failure-group="refusal"');
  assert.ok(faultAt < refusalAt, "the fault outranks three refusals — reach and severity, never volume");

  /*
   * The marker is not enough on its own: an operator reads the screen, not
   * the DOM. The two rows must differ visibly, so a fault cannot be scrolled
   * past as one more limit.
   */
  const faultRow = html.slice(faultAt, refusalAt);
  const refusalRow = html.slice(refusalAt);
  const stripe = (row: string) => /border-left:3px solid ([^;"]+)/.exec(row)?.[1] ?? null;
  assert.ok(stripe(faultRow), "the fault row must carry a stripe colour");
  assert.notEqual(stripe(faultRow), stripe(refusalRow), "and it must not be the colour worn by an honest refusal");
});

test("[was-red] an unmeasured zero does not render as a quiet day", () => {
  /*
   * Zero failures and a store that never answered are the same empty list and
   * mean opposite things. Reading the first when it is the second is how a
   * total outage looks like the best day the platform ever had.
   */
  const WARNING = "data-quantora-failure-source-warning";

  const quiet = render({ ...summarizeTurnFailures([], FAILURE_WINDOW_HOURS), source: "measured" });
  assert.ok(!quiet.includes(WARNING), "a measured zero is reported plainly, with nothing to caveat");

  const blind = render({ ...summarizeTurnFailures([{ correlationId: "r", userSub: "u", detailCode: "upstream-5xx", statusCode: 500, engine: "e", createdAt: at(1) }] as never, FAILURE_WINDOW_HOURS), source: "not_configured" });
  assert.ok(blind.includes(`${WARNING}="not_configured"`), "an unconfigured store must be caveated on the screen, naming which source it was");

  /*
   * Anchored on the hook, not the sentence. This gate says a caveat SURFACE
   * exists and is conditional on the source; it does not police the wording,
   * because a test that matches prose is the one that went permanently red
   * when a button's copy changed and got three endpoints muted with it.
   */
});

test("no user identifier reaches the rendered panel", () => {
  /*
   * The digest counts people and never names them. This is the surface where
   * a leak would actually be read by someone, so it is asserted here too
   * rather than trusted from one layer down.
   */
  const html = render({ ...summarizeTurnFailures(ROWS as never, FAILURE_WINDOW_HOURS), source: "measured" });
  for (const row of ROWS) {
    assert.ok(!html.includes(row.userSub), `the panel must not name ${row.userSub}`);
  }
});
