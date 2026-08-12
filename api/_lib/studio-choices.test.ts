import test from "node:test";
import assert from "node:assert/strict";
import {
  extractChoicesFromAssistantText,
  normalizeStudioChoiceSet,
  stripPartialAssistantMarkers,
} from "./studio-choices.js";

test("normalizeStudioChoiceSet validates choices", () => {
  const set = normalizeStudioChoiceSet({
    title: "Site type",
    choices: [
      { id: "shop", label: "Shop", value: "I want an online shop with cart" },
      { id: "x", label: "", value: "bad" },
    ],
  });
  assert.equal(set?.choices.length, 1);
  assert.equal(set?.choices[0].id, "shop");
});

test("extractChoicesFromAssistantText strips marker", () => {
  const raw = `What kind of site?\n<!-- quantora-choices:{"choices":[{"id":"a","label":"Shop","value":"Shop please"}]} -->`;
  const { displayText, choiceSet } = extractChoicesFromAssistantText(raw);
  assert.match(displayText, /What kind of site/);
  assert.doesNotMatch(displayText, /quantora-choices/);
  assert.equal(choiceSet?.choices[0].label, "Shop");
});

test("stripPartialAssistantMarkers hides incomplete markers during stream", () => {
  const partial = "Pick one:\n<!-- quantora-choices:{\"cho";
  assert.equal(stripPartialAssistantMarkers(partial), "Pick one:");
});
