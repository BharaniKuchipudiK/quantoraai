/**
 * The ring's job is to be seen BEFORE the wall, so its failure modes are
 * silence when it should speak and a comfortable arc drawn from nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import TurnBudgetRing from "./TurnBudgetRing.jsx";

const NOW = Date.parse("2026-09-08T10:00:00Z");
const draw = (budget: unknown) => renderToStaticMarkup(<TurnBudgetRing budget={budget} now={NOW} />);
const RESETS = "2026-09-09T00:00:00Z";

test("[was-red] nothing is drawn when the standing is unknown", () => {
  /*
   * A ring from a null count is a full untouched allowance -- the most
   * reassuring picture available, produced by knowing nothing.
   */
  assert.equal(draw({ limit: 60, used: null, resetsAt: RESETS }), "");
  assert.equal(draw(null), "");
  assert.equal(draw(undefined), "");
});

test("[was-red] the ring shows what is left while there is still a choice", () => {
  /*
   * The whole point. A meter that only appears on the refusal is the defect
   * it was built to fix: at turn 45 the number changes behaviour, at turn 61
   * it is an explanation.
   */
  const midway = draw({ scope: "user", limit: 60, used: 45, resetsAt: RESETS });
  assert.ok(midway.includes('data-quantora-turn-ring="available"'));
  assert.ok(midway.includes('data-quantora-turn-ring-remaining="15"'));
  assert.ok(/15 of 60 turns left/.test(midway), "and says so in words for a screen reader and a hover");
  assert.ok(/in 14h/.test(midway), "with when it comes back");
});

test("a spent allowance is drawn differently from a healthy one", () => {
  const ok = draw({ scope: "user", limit: 60, used: 10, resetsAt: RESETS });
  const spent = draw({ scope: "user", limit: 60, used: 60, resetsAt: RESETS });
  assert.ok(spent.includes('data-quantora-turn-ring="exhausted"'));

  const arcColour = (html: string) => /stroke="(#[0-9a-f]{6})" stroke-width="2\.5" stroke-linecap/i.exec(html)?.[1] ?? null;
  assert.ok(arcColour(ok), "the healthy arc has a colour");
  assert.notEqual(arcColour(ok), arcColour(spent), "and it is not the colour of a spent one");
});

test("[was-red] the arc cannot wind past its own start", () => {
  /*
   * The refusal is itself a counted hit, so used passes the limit -- 83/60 in
   * production on the day this shipped. An unclamped dash array wraps the
   * circle and draws a full ring that reads as untouched.
   */
  const over = draw({ scope: "user", limit: 60, used: 83, resetsAt: RESETS });
  const dash = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(over);
  assert.ok(dash, "the arc must be drawn");
  assert.ok(Number(dash![2]) >= 0, "the remainder of the circle is never negative");
  assert.ok(over.includes('data-quantora-turn-ring-remaining="0"'));
});

test("an exempt account is told the truth instead of shown an empty ring", () => {
  const html = draw({ scope: "user", limit: 60, used: 5, resetsAt: RESETS, exempt: true });
  assert.ok(html.includes('data-quantora-turn-ring="exempt"'));
  assert.ok(/no daily limit/i.test(html), "an allowance that does not apply must not be drawn as one");
});

test("[was-red] the ring is reachable — server header to composer, every hop", () => {
  const handler = readFileSync(new URL("../../api/_lib/chat-handler.ts", import.meta.url), "utf8");
  /*
   * The setHeader CALL, not the header name. The first version of this matched
   * the name anywhere in the file, so deleting the line that actually sends it
   * still passed on the Access-Control-Expose-Headers line beneath — a gate
   * green over the exact defect it names.
   */
  assert.match(handler, /res\.setHeader\('X-Quantora-Turn-Budget', JSON\.stringify\(standing\)\)/,
    "the standing must travel on every turn, not only the refused one");
  assert.match(handler, /Access-Control-Expose-Headers/, "and be readable by the page that asked");

  const stream = readFileSync(new URL("../hooks/useChatStream.js", import.meta.url), "utf8");
  assert.match(stream, /res\.headers\.get\('X-Quantora-Turn-Budget'\)/, "the client must read it");
  assert.match(stream, /onTurnBudgetRef\.current\?\.\(/, "and hand it up");

  const studio = readFileSync(new URL("./AiStudio.jsx", import.meta.url), "utf8");
  assert.match(studio, /onTurnBudget: setTurnBudget/, "the desk must subscribe");
  assert.match(studio, /<TurnBudgetRing budget=\{turnBudget\}/, "and place the ring — importing is not rendering");
});
