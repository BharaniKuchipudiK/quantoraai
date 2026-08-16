/**
 * Build Communication Layer — chat stays conversational; HTML routes to preview.
 */

export function stripArtifactFromChatDisplay(rawText = '') {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  // Code and generated artifacts belong in the preview panel, never in the chat.
  // Strip EVERY fenced code block — any language — closed or still streaming.
  text = text.replace(/```[\s\S]*?```/g, '');   // complete fenced blocks
  text = text.replace(/```[\s\S]*$/g, '');       // an unclosed (mid-stream) fence

  // Strip any bare (un-fenced) HTML document that leaked into the prose.
  if (/<!DOCTYPE html>/i.test(text) || /<html[\s>]/i.test(text)) {
    const htmlStart = text.search(/<!DOCTYPE html>|<html[\s>]/i);
    text = htmlStart > 0 ? text.slice(0, htmlStart) : '';
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// Keep the chat reply short. Presentations especially should read as a one- or
// two-line brief, not an essay — the deck itself is the deliverable in the panel.
function capBrief(text, maxChars = 480) {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
  return `${(lastStop > 120 ? slice.slice(0, lastStop + 1) : slice).trim()}…`;
}

export function getChatDisplayText(rawText = '', { artifactHtml = '' } = {}) {
  const stripped = stripArtifactFromChatDisplay(rawText);
  if (stripped) return capBrief(stripped);
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
