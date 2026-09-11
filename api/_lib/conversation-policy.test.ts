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

/*
 * Phase 06 — the composer's Plan control reaches this function, so the two
 * plan directives can now be asked for on the same turn. They want opposite
 * replies: one demands JSON and nothing else, the other demands prose plus a
 * marker. A model cannot satisfy both, and whichever it picks the platform
 * judges it against the other — the guided-intake failure again.
 */
test("an explicit Plan turn asks for a readable plan, not a JSON blob", () => {
  const prompt = buildConversationSystemPrompt({ planMode: true, needsJobPlan: true });

  assert.match(prompt, /quantora-plan/, "the desk renders the marker; without it a plan is just prose");
  assert.match(prompt, /No code this turn/);
  assert.doesNotMatch(
    prompt,
    /Output ONLY valid JSON/,
    "the model was told to emit prose and a marker, and simultaneously to emit only JSON",
  );
});

test("the job plan still stands on its own when nobody pressed Plan", () => {
  // The size heuristic path predates the toggle and must be unchanged by it.
  const prompt = buildConversationSystemPrompt({ needsJobPlan: true });
  assert.match(prompt, /quantora-plan/);
  assert.doesNotMatch(prompt, /Output ONLY valid JSON/);
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

test("build policy preserves named Python deliverables instead of inventing a web replica", () => {
  const prompt = buildConversationSystemPrompt({ buildMode: true });
  assert.match(prompt, /PYTHON SOURCE OVERRIDE/);
  assert.match(prompt, /Do not invent index\.html or a browser replica/);
  assert.match(prompt, /runs pytest when test files are present/);
});

test("shop checkout points at the live canonical application domain", () => {
  const prompt = buildConversationSystemPrompt({ buildMode: true });
  assert.match(prompt, /https:\/\/quantoraai\.app\/api\/checkout/);
  assert.doesNotMatch(prompt, /quantoraai\.vercel\.app/);
});

test("build mode tells the model to ship working tools immediately", () => {
  const prompt = buildConversationSystemPrompt({
    buildMode: true,
    guided: false,
    lastMessage: "Help me create a calculator that can handle all the basic functions with the iOS theme.",
  });
  assert.match(prompt, /BUILD MODE/);
  assert.match(prompt, /TOOLS AND WIDGETS/);
  assert.match(prompt, /calculator/);
  assert.match(prompt, /OVERRIDES the React VFS runtime contract/);
  assert.doesNotMatch(prompt, /FIRST-TURN RULE/);
  assert.doesNotMatch(prompt, /You are an API, not a chatbot/);
  assert.match(prompt, /domestic vs international shipping/);
});

test('[was-red] build mode never promises refresh persistence that Preview cannot provide', () => {
  const prompt = buildConversationSystemPrompt({ buildMode: true });
  assert.match(prompt, /PREVIEW STORAGE/);
  assert.match(prompt, /localStorage, sessionStorage, and IndexedDB are unavailable/);
  assert.match(prompt, /state plainly that refresh persistence is not available yet/);
});

test("a shop build must emit real proxied photos, not placeholder frames", () => {
  const prompt = buildConversationSystemPrompt({
    buildMode: true,
    guided: false,
    lastMessage: "build a website for an Indian ethnic saree boutique",
  });
  // Real photos flow through the same-origin proxy, not fabricated data URIs.
  assert.match(prompt, /\/api\/preview-image\?u=/);
  assert.match(prompt, /images\.unsplash\.com/);
  // The products.json example must NOT show an svg placeholder for the image.
  assert.doesNotMatch(prompt, /"image":\s*"data:image\/svg\+xml/);
  // The model must never offload image work back onto the user.
  assert.match(prompt, /NEVER instruct the user to|never tell the user to fill in image data/i);
  assert.doesNotMatch(prompt, /tasteful placeholder imagery/);
});

test("Office JSON rules are only injected for Office requests", () => {
  const office = buildConversationSystemPrompt({
    buildMode: true,
    lastMessage: "Create a slide deck about Q3 results",
  });
  assert.match(office, /MS OFFICE DOCUMENT GENERATION/);
  assert.match(office, /raw JSON only/);
});

test("guided build requires intake before HTML on first turn", () => {
  const prompt = buildConversationSystemPrompt({ guided: true });
  assert.match(prompt, /GUIDED BUILD MODE/);
  assert.match(prompt, /FIRST-TURN RULE/);
  assert.match(prompt, /MUST NOT output HTML/);
  assert.match(prompt, /Never invent a business name/);
  assert.match(prompt, /\/api\/preview-image\?u=/);
  assert.match(prompt, /images\.unsplash\.com/);
  assert.doesNotMatch(prompt, /"image":\s*"data:image\/svg\+xml/);
  assert.doesNotMatch(prompt, /tasteful placeholder imagery/);
});

test("build mode demands a real design system, not a bare page", () => {
  const prompt = buildConversationSystemPrompt({
    buildMode: true,
    lastMessage: "build a landing page for my bakery",
  });
  assert.match(prompt, /STYLE IS NOT OPTIONAL/);
  assert.match(prompt, /never a bare .*page/i);
});

test("refine mode uses communication layer before code", () => {
  const prompt = buildConversationSystemPrompt({ buildMode: true, refineMode: true });
  assert.match(prompt, /COMMUNICATION LAYER/);
  assert.match(prompt, /REFINE \/ ITERATE MODE/);
  assert.match(prompt, /You MUST emit that HTML block/);
  assert.match(prompt, /filepath=/);
  assert.match(prompt, /LIVE PREVIEW FACTS are present/);
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

test("education prompt carries tutor stance from session signals, not a chapter pack", () => {
  const education = buildConversationSystemPrompt({ studioDomain: "education" });
  assert.match(education, /Never invent a syllabus chapter/i);
  assert.match(education, /Empathize with struggle/i);
  assert.match(education, /recall, apply, multi-concept, numerical, assertion-reason/);
  const travel = buildConversationSystemPrompt({ studioDomain: "travel" });
  assert.doesNotMatch(travel, /Never invent a syllabus chapter/i);
  assert.doesNotMatch(travel, /Empathize with struggle/i);
});
