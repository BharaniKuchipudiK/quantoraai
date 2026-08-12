/**
 * Client-side proactive nudges — human "I thought of you" moments from the listening layer.
 */

export function detectProactiveNudge(userPrompt = '', aiResponse = '', userFirstName = '') {
  const name = userFirstName?.trim() || 'there';
  const wantsUrls = /\b(url|urls|link|links|website|web site|click|visit|book(?:ing)?)\b/i.test(userPrompt);
  const hasUrls = /https?:\/\//i.test(aiResponse);

  if (wantsUrls && hasUrls) {
    return {
      type: 'urls_included',
      text: `Hey ${name} — I've included direct links for each option so you can explore the beach, rooms, and facilities at your own pace.`,
    };
  }

  const wantsPlan = /\b(plan|itinerary|trip|travel|schedule)\b/i.test(userPrompt.toLowerCase());
  const hasPlanStructure = /\bday\s+\d|day \d|morning:|afternoon:|evening:/i.test(aiResponse);

  if (wantsPlan && hasPlanStructure && hasUrls) {
    return {
      type: 'plan_with_links',
      text: `Hey ${name} — your plan is below, and I've added booking links wherever they help you act faster.`,
    };
  }

  if (wantsPlan && hasPlanStructure) {
    return {
      type: 'plan_ready',
      text: `Hey ${name} — here's a plan you can refine. Tell me what to adjust and we'll tighten it together.`,
    };
  }

  return null;
}
