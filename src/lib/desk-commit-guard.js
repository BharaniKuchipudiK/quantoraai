/**
 * Protect the user's work: a coding turn must never replace a WORKING preview
 * with a broken, empty, or truncated one.
 *
 * When a build/refine turn times out or the model dies mid-write, the half-
 * written (or empty) file was committed over the good page — a 145-line working
 * shop became a 4-line stub — and the platform then claimed success. This gate
 * refuses that overwrite at the VFS-write chokepoints, so a failed turn leaves
 * the last working preview intact.
 *
 * It judges "working" by whether the VFS is a RUNNABLE preview, covering every
 * preview type Coding Desk renders:
 *   - a complete (opened AND closed) HTML document,
 *   - a React/Vite project runtime (package.json + src/main|App.*),
 *   - an inline React/JSX entry the runtime can wrap,
 *   - a substantial HTML fragment with real structure.
 * No length threshold is used, so a legitimate edit that shrinks the page — or
 * an HTML→React rewrite as small as `export default () => <App/>` — is allowed.
 * A first build (no prior working preview) is never blocked. The guard can only
 * ever KEEP a preview that already works.
 */

import { pickPreviewEntry } from './preview-utils.js';
import { createInlineReactRuntimeVfs, isProjectRuntimeVfs } from './project-runtime-preview.js';

/** Opened an HTML document but never closed it — the signature of a cut-off write. */
export function looksTruncatedHtml(html = '') {
  const s = String(html || '');
  const opened = /<!DOCTYPE html>/i.test(s) || /<html[\s>]/i.test(s);
  if (!opened) return false;
  return !/<\/html>/i.test(s) && !/<\/body>/i.test(s);
}

function fileText(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  return '';
}

/** Rough balance check — a mid-write truncation almost always leaves it unbalanced. */
function bracketsBalanced(code = '') {
  let curly = 0;
  let paren = 0;
  for (const ch of String(code)) {
    if (ch === '{') curly += 1;
    else if (ch === '}') curly -= 1;
    else if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    if (curly < 0 || paren < 0) return false;
  }
  return curly === 0 && paren === 0;
}

/**
 * A JSX/React entry that looks complete: has a component signature and balanced
 * brackets. A truncated component (dangling `App.jsx` fence) fails the balance
 * check, so it is not treated as runnable.
 */
export function jsxEntryLooksComplete(code = '') {
  const s = String(code || '').trim();
  if (s.length < 16) return false;
  if (!/\b(export\s+default|function\s+[A-Za-z]|const\s+[A-Za-z]\w*\s*=|=>)/.test(s)) return false;
  if (!/<[A-Za-z][\w.]*[\s/>]|React\.createElement/.test(s)) return false;
  return bracketsBalanced(s);
}

/** The primary UI component of a React/Vite project (App.* preferred, else main.*). */
function projectEntryComplete(vfs = {}) {
  const names = Object.keys(vfs || {});
  const app = names.find((n) => /(?:^|\/)src\/App\.(?:jsx|tsx|js|ts)$/i.test(n));
  const main = names.find((n) => /(?:^|\/)src\/main\.(?:jsx|tsx|js|ts)$/i.test(n));
  const primary = app || main;
  if (!primary) return false;
  return jsxEntryLooksComplete(fileText(vfs[primary]));
}

/** Whether a VFS renders a real preview (HTML doc, React/Vite project, or JSX entry). */
export function vfsIsRunnablePreview(vfs = {}) {
  if (!vfs || typeof vfs !== 'object') return false;
  // A React/Vite project runtime — but validate its ENTRY COMPONENT is complete,
  // not just that the filenames exist. A dangling/empty App.jsx keeps the project
  // shape yet cannot run, and must not count as a working preview.
  if (isProjectRuntimeVfs(vfs)) return projectEntryComplete(vfs);
  const entry = String(pickPreviewEntry(vfs) || '');
  if (!entry.trim()) return false;
  // An inline React/JSX entry the runtime can wrap — must look complete.
  if (createInlineReactRuntimeVfs(entry, vfs)) return jsxEntryLooksComplete(entry);
  // A complete, non-truncated HTML document.
  if (/<!DOCTYPE html>/i.test(entry) || /<html[\s>]/i.test(entry)) {
    return !looksTruncatedHtml(entry);
  }
  // A bare JSX/component entry (e.g. `export default () => <App/>`).
  if (/\bexport\s+default\b/.test(entry) && /<[A-Za-z][\w.]*[\s/>]/.test(entry)) {
    return jsxEntryLooksComplete(entry);
  }
  // A substantial HTML fragment with real page structure.
  return /<(body|main|section|header|nav|footer|div|script|ul|ol|table|form|article)\b/i.test(entry);
}

/**
 * Should this desk commit be rejected because it would regress a working page?
 *
 * @param {object} before current desk VFS (what is on the desk now)
 * @param {object} after  proposed desk VFS (the turn's output)
 * @returns {{ reject: boolean, reason: string }}
 */
export function deskCommitRegressesPreview(before = {}, after = {}) {
  // Nothing worth protecting — allow (first builds, non-preview desks, etc.).
  if (!vfsIsRunnablePreview(before)) return { reject: false, reason: 'no-working-page-before' };
  // The proposed state is itself runnable — a real edit (incl. a valid shrink
  // or an HTML→React rewrite). Allow.
  if (vfsIsRunnablePreview(after)) return { reject: false, reason: 'ok' };
  // Working preview → broken/empty/truncated output: reject and keep the page.
  const entry = String(pickPreviewEntry(after || {}) || '');
  if (!entry.trim()) return { reject: true, reason: 'incoming-entry-empty' };
  if (looksTruncatedHtml(entry)) return { reject: true, reason: 'incoming-entry-truncated' };
  return { reject: true, reason: 'incoming-entry-not-runnable' };
}

/**
 * Local modules a file imports that are not on the desk.
 *
 * WHY THIS EXISTS
 *
 * A scheduling board was committed as three files: App.jsx, main.jsx, and a
 * Scheduler.jsx that had been cut off mid-write at two lines — an import of
 * `./JobPanel` and nothing else. JobPanel was never written. Preview said
 * "Missing local preview module", and the chat said:
 *
 *   "The model hit the 175s limit, but Preview is already proved on the desk."
 *
 * Proved. Over a project that could not start.
 *
 * Whether a page RENDERS needs a browser. Whether every module it imports was
 * actually written does not — it is a fact about files we are already holding.
 * The cheap half of the check was simply never done.
 */
const LOCAL_IMPORT = /(?:^|\n)\s*(?:import\s[\s\S]*?from\s*|import\s*|export\s[\s\S]*?from\s*)['"](\.\.?\/[^'"]+)['"]/g;
const RESOLVE_EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.css', '/index.js', '/index.jsx'];

function normalizeJoin(fromPath, spec) {
  const base = String(fromPath).split('/').slice(0, -1);
  const parts = String(spec).split('/');
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base.join('/');
}

export function findMissingLocalImports(vfs = {}) {
  const files = vfs && typeof vfs === 'object' ? vfs : {};
  const present = new Set(Object.keys(files));
  const missing = [];
  for (const path of Object.keys(files)) {
    if (!/\.(jsx?|tsx?|mjs)$/i.test(path)) continue;
    const entry = files[path];
    const text = typeof entry === 'string' ? entry : String(entry?.content ?? entry?.code ?? '');
    const re = new RegExp(LOCAL_IMPORT.source, 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const target = normalizeJoin(path, match[1]);
      const found = RESOLVE_EXTS.some((ext) => present.has(`${target}${ext}`));
      if (!found) missing.push({ from: path, spec: match[1] });
    }
  }
  return missing;
}

/**
 * Can this desk possibly start?
 *
 * Not "does it look good" — only that nothing it imports is absent. A false
 * here is a fact, so it is safe to block a success claim on. A true is not a
 * promise the page renders, and callers must not read it as one.
 */
export function deskCanStart(vfs = {}) {
  return findMissingLocalImports(vfs).length === 0;
}

/** What to tell the user, naming the file and the import. */
export function describeMissingImports(missing = []) {
  if (!missing.length) return '';
  const shown = missing.slice(0, 3).map((m) => `\`${m.spec}\` (imported by ${m.from})`);
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
  return `Preview cannot start — ${shown.join(', ')}${more} ${missing.length === 1 ? 'was' : 'were'} never written. The turn ran out before finishing them.`;
}
