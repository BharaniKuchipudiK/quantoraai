import assert from "node:assert/strict";
import test from "node:test";

import { parseDebtIntent } from "./debt-intent.js";
import { composeDebtTurn } from "./debt-conversation.js";

function move(message: string) {
  return composeDebtTurn(parseDebtIntent(message));
}

const CRISIS =
  "Help me pay off my debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I only earn $15,000 per month.";

test("every move ends with a next move, never a full stop", () => {
  for (const message of [
    CRISIS,
    "help me pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24% (min $90)",
    "pay off $5,000 at 19.99% (min $150), I can put $600 a month extra toward it",
    "consolidate at 9% over 7 years: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I earn $15,000 a month.",
  ]) {
    const m = move(message);
    assert.ok(m, message);
    assert.match(m.text, /<quantora-modal>[\s\S]*<\/quantora-modal>/, message);
    const json = JSON.parse(m.text.match(/<quantora-modal>([\s\S]*?)<\/quantora-modal>/)![1]);
    assert.ok(Array.isArray(json.options) && json.options.length >= 2, message);
    for (const opt of json.options) {
      assert.ok(opt.id && opt.title && opt.value, `option incomplete: ${message}`);
      // The value is what the user is about to send, so it must be a whole
      // sentence — a fragment would post a broken message on their behalf.
      assert.match(opt.value, /[.?]$/, `option value is a fragment: ${opt.value}`);
    }
  }
});

test("what was learned is carried forward so nothing is asked twice", () => {
  const m = move(CRISIS);
  const ctx = JSON.parse(m!.text.match(/<!--\s*quantora-ctx:\s*([\s\S]*?)\s*-->/)![1]);
  assert.ok(ctx.facts.some((f: string) => /400,000 at 4%/.test(f)));
  assert.ok(ctx.facts.some((f: string) => /Monthly income stated: 15,000/.test(f)));
  assert.ok(ctx.facts.some((f: string) => /shortfall/i.test(f)));
});

test("the shortfall move never presents income as money available for debt", () => {
  const m = move(CRISIS);
  assert.equal(m!.kind, "shortfall");
  assert.doesNotMatch(m!.text, /Debt-free in/);
  assert.match(m!.text, /shortfall of \*\*10,000 every month\*\*/);
  // The solver's answer is a ceiling and has to say so in the same breath.
  assert.match(m!.text, /ceiling nobody actually reaches/);
  assert.match(m!.text, /nothing to living|does not cover the interest/);
});

test("debts with no stated capacity ask one question instead of assuming", () => {
  const m = move("help me pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24% (min $90)");
  assert.equal(m!.kind, "ask-capacity");
  assert.match(m!.text, /240 a month/); // it states what it already worked out
  assert.doesNotMatch(m!.text, /Debt-free in/); // and plans nothing yet
});

test("a consolidation offer is tested, and a worse rate is named as worse", () => {
  const m = move(
    "consolidate at 9% over 7 years: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I earn $15,000 a month.",
  );
  assert.equal(m!.kind, "consolidation");
  assert.match(m!.text, /is \*\*worse\*\* than what you already pay/);
  assert.match(m!.text, /buying breathing room with interest/);
});

test("a debt-shaped question with no numbers stays a conversation", () => {
  for (const message of [
    "how does debt affect my credit score?",
    "is debt consolidation a good idea in general?",
    "explain the snowball method",
  ]) {
    assert.equal(move(message), null, message);
  }
});

test("a rate belonging to a debt is not mistaken for an offer", () => {
  // "consolidate" plus a rate that IS one of the debts is the problem restated.
  const intent = parseDebtIntent("consolidate my $5,000 at 19.99% (min $150) over 3 years");
  assert.equal(intent.offer, null);
});

const MONTH_YEAR = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;

/*
 * "Debt-free in 19 payments" is arithmetic. A date is a commitment, and the
 * months the individual cards disappear are the moments people actually
 * remember. Both must survive from the engine to the reply.
 */
test("a workable plan comes back as a dated program", () => {
  const m = move(
    "help me pay off my debts: $3,200 at 22.9% (min $80), $8,400 at 7.4% (min $210) and $900 at 29.9% (min $25). I can put $400 a month extra toward it.",
  );
  assert.ok(m, "a plan is expected from concrete numbers");
  assert.equal(m.kind, "plan");
  assert.match(m.text, /Debt-free: /, "the program must reach the reply");
  assert.match(m.text, MONTH_YEAR, "the freedom date must name a real month");
  assert.match(m.text, /On the way:/, "the landmarks must survive");
  assert.match(m.text, /gone/, "each cleared debt is named");
  assert.doesNotMatch(m.text, /Debt \\d gone/, "a numbered placeholder must never reach the reader");
  assert.match(m.text, /deterministic simulation/, "the plan itself is not replaced");
});

/*
 * The person whose minimums already exceed their income must never be handed a
 * freedom date — a schedule would have to assume money that is not there.
 */
test("a shortfall keeps the refusal and invents no freedom date", () => {
  const m = move(
    "help me pay off my debts: $9,000 at 24% (min $250) and $7,000 at 26% (min $200). I only earn $200 per month.",
  );
  assert.ok(m);
  assert.doesNotMatch(m.text, /Debt-free: /, "no finish line where there is none to name");
  assert.doesNotMatch(m.text, MONTH_YEAR, "no date invented from a shortfall");
});
