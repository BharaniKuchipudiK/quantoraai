import assert from "node:assert/strict";
import test from "node:test";
import { buildPclAgentExecutionPlan } from "./agent-execution-fabric.js";
import type { PclActionAssessment } from "./pcl-action-policy.js";
import { PCL_COGNITIVE_KERNEL_VERSION, type PclCognitiveAssessment } from "./pcl-cognitive-kernel.js";

function cognition(): PclCognitiveAssessment {
  return {
    kernelVersion: PCL_COGNITIVE_KERNEL_VERSION,
    outcomeAlignment: "aligned",
    autonomy: "autonomous",
    humanGate: "none",
    risk: "low",
    reversibility: "easy",
    confidence: 0.9,
    completion: 0,
    evidenceCoverage: 0,
    missingCritical: [],
    conflicts: [],
    reasons: ["test"],
    responsePolicy: {
      questionBudget: 0,
      leadWithOutcome: true,
      discloseMaterialAssumption: false,
      requireApprovalBeforeAction: false,
      surfaceConflict: false,
      verifyBeforeClaimingDone: true,
      stopWhenOutcomeAchieved: false,
    },
    continuity: {
      stateAuthority: "authoritative",
      projectContextAvailable: false,
      decisionsKnown: 0,
      artifactsKnown: 0,
      verifiedArtifacts: 0,
      ledgerEntriesKnown: 0,
      activeRejectionsKnown: 0,
      activeCorrectionsKnown: 0,
    },
  };
}

function action(): PclActionAssessment {
  return {
    description: "Advise the learner",
    risk: "low",
    reversibility: "easy",
    sideEffect: "internal",
    reasonCode: "reversible_internal_work",
  };
}

test("education plans through common Agent Fabric advisor capabilities instead of a separate tutor orchestrator", () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Tell me what concepts I should strengthen before JEE mechanics practice.",
    studioDomain: "education",
    cognition: cognition(),
    action: action(),
  });

  assert.deepEqual(plan.tasks.map((item) => item.id), ["diagnose", "analysis", "verify"]);
  assert.equal(plan.tasks[0].role, "diagnostician");
  assert.deepEqual(plan.tasks[0].capabilities, ["advisor_intelligence", "learning_intelligence"]);
  assert.equal(plan.tasks[0].requiresEvidence, true);
  assert.deepEqual(plan.tasks[1].dependsOn, ["diagnose"]);
  assert.ok(plan.requiredCapabilities.includes("advisor_intelligence"));
  assert.ok(plan.requiredCapabilities.includes("learning_intelligence"));
  assert.ok(plan.requiredCapabilities.includes("verification"));
  assert.equal(plan.providerNeutral, true);
});
