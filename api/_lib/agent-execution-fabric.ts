import type { PclActionAssessment } from "./pcl-action-policy.js";
import type { PclCognitiveAssessment, PclReversibility, PclRisk } from "./pcl-cognitive-kernel.js";

export const PCL_AGENT_FABRIC_VERSION = "pcl-agent-fabric-2026-08-20.1";

export type AgentCapability =
  | "research"
  | "analysis"
  | "artifact_generation"
  | "coding"
  | "travel_intelligence"
  | "tool_execution"
  | "verification";

export type AgentRole = "researcher" | "analyst" | "builder" | "executor" | "verifier";
export type AgentRuntimeKind = "quantora-native" | "openai-agents" | "claude-agent" | "google-adk-a2a" | "custom";
export type AgentPlanStrategy = "single" | "pipeline";
export type AgentPlanGovernance = "ready" | "supervised" | "requires_approval" | "requires_choice" | "blocked";

export type AgentExecutionTask = {
  id: string;
  role: AgentRole;
  objective: string;
  capabilities: AgentCapability[];
  dependsOn: string[];
  risk: PclRisk;
  reversibility: PclReversibility;
  sideEffect: PclActionAssessment["sideEffect"];
  requiresApproval: boolean;
  requiresEvidence: boolean;
};

export type PclAgentExecutionPlan = {
  version: string;
  providerNeutral: true;
  strategy: AgentPlanStrategy;
  governance: AgentPlanGovernance;
  tasks: AgentExecutionTask[];
  finalTaskId: string | null;
  requiredCapabilities: AgentCapability[];
  requiresHumanApproval: boolean;
  reasonCodes: string[];
};

export type AgentRuntimeExecutionResult = {
  status: "success" | "failure";
  output?: unknown;
  error?: string | null;
  evidenceRef?: string | null;
  verification?: {
    passed: boolean;
    issues?: string[];
  } | null;
  provider?: string | null;
  model?: string | null;
};

export type AgentRuntimeContext = {
  plan: PclAgentExecutionPlan;
  task: AgentExecutionTask;
  sessionId?: string | null;
  userSub?: string | null;
  input?: unknown;
  priorResults: Record<string, AgentRuntimeExecutionResult>;
};

export type AgentRuntimeAdapter = {
  id: string;
  kind: AgentRuntimeKind;
  priority?: number;
  capabilities: AgentCapability[];
  isAvailable?: () => boolean | Promise<boolean>;
  execute: (context: AgentRuntimeContext) => Promise<AgentRuntimeExecutionResult>;
};

export type AgentTaskAuthorization = {
  allowed: boolean;
  reasonCode?: string;
};

export type AgentFabricRunResult = {
  status: "complete" | "paused" | "failed" | "blocked";
  plan: PclAgentExecutionPlan;
  results: Record<string, AgentRuntimeExecutionResult>;
  pendingTaskId?: string | null;
  failedTaskId?: string | null;
  reasonCode?: string | null;
};

const RESEARCH_TERMS = /\b(research|investigate|benchmark|market scan|find sources|evidence|latest|current|compare vendors|competitor|industry)\b/i;
const ANALYSIS_TERMS = /\b(analy[sz]e|compare|evaluate|assess|recommend|strategy|business case|trade-?off|decision|root cause|diagnos|synthesi[sz]e)\b/i;
const ARTIFACT_TERMS = /\b(presentation|powerpoint|pptx|document|word|docx|spreadsheet|excel|xlsx|pdf|report|memo|proposal|deck)\b/i;
const CODING_TERMS = /\b(code|coding|repository|repo|implement|refactor|debug|fix|build|develop|typescript|javascript|react|api|database|sql|deploy)\b/i;
const TRAVEL_TERMS = /\b(travel|trip|flight|hotel|property|attraction|itinerary|route|restaurant|destination)\b/i;
const EXECUTION_TERMS = /\b(send|submit|publish|merge|deploy|book|buy|purchase|pay|transfer|delete|remove|cancel|create account|invite|revoke)\b/i;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function governanceFor(cognition: PclCognitiveAssessment): AgentPlanGovernance {
  if (cognition.outcomeAlignment === "complete") return "blocked";
  if (cognition.humanGate === "choose") return "requires_choice";
  if (cognition.humanGate === "approve") return "requires_approval";
  if (cognition.humanGate === "inform") return "supervised";
  return "ready";
}

function task(
  id: string,
  role: AgentRole,
  objective: string,
  capabilities: AgentCapability[],
  dependsOn: string[],
  input: {
    risk: PclRisk;
    reversibility: PclReversibility;
    sideEffect?: PclActionAssessment["sideEffect"];
    requiresApproval?: boolean;
    requiresEvidence?: boolean;
  },
): AgentExecutionTask {
  return {
    id,
    role,
    objective: objective.trim().slice(0, 900),
    capabilities: unique(capabilities),
    dependsOn: unique(dependsOn),
    risk: input.risk,
    reversibility: input.reversibility,
    sideEffect: input.sideEffect || "none",
    requiresApproval: input.requiresApproval === true,
    requiresEvidence: input.requiresEvidence === true,
  };
}

/**
 * Deterministic first-pass decomposition for PCL. It decides which specialist
 * capabilities are needed; it does NOT pick a vendor/model. External SDKs plug
 * into the runtime registry below and remain replaceable.
 */
export function buildPclAgentExecutionPlan(input: {
  message: string;
  studioDomain?: string | null;
  cognition: PclCognitiveAssessment;
  action: PclActionAssessment;
}): PclAgentExecutionPlan {
  const message = String(input.message || "").trim();
  const domain = String(input.studioDomain || "").trim().toLowerCase();
  const combined = `${message} ${domain}`.trim();
  const governance = governanceFor(input.cognition);
  const reasonCodes = [input.action.reasonCode, ...input.cognition.reasons].filter(Boolean);

  if (governance === "blocked" || governance === "requires_choice") {
    return {
      version: PCL_AGENT_FABRIC_VERSION,
      providerNeutral: true,
      strategy: "single",
      governance,
      tasks: [],
      finalTaskId: null,
      requiredCapabilities: [],
      requiresHumanApproval: governance === "requires_approval",
      reasonCodes: unique(reasonCodes),
    };
  }

  const needsResearch = RESEARCH_TERMS.test(combined);
  const needsAnalysis = ANALYSIS_TERMS.test(combined) || needsResearch;
  const needsArtifact = ARTIFACT_TERMS.test(combined);
  const needsCoding = CODING_TERMS.test(combined);
  const needsTravel = domain === "travel" || TRAVEL_TERMS.test(combined);
  const needsExecution = input.action.sideEffect !== "none" && (EXECUTION_TERMS.test(message) || input.action.sideEffect !== "internal");
  const tasks: AgentExecutionTask[] = [];
  let previous: string | null = null;

  if (needsResearch) {
    tasks.push(task(
      "research",
      "researcher",
      `Gather the minimum authoritative evidence needed to support the requested outcome: ${message}`,
      ["research"],
      [],
      { risk: "low", reversibility: "easy" },
    ));
    previous = "research";
  }

  if (needsTravel) {
    tasks.push(task(
      "travel",
      "researcher",
      `Use provider-backed travel intelligence for the requested outcome without inventing live availability, prices, ratings or route facts: ${message}`,
      ["travel_intelligence"],
      previous ? [previous] : [],
      { risk: "low", reversibility: "easy" },
    ));
    previous = "travel";
  }

  if (needsAnalysis) {
    tasks.push(task(
      "analysis",
      "analyst",
      `Synthesize the available context and evidence into a clear recommendation, decision frame or solution for: ${message}`,
      ["analysis"],
      previous ? [previous] : [],
      { risk: input.action.risk, reversibility: "easy" },
    ));
    previous = "analysis";
  }

  if (needsCoding) {
    tasks.push(task(
      "build",
      "builder",
      `Implement or prepare the requested technical change while preserving existing behavior and producing verifiable output: ${message}`,
      ["coding"],
      previous ? [previous] : [],
      { risk: input.action.risk, reversibility: input.action.reversibility, sideEffect: "internal", requiresEvidence: true },
    ));
    previous = "build";
  } else if (needsArtifact) {
    tasks.push(task(
      "build",
      "builder",
      `Create the requested professional artifact from the approved context and analysis: ${message}`,
      ["artifact_generation"],
      previous ? [previous] : [],
      { risk: input.action.risk, reversibility: "easy", sideEffect: "internal", requiresEvidence: true },
    ));
    previous = "build";
  }

  if (needsExecution) {
    tasks.push(task(
      "execute",
      "executor",
      `Perform only the explicitly requested consequential action after PCL authorization: ${message}`,
      ["tool_execution"],
      previous ? [previous] : [],
      {
        risk: input.action.risk,
        reversibility: input.action.reversibility,
        sideEffect: input.action.sideEffect,
        requiresApproval: input.cognition.humanGate === "approve" || input.action.reversibility === "hard",
        requiresEvidence: true,
      },
    ));
    previous = "execute";
  }

  if (!tasks.length) {
    tasks.push(task(
      "work",
      "analyst",
      `Complete the requested reversible knowledge work: ${message}`,
      ["analysis"],
      [],
      { risk: input.action.risk, reversibility: input.action.reversibility, sideEffect: input.action.sideEffect },
    ));
    previous = "work";
  }

  const shouldVerify = input.cognition.responsePolicy.verifyBeforeClaimingDone
    || tasks.length > 1
    || tasks.some((item) => item.requiresEvidence || item.sideEffect !== "none");
  if (shouldVerify) {
    tasks.push(task(
      "verify",
      "verifier",
      "Independently verify that the produced result satisfies the requested outcome, preserves evidence boundaries, and does not claim completion without proof.",
      ["verification"],
      previous ? [previous] : [],
      { risk: "low", reversibility: "easy" },
    ));
    previous = "verify";
  }

  const requiredCapabilities = unique(tasks.flatMap((item) => item.capabilities));
  return {
    version: PCL_AGENT_FABRIC_VERSION,
    providerNeutral: true,
    strategy: tasks.length === 1 ? "single" : "pipeline",
    governance,
    tasks,
    finalTaskId: previous,
    requiredCapabilities,
    requiresHumanApproval: tasks.some((item) => item.requiresApproval),
    reasonCodes: unique(reasonCodes),
  };
}

export function validatePclAgentExecutionPlan(plan: PclAgentExecutionPlan): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const ids = new Set(plan.tasks.map((item) => item.id));
  if (ids.size !== plan.tasks.length) issues.push("Agent plan contains duplicate task ids.");

  for (const item of plan.tasks) {
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency)) issues.push(`Task ${item.id} depends on missing task ${dependency}.`);
      if (dependency === item.id) issues.push(`Task ${item.id} cannot depend on itself.`);
    }
    if (["external", "transactional", "destructive"].includes(item.sideEffect) && !item.requiresApproval) {
      issues.push(`Consequential task ${item.id} must require explicit PCL approval.`);
    }
    if (["external", "transactional", "destructive"].includes(item.sideEffect) && !item.requiresEvidence) {
      issues.push(`Consequential task ${item.id} must require provider evidence.`);
    }
  }

  if (plan.finalTaskId && !ids.has(plan.finalTaskId)) issues.push("Agent plan finalTaskId does not exist.");
  if (plan.tasks.length && plan.tasks.some((item) => item.sideEffect !== "none") && !plan.tasks.some((item) => item.role === "verifier")) {
    issues.push("Plans with side effects require an independent verifier task.");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export class AgentRuntimeRegistry {
  private adapters: AgentRuntimeAdapter[] = [];

  register(adapter: AgentRuntimeAdapter): void {
    this.adapters = [...this.adapters.filter((item) => item.id !== adapter.id), adapter];
  }

  list(): AgentRuntimeAdapter[] {
    return [...this.adapters];
  }

  async compatible(taskInput: AgentExecutionTask): Promise<AgentRuntimeAdapter[]> {
    const matches: AgentRuntimeAdapter[] = [];
    for (const adapter of this.adapters) {
      const covers = taskInput.capabilities.every((capability) => adapter.capabilities.includes(capability));
      if (!covers) continue;
      const available = adapter.isAvailable ? await adapter.isAvailable() : true;
      if (available) matches.push(adapter);
    }
    return matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
}

/**
 * Executes a validated plan using injected runtimes. The fabric owns fallback,
 * dependency ordering and proof requirements; PCL remains the authority for
 * consequential actions through authorizeTask.
 */
export async function runPclAgentExecutionPlan(input: {
  plan: PclAgentExecutionPlan;
  registry: AgentRuntimeRegistry;
  sessionId?: string | null;
  userSub?: string | null;
  initialInput?: unknown;
  authorizeTask?: (task: AgentExecutionTask) => Promise<AgentTaskAuthorization> | AgentTaskAuthorization;
}): Promise<AgentFabricRunResult> {
  const validation = validatePclAgentExecutionPlan(input.plan);
  if (!validation.valid) {
    return {
      status: "blocked",
      plan: input.plan,
      results: {},
      reasonCode: `invalid_plan:${validation.issues.join("|")}`,
    };
  }
  if (input.plan.governance === "blocked" || input.plan.governance === "requires_choice") {
    return {
      status: "blocked",
      plan: input.plan,
      results: {},
      reasonCode: input.plan.governance,
    };
  }

  const results: Record<string, AgentRuntimeExecutionResult> = {};
  for (const currentTask of input.plan.tasks) {
    const unmet = currentTask.dependsOn.filter((id) => results[id]?.status !== "success");
    if (unmet.length) {
      return {
        status: "failed",
        plan: input.plan,
        results,
        failedTaskId: currentTask.id,
        reasonCode: `dependency_failed:${unmet.join(",")}`,
      };
    }

    if (currentTask.requiresApproval) {
      const authorization = input.authorizeTask
        ? await input.authorizeTask(currentTask)
        : { allowed: false, reasonCode: "explicit_pcl_approval_required" };
      if (!authorization.allowed) {
        return {
          status: "paused",
          plan: input.plan,
          results,
          pendingTaskId: currentTask.id,
          reasonCode: authorization.reasonCode || "explicit_pcl_approval_required",
        };
      }
    }

    const adapters = await input.registry.compatible(currentTask);
    if (!adapters.length) {
      return {
        status: "failed",
        plan: input.plan,
        results,
        failedTaskId: currentTask.id,
        reasonCode: `no_runtime_for:${currentTask.capabilities.join(",")}`,
      };
    }

    let successful: AgentRuntimeExecutionResult | null = null;
    let lastError = "runtime_failed";
    for (const adapter of adapters) {
      try {
        const result = await adapter.execute({
          plan: input.plan,
          task: currentTask,
          sessionId: input.sessionId || null,
          userSub: input.userSub || null,
          input: input.initialInput,
          priorResults: { ...results },
        });
        if (result?.status === "success") {
          successful = result;
          break;
        }
        lastError = result?.error || `${adapter.id}:failure`;
      } catch (error: any) {
        lastError = `${adapter.id}:${String(error?.message || error)}`;
      }
    }

    if (!successful) {
      return {
        status: "failed",
        plan: input.plan,
        results,
        failedTaskId: currentTask.id,
        reasonCode: lastError,
      };
    }
    if (currentTask.requiresEvidence && !successful.evidenceRef) {
      return {
        status: "failed",
        plan: input.plan,
        results: { ...results, [currentTask.id]: successful },
        failedTaskId: currentTask.id,
        reasonCode: "required_execution_evidence_missing",
      };
    }
    if (currentTask.role === "verifier" && successful.verification?.passed !== true) {
      return {
        status: "failed",
        plan: input.plan,
        results: { ...results, [currentTask.id]: successful },
        failedTaskId: currentTask.id,
        reasonCode: "verification_failed",
      };
    }
    results[currentTask.id] = successful;
  }

  return { status: "complete", plan: input.plan, results, reasonCode: "verified_complete" };
}

export function publicAgentPlanSummary(plan: PclAgentExecutionPlan) {
  return {
    version: plan.version,
    providerNeutral: true,
    strategy: plan.strategy,
    governance: plan.governance,
    taskCount: plan.tasks.length,
    roles: unique(plan.tasks.map((item) => item.role)),
    requiredCapabilities: plan.requiredCapabilities,
    requiresHumanApproval: plan.requiresHumanApproval,
  };
}
