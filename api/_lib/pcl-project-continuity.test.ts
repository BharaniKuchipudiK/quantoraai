import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSnapshot, chooseNextConversationMove, formatConversationDecisionForPrompt } from "./conversation-engine.js";
import type { ProjectContextPack } from "./project-state.js";

function projectContext(): ProjectContextPack {
  return {
    projectId: "project-quantora",
    projectName: "Quantora",
    goal: "Make PCL the outcome continuity layer",
    understanding: "PCL owns mission continuity across chats",
    facts: ["Decision: Models are replaceable workers"],
    decisions: ["Models are replaceable workers"],
    constraints: ["Do not create a second memory system"],
    assumptions: [],
    openQuestions: [],
    nextActions: [{ action: "Wire trusted project context into chat", risk: "low" }],
    artifacts: [{ type: "architecture", ref: "arch:pcl-v2", title: "PCL Architecture", verifiedAt: "2026-08-19T00:00:00Z" }],
    cognitiveLedger: [{
      id: "reject-second-brain",
      type: "rejection",
      statement: "Do not create another synthetic intelligence memory layer",
      actor: "user",
      status: "active",
    }],
    sessionCount: 4,
    updatedAt: "2026-08-19T00:00:00Z",
  };
}

function personalProjectContext(): ProjectContextPack {
  return {
    ...projectContext(),
    projectId: "project-personal",
    projectName: "Personal Workspace",
    goal: "Finish QuantoraAI PR #737",
    understanding: "CI is running on the Skill assignment PR",
    facts: ["PR #737 is the active work item"],
    decisions: ["Keep working on PR #737"],
    nextActions: [{ action: "Merge PR #737", risk: "low" }],
  };
}

test("trusted Project Outcome Graph makes a new chat authoritative", () => {
  const snapshot = buildConversationSnapshot({
    projectContext: projectContext(),
    sessionContext: { goal: "Untrusted browser goal", facts: ["Browser-only fact"] },
    message: "Continue the architecture.",
  });

  assert.equal(snapshot.stateSource, "authoritative");
  assert.equal(snapshot.authorityScope, "project");
  assert.equal(snapshot.goal?.statement, "Make PCL the outcome continuity layer");
  assert.ok(snapshot.confirmedFacts.includes("Decision: Models are replaceable workers"));
  assert.doesNotMatch(JSON.stringify(snapshot.confirmedFacts), /Browser-only fact/);
  assert.equal(snapshot.cognitiveLedger[0].id, "reject-second-brain");
});

test("session Outcome State remains more specific than Project PCL", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-current",
      version: 8,
      state: {
        goal: { statement: "Finish the current PCL PR", status: "confirmed" },
        definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [],
        decisions: [{ value: "Keep this PR draft until validation" }], artifacts: [], nextActions: [],
        cognitiveLedger: [{ id: "session-decision", type: "decision", statement: "Keep this PR draft until validation", actor: "user", status: "active" }],
        memory: { scope: "project", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    projectContext: projectContext(),
    message: "Continue.",
  });

  assert.equal(snapshot.authorityScope, "session+project");
  assert.equal(snapshot.goal?.statement, "Finish the current PCL PR");
  assert.ok(snapshot.decisions.includes("Keep this PR draft until validation"));
  assert.ok(snapshot.decisions.includes("Models are replaceable workers"));
  assert.equal(snapshot.cognitiveLedger.length, 2);
});

test("Project PCL is visible to the governance kernel and provider prompt", () => {
  const snapshot = buildConversationSnapshot({
    projectContext: projectContext(),
    message: "Continue the architecture.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatConversationDecisionForPrompt(snapshot, decision);

  assert.match(directive, /scope project/);
  assert.match(directive, /PCL COGNITIVE LEDGER/);
  assert.match(directive, /Do not create another synthetic intelligence memory layer/);
});

test("Personal Workspace does not carry a previous chat mission into a fresh chat", () => {
  const personal = personalProjectContext();
  const snapshot = buildConversationSnapshot({
    projectContext: personal,
    sessionContext: {
      projectId: "project-personal",
      goal: personal.goal,
      understanding: personal.understanding,
      facts: [...personal.facts],
    },
    message: "Explain photosynthesis.",
  });

  assert.equal(snapshot.stateSource, "ephemeral");
  assert.equal(snapshot.authorityScope, "ephemeral");
  assert.equal(snapshot.projectContext, null);
  assert.equal(snapshot.goal, undefined);
  assert.equal(snapshot.confirmedFacts.length, 0);
  assert.equal(snapshot.inferredFacts.length, 0);
  assert.doesNotMatch(JSON.stringify(snapshot), /PR #737|Skill assignment/i);
});

test("Personal Workspace keeps current-chat context while stripping project echo", () => {
  const personal = personalProjectContext();
  const snapshot = buildConversationSnapshot({
    projectContext: personal,
    sessionContext: {
      projectId: "project-personal",
      goal: "Plan a Kyoto weekend",
      understanding: personal.understanding,
      facts: [...personal.facts, "User prefers quiet temples"],
    },
    message: "Make day two less rushed.",
  });

  assert.equal(snapshot.stateSource, "ephemeral");
  assert.equal(snapshot.authorityScope, "ephemeral");
  assert.equal(snapshot.goal?.statement, "Plan a Kyoto weekend");
  assert.ok(snapshot.inferredFacts.includes("User prefers quiet temples"));
  assert.doesNotMatch(JSON.stringify(snapshot.inferredFacts), /PR #737|Skill assignment/i);
});
