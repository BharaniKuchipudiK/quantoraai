export const SAFETY_POLICY_VERSION = "2026-08-13.1";

export type SafetyAction = "allow" | "block" | "support";
export type SafetyCategory =
  | "sexual_exploitation_of_minors"
  | "self_harm_imminent"
  | "violent_wrongdoing"
  | "malware_or_credential_theft"
  | "none";

export type SafetyDecision = {
  action: SafetyAction;
  category: SafetyCategory;
  severity: "none" | "high" | "critical";
  policyVersion: string;
  reasonCode: string;
  userMessage?: string;
};

const decision = (
  action: SafetyAction,
  category: SafetyCategory,
  severity: SafetyDecision["severity"],
  reasonCode: string,
  userMessage?: string,
): SafetyDecision => ({ action, category, severity, reasonCode, userMessage, policyVersion: SAFETY_POLICY_VERSION });

const CSAM_TERMS = /\b(?:csam|child\s+porn(?:ography)?|child\s+sexual\s+abuse\s+material)\b/i;
const MINOR_TERMS = /\b(?:child|children|minor|underage|preteen|young\s+teen)\b/i;
const SEXUAL_TERMS = /\b(?:sexual|sex|nude|naked|porn(?:ography)?|explicit|erotic)\b/i;
const ACQUISITION_OR_CREATION = /\b(?:create|generate|make|draw|write|find|locate|download|upload|share|send|trade|sell|buy|link|website|source|sexuali[sz]e|undress|remove\s+(?:their\s+)?clothes)\b/i;
const LEGITIMATE_SAFETY_CONTEXT = /\b(?:prevent|prevention|report|reporting|policy|protect|protection|victim\s+support|survivor\s+support|warning\s+signs|online\s+safety|school\s+safety|law\s+enforcement)\b/i;
const DIRECT_ACQUISITION = /\b(?:find|locate|download|upload|share|send|trade|sell|buy|link|website|source)\b/i;

/**
 * High-confidence deterministic safety floor.
 *
 * It intentionally does not classify every sensitive word. Legitimate
 * prevention, reporting, recovery, educational, and support conversations
 * must remain available. A provider-backed contextual classifier will extend
 * this floor; it must not weaken these severe-content rules.
 */
export function evaluateSafetyText(value: unknown): SafetyDecision {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return decision("allow", "none", "none", "empty_or_non_text");

  const hasExploitationTerms = CSAM_TERMS.test(text) || (MINOR_TERMS.test(text) && SEXUAL_TERMS.test(text));
  const legitimateContext = LEGITIMATE_SAFETY_CONTEXT.test(text) && !DIRECT_ACQUISITION.test(text);
  const requestsCsam = ACQUISITION_OR_CREATION.test(text) && hasExploitationTerms && !legitimateContext;
  if (requestsCsam) {
    return decision(
      "block", "sexual_exploitation_of_minors", "critical", "sexual_exploitation_request",
      "I can’t help create, find, transform, or distribute sexual content involving minors. I can help with prevention, reporting, victim support, or online-safety information.",
    );
  }

  const selfHarmIntent = /\b(?:i\s+(?:want|plan|intend|am\s+going)\s+to|how\s+(?:can|do|would)\s+i|best\s+way\s+to)\s+(?:kill\s+myself|end\s+my\s+life|die\s+by\s+suicide|commit\s+suicide)\b/i.test(text)
    || /\b(?:kill\s+myself|end\s+my\s+life)\b/i.test(text);
  if (selfHarmIntent) {
    return decision(
      "support", "self_harm_imminent", "critical", "possible_immediate_self_harm",
      "I’m sorry you’re dealing with this. You deserve immediate human support. If you may act now, contact local emergency services or go to the nearest emergency department, and tell someone you trust who can stay with you. I can also stay with you while we focus on the next safe step.",
    );
  }

  const violentInstructions = /\b(?:how\s+to|instructions?|steps?|teach\s+me|help\s+me)\b[\s\S]{0,60}\b(?:make|build|assemble|hide|use)\b[\s\S]{0,30}\b(?:bomb|explosive|poison)\b/i.test(text)
    || /\b(?:how\s+to|help\s+me|plan\s+to)\b[\s\S]{0,50}\b(?:murder|kill|assassinate)\b[\s\S]{0,30}\b(?:someone|person|people|target)\b/i.test(text);
  if (violentInstructions) {
    return decision(
      "block", "violent_wrongdoing", "high", "violent_wrongdoing_instructions",
      "I can’t help plan or carry out violence. I can help with safety, prevention, de-escalation, emergency preparedness, or a non-actionable explanation.",
    );
  }

  const credentialTheft = /\b(?:steal|harvest|exfiltrate|phish|capture)\b[\s\S]{0,40}\b(?:passwords?|credentials?|session\s+cookies?|api\s+keys?|tokens?)\b/i.test(text);
  if (credentialTheft) {
    return decision(
      "block", "malware_or_credential_theft", "high", "credential_theft_request",
      "I can’t help steal credentials or gain unauthorized access. I can help secure an account, detect phishing, test an authorized system safely, or respond to an incident.",
    );
  }

  return decision("allow", "none", "none", "no_high_confidence_violation");
}
