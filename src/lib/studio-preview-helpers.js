/** HTML extraction and live-preview button state for studio chat messages. */

import { parseVFSFromMarkdown, isolateHtmlDocument } from './vfs-parser.js';
import { pickPreviewEntry, prepareCodeForPreview } from './preview-utils.js';
import { isInlineReactRuntimeCode } from './project-runtime-preview.js';

function isHtmlDocument(source = '') {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

function extractUnfencedHtml(rawText) {
  return isolateHtmlDocument(rawText);
}

/**
 * One pipeline for every generated artifact: fenced VFS, single HTML file,
 * or unfenced HTML document. Callers must not pick the first markdown fence.
 */
export function assembleStudioPreview(rawText, currentVfs = {}) {
  if (!rawText || typeof rawText !== 'string') return { vfs: {}, code: '' };

  const vfs = parseVFSFromMarkdown(rawText, currentVfs);
  if (Object.keys(vfs).length > 0) {
    return { vfs, code: pickPreviewEntry(vfs) };
  }

  const html = extractUnfencedHtml(rawText);
  if (html) {
    return {
      vfs: { 'index.html': { content: html, language: 'html' } },
      code: html,
    };
  }

  return { vfs: {}, code: '' };
}

/**
 * Apply a chat turn onto the desk. A follow-up that only sends one file
 * keeps the rest of the project. A first build does not force the desk open.
 */
export function applyWorkspaceFromChat(rawText, currentVfs = {}) {
  const assembled = assembleStudioPreview(rawText, currentVfs);
  const hadProject = Object.keys(currentVfs || {}).some(
    (path) => path && currentVfs[path] && typeof currentVfs[path].content === 'string',
  );
  const didUpdate = Object.keys(assembled.vfs).length > 0 && Boolean(assembled.code);
  return {
    vfs: assembled.vfs,
    code: assembled.code,
    didUpdate,
    reopenDesk: hadProject && didUpdate,
  };
}

/** Preview runs the project, not the file currently open in the editor. */
export function runningPreviewCode(vfs = {}, fallback = '') {
  return pickPreviewEntry(vfs) || String(fallback || '');
}

export function extractHtmlFromResponse(rawText) {
  const { vfs, code } = assembleStudioPreview(rawText);
  const htmlFile = vfs['index.html']?.content
    || Object.entries(vfs).find(([name]) => /\.html$/i.test(name))?.[1]?.content;
  if (htmlFile) return String(htmlFile).trim();
  return isHtmlDocument(code) ? String(code).trim() : '';
}

export function extractRunnableCode(rawText) {
  const { code } = assembleStudioPreview(rawText);
  if (code) return code;
  if (isInlineReactRuntimeCode(rawText)) return String(rawText).trim();
  return null;
}

const BROWSER_ENTRY = /(?:^|\/)(?:index\.html|presentation\.html|App\.jsx|App\.tsx|src\/App\.jsx|src\/App\.tsx|src\/main\.jsx|src\/main\.tsx)$/i;

function vfsHasBrowserPreview(vfs = {}) {
  const names = Object.keys(vfs);
  if (names.some((name) => BROWSER_ENTRY.test(name))) return true;
  if (names.some((name) => /\.html$/i.test(name))) return true;
  return names.some((name) => isHtmlDocument(vfs[name]?.content) || isInlineReactRuntimeCode(vfs[name]?.content));
}

/**
 * Live Preview only opens for artifacts the sandbox can actually run.
 * Native sources (Swift, Kotlin, etc.) stay in chat until a browser replica exists.
 */
export function canOpenStudioPreviewPane(rawText, currentVfs = {}) {
  if (!rawText || typeof rawText !== 'string') return false;
  const assembled = assembleStudioPreview(rawText, currentVfs);
  if (isHtmlDocument(assembled.code) || isInlineReactRuntimeCode(assembled.code || rawText)) return true;
  return vfsHasBrowserPreview(assembled.vfs);
}

export function hasPreviewableContent(rawText) {
  return canOpenStudioPreviewPane(rawText);
}

export function preparePreviewHtml(rawText, imageMap = new Map()) {
  const assembled = assembleStudioPreview(rawText);
  let html = extractHtmlFromResponse(rawText) || assembled.code;
  if (!html || !isHtmlDocument(html)) return '';
  if (imageMap.size) {
    for (const [token, dataUrl] of imageMap) html = html.split(token).join(dataUrl);
  }
  return prepareCodeForPreview(html, assembled.vfs);
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
