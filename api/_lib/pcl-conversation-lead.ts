import type { ConversationDecision, ConversationSnapshot } from "./conversation-engine.js";
import type { PclHumanGate, PclOutcomeAlignment } from "./pcl-cognitive-kernel.js";

export type PclConversationLead =
  | "answer_and_advance"
  | "resolve_blocker"
  | "seek_approval"
  | "close";

export type PclLeadingQuestionMode = "none" | "optional" | "required";

export type PclConversationLeadPolicy = {
  conversationLead: PclConversationLead;
  leadingQuestionMode: PclLeadingQuestionMode;
  questionBudget: 0 | 1;
};

/**
 * Provider-neutral dialogue leadership policy.
 *
 * The model owns wording. PCL owns whether the turn should keep moving, resolve
 * one blocker, request approval, or stop. Travel gets an OPTIONAL one-question
 * budget so it can behave like a good human adviser after delivering value,
 * without turning every turn into an intake questionnaire.
 */
export function derivePclConversationLead(input: {
  snapshot: ConversationSnapshot;
  decision: ConversationDecision;
  humanGate: PclHumanGate;
  alignment: PclOutcomeAlignment;
}): PclConversationLeadPolicy {
  const { snapshot, decision, humanGate, alignment } = input;

  if (alignment === "complete") {
    return { conversationLead: "close", leadingQuestionMode: "none", questionBudget: 0 };
  }

  if (humanGate === "approve") {
    return { conversationLead: "seek_approval", leadingQuestionMode: "required", questionBudget: 1 };
  }

  if (humanGate === "choose") {
    return { conversationLead: "resolve_blocker", leadingQuestionMode: "required", questionBudget: 1 };
  }

  const isAdvisorLead = snapshot.currentTurn.studioDomain === "travel"
    || snapshot.currentTurn.studioDomain === "education";
  const anticipatoryMove = decision.move === "anticipate";
  const optionalLead = isAdvisorLead || anticipatoryMove;

  return {
    conversationLead: "answer_and_advance",
    leadingQuestionMode: optionalLead ? "optional" : "none",
    questionBudget: optionalLead ? 1 : 0,
  };
}

export function formatPclConversationLeadContract(policy: PclConversationLeadPolicy): string {
  return `Conversation lead: ${policy.conversationLead}; leading question mode: ${policy.leadingQuestionMode}; question budget: ${policy.questionBudget}.`;
}
