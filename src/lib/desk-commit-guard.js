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
