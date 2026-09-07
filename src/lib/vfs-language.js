/*
 * Which language a desk file is, from its path.
 *
 * WHY THIS IS ITS OWN FILE.
 *
 * It lived in github-workspace.js, which is fine for the checkout path that
 * needed it. desk-checkpoints.js then needed it too -- a restore has to hand
 * files back as { content, language }, the shape the desk renders -- and
 * importing it from there quietly undid a deliberate optimisation: AiStudio.jsx
 * loads github-workspace.js with a DYNAMIC import, under a comment recording
 * that a static one "took AiStudio from under budget to 301,933 bytes. Nothing
 * below runs until someone clicks Open in desk, so nothing below belongs in the
 * bundle everyone downloads."
 *
 * desk-checkpoints.js IS statically imported by AiStudio, so importing
 * github-workspace.js from it made the whole GitHub integration eager again for
 * every desk visit, for a twenty-line lookup table. Review of #597 caught it.
 *
 * So the table moves here, where both can take it without either dragging the
 * other along. github-workspace.js re-exports `languageForPath` so its existing
 * callers are untouched.
 */

const LANGUAGE_BY_EXTENSION = {
  js: 'jsx', jsx: 'jsx', mjs: 'jsx', cjs: 'jsx',
  ts: 'tsx', tsx: 'tsx',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  json: 'json', md: 'markdown', mdx: 'markdown',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml', sql: 'sql',
};

export function languageForPath(path = '') {
  const extension = String(path).split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_BY_EXTENSION[extension] || 'plaintext';
}
