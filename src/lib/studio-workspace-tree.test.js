import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deskShellVfs,
  formatWorkspaceListing,
  isWorkspaceListingCommand,
  listingShowsGeneratedProjectFile,
  normalizeStudioWorkspacePath,
  studioWorkspaceFileEntries,
  vfsToFileSystemTree,
} from './studio-workspace-tree.js';

const calculator = `
import React, { useState } from 'react';
import { Delete } from 'lucide-react';
export default function Calculator() {
  const [value, setValue] = useState('0');
  return <main><output data-testid="calculator-display">{value}</output></main>;
}
`;

test('a calculator Preview tree is what Terminal mounts, not a lone App.jsx', () => {
  const vfs = { 'App.jsx': { content: calculator, language: 'jsx' } };
  const tree = deskShellVfs(vfs, calculator);
  assert.ok(tree['index.html']?.content);
  assert.ok(tree['src/App.jsx']?.content);
  const mounted = vfsToFileSystemTree(tree);
  assert.equal(typeof mounted['index.html']?.file?.contents, 'string');
  assert.equal(typeof mounted.src?.directory?.['App.jsx']?.file?.contents, 'string');
  const listing = formatWorkspaceListing(studioWorkspaceFileEntries(tree).map((file) => file.path));
  assert.equal(listingShowsGeneratedProjectFile(listing), true);
});

test('an HTML boutique stays the boutique files, not a fabricated React app', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><div class="product-card">Silk</div></body></html>', language: 'html' },
    'products.json': { content: '[]', language: 'json' },
  };
  const tree = deskShellVfs(vfs);
  assert.ok(tree['index.html']);
  assert.ok(tree['products.json']);
  assert.equal(tree['src/App.jsx'], undefined);
  assert.equal(listingShowsGeneratedProjectFile(formatWorkspaceListing(['index.html', 'products.json'])), true);
});

test('leading slashes do not create an empty WebContainer folder', () => {
  assert.equal(normalizeStudioWorkspacePath('/src/App.jsx'), 'src/App.jsx');
  assert.equal(normalizeStudioWorkspacePath('./index.html'), 'index.html');
  const mounted = vfsToFileSystemTree({
    '/index.html': { content: '<html></html>' },
    './src/App.jsx': { content: 'export default function App(){ return null }' },
  });
  assert.equal(mounted[''], undefined);
  assert.ok(mounted['index.html']?.file);
  assert.ok(mounted.src?.directory?.['App.jsx']?.file);
});

test('empty or non-file VFS slots are not mounted', () => {
  assert.deepEqual(vfsToFileSystemTree({ skip: null, empty: { content: 1 } }), {});
  assert.deepEqual(studioWorkspaceFileEntries({ 'index.html': { content: '<html></html>' }, skip: null }).map((file) => file.path), ['index.html']);
});

test('ls is recognized so an empty shell listing can be checked against the mount', () => {
  assert.equal(isWorkspaceListingCommand('ls'), true);
  assert.equal(isWorkspaceListingCommand('ls -la'), true);
  assert.equal(isWorkspaceListingCommand('rm -rf /'), false);
  assert.equal(listingShowsGeneratedProjectFile(''), false);
  assert.equal(listingShowsGeneratedProjectFile('App.jsx\nstyles.css'), false);
});
