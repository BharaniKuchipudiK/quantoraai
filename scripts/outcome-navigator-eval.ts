import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildConversationSnapshot,
  chooseNextConversationMove,
  type ConversationMove,
} from "../api/_lib/conversation-engine.js";
import type { OutcomeStateRecord } from "../api/_lib/outcome-state.js";

type Scenario = {
  id: string;
  message: string;
  expectedMove: ConversationMove;
  studioMode?: string;
  guidedBuild?: boolean;
  openQuestion?: string;
  outcomeGap?: string;
  nextAction?: string;
  nextActionRisk?: "low" | "medium" | "high";
  goalStatus?: "draft" | "confirmed" | "achieved";
  safetyFlag?: string;
};

const fixtureUrl = new URL("./fixtures/outcome-navigator-scenarios.json", import.meta.url);
const scenarios = JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8")) as Scenario[];

function recordFor(scenario: Scenario): OutcomeStateRecord | null {
  if (!scenario.openQuestion && !scenario.nextAction && !scenario.goalStatus && !scenario.safetyFlag) return null;
  return {
    sessionId: `eval-${scenario.id}`,
    version: 1,
    state: {
      ...(scenario.goalStatus ? {
        goal: { statement: "Complete the evaluated outcome", status: scenario.goalStatus },
      } : {}),
      definitionOfDone: [],
      constraints: [],
      assumptions: [],
      openQuestions: scenario.openQuestion
        ? [{ question: scenario.openQuestion, material: true }]
        : [],
      decisions: [],
      artifacts: [],
      nextActions: scenario.nextAction
        ? [{ action: scenario.nextAction, risk: scenario.nextActionRisk || "low" }]
        : [],
      memory: { scope: "session", consented: true },
      safety: { unresolvedFlags: scenario.safetyFlag ? [scenario.safetyFlag] : [] },
    },
  };
}

let passed = 0;
for (const scenario of scenarios) {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: recordFor(scenario),
    message: scenario.message,
    studioMode: scenario.studioMode,
    guidedBuild: scenario.guidedBuild,
    listeningSignals: scenario.outcomeGap
      ? [{ type: "outcome_gap_detected", label: scenario.outcomeGap }]
      : [],
  });
  const decision = chooseNextConversationMove(snapshot);
  assert.equal(decision.move, scenario.expectedMove, `${scenario.id}: expected ${scenario.expectedMove}, received ${decision.move}`);
  passed += 1;
}

console.log(`Outcome Navigator policy evaluation: ${passed}/${scenarios.length} scenarios passed`);
