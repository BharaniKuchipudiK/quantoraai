import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSystemPrompt } from "./conversation-policy.js";

test("uses the Senior Partner conversation loop by default", () => {
  const prompt = buildConversationSystemPrompt();

  assert.match(prompt, /Quantora Senior Partner/);
  assert.match(prompt, /UNDERSTAND → CONTEXTUALIZE → RESPOND → ACT/);
  assert.match(prompt, /Ask exactly one short, natural follow-up question/);
  assert.match(prompt, /materially change the design, cost, risk, or outcome/);
  assert.match(prompt, /do not dump code/);
  assert.match(prompt, /SESSION MEMORY UPDATE/);
  assert.match(prompt, /BALANCED MODE/);
});

test("injects stored session memory into the system prompt", () => {
  const prompt = buildConversationSystemPrompt({
    sessionContext: { goal: "Plan Bali", facts: ["5 nights in March"] },
  });

  assert.match(prompt, /Plan Bali/);
  assert.match(prompt, /5 nights in March/);
});

test("includes continuation chips directive in every mode", () => {
  const prompt = buildConversationSystemPrompt();
  assert.match(prompt, /CONTINUATION CHIPS/);
  assert.match(prompt, /quantora-continues/);
});

test("scopes plan mode to software architecture only", () => {
  const prompt = buildConversationSystemPrompt({ planMode: true });
  assert.match(prompt, /software \/ application architecture ONLY/);
  assert.match(prompt, /travel, finance, events/);
});

test("asks to clarify before detailed personalized plans", () => {
  const prompt = buildConversationSystemPrompt();
  assert.match(prompt, /PERSONALIZED PLANNING/);
  assert.match(prompt, /ask ONE natural question before delivering a detailed plan/);
});

test("an explicit implementation request is allowed to proceed", () => {
  const prompt = buildConversationSystemPrompt();

  assert.match(prompt, /explicitly asks you to build, implement, write, fix, debug, or show code/);
  assert.match(prompt, /without asking for permission again/);
});

test("Lightning remains human rather than suppressing all explanation", () => {
  const prompt = buildConversationSystemPrompt({ cognitiveLevel: "Lightning" });

  assert.match(prompt, /LIGHTNING MODE/);
  assert.match(prompt, /preserve essential context/);
  assert.doesNotMatch(prompt, /No explanations/);
});

test("Deep Think requests conclusions rather than private reasoning", () => {
  const prompt = buildConversationSystemPrompt({ cognitiveLevel: "Deep Think" });

  assert.match(prompt, /DEEP THINK MODE/);
  assert.match(prompt, /do not expose private chain-of-thought/);
});

test("identifies the selected underlying model without changing the persona", () => {
  const prompt = buildConversationSystemPrompt({ modelName: "Claude Sonnet" });

  assert.match(prompt, /using Claude Sonnet as the underlying model/);
  assert.match(prompt, /following the Quantora policy/);
});
