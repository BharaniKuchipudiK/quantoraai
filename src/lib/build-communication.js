/**
 * Build Communication Layer — chat stays conversational; HTML routes to preview.
 */

import { polishOfficeUiCopy } from './office-ui-copy.js';

export function stripArtifactFromChatDisplay(rawText = '') {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = polishOfficeUiCopy(rawText).trim();

  // Code and generated artifacts belong in the preview panel, never in the chat.
  // Strip EVERY fenced code block — any language — closed or still streaming.
  text = text.replace(/```[\s\S]*?```/g, '');   // complete fenced blocks
  text = text.replace(/```[\s\S]*$/g, '');       // an unclosed (mid-stream) fence

  // Strip any bare (un-fenced) HTML document that leaked into the prose.
  if (/<!DOCTYPE html>/i.test(text) || /<html[\s>]/i.test(text)) {
    const htmlStart = text.search(/<!DOCTYPE html>|<html[\s>]/i);
    text = htmlStart > 0 ? text.slice(0, htmlStart) : '';
  }

  // Strip bare JSON objects (from strict JSON mode) that leaked into the prose.
  // This prevents raw JSON schemas from rendering in the user's chat feed.
  if (text.includes('{"title":') || text.includes('{"slides":') || text.trim().startsWith('{')) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(0, firstBrace) + text.slice(lastBrace + 1);
    }
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function getChatDisplayText(rawText = '', { artifactHtml = '' } = {}) {
  const stripped = stripArtifactFromChatDisplay(rawText);
  // Return the FULL reply — never truncate chat. (A 480-char cap here previously
  // chopped normal answers mid-sentence; artifacts are already stripped above.)
  if (stripped) return stripped;
  if (artifactHtml || rawText.trim() !== '') {
    // The reply was pure artifact — surface a short, kind-aware pointer instead.
    const isDeck = /\b(slide|deck|presentation|powerpoint|pptx)\b/i.test(`${rawText} ${artifactHtml}`);
    return isDeck
      ? 'Your presentation is ready in the preview panel →'
      : 'Your generated result is ready in the preview panel →';
  }
  return rawText;
}

export function isFeatureSuggestionRequest(text = '') {
  return /\b(suggest\s+(?:one|a)\s+(?:high-impact\s+)?feature|add a feature|what feature|feature to add)\b/i.test(text)
    && !/\b(yes,?\s*build|go ahead|implement|add it|do it|build it)\b/i.test(text);
}

export function isExplicitArtifactProceed(text = '') {
  return /\b(yes,?\s*build|go ahead|implement|add it|do it|build it|build that|ship it|make it live|update the site)\b/i.test(text);
}
