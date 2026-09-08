/**
 * The meter is read at a glance and believed, so its failure mode is not a
 * crash but a comfortable picture of a state nobody measured.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import TurnBudgetMeter from "./TurnBudgetMeter.jsx";

const NOW = Date.parse("2026-09-08T10:00:00Z");
const draw = (budget: unknown) => renderToStaticMarkup(<TurnBudgetMeter budget={budget} now={NOW} />);

test("[was-red] nothing is drawn when the standing is unknown", () => {
  /*
   * A null count comes from a durable store that did not answer. Coerced to a
   * number it is 0, and a 0% bar is a full untouched allowance -- the best
   * news on the screen, invented. Absent beats optimistic.
   */
  assert.equal(draw({ limit: 60, used: null, resetsAt: null }), "");
  assert.equal(draw(null), "");
});

test("a spent budget says when the whole allowance returns", () => {
  const html = draw({ scope: "user", limit: 60, used: 60, resetsAt: "2026-09-09T00:00:00Z" });
  assert.ok(html.includes('data-quantora-turn-meter="exhausted"'));
  assert.ok(html.includes("in 14h"), "the duration, not a timestamp in some other timezone");
  assert.ok(html.includes("all of them come back"), "the window is fixed — they return whole, not a few at a time");
  assert.ok(!html.includes("within 24 hours"), "the sentence that was true at every hour of the day is gone");
});

test("a healthy budget shows what is left, and is drawn differently from a spent one", () => {
  const ok = draw({ scope: "user", limit: 60, used: 15, resetsAt: "2026-09-09T00:00:00Z" });
  assert.ok(ok.includes('data-quantora-turn-meter="available"'));
  assert.ok(ok.includes('data-quantora-turn-remaining="45"'));

  const spent = draw({ scope: "user", limit: 60, used: 60, resetsAt: "2026-09-09T00:00:00Z" });
  const fill = (html: string) => /width:([\d.]+)%;height:100%;background:([^;"]+)/.exec(html)?.[2] ?? null;
  assert.ok(fill(ok), "the healthy bar has a colour");
  assert.notEqual(fill(ok), fill(spent), "and it is not the colour of a spent one");
});

test("a shared ceiling never reads as the person's own doing", () => {
  const html = draw({ scope: "platform", limit: 500, used: 500, resetsAt: "2026-09-09T00:00:00Z" });
  assert.ok(/shared daily turns/i.test(html), "it must say the limit is Quantora's, not yours");
  assert.ok(!/your daily turns/i.test(html));
});


test("[was-red] the meter is reachable — server to screen, every hop", () => {
  /*
   * A meter nothing renders is the orphan class this repo has shipped twice.
   * Each hop below is one where the chain has silently broken before: the
   * server computing a number it never sends, the client dropping a field it
   * never reads, the component imported and never placed.
   */
  const budget = readFileSync(new URL("../../api/_lib/user-turn-budget.ts", import.meta.url), "utf8");
  assert.match(budget, /used: user\.hits/, "the verdict must carry the count the store returned");
  assert.match(budget, /resetsAt: user\.resetsAt/, "and the instant it returns");
  assert.match(budget, /export function describeResetIn/, "and the duration must be sayable");

  const handler = readFileSync(new URL("../../api/_lib/chat-handler.ts", import.meta.url), "utf8");
  assert.match(handler, /turnBudget: \{/, "the refusal must send the standing, not just the word no");
  assert.match(handler, /resetsAt: budget\.resetsAt/, "including when the allowance comes back");

  const stream = readFileSync(new URL("../hooks/useChatStream.js", import.meta.url), "utf8");
  assert.match(stream, /turnBudget: errData\.turnBudget \|\| null/, "the client must keep it on the message that reports the refusal");

  const studio = readFileSync(new URL("./AiStudio.jsx", import.meta.url), "utf8");
  assert.match(studio, /import TurnBudgetMeter from '\.\/TurnBudgetMeter\.jsx'/, "the desk must import the meter");
  assert.match(studio, /<TurnBudgetMeter budget=\{msg\.turnBudget\}/, "and actually place it — importing is not rendering");
});
