import test from "node:test";
import assert from "node:assert/strict";
import { buildChoiceTemplateDirective } from "./studio-choice-templates.ts";
import { buildConversationSystemPrompt } from "./conversation-policy.ts";

test("buildChoiceTemplateDirective includes travel hints for travel domain", () => {
  const directive = buildChoiceTemplateDirective({ studioDomain: "travel" });
  assert.match(directive, /TRAVEL CHOICE TEMPLATES/);
  assert.match(directive, /When are you thinking/);
});

test("buildChoiceTemplateDirective includes build hints for guided build", () => {
  const directive = buildChoiceTemplateDirective({ guided: true });
  assert.match(directive, /BUILD CHOICE TEMPLATES/);
  assert.match(directive, /Online shop/);
});

test("buildChoiceTemplateDirective is empty for general ask", () => {
  assert.equal(buildChoiceTemplateDirective({}), "");
});

test("conversation prompt includes travel and choice templates together", () => {
  const prompt = buildConversationSystemPrompt({ studioDomain: "travel" });
  assert.match(prompt, /STRUCTURED FOLLOW-UP OPTIONS/);
  assert.match(prompt, /TRAVEL CHOICE TEMPLATES/);
  assert.match(prompt, /DOMAIN FOCUS: TRAVEL/);
});

test("conversation prompt includes build choice templates in guided mode", () => {
  const prompt = buildConversationSystemPrompt({ guided: true });
  assert.match(prompt, /BUILD CHOICE TEMPLATES/);
  assert.match(prompt, /GUIDED BUILD MODE/);
});
