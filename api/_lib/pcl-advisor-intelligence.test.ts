import assert from "node:assert/strict";
import test from "node:test";
import {
  AdvisorDomainRegistry,
  DEFAULT_ADVISOR_RANKING_POLICY,
  formatPclAdvisorContract,
  normalizeAdvisorAssessment,
  scoreAdvisorIntervention,
} from "./pcl-advisor-intelligence.js";
import { buildStudyAdvisorCandidate } from "./study-mastery-intelligence.js";

function studyCandidate() {
  return buildStudyAdvisorCandidate({
    goalLabel: "Master projectile motion for JEE Advanced",
    targetConceptIds: ["projectile"],
    concepts: [
      { id: "trig", label: "Trigonometric component interpretation", examWeight: 0.9 },
      { id: "vectors", label: "Vector decomposition", prerequisiteIds: ["trig"], examWeight: 0.9 },
      { id: "projectile", label: "Projectile motion", prerequisiteIds: ["vectors"], examWeight: 1 },
    ],
    evidence: [
      { conceptId: "trig", mastery: 0.45, confidence: 0.92, attempts: 8 },
      { conceptId: "vectors", mastery: 0.58, confidence: 0.9, attempts: 10 },
      { conceptId: "projectile", mastery: 0.63, confidence: 0.88, attempts: 12 },
    ],
    estimatedMinutesByConcept: { trig: 15, vectors: 20, projectile: 30 },
  });
}

test("Study descends the prerequisite graph and recommends the deepest confirmed root gap", () => {
  const assessment = normalizeAdvisorAssessment(studyCandidate());
  assert.ok(assessment);
  assert.equal(assessment.domain, "education");
  assert.equal(assessment.recommendedInterventionId, "study-intervention:repair:trig");
  const trigGap = assessment.gaps.find((item) => item.id.endsWith(":trig"));
  const vectorGap = assessment.gaps.find((item) => item.id.endsWith(":vectors"));
  assert.equal(trigGap?.rootCause, true);
  assert.equal(vectorGap?.rootCause, false);
  assert.ok(trigGap?.blocks.includes("Projectile motion"));
});

test("confident misconception is prioritised as a repair target instead of rewarding a raw score", () => {
  const candidate = buildStudyAdvisorCandidate({
    goalLabel: "Improve mechanics exam readiness",
    targetConceptIds: ["forces"],
    concepts: [
      { id: "third-law", label: "Newton's third law", examWeight: 0.9 },
      { id: "forces", label: "Force analysis", prerequisiteIds: ["third-law"], examWeight: 1 },
    ],
    evidence: [
      { conceptId: "third-law", mastery: 0.74, confidence: 0.94, selfConfidence: 0.95, misconception: true },
      { conceptId: "forces", mastery: 0.76, confidence: 0.9 },
    ],
  });
  const assessment = normalizeAdvisorAssessment(candidate);
  assert.ok(assessment);
  assert.equal(assessment.recommendedInterventionId, "study-intervention:repair:third-law");
  assert.equal(assessment.gaps.find((item) => item.id.includes("third-law"))?.kind, "misconception");
});

test("missing prerequisite evidence becomes a diagnostic action rather than an invented mastery gap", () => {
  const candidate = buildStudyAdvisorCandidate({
    goalLabel: "Master algebraic fractions",
    targetConceptIds: ["fractions"],
    concepts: [
      { id: "factorisation", label: "Factorisation" },
      { id: "fractions", label: "Algebraic fractions", prerequisiteIds: ["factorisation"] },
    ],
    evidence: [
      { conceptId: "fractions", mastery: 0.55, confidence: 0.9 },
    ],
  });
  const assessment = normalizeAdvisorAssessment(candidate);
  assert.ok(assessment);
  const unknown = assessment.gaps.find((item) => item.id === "study-gap:evidence:factorisation");
  assert.ok(unknown);
  assert.equal(unknown.kind, "evidence_gap");
  assert.equal(assessment.evidence.some((item) => item.id.includes("factorisation")), false);
});

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

test("advisor registry falls back across replaceable domain adapters", async () => {
  const registry = new AdvisorDomainRegistry();
  registry.register({
    id: "preferred",
    domain: "education",
    priority: 20,
    assess: async () => { throw new Error("provider unavailable"); },
  });
  registry.register({
    id: "fallback",
    domain: "education",
    priority: 10,
    assess: async () => studyCandidate(),
  });
  const result = await registry.assess({ domain: "education", goal: "Master projectile motion" });
  assert.equal(result.status, "success");
  assert.equal(result.adapterId, "fallback");
  assert.equal(result.assessment?.recommendedInterventionId, "study-intervention:repair:trig");
});

test("PCL advisor contract tells the model to explain root gaps and never invent progress", () => {
  const assessment = normalizeAdvisorAssessment(studyCandidate());
  assert.ok(assessment);
  const contract = formatPclAdvisorContract(assessment);
  assert.match(contract, /highest-value gap/i);
  assert.match(contract, /root-cause and dependency-leverage/i);
  assert.match(contract, /Never invent a gap, mastery level/i);
  assert.match(contract, /verify whether the state improved/i);
  assert.doesNotMatch(contract, /Gemini|Claude|OpenAI/i);
});
