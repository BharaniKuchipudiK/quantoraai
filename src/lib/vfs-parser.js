import { applyDiffPatch } from './diff-patcher.js';
/**
 * Parses markdown text to extract code blocks into a Virtual File System (VFS).
 *
 * @param {string} text - The markdown text (often streamed).
 * @returns {object} A VFS object mapping filepaths to their contents.
 * Example: { 'App.jsx': { content: '...', language: 'jsx' } }
 */
export function parseVFSFromMarkdown(text, currentVfs = {}) {
  // Deep clone currentVfs to prevent mutating React state directly.
  let vfs = JSON.parse(JSON.stringify(currentVfs));
  if (!text) return vfs;

  // Regex to match markdown code blocks
  // Matches: ```language filepath="something" ... ```
  // Group 1: language (optional)
  // Group 2: attributes (optional, e.g. filepath="App.jsx")
  // Group 3: code content
  const codeBlockRegex = /```(\w+)?\s*(.*?)\n([\s\S]*?)```/g;
  
  let match;
  let blockCount = 0;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blockCount++;
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

    // Try to extract filepath="filename" or filename="filename"
    const filepathMatch = attributes.match(/(?:filepath|filename)="([^"]+)"/) || attributes.match(/(?:filepath|filename)='([^']+)'/);
    let filepath = filepathMatch ? filepathMatch[1] : null;

    // Fallbacks if no explicit filepath is given
    if (!filepath) {
      if (language === 'css') {
        filepath = 'styles.css';
      } else if (language === 'html') {
        filepath = 'index.html';
      } else if (['js', 'jsx', 'javascript', 'ts', 'tsx', 'typescript', 'react'].includes(language)) {
        filepath = 'App.jsx';
      } else {
        // Unknown language without a filepath, skip or assign generic
        continue;
      }
    }

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
  
  // Backward compatibility: If no valid code blocks were found using standard markdown,
  // maybe the AI just spit out raw HTML/React. The caller handles that path.
  return vfs;
}
