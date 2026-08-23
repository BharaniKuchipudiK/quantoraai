/**
 * Terminal and Git must see the same files Preview is running.
 * Chat VFS can be a single App.jsx while Preview expands that into a project.
 */

import { pickPreviewEntry } from './preview-utils.js';
import { createInlineReactRuntimeVfs, isProjectRuntimeVfs } from './project-runtime-preview.js';

export function previewRuntimeVfs(vfs = {}, code = '') {
  if (isProjectRuntimeVfs(vfs)) return vfs;
  return createInlineReactRuntimeVfs(String(code || ''), vfs);
}

/** The tree a running Preview is actually serving. */
export function deskShellVfs(vfs = {}, code = '') {
  const source = String(code || pickPreviewEntry(vfs) || '');
  return previewRuntimeVfs(vfs, source) || vfs || {};
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
