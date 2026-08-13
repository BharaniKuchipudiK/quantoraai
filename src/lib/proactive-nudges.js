/**
 * Client-side proactive nudges — human "I thought of you" moments from the listening layer.
 */

import { inferConversationStage } from './communication-intelligence.js';

function isHtmlBuildResponse(aiResponse = '') {
  return /```html|<!DOCTYPE html>|<html[\s>]/i.test(aiResponse);
}

export function detectProactiveNudge(userPrompt = '', aiResponse = '', userFirstName = '', options = {}) {
  const {
    studioDomain = null,
    studioMode = 'ask',
    hasPreview = false,
    guidedIntake = false,
    conversationContext = {},
  } = options;

  const name = userFirstName?.trim() || 'there';
  const stage = inferConversationStage(conversationContext, studioDomain);

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

  if (wantsUrls && hasUrls && (studioDomain === 'travel' || /\b(trip|travel|hotel|resort|destination|itinerary|beach|flight)\b/i.test(userPrompt))) {
    return {
      type: 'urls_included',
      text: `Hey ${name} — I've included direct links for each option so you can explore the beach, rooms, and facilities at your own pace.`,
    };
  }

  if (wantsUrls && hasUrls) {
    return {
      type: 'urls_included',
      text: `Hey ${name} — I've added direct links below so you can explore each option at your own pace.`,
    };
  }

  const wantsPlan = /\b(plan|itinerary|trip|travel|schedule)\b/i.test(userPrompt.toLowerCase());
  const hasPlanStructure = /\bday\s+\d|day \d|morning:|afternoon:|evening:/i.test(aiResponse);

  if (wantsPlan && hasPlanStructure && hasUrls) {
    if (stage === 'itinerary_delivered') return null;
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
