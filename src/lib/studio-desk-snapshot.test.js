import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioDeskSnapshot,
  restoreStudioDeskSnapshot,
} from './studio-desk-snapshot.js';

test('an empty desk does not invent a snapshot', () => {
  const built = buildStudioDeskSnapshot({ vfs: {}, workspaceCode: '' });
  assert.equal(built.ok, true);
  assert.equal(built.snapshot, null);
  assert.equal(restoreStudioDeskSnapshot({}), null);
});

test('files and preview round-trip with the session', () => {
  const built = buildStudioDeskSnapshot({
    vfs: {
      'index.html': { content: '<!DOCTYPE html><html><body>Hi</body></html>', language: 'html' },
    },
    workspaceCode: '<!DOCTYPE html><html><body>Hi</body></html>',
    codingDeskOpen: true,
    lastProcessedMessageId: 42,
    review: [{ path: 'index.html', added: 3, removed: 0, exact: true }],
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
  });
  assert.equal(built.ok, true);
  const restored = restoreStudioDeskSnapshot({ desk: built.snapshot });
  assert.equal(restored.codingDeskOpen, true);
  assert.equal(restored.lastProcessedMessageId, 42);
  assert.match(restored.vfs['index.html'].content, /Hi/);
  assert.match(restored.workspaceCode, /Hi/);
  assert.deepEqual(restored.review, [{ path: 'index.html', added: 3, removed: 0, exact: true }]);
  assert.equal(restored.job.purpose, 'A working calculator');
});

test('a saved boutique without photos gets them back on restore', () => {
  const built = buildStudioDeskSnapshot({
    vfs: {
      'index.html': {
        content: '<!DOCTYPE html><html><body><main><div class="hero">Aaranya</div></main></body></html>',
        language: 'html',
      },
      'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
    },
    workspaceCode: '<!DOCTYPE html><html><body><main><div class="hero">Aaranya</div></main></body></html>',
    codingDeskOpen: true,
  });
  const restored = restoreStudioDeskSnapshot({ desk: built.snapshot });
  assert.match(restored.vfs['index.html'].content, /images\.unsplash\.com/);
  assert.match(restored.workspaceCode, /images\.unsplash\.com/);
  assert.match(restored.vfs['index.html'].content, /Add to Cart/);
  assert.match(restored.vfs['index.html'].content, /USD/);
});

test('a snapshot that is too large is refused instead of faking persistence', () => {
  const huge = 'x'.repeat(800_001);
  const built = buildStudioDeskSnapshot({
    vfs: { 'index.html': { content: huge, language: 'html' } },
    workspaceCode: huge,
  });
  assert.equal(built.ok, false);
  assert.equal(built.snapshot, null);
});
