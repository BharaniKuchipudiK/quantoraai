import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRuntimeRegistry,
  buildPclAgentExecutionPlan,
  runPclAgentExecutionPlan,
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

test("consequential execution is prepared but pauses at the PCL approval boundary", async () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Send the customer email now.",
    cognition: cognition({ humanGate: "approve", autonomy: "gated", risk: "medium", reversibility: "hard" }),
    action: action({ sideEffect: "external", risk: "medium", reversibility: "hard", reasonCode: "irreversible_external_side_effect" }),
  });
  assert.equal(plan.governance, "requires_approval");
  assert.equal(plan.tasks[0].id, "execute");
  assert.equal(plan.tasks[0].requiresApproval, true);
  assert.equal(plan.tasks[0].requiresEvidence, true);

  let executions = 0;
  const registry = new AgentRuntimeRegistry();
  registry.register(adapter({
    id: "external-runtime",
    capabilities: ["tool_execution", "verification"],
    execute: async ({ task }) => {
      executions += 1;
      return task.role === "verifier"
        ? { status: "success", verification: { passed: true } }
        : { status: "success", evidenceRef: "provider:message-123" };
    },
  }));

  const paused = await runPclAgentExecutionPlan({ plan, registry });
  assert.equal(paused.status, "paused");
  assert.equal(paused.pendingTaskId, "execute");
  assert.equal(executions, 0);

  const completed = await runPclAgentExecutionPlan({
    plan,
    registry,
    authorizeTask: () => ({ allowed: true, reasonCode: "explicit_human_approval_present" }),
  });
  assert.equal(completed.status, "complete");
  assert.equal(executions, 2);
  assert.equal(completed.results.execute.evidenceRef, "provider:message-123");
});

test("runtime registry fails over between interchangeable providers", async () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Analyze these options and recommend the best path.",
    cognition: cognition({ responsePolicy: { ...cognition().responsePolicy, verifyBeforeClaimingDone: false } }),
    action: action(),
  });

  const calls: string[] = [];
  const registry = new AgentRuntimeRegistry();
  registry.register(adapter({
    id: "preferred-runtime",
    priority: 20,
    capabilities: ["analysis"],
    execute: async () => {
      calls.push("preferred-runtime");
      return { status: "failure", error: "provider unavailable" };
    },
  }));
  registry.register(adapter({
    id: "fallback-runtime",
    priority: 10,
    capabilities: ["analysis"],
    execute: async () => {
      calls.push("fallback-runtime");
      return { status: "success", output: { recommendation: "Option B" } };
    },
  }));

  const result = await runPclAgentExecutionPlan({ plan, registry });
  assert.equal(result.status, "complete");
  assert.deepEqual(calls, ["preferred-runtime", "fallback-runtime"]);
});

test("verifier can fail a run even when builders reported success", async () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Build a React application and verify it works.",
    cognition: cognition(),
    action: action(),
  });
  const registry = new AgentRuntimeRegistry();
  registry.register(adapter({
    id: "builder",
    capabilities: ["coding"],
    execute: async () => ({ status: "success", output: "patch", evidenceRef: "artifact:patch-1" }),
  }));
  registry.register(adapter({
    id: "verifier",
    capabilities: ["verification"],
    execute: async () => ({ status: "success", verification: { passed: false, issues: ["smoke test failed"] } }),
  }));

  const result = await runPclAgentExecutionPlan({ plan, registry });
  assert.equal(result.status, "failed");
  assert.equal(result.failedTaskId, "verify");
  assert.equal(result.reasonCode, "verification_failed");
});

test("completed outcomes are not delegated again", async () => {
  const plan = buildPclAgentExecutionPlan({
    message: "Do it again.",
    cognition: cognition({ outcomeAlignment: "complete", autonomy: "complete", completion: 1 }),
    action: action(),
  });
  assert.equal(plan.governance, "blocked");
  assert.equal(plan.tasks.length, 0);

  const result = await runPclAgentExecutionPlan({ plan, registry: new AgentRuntimeRegistry() });
  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "blocked");
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
