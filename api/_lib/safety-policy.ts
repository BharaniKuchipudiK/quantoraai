export const SAFETY_POLICY_VERSION = "2026-08-14.1";

export type SafetyAction = "allow" | "block" | "support";
export type SafetyCategory =
  | "sexual_exploitation_of_minors"
  | "self_harm_imminent"
  | "violent_wrongdoing"
  | "scam_or_financial_fraud"
  | "malware_or_credential_theft"
  | "severe_harassment_or_hate"
  | "none";

export interface CrisisResource {
  country: string;
  emergency: string;
  suicideCrisisHotline: string;
  specializedService: string;
  website: string;
}

export const COUNTRY_CRISIS_DIRECTORY: Record<string, CrisisResource> = {
  SG: {
    country: "Singapore",
    emergency: "995 (SCDF Emergency Medical) / 999 (Police)",
    suicideCrisisHotline: "1767 (Samaritans of Singapore - SOS 24-hr Hotline) | WhatsApp: 9151 1767",
    specializedService: "6389 2222 (Institute of Mental Health / IMH 24-Hour Mental Health Helpline)",
    website: "https://www.sos.org.sg | https://www.imh.com.sg",
  },
  US: {
    country: "United States",
    emergency: "911",
    suicideCrisisHotline: "988 (Suicide & Crisis Lifeline - Call or Text 24/7)",
    specializedService: "Text HOME to 741741 (Crisis Text Line)",
    website: "https://988lifeline.org",
  },
  CA: {
    country: "Canada",
    emergency: "911",
    suicideCrisisHotline: "988 (Suicide Crisis Helpline - Call or Text 24/7)",
    specializedService: "1-888-668-6810 (Kids Help Phone) | Text 686868",
    website: "https://988.ca",
  },
  MY: {
    country: "Malaysia",
    emergency: "999",
    suicideCrisisHotline: "15999 (Talian Kasih) | 03-7627 2929 (Befrienders KL)",
    specializedService: "03-2935 9935 (HEAL Line 15555 - Ministry of Health)",
    website: "https://www.befrienders.org.my",
  },
  IN: {
    country: "India",
    emergency: "112",
    suicideCrisisHotline: "14416 / 1800-891-4416 (Tele-MANAS 24/7) | 9152987821 (KIRAN)",
    specializedService: "022-25521111 (iCall Psychosocial Helpline)",
    website: "https://telemanas.mohfw.gov.in",
  },
  UK: {
    country: "United Kingdom",
    emergency: "999",
    suicideCrisisHotline: "111 (NHS Mental Health Services) | 116 123 (Samaritans UK)",
    specializedService: "Text SHOUT to 85258 (Crisis Text Line UK)",
    website: "https://www.samaritans.org",
  },
  AU: {
    country: "Australia",
    emergency: "000",
    suicideCrisisHotline: "13 11 14 (Lifeline 24/7) | Text 0477 13 11 14",
    specializedService: "1300 22 4636 (Beyond Blue Support Service)",
    website: "https://www.lifeline.org.au",
  },
  NZ: {
    country: "New Zealand",
    emergency: "111",
    suicideCrisisHotline: "1737 (Need to Talk? - Free call or text 24/7)",
    specializedService: "0800 543 354 (Lifeline Aotearoa)",
    website: "https://1737.org.nz",
  },
  HK: {
    country: "Hong Kong",
    emergency: "999",
    suicideCrisisHotline: "2382 0000 (Suicide Prevention Services) | 2896 0000 (The Samaritans HK)",
    specializedService: "2466 7350 (Hospital Authority Mental Health Direct 24-hr)",
    website: "https://www.sps.org.hk",
  },
};

export const GLOBAL_CRISIS_FALLBACK: CrisisResource = {
  country: "International",
  emergency: "Contact your local emergency services (e.g., 911, 999, 112)",
  suicideCrisisHotline: "https://findahelpline.com (Free, confidential 24/7 crisis support in your country)",
  specializedService: "https://www.befrienders.org (International emotional support network)",
  website: "https://findahelpline.com",
};

export function formatCrisisInterventionMessage(countryCode?: string | null): string {
  const code = countryCode ? countryCode.toUpperCase() : null;
  const resource = (code && COUNTRY_CRISIS_DIRECTORY[code]) || GLOBAL_CRISIS_FALLBACK;

  return [
    `I'm really sorry you're dealing with this painful moment, but you don't have to carry this alone. You deserve immediate human support and care.`,
    ``,
    `### 🆘 Immediate Professional & Crisis Support (${resource.country})`,
    `- **Emergency Services:** ${resource.emergency}`,
    `- **24/7 Crisis Hotline:** ${resource.suicideCrisisHotline}`,
    `- **Mental Health Support:** ${resource.specializedService}`,
    `- **Online Support Directory:** [Find Support Online](${resource.website})`,
    ``,
    `If you may be in immediate physical danger, please call emergency services or go to the nearest emergency department right away. Please reach out to someone you trust who can stay with you.`,
  ].join("\n");
}

export type SafetyDecision = {
  action: SafetyAction;
  category: SafetyCategory;
  severity: "none" | "high" | "critical";
  policyVersion: string;
  reasonCode: string;
  userMessage?: string;
  crisisResource?: CrisisResource;
};

const decision = (
  action: SafetyAction,
  category: SafetyCategory,
  severity: SafetyDecision["severity"],
  reasonCode: string,
  userMessage?: string,
  crisisResource?: CrisisResource,
): SafetyDecision => ({
  action,
  category,
  severity,
  reasonCode,
  userMessage,
  crisisResource,
  policyVersion: SAFETY_POLICY_VERSION,
});

const CSAM_TERMS = /\b(?:csam|child\s+porn(?:ography)?|child\s+sexual\s+abuse\s+material)\b/i;
const MINOR_TERMS = /\b(?:child|children|minor|underage|preteen|young\s+teen)\b/i;
const SEXUAL_TERMS = /\b(?:sexual|sex|nude|naked|porn(?:ography)?|explicit|erotic)\b/i;
const ACQUISITION_OR_CREATION = /\b(?:create|generate|make|draw|write|find|locate|download|upload|share|send|trade|sell|buy|link|website|source|sexuali[sz]e|undress|remove\s+(?:their\s+)?clothes)\b/i;
const LEGITIMATE_SAFETY_CONTEXT = /\b(?:prevent|prevention|report|reporting|policy|protect|protection|victim\s+support|survivor\s+support|warning\s+signs|online\s+safety|school\s+safety|law\s+enforcement|mental\s+health\s+awareness)\b/i;
const DIRECT_ACQUISITION = /\b(?:find|locate|download|upload|share|send|trade|sell|buy|link|website|source)\b/i;

// Self-harm / Suicidal Intent Regex
const SELF_HARM_TERMS = /\b(?:i\s+(?:want|plan|intend|am\s+going)\s+to|how\s+(?:can|do|would)\s+i|best\s+way\s+to|give\s+me\s+instructions?\s+to)\s+(?:kill\s+myself|end\s+my\s+life|die\s+by\s+suicide|commit\s+suicide|hang\s+myself|overdose\s+myself)\b/i;
const SUICIDAL_DISTRESS_TERMS = /\b(?:kill\s+myself|end\s+my\s+life|suicidal\s+thoughts?|feel\s+like\s+ending\s+it\s+all|want\s+to\s+die|no\s+reason\s+to\s+live|better\s+off\s+dead)\b/i;

// Homicidal / Mass Harm / Violent Terrorism Intent Regex
const HOMICIDAL_OR_VIOLENCE_TERMS = /\b(?:how\s+to|instructions?|steps?|teach\s+me|help\s+me|plan\s+to)\b[\s\S]{0,60}\b(?:make|build|assemble|hide|detonate|use)\b[\s\S]{0,30}\b(?:bomb|explosive|dirty\s+bomb|nerve\s+agent|bioweapon|poison)\b/i;
const MASS_ATTACK_OR_MURDER_TERMS = /\b(?:how\s+to|help\s+me|plan\s+to|want\s+to|guide\s+to)\s+(?:murder|kill|assassinate|slaughter|massacre|shoot\s+up|poison|harm)\b/i;

// Scams, Phishing, Financial Fraud Regex
const PHISHING_OR_FRAUD_TERMS = /\b(?:create|build|write|clone|code|generate|make|deploy)\b[\s\S]{0,50}\b(?:phishing|fake\s+(?:login|bank|portal|page|site|app|checkout)|credential\s+harvesting|stealer\s+page|spoof\s+page)\b/i;
const SCAM_OR_FRAUD_TERMS = /\b(?:how\s+to|help\s+me|write\s+a\s+script\s+to|create\s+a\s+bot\s+to)\b[\s\S]{0,50}\b(?:scam\s+people|drain\s+crypto\s+wallets?|steal\s+credit\s+cards?|run\s+a\s+ponzi|defraud\s+users?|fake\s+investment\s+scheme)\b/i;
const CREDENTIAL_THEFT = /\b(?:steal|harvest|exfiltrate|phish|capture)\b[\s\S]{0,40}\b(?:passwords?|credentials?|session\s+cookies?|api\s+keys?|tokens?)\b/i;

/**
 * High-confidence deterministic safety floor & crisis intervention gateway.
 *
 * Evaluates inputs for severe harms, illegal exploitation, scams, and mental
 * health crisis. Seamlessly injects localized support directories when crisis
 * signals are detected.
 */
export function evaluateSafetyText(value: unknown, countryCode?: string | null): SafetyDecision {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return decision("allow", "none", "none", "empty_or_non_text");

  // 1. Sexual Exploitation of Minors (CSAM)
  const hasExploitationTerms = CSAM_TERMS.test(text) || (MINOR_TERMS.test(text) && SEXUAL_TERMS.test(text));
  const legitimateContext = LEGITIMATE_SAFETY_CONTEXT.test(text) && !DIRECT_ACQUISITION.test(text);
  const requestsCsam = ACQUISITION_OR_CREATION.test(text) && hasExploitationTerms && !legitimateContext;
  if (requestsCsam) {
    return decision(
      "block",
      "sexual_exploitation_of_minors",
      "critical",
      "sexual_exploitation_request",
      "I can’t help create, find, transform, or distribute sexual content involving minors. I can help with prevention, reporting, victim support, or online-safety information.",
    );
  }

  // 2. Self-Harm & Suicidal Thoughts (Support + Geo Helplines)
  const selfHarmIntent = SELF_HARM_TERMS.test(text) || (SUICIDAL_DISTRESS_TERMS.test(text) && !legitimateContext);
  if (selfHarmIntent) {
    const code = countryCode ? countryCode.toUpperCase() : null;
    const resource = (code && COUNTRY_CRISIS_DIRECTORY[code]) || GLOBAL_CRISIS_FALLBACK;
    const supportMessage = formatCrisisInterventionMessage(countryCode);

    return decision(
      "support",
      "self_harm_imminent",
      "critical",
      "possible_immediate_self_harm",
      supportMessage,
      resource,
    );
  }

  // 3. Homicidal Intent, Mass Harm & Violent Instructions
  const violentInstructions = HOMICIDAL_OR_VIOLENCE_TERMS.test(text) || MASS_ATTACK_OR_MURDER_TERMS.test(text);
  if (violentInstructions) {
    return decision(
      "block",
      "violent_wrongdoing",
      "high",
      "violent_wrongdoing_instructions",
      "I can’t help plan or carry out violence or harm against others. I can help with safety, conflict de-escalation, emergency preparedness, or lawful educational analysis.",
    );
  }

  // 4. Scams, Phishing, & Financial Fraud
  const isScamOrFraud = (PHISHING_OR_FRAUD_TERMS.test(text) || SCAM_OR_FRAUD_TERMS.test(text)) && !legitimateContext;
  if (isScamOrFraud) {
    return decision(
      "block",
      "scam_or_financial_fraud",
      "high",
      "financial_fraud_or_phishing_request",
      "I can’t help create phishing pages, wallet drainers, scams, or tools designed to defraud people. I can help you build secure authentication, detect fraud, or learn about defensive security.",
    );
  }

  // 5. Credential Theft & Malware
  const isCredentialTheft = CREDENTIAL_THEFT.test(text) && !legitimateContext;
  if (isCredentialTheft) {
    return decision(
      "block",
      "malware_or_credential_theft",
      "high",
      "credential_theft_request",
      "I can’t help steal credentials, tokens, or gain unauthorized access. I can help secure an account, detect phishing, audit authorized code, or respond to an incident.",
    );
  }

  return decision("allow", "none", "none", "no_high_confidence_violation");
}
