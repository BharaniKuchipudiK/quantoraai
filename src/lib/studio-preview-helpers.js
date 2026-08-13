/** HTML extraction and live-preview button state for studio chat messages. */

export function extractHtmlFromResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const trimmed = rawText.trim();
  const htmlFence = trimmed.match(/```html\s*\n?([\s\S]*?)```/i);
  if (htmlFence?.[1]) return htmlFence[1].trim();
  const genericFence = trimmed.match(/```\s*\n?([\s\S]*?<(?:!DOCTYPE|html)[\s\S]*?)```/i);
  if (genericFence?.[1]) return genericFence[1].trim();
  if (/<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return trimmed.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim();
  }
  return '';
}

export function hasPreviewableContent(rawText) {
  if (!rawText || typeof rawText !== 'string') return false;
  return Boolean(extractHtmlFromResponse(rawText) || /```/.test(rawText));
}

export function preparePreviewHtml(rawText, imageMap = new Map()) {
  let html = extractHtmlFromResponse(rawText);
  if (!html && (/<!DOCTYPE html>/i.test(rawText) || /<html[\s>]/i.test(rawText))) {
    html = rawText.replace(/```(?:html|javascript|js|css)?\s*\n?([\s\S]*?)```/gi, '$1').trim();
  }
  if (!html) return '';
  if (imageMap.size) {
    for (const [token, dataUrl] of imageMap) html = html.split(token).join(dataUrl);
  }
  return html;
}

export function getLivePreviewButtonMeta(msg, { isGenerating, streamingMessageId }) {
  if (!hasPreviewableContent(msg.text)) return null;
  if (isGenerating && msg.id === streamingMessageId) {
    return { disabled: true, label: 'Building…', title: 'Still generating the response' };
  }
  const status = msg.previewStatus;
  if (!status) {
    return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
  }
  if (status === 'running' || status === 'verifying' || status === 'healing') {
    return { disabled: true, label: 'Verifying preview…', title: 'Running sandbox checks before preview opens' };
  }
  if (status === 'clean') {
    return { disabled: false, label: 'Open Live Preview', title: 'Verified — runs clean' };
  }
  if (status === 'degraded') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview ready — styling may be incomplete' };
  }
  if (status === 'failed') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview may have runtime errors' };
  }
  return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
}
