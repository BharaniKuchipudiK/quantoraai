import assert from "node:assert/strict";
import test from "node:test";
import {
  composeDeepDiveMessages,
  normalizeResearchDeepDiveRequest,
  runResearchDeepDive,
} from "./research-deep-dive.js";
// The dive's whole contract is that its output is a well-formed investigation
// to the SAME parser the board uses — so the test feeds it straight in.
import { deriveResearchBrief } from "../../src/lib/research-brief.js";

const QUESTION = "Is nuclear cheaper than solar per MWh today?";
const SUBS = [
  "What does current cost data say per MWh?",
  "How do lifetime extensions change the comparison?",
  "Where do firming costs change the ranking?",
];
const ANSWER = (n: number) => ({
  answer: `- Finding ${n}: utility solar undercut new nuclear in the surveyed markets this year.\n- Finding ${n}b: the gap narrows where firming is priced into the comparison.`,
  sources: [{ uri: "https://www.nature.com/articles/x123", title: "Nature study" }],
});

test("normalize enforces the question contract", () => {
  assert.equal(normalizeResearchDeepDiveRequest({ question: QUESTION }).ok, true);
  assert.equal(normalizeResearchDeepDiveRequest({ question: "short" }).ok, false);
  assert.equal(normalizeResearchDeepDiveRequest({ question: "x".repeat(501) }).ok, false);
  assert.equal(normalizeResearchDeepDiveRequest({}).ok, false);
});

test("the dive's output IS a well-formed investigation to the board's own parser", async () => {
  const result = await runResearchDeepDive({
    question: QUESTION,
    decompose: async () => SUBS,
    groundedAnswer: async (sub) => ANSWER(SUBS.indexOf(sub) + 1),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.subQuestions, 3);
  assert.equal(result.grounded, 3);

  const brief = deriveResearchBrief({
    messages: [
      { sender: "user", text: QUESTION },
      ...result.messages,
    ],
  });
  assert.equal(brief.question, QUESTION);
  assert.equal(brief.plan.length, 3);
  assert.ok(brief.plan.every((item: any) => item.explored), "every answered sub-question marks explored");
  assert.ok(brief.findings.length >= 3);
  assert.equal(brief.sources.length, 1);
  assert.equal(brief.groundedTurns, 3);
  // The plan bookkeeping message is not an "unverified answer".
  assert.equal(brief.ungroundedTurns, 0);
});

test("a failed lookup leaves its plan item an open chip, never an invented answer", async () => {
  const result = await runResearchDeepDive({
    question: QUESTION,
    decompose: async () => SUBS,
    groundedAnswer: async (sub) => {
      if (sub === SUBS[1]) throw new Error("provider down");
      return ANSWER(1);
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.grounded, 2);
  const brief = deriveResearchBrief({
    messages: [{ sender: "user", text: QUESTION }, ...result.messages],
  });
  assert.deepEqual(brief.plan.map((item: any) => item.explored), [true, false, true]);
});

test("an answer with no admissible sources carries no Sources block", () => {
  const messages = composeDeepDiveMessages(QUESTION, [SUBS[0]], [{
    answer: "- A claim with nothing behind it worth citing here at all.",
    sources: [{ uri: "https://169.254.169.254/latest", title: "metadata" }],
  }]);
  const answerMessage = messages[messages.length - 1];
  assert.doesNotMatch(answerMessage.text, /\*\*Sources\*\*/);
  const brief = deriveResearchBrief({
    messages: [{ sender: "user", text: QUESTION }, ...messages],
  });
  assert.equal(brief.groundedTurns, 0);
  assert.equal(brief.ungroundedTurns, 1);
});

test("the dive fails closed on an undecomposable question or a total lookup failure", async () => {
  const noSubs = await runResearchDeepDive({
    question: QUESTION,
    decompose: async () => ["not a question", "too short?"],
    groundedAnswer: async () => { throw new Error("must not run"); },
  });
  assert.equal(noSubs.ok, false);

  const allDown = await runResearchDeepDive({
    question: QUESTION,
    decompose: async () => SUBS,
    groundedAnswer: async () => { throw new Error("provider down"); },
  });
  assert.equal(allDown.ok, false);

  const crash = await runResearchDeepDive({
    question: QUESTION,
    decompose: async () => { throw new Error("model down"); },
  });
  assert.equal(crash.ok, false);
});
