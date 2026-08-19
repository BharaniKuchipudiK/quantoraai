import type { OutcomeState } from "./outcome-state.js";

export type GoldenOutcomeBlueprint = {
  id: string;
  title: string;
  mission: string;
  understanding: string;
  definitionOfDone: string[];
  expectedDeliverables: Array<{ type: string; description: string }>;
  decisionPoints: string[];
  workflow: Array<{
    stage: "understand" | "research" | "decide" | "create" | "verify" | "deliver";
    objective: string;
  }>;
};

/**
 * First investor/demo Golden Workflow: one complex enterprise mission that
 * crosses reasoning, decisions, artifact creation and verification.
 *
 * It is opt-in reference data, never an automatic prompt classifier.
 */
export const CLOUD_MIGRATION_EXECUTIVE_STRATEGY_BLUEPRINT: GoldenOutcomeBlueprint = {
  id: "golden-cloud-migration-executive-strategy-v1",
  title: "Executive Cloud Migration Strategy",
  mission: "Prepare a decision-ready cloud migration strategy and executive business case.",
  understanding: "Create a coherent executive recommendation that connects current-state challenges, target-state architecture, migration approach, roadmap, risk, economics and measurable business outcomes.",
  definitionOfDone: [
    "Current-state challenges and migration drivers are clearly established.",
    "A recommended migration approach is stated with rationale and rejected alternatives are preserved.",
    "Target-state architecture and operating implications are explained at executive level.",
    "A phased roadmap with milestones, dependencies and ownership is included.",
    "Business case, major cost/value assumptions and material risks are explicit.",
    "An executive presentation is created and passes presentation verification.",
    "Key figures, recommendations and roadmap statements are internally consistent across artifacts.",
    "Material assumptions or unresolved executive decisions are surfaced before the outcome is called Done.",
  ],
  expectedDeliverables: [
    { type: "presentation", description: "Executive cloud migration strategy deck" },
    { type: "analysis", description: "Business case and decision assumptions" },
    { type: "architecture", description: "Target-state architecture view" },
    { type: "roadmap", description: "Phased migration roadmap" },
  ],
  decisionPoints: [
    "Preferred migration pattern and target cloud/platform posture",
    "Programme horizon and sequencing constraints",
    "Investment envelope and value assumptions",
    "Risk appetite for application modernization versus rehost/refactor",
  ],
  workflow: [
    { stage: "understand", objective: "Establish the executive decision, audience, constraints and Definition of Done." },
    { stage: "research", objective: "Gather the facts and evidence required to support the recommendation." },
    { stage: "decide", objective: "Resolve or explicitly escalate the few decisions that materially change the strategy." },
    { stage: "create", objective: "Create the analysis, architecture, roadmap and executive presentation against one shared Outcome Contract." },
    { stage: "verify", objective: "Check consistency, artifact quality and completion evidence against every success criterion." },
    { stage: "deliver", objective: "Deliver the verified artifacts and close only when Proof of Done passes." },
  ],
};

/**
 * Instantiate a blueprint as ordinary Outcome State. The blueprint does not get
 * a private workflow engine or memory store; it starts the same canonical PCL
 * mission state used by every other Quantora project.
 */
export function instantiateGoldenOutcomeBlueprint(
  blueprint: GoldenOutcomeBlueprint,
  memory: OutcomeState["memory"] = { scope: "project", consented: true },
): OutcomeState {
  return {
    goal: { statement: blueprint.mission, status: "draft", sourceTurn: null },
    understanding: { statement: blueprint.understanding, status: "inferred", sourceTurn: null },
    definitionOfDone: blueprint.definitionOfDone.map((criterion) => ({ criterion, confirmed: false, sourceTurn: null })),
    constraints: [],
    assumptions: [],
    openQuestions: blueprint.decisionPoints.map((question) => ({ question, material: true, sourceTurn: null })),
    decisions: [],
    artifacts: [],
    nextActions: blueprint.workflow.map((step, index) => ({
      action: step.objective,
      risk: index === 2 ? "medium" : "low",
    })),
    cognitiveLedger: [],
    memory,
    safety: { unresolvedFlags: [] },
  };
}
