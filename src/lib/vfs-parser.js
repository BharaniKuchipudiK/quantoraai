import { applyDiffPatch, looksLikePatch } from './diff-patcher.js';

function looksLikeReactSource(source = '') {
  return /(?:from\s+['"]react['"]|import\s+React\b|useState\s*\(|useEffect\s*\(|export\s+default\s+(?:function|class)|ReactDOM\.createRoot\s*\(|createRoot\s*\(|<[A-Z][A-Za-z0-9_.:-]*(?:\s|\/?>))/m.test(String(source || ''));
}

/** Chat prose plus a later HTML document must not become the preview page. */
export function isolateHtmlDocument(source = '') {
  const text = String(source || '');
  const start = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start < 0) return '';
  return text.slice(start).trim();
}

/**
 * Parses markdown text to extract code blocks into a Virtual File System (VFS).
 *
 * @param {string} text - The markdown text (often streamed).
 * @returns {object} A VFS object mapping filepaths to their contents.
 * Example: { 'App.jsx': { content: '...', language: 'jsx' } }
 */
/**
 * Parse a reply into project files, and report any edit that did not land.
 *
 * Returns { vfs, patchFailures }. parseVFSFromMarkdown wraps this for the
 * callers that only want the files; anything that speaks to the user should
 * come through here, because a partly-applied patch that goes unreported is
 * how a build ends up wrong under a confident sentence.
 */
export function parseVFSWithReport(text, currentVfs = {}) {
  // Existing files are used only as the base for an actual code update/diff.
  // A plain-language reply must return an empty parse result; otherwise callers
  // cannot distinguish "this response contains project files" from "an older
  // project happens to exist", which used to resurrect Code Preview in Travel.
  let vfs = JSON.parse(JSON.stringify(currentVfs));
  if (!text) return { vfs: {}, patchFailures: [] };

  const codeBlockRegex = /```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let foundRunnableFile = false;
  const patchFailures = [];

  function ingestBlock(languageRaw, attributesRaw, codeRaw) {
    const language = (languageRaw || '').toLowerCase();
    const attributes = attributesRaw || '';
    let code = codeRaw;

    if (language === 'html' && /id=["']quantora-office-manifest["']/i.test(code)) {
      vfs = {
        'presentation.html': {
          content: code,
          language: 'html',
        },
      };
      foundRunnableFile = true;
      return 'office';
    }

    const filepathMatch = attributes.match(/(?:filepath|filename)\s*=\s*["']([^"']+)["']/)
      || attributes.match(/(?:filepath|filename)\s*=\s*([^\s"']+)/)
      || attributes.match(/^([\w./-]+\.\w+)$/);
    let filepath = filepathMatch ? filepathMatch[1] : null;

    if (!filepath) {
      if (language === 'css') {
        filepath = 'styles.css';
      } else if (language === 'html') {
        filepath = 'index.html';
      } else if (['jsx', 'tsx', 'typescript', 'react'].includes(language) || looksLikeReactSource(code)) {
        filepath = 'App.jsx';
      } else if (['js', 'javascript', 'ts'].includes(language)) {
        filepath = 'script.js';
      } else {
        return false;
      }
    }

    let normalizedLanguage = language;
    if (['js', 'jsx', 'javascript', 'react'].includes(language)) normalizedLanguage = 'jsx';
    if (['ts', 'tsx', 'typescript'].includes(language)) normalizedLanguage = 'tsx';

    /*
     * Recognise a patch BEFORE isolating an HTML document.
     *
     * isolateHtmlDocument looks for <!DOCTYPE html> or <html>. A search/replace
     * block contains neither, so it returned '' and the block was thrown away —
     * meaning a patch to index.html has never once been accepted, whatever the
     * system prompt asked the model to emit. Full-document rewrites were not a
     * policy choice here; they were the only thing that could get through.
     */
    const isPatch = looksLikePatch(code);

    if (!isPatch && (language === 'html' || /\.html$/i.test(filepath))) {
      const html = isolateHtmlDocument(code);
      if (!html) return false;
      code = html;
    }

    const existingContent = vfs[filepath] ? vfs[filepath].content : '';
    if (isPatch && !existingContent) {
      return false;
    }

    let content = code;
    if (isPatch) {
      /*
       * A patch that only partly applied must be REPORTED, never committed as
       * if it were whole. The previous code took a plain string back and had no
       * way to know: two edits went out, one landed, the desk committed the
       * file and the reply claimed both. Collected here and surfaced by the
       * caller through patchFailures.
       */
      const result = applyDiffPatch(existingContent, code);
      if (!result.ok) patchFailures.push({ filepath, result });
      // A patch that landed nothing leaves the file exactly as it was, rather
      // than rewriting it with a half-edit or with the markers themselves.
      if (!result.applied.length) return false;
      content = result.text;
    }

    foundRunnableFile = true;
    vfs[filepath] = { content, language: normalizedLanguage };
    return true;
  }

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const result = ingestBlock(match[1], match[2], match[3]);
    if (result === 'office') return { vfs, patchFailures };
  }

  const withoutClosed = String(text || '').replace(/```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g, '');
  const dangling = withoutClosed.match(/```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*)$/);
  if (dangling) {
    ingestBlock(dangling[1], dangling[2], dangling[3]);
  }

  return { vfs: foundRunnableFile ? vfs : {}, patchFailures };
}

