/**
 * Build Communication Layer — chat stays conversational; HTML routes to preview.
 */

export function stripArtifactFromChatDisplay(rawText = '') {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  text = text.replace(/```html\s*\n?[\s\S]*?(?:```|$)/gi, '');
  text = text.replace(/```\s*\n?[\s\S]*?<(?:!DOCTYPE|html)[\s\S]*?(?:```|$)/gi, '');

  if (/<!DOCTYPE html>/i.test(text) || /<html[\s>]/i.test(text)) {
    const htmlStart = text.search(/<!DOCTYPE html>|<html[\s>]/i);
    if (htmlStart > 0) text = text.slice(0, htmlStart).trim();
    else if (htmlStart === 0) text = '';
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function getChatDisplayText(rawText = '', { artifactHtml = '' } = {}) {
  const stripped = stripArtifactFromChatDisplay(rawText);
  if (stripped) return stripped;
  if (artifactHtml || rawText.trim() !== '') {
    // If the text was entirely stripped (leaving it blank), it means it was just an HTML block
    return 'Your generated site is ready in the preview panel →';
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
