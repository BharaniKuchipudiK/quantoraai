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
  assert.match(prompt, /GENERATED VFS RUNTIME CONTRACT/);
  assert.match(prompt, /bare package specifiers/);
  assert.match(prompt, /never load a framework from a CDN/);
  assert.match(prompt, /Prefer platform primitives/);
  assert.match(prompt, /opaque-origin security sandbox/);
});

test("injects listening signals into the system prompt", () => {
  const prompt = buildConversationSystemPrompt({
    listeningSignals: [{ type: "choice_selected", label: "Chose: Day-by-day plan" }],
  });

  assert.match(prompt, /RECENT USER BEHAVIOR/);
  assert.match(prompt, /Day-by-day plan/);
});

test("injects outcome gap hint when gap signal present", () => {
  const prompt = buildConversationSystemPrompt({
    listeningSignals: [
      { type: "outcome_gap_detected", label: "Gap detected: Add direct links" },
    ],
  });

  assert.match(prompt, /missed user intent/);
  assert.match(prompt, /Add direct links/);
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

test("guided build requires intake before HTML on first turn", () => {
  const prompt = buildConversationSystemPrompt({ guided: true });
  assert.match(prompt, /GUIDED BUILD MODE/);
  assert.match(prompt, /FIRST-TURN RULE/);
  assert.match(prompt, /MUST NOT output HTML/);
  assert.match(prompt, /Never invent a business name/);
});

test("refine mode uses communication layer before code", () => {
  const prompt = buildConversationSystemPrompt({ buildMode: true, refineMode: true });
  assert.match(prompt, /COMMUNICATION LAYER/);
  assert.match(prompt, /REFINE \/ ITERATE MODE/);
  assert.match(prompt, /What do you think/);
});

test("feature suggest mode blocks html output", () => {
  const prompt = buildConversationSystemPrompt({ featureSuggest: true });
  assert.match(prompt, /FEATURE SUGGESTION MODE/);
  assert.match(prompt, /Do NOT output any HTML/);
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
