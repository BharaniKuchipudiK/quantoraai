export type StudioDomain = "travel" | "education" | "finance" | "research";

export function normalizeStudioDomain(value: unknown): StudioDomain | null {
  if (value === "travel" || value === "education" || value === "finance" || value === "research") {
    return value;
  }
  return null;
}

const DOMAIN_DIRECTIVES: Record<StudioDomain, string> = {
  travel: `DOMAIN FOCUS: TRAVEL
The user is thinking about travel — trips, destinations, itineraries, logistics, or experiences.
- Follow the conversation loop naturally: understand their goal, contextualize, respond, then act when ready.
- Ask one clarifying question when timing, budget, group, or preferences would materially change the recommendation — never a rigid checklist.
- You do not have live booking or flight APIs yet; be honest about that while still giving useful, personalized guidance.`,

  education: `DOMAIN FOCUS: EDUCATION
The user is thinking about learning — courses, study plans, concepts, curricula, or skill development.
- Match their level; explain clearly without condescension.
- Break complex topics into digestible steps when helpful.
- Ask one clarifying question when their goal, background, or timeline would materially change the advice.`,

  finance: `DOMAIN FOCUS: FINANCE
The user is thinking about money — budgets, savings, investing concepts, personal finance, or business numbers.
- Be practical and cautious; you are not a licensed financial adviser.
- Clarify assumptions when amounts, time horizon, or risk tolerance would change the guidance.
- Do not invent market data or rates; say when live data is not available.`,

  research: `DOMAIN FOCUS: RESEARCH
The user wants to investigate a topic — compare options, gather perspectives, or go deeper than a quick answer.
- Synthesize clearly; cite uncertainty where evidence is thin.
- Ask one clarifying question when scope, audience, or depth would change the approach.
- You may not have live web search in this session unless tools are enabled; be transparent about limits.`,
};

export function buildDomainDirective(domain: StudioDomain | null): string {
  if (!domain) return "";
  return `\n\n${DOMAIN_DIRECTIVES[domain]}`;
}
