/**
 * Client-side proactive nudges — human "I thought of you" moments from the listening layer.
 */

function isHtmlBuildResponse(aiResponse = '') {
  return /```html|<!DOCTYPE html>|<html[\s>]/i.test(aiResponse);
}

export function detectProactiveNudge(userPrompt = '', aiResponse = '', userFirstName = '', options = {}) {
  const {
    studioDomain = null,
    studioMode = 'ask',
    hasPreview = false,
    guidedIntake = false,
  } = options;

  const name = userFirstName?.trim() || 'there';

  // Never show travel/link nudges during build intake or on generated HTML sites.
  if (guidedIntake || (studioMode === 'build' && !studioDomain) || isHtmlBuildResponse(aiResponse)) {
    if (hasPreview && studioMode === 'build') {
      return {
        type: 'site_ready',
        text: `Hey ${name} — your site is ready to preview. Tell me what to change and I'll update it in place.`,
      };
    }
    return null;
  }

  const wantsUrls = /\b(url|urls|link|links|website|web site|click|visit|book(?:ing)?)\b/i.test(userPrompt);
  const hasUrls = /https?:\/\//i.test(aiResponse);

  if (wantsUrls && hasUrls) {
    return null;
  }

  const wantsPlan = /\b(plan|itinerary|trip|travel|schedule)\b/i.test(userPrompt.toLowerCase());
  const hasPlanStructure = /\bday\s+\d|day \d|morning:|afternoon:|evening:/i.test(aiResponse);

  // Plan + links already live in the chat — a banner repeating "below" adds noise.
  if (wantsPlan && hasPlanStructure && hasUrls) {
    return null;
  }

  if (wantsPlan && hasPlanStructure) {
    return null;
  }

  return null;
}
