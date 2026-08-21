import { applyDiffPatch } from './diff-patcher.js';

function looksLikeReactSource(source = '') {
  return /(?:from\s+['"]react['"]|import\s+React\b|useState\s*\(|useEffect\s*\(|export\s+default\s+(?:function|class)|ReactDOM\.createRoot\s*\(|createRoot\s*\(|<[A-Z][A-Za-z0-9_.:-]*(?:\s|\/?>))/m.test(String(source || ''));
}

/**
 * Parses markdown text to extract code blocks into a Virtual File System (VFS).
 *
 * @param {string} text - The markdown text (often streamed).
 * @returns {object} A VFS object mapping filepaths to their contents.
 * Example: { 'App.jsx': { content: '...', language: 'jsx' } }
 */
export function parseVFSFromMarkdown(text, currentVfs = {}) {
  // Existing files are used only as the base for an actual code update/diff.
  // A plain-language reply must return an empty parse result; otherwise callers
  // cannot distinguish "this response contains project files" from "an older
  // project happens to exist", which used to resurrect Code Preview in Travel.
  let vfs = JSON.parse(JSON.stringify(currentVfs));
  if (!text) return {};

  // Regex to match markdown code blocks. Spaces/tabs are allowed between the
  // language and optional attributes, but never consume the newline that begins
  // the code body. This matters for one-line canonical Office HTML documents.
  // Group 1: language (optional)
  // Group 2: attributes (optional, e.g. filepath="App.jsx")
  // Group 3: code content
  const codeBlockRegex = /```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let foundRunnableFile = false;
  
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = (match[1] || '').toLowerCase();
    const attributes = match[2] || '';
    const code = match[3];

    // A server-verified Office preview is an atomic artifact state, not another
    // generic HTML file to merge into a stale app/deck VFS. Reset the VFS and
    // preserve the exact canonical HTML so its embedded fingerprint remains valid.
    if (language === 'html' && /id=["']quantora-office-manifest["']/i.test(code)) {
      return {
        'presentation.html': {
          content: code,
          language: 'html',
        },
      };
    }

    const filepathMatch = attributes.match(/(?:filepath|filename)\s*=\s*["']([^"']+)["']/)
      || attributes.match(/(?:filepath|filename)\s*=\s*([^\s"']+)/)
      || attributes.match(/^([\w./-]+\.\w+)$/);
    let filepath = filepathMatch ? filepathMatch[1] : null;

    // Fallbacks if no explicit filepath is given
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
        continue;
      }
    }

    foundRunnableFile = true;

    // Normalize language
    let normalizedLanguage = language;
    if (['js', 'jsx', 'javascript', 'react'].includes(language)) normalizedLanguage = 'jsx';
    if (['ts', 'tsx', 'typescript'].includes(language)) normalizedLanguage = 'tsx';

    // Update VFS
    if (code.includes('<<<<') && code.includes('====')) {
       // It's a diff patch! Apply it to the existing content if it exists
       const existingContent = vfs[filepath] ? vfs[filepath].content : '';
       vfs[filepath] = {
          content: applyDiffPatch(existingContent, code),
          language: normalizedLanguage
       };
    } else {
       // It's a full rewrite
       vfs[filepath] = {
         content: code,
         language: normalizedLanguage
       };
    }
  }
  
  // Plain prose must never carry an older VFS forward. The caller can now use
  // Object.keys(result).length as a truthful signal that THIS response contains
  // a runnable artifact.
  return foundRunnableFile ? vfs : {};
}
