import assert from "node:assert/strict";
import test from "node:test";
import { studyAdvisorContractForTurn } from "./study-advisor-turn.js";

test("a projectile-motion question gets a diagnostic Study contract, not invented mastery", () => {
  const contract = studyAdvisorContractForTurn({
    message: "I keep missing projectile motion questions on JEE practice.",
    goal: "Get stronger at mechanics",
  });
  assert.match(contract, /PCL ADVISOR INTELLIGENCE/);
  assert.match(contract, /projectile/i);
  assert.match(contract, /Never invent a gap, mastery level/i);
  assert.match(contract, /diagnostic/i);
  assert.doesNotMatch(contract, /mastery 0\.|82%|Gemini|LangChain/i);
});

test("unrelated chat does not force a Study diagnosis", () => {
  assert.equal(studyAdvisorContractForTurn({ message: "hello" }), "");
});
