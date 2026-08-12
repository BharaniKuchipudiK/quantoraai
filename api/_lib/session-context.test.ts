import assert from "node:assert/strict";
import test from "node:test";
import {
  extractContextFromAssistantText,
  formatSessionContextForPrompt,
  mergeSessionContext,
  normalizeSessionContext,
  stripPartialContextMarker,
} from "./session-context.js";

test("normalizeSessionContext trims and caps facts", () => {
  const ctx = normalizeSessionContext({
    goal: " Plan Bali ",
    facts: [" mid-range budget ", "", 42],
    understanding: "Couple trip",
  });
  assert.equal(ctx.goal, "Plan Bali");
  assert.deepEqual(ctx.facts, ["mid-range budget"]);
  assert.equal(ctx.understanding, "Couple trip");
});

test("mergeSessionContext accumulates facts and prefers newer goal", () => {
  const merged = mergeSessionContext(
    { goal: "Old", facts: ["dates: March"] },
    { goal: "Plan Bali", facts: ["budget: mid-range"] },
  );
  assert.equal(merged.goal, "Plan Bali");
  assert.ok(merged.facts?.includes("dates: March"));
  assert.ok(merged.facts?.includes("budget: mid-range"));
});

test("formatSessionContextForPrompt returns empty for blank context", () => {
  assert.equal(formatSessionContextForPrompt({}), "");
});

test("formatSessionContextForPrompt renders memory block", () => {
  const block = formatSessionContextForPrompt({ goal: "Plan Bali", facts: ["5 nights"] });
  assert.match(block, /SESSION MEMORY/);
  assert.match(block, /Plan Bali/);
  assert.match(block, /5 nights/);
});

test("extractContextFromAssistantText strips hidden marker", () => {
  const raw = `Here is your plan.\n\n<!-- quantora-ctx:{"goal":"Plan Bali","facts":["5 nights"]} -->`;
  const { displayText, contextUpdate } = extractContextFromAssistantText(raw);
  assert.equal(displayText, "Here is your plan.");
  assert.equal(contextUpdate?.goal, "Plan Bali");
});

test("stripPartialContextMarker hides streaming marker tail", () => {
  assert.equal(
    stripPartialContextMarker('Working on it.\n\n<!-- quantora-ctx:{"goal":'),
    "Working on it.",
  );
});
