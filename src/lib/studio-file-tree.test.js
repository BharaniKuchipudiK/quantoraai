import assert from 'node:assert/strict';
import test from 'node:test';
import { listStudioFiles, studioFileLabel } from './studio-file-tree.js';

test('lists project files in order and skips empty slots', () => {
  assert.deepEqual(
    listStudioFiles({
      'src/App.jsx': { content: 'export default function App() { return 1 }' },
      'index.html': { content: '<html></html>' },
      skip: null,
    }),
    ['index.html', 'src/App.jsx'],
  );
});

test('preview is labelled Preview, not a fake file name', () => {
  assert.equal(studioFileLabel('preview'), 'Preview');
  assert.equal(studioFileLabel('terminal'), 'Terminal');
  assert.equal(studioFileLabel('src/App.jsx'), 'src/App.jsx');
});
