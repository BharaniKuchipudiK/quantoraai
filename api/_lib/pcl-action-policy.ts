import type { ConversationDecision, ConversationSnapshot } from "./conversation-engine.js";
import type { PclActionContext, PclReversibility, PclRisk } from "./pcl-cognitive-kernel.js";

export type PclActionAssessment = PclActionContext & {
  risk: PclRisk;
  reversibility: PclReversibility;
  sideEffect: "none" | "internal" | "external" | "transactional" | "destructive";
  reasonCode: string;
};

const HARD_EXTERNAL = /\b(?:send|email|message|post|publish|submit|book|purchase|buy|pay|transfer|invite|revoke|cancel|terminate|merge|release|deploy\s+(?:to\s+)?production|ship\s+(?:to\s+)?production)\b/i;
const DESTRUCTIVE = /\b(?:delete|drop|destroy|erase|purge|wipe|remove\s+(?:the\s+)?(?:production|account|database|data)|reset\s+(?:the\s+)?(?:production|database))\b/i;
const TRANSACTIONAL = /\b(?:pay|purchase|buy|transfer|book|subscribe|order|charge|refund|withdraw)\b/i;
const REVERSIBLE_INTERNAL = /\b(?:draft|write|rewrite|summari[sz]e|analy[sz]e|compare|plan|recommend|prepare|generate|create|edit|revise|refactor|preview|simulate|mock|outline)\b/i;
const PREVIEW_DEPLOY = /\b(?:deploy|publish)\s+(?:a\s+)?(?:preview|staging|test|sandbox)\b/i;

function knownRisk(snapshot: ConversationSnapshot): PclRisk {
  if (snapshot.safetyFlags.length) return "high";
  if (snapshot.nextActions.some((item) => item.risk === "high")) return "high";
  if (snapshot.nextActions.some((item) => item.risk === "medium")) return "medium";
  return "low";
}

/**
 * Deterministic first-pass action governance.
 *
 * This intentionally classifies the consequence of the requested action rather
 * than the provider/model. Unknown work defaults to the risk already encoded in
 * Outcome State. Semantic judgment can be layered later only when deterministic
 * rules and state cannot resolve the consequence safely.
 */
export function inferPclActionContext(
  snapshot: ConversationSnapshot,
  decision: ConversationDecision,
): PclActionAssessment {
  const message = snapshot.currentTurn.message.trim();
  const stateRisk = knownRisk(snapshot);

  if (decision.move !== "act" && decision.move !== "challenge") {
    return {
      description: message,
      risk: stateRisk,
      reversibility: stateRisk === "high" ? "hard" : stateRisk === "medium" ? "partial" : "easy",
      sideEffect: "none",
      reasonCode: "no_action_move",
    };
  }

  if (DESTRUCTIVE.test(message)) {
    return {
      description: message,
      risk: "high",
      reversibility: "hard",
      sideEffect: "destructive",
      reasonCode: "destructive_side_effect",
    };
  }

  if (TRANSACTIONAL.test(message)) {
    return {
      description: message,
      risk: "high",
      reversibility: "hard",
      sideEffect: "transactional",
      reasonCode: "transactional_side_effect",
    };
  }

  if (HARD_EXTERNAL.test(message)) {
    return {
      description: message,
      risk: stateRisk === "high" ? "high" : "medium",
      reversibility: "hard",
      sideEffect: "external",
      reasonCode: "irreversible_external_side_effect",
    };
  }

  if (PREVIEW_DEPLOY.test(message)) {
    return {
      description: message,
      risk: stateRisk === "high" ? "high" : "medium",
      reversibility: "partial",
      sideEffect: "internal",
      reasonCode: "reversible_environment_change",
    };
  }

  if (REVERSIBLE_INTERNAL.test(message)) {
    return {
      description: message,
      risk: stateRisk,
      reversibility: stateRisk === "high" ? "hard" : stateRisk === "medium" ? "partial" : "easy",
      sideEffect: "internal",
      reasonCode: "reversible_internal_work",
    };
  }

  return {
    description: message,
    risk: stateRisk,
    reversibility: stateRisk === "high" ? "hard" : stateRisk === "medium" ? "partial" : "easy",
    sideEffect: "internal",
    reasonCode: "outcome_state_risk",
  };
}
