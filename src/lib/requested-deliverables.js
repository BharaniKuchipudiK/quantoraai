/*
 * Requested deliverables — deterministic truth about files the user explicitly
 * asked Coding Desk to produce.
 *
 * This is intentionally narrow. It is not a general NLP classifier and it does
 * not infer architecture. It only turns an explicit multi-file request such as
 * "write a 3-file utility (parser.py, cleaner.py and README.md)" into a list of
 * file paths that can later be checked against the VFS.
 *
 * Why this exists: a rendered index.html can DISPLAY code labelled parser.py,
 * cleaner.py and README.md while none of those files exists. Preview success is
 * evidence about the page, not evidence that requested deliverables were made.
 */

// A full stop after a filename is sentence punctuation, not part of the path.
// Keep dot out of the trailing guard so "README.md." is still captured.
const FILE_TOKEN = /(?:^|[\s(`'"[,;:])((?:\.?\/?[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:py|md|txt|csv|json|ya?ml|toml|ini|cfg|js|jsx|mjs|cjs|ts|tsx|css|scss|html?|sql|sh|bash|zsh|ps1|java|kt|kts|swift|go|rs|rb|php|c|cc|cpp|h|hpp))(?![A-Za-z0-9_-])/gi;
const MULTI_FILE_CUE = /\b(?:\d+\s*[- ]?file|multi[- ]?file|files?\s+(?:named|called|including|include)|(?:write|create|generate|produce|deliver|build|implement|package|update|modify)\b[^\n.]{0,180}\b(?:files?|utility|project|package|module|codebase))\b/i;
const NEGATION_NEAR_FILE = /\b(?:do\s+not|don't|dont|must\s+not|without|avoid|leave|keep)\b[^\n.]{0,55}$/i;

export function normalizeRequestedDeliverablePath(value = '') {
  const raw = String(value || '')
    .trim()
    .replace(/^[`'"(\[]+|[`'"),;:\]]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (!raw || raw.length > 240 || /:\/\//.test(raw)) return '';
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  return raw;
}

/**
 * Return only file paths that are explicit deliverables in a strong multi-file
 * request. Ordinary discussion that merely mentions source files must not turn
 * into a hidden completion contract.
 */
export function requestedDeliverablePaths(prompt = '') {
  const source = String(prompt || '').slice(0, 20_000);
  if (!source || !MULTI_FILE_CUE.test(source)) return [];

  const found = [];
  FILE_TOKEN.lastIndex = 0;
  let match;
  while ((match = FILE_TOKEN.exec(source)) !== null) {
    const path = normalizeRequestedDeliverablePath(match[1]);
    if (!path) continue;
    const before = source.slice(Math.max(0, match.index - 70), match.index);
    if (NEGATION_NEAR_FILE.test(before)) continue;
    if (!found.includes(path)) found.push(path);
    if (found.length >= 20) break;
  }

  // One incidental filename is too weak a signal for this first contract.
  // Single-file edit intent already has its own desk/refinement safeguards.
  return found.length >= 2 ? found : [];
}

/**
 * Source availability, not syntax or execution proof. Keep this first content
 * guard limited to explicitly requested Python bundles and their documentation;
 * website/React contracts retain their existing behavior.
 */
function hasPythonBundleContent(path, entry) {
  const content = typeof entry === 'string'
    ? entry
    : entry && Object.prototype.hasOwnProperty.call(entry, 'content') && typeof entry.content === 'string'
      ? entry.content
      : null;
  if (content === null) return false;
  // Empty text is still a real file (for example __init__.py or a requested
  // scaffold). Semantic completeness belongs to task-specific verification.
  if (!/\.py$/i.test(path)) return true;
  // Skip leading HTML comments linearly; a repeated wildcard regex can
  // backtrack on model-controlled input. Python string literals are untouched.
  let source = content.trimStart();
  while (source.startsWith('<!--')) {
    const end = source.indexOf('-->');
    if (end === -1) return false;
    source = source.slice(end + 3).trimStart();
  }
  // A rendered code panel renamed to .py is still HTML, not Python source.
  return !/^(?:<!doctype\s+html\b|<html[\s>])/i.test(source);
}

export function missingRequestedDeliverables(prompt = '', vfs = {}) {
  const requested = requestedDeliverablePaths(prompt);
  if (!requested.length) return [];
  const inspectPythonBundle = requested.some((path) => /\.py$/i.test(path))
    && requested.every((path) => /\.(?:py|md|txt)$/i.test(path));
  const present = new Set(Object.keys(vfs || {})
    .filter((path) => !inspectPythonBundle
      || hasPythonBundleContent(normalizeRequestedDeliverablePath(path), vfs[path]))
    .map(normalizeRequestedDeliverablePath).filter(Boolean));
  return requested.filter((path) => !present.has(path));
}
