import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRuntimeRegistry,
  buildPclAgentExecutionPlan,
  validatePclAgentExecutionPlan,
  type AgentRuntimeAdapter,
} from "./agent-execution-fabric.js";
import type { PclActionAssessment } from "./pcl-action-policy.js";
import { PCL_COGNITIVE_KERNEL_VERSION, type PclCognitiveAssessment } from "./pcl-cognitive-kernel.js";

function cognition(overrides: Partial<PclCognitiveAssessment> = {}): PclCognitiveAssessment {
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
      stopWhenOutcomeAchieved: true,
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
    ...overrides,
  };
}

function action(overrides: Partial<PclActionAssessment> = {}): PclActionAssessment {
  return {
    description: "Complete the work",
    risk: "low",
    reversibility: "easy",
    sideEffect: "internal",
    reasonCode: "reversible_internal_work",
    ...overrides,
  };
}

function adapter(input: Partial<AgentRuntimeAdapter> & Pick<AgentRuntimeAdapter, "id" | "capabilities" | "execute">): AgentRuntimeAdapter {
  return {
    kind: "custom",
    priority: 0,
    ...input,
  };
}

test("complex research artifact becomes a provider-neutral specialist pipeline", () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Research the current market, analyze the options, and prepare a professional strategy presentation with a recommendation.",
    cognition: cognition(),
    action: action(),
  });

  assert.equal(plan.providerNeutral, true);
  assert.equal(plan.strategy, "pipeline");
  assert.deepEqual(plan.tasks.map((item) => item.id), ["research", "analysis", "build", "verify"]);
  assert.deepEqual(plan.tasks[1].dependsOn, ["research"]);
  assert.deepEqual(plan.tasks[2].dependsOn, ["analysis"]);
  assert.deepEqual(plan.tasks[3].dependsOn, ["build"]);
  assert.ok(plan.requiredCapabilities.includes("research"));
  assert.ok(plan.requiredCapabilities.includes("artifact_generation"));
  assert.ok(plan.requiredCapabilities.includes("verification"));
  assert.equal(validatePclAgentExecutionPlan(plan).valid, true);
});

test("malformed external plans cannot bypass the approval contract", () => {
  const invalid = {
    version: "test",
    providerNeutral: true as const,
    strategy: "single" as const,
    governance: "ready" as const,
    tasks: [{
      id: "execute",
      role: "executor" as const,
      objective: "Publish externally",
      capabilities: ["tool_execution" as const],
      dependsOn: [],
      risk: "high" as const,
      reversibility: "hard" as const,
      sideEffect: "external" as const,
      requiresApproval: false,
      requiresEvidence: false,
    }],
    finalTaskId: "execute",
    requiredCapabilities: ["tool_execution" as const],
    requiresHumanApproval: false,
    reasonCodes: [],
  };

  const validation = validatePclAgentExecutionPlan(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /explicit PCL approval/i);
  assert.match(validation.issues.join(" "), /provider evidence/i);
});
