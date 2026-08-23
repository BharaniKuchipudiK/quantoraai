/**
 * Terminal and Git must see the same files Preview is running.
 * Chat VFS can be a single App.jsx while Preview expands that into a project.
 */

import { pickPreviewEntry } from './preview-utils.js';
import { createInlineReactRuntimeVfs, isProjectRuntimeVfs } from './project-runtime-preview.js';

function looksLikeHtmlDocument(source = '') {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

export function previewRuntimeVfs(vfs = {}, code = '') {
  if (isProjectRuntimeVfs(vfs)) return vfs;
  return createInlineReactRuntimeVfs(String(code || ''), vfs);
}

/** The tree a running Preview is actually serving — React runtime or blob HTML. */
export function deskShellVfs(vfs = {}, code = '') {
  const source = String(code || pickPreviewEntry(vfs) || '');
  const runtime = previewRuntimeVfs(vfs, source);
  if (runtime) return runtime;
  if (studioWorkspaceFileEntries(vfs).length) return vfs;
  if (looksLikeHtmlDocument(source)) {
    return { 'index.html': { content: source, language: 'html' } };
  }
  return vfs || {};
}

export function normalizeStudioWorkspacePath(path = '') {
  const parts = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

export function studioWorkspaceFileEntries(vfs = {}) {
  const entries = [];
  for (const [rawPath, file] of Object.entries(vfs || {})) {
    const path = normalizeStudioWorkspacePath(rawPath);
    if (!path || !file || typeof file.content !== 'string') continue;
    entries.push({ path, content: file.content });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** WebContainer FileSystemTree. Leading slashes must not become an empty folder. */
export function vfsToFileSystemTree(vfs = {}) {
  const tree = {};
  for (const { path, content } of studioWorkspaceFileEntries(vfs)) {
    const parts = path.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = { file: { contents: content } };
      } else {
        if (!current[part] || !current[part].directory) {
          current[part] = { directory: {} };
        }
        current = current[part].directory;
      }
    }
  }
  return tree;
}

export function isWorkspaceListingCommand(commandLine = '') {
  const line = String(commandLine || '').trim();
  return /^(?:ls|dir)(?:\s+(?:-\w+|\s)*)?$/.test(line);
}

export function listingShowsGeneratedProjectFile(output = '') {
  return /(?:^|[\s/])(?:index\.html|src\/App\.jsx|src\/main\.jsx)\b/m.test(String(output || ''));
}

export function formatWorkspaceListing(paths = []) {
  return [...new Set(paths.filter(Boolean))].sort((a, b) => a.localeCompare(b)).join('\n');
}

/** Names already on this desk. ls prints these; it does not invent extra files. */
export function deskListing(vfs = {}) {
  return formatWorkspaceListing(studioWorkspaceFileEntries(vfs).map((file) => file.path));
}

/**
 * ls/dir answer for the Preview tree. Does not invent files and does not
 * wait on WebContainer — Preview is often a blob, not a WC mount.
 */
export function answerWorkspaceListing(vfs = {}, code = '') {
  const tree = deskShellVfs(vfs, code);
  const listing = deskListing(tree);
  if (listingShowsGeneratedProjectFile(listing) || listing) {
    return { ok: true, output: listing };
  }
  return {
    ok: false,
    output: 'The shell is empty while Preview has files. No fake listing was shown.',
  };
}
