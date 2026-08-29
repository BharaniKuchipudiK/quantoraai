import assert from "node:assert/strict";
import test from "node:test";
import {
  AdvisorDomainRegistry,
  DEFAULT_ADVISOR_RANKING_POLICY,
  normalizeAdvisorAssessment,
  scoreAdvisorIntervention,
} from "./pcl-advisor-intelligence.js";


test("advisor ranking is policy driven and can prefer a faster intervention when benefit is otherwise similar", () => {
  const base = {
    id: "a",
    label: "A",
    gapIds: ["gap"],
    expectedBenefit: 0.8,
    urgency: 0.8,
    dependencyLeverage: 0.8,
    confidence: 0.9,
    risk: "low" as const,
    reversibility: "easy" as const,
    verificationCriteria: ["verify"],
    reasonCodes: [],
  };
  const fast = scoreAdvisorIntervention({ ...base, estimatedMinutes: 10 }, DEFAULT_ADVISOR_RANKING_POLICY);
  const slow = scoreAdvisorIntervention({ ...base, id: "b", estimatedMinutes: 80 }, DEFAULT_ADVISOR_RANKING_POLICY);
  assert.ok(fast > slow);
});
