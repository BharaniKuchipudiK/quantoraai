import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.equal(studioFileLabel('git'), 'Git');
  assert.equal(studioFileLabel('src/App.jsx'), 'src/App.jsx');
});

test('the file tree does not repeat the desk job card', () => {
  const tree = fs.readFileSync(new URL('../components/StudioFileTree.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(tree, /data-quantora-desk-job-panel/);
  const studio = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /data-quantora-desk-job="true"/);
});

test('diff hunks live in Git, not in the file tree', () => {
  const tree = fs.readFileSync(new URL('../components/StudioFileTree.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(tree, /data-quantora-desk-review-hunk/);
  assert.match(tree, /data-quantora-desk-review="true"/);
  const git = fs.readFileSync(new URL('../components/StudioGit.jsx', import.meta.url), 'utf8');
  assert.match(git, /StudioDeskReviewHunks/);
  const hunks = fs.readFileSync(new URL('../components/StudioDeskReviewHunks.jsx', import.meta.url), 'utf8');
  assert.match(hunks, /data-quantora-desk-review-hunks/);
  assert.match(hunks, /data-quantora-desk-review-line/);
});
