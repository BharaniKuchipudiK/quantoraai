/**
 * Parses markdown text to extract code blocks into a Virtual File System (VFS).
 *
 * @param {string} text - The markdown text (often streamed).
 * @returns {object} A VFS object mapping filepaths to their contents.
 * Example: { 'App.jsx': { content: '...', language: 'jsx' } }
 */
export function parseVFSFromMarkdown(text) {
  const vfs = {};
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
    vfs[filepath] = {
      content: code,
      language: normalizedLanguage
    };
  }
  
  // Backward compatibility: If no valid code blocks were found using standard markdown, 
  // maybe the AI just spit out raw HTML/React (like the old LivePreviewCanvas logic did).
  // We'll leave that to the caller to handle, or we can assume if no blocks exist, return empty.
  
  return vfs;
}
