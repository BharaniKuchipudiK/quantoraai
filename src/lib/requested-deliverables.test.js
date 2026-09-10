import assert from 'node:assert/strict';
import test from 'node:test';
import {
  missingRequestedDeliverables,
  normalizeRequestedDeliverablePath,
  requestedDeliverablePaths,
} from './requested-deliverables.js';

const PYTHON_ASK = "Act as a Data Engineer and write a modular 3-file Python utility (parser.py, cleaner.py and README.md) for processing financial datasets. Once the code is generated, package all three files into a single Git tree.";

test('[was-red] extracts the exact three Python utility deliverables from the observed request', () => {
  assert.deepEqual(requestedDeliverablePaths(PYTHON_ASK), ['parser.py', 'cleaner.py', 'README.md']);
});

test('[was-red] a web page that merely displays the requested filenames does not satisfy the contract', () => {
  const vfs = {
    'index.html': {
      content: '<html><body><h1>3-File Utility</h1><pre>parser.py cleaner.py README.md</pre></body></html>',
    },
  };
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py', 'cleaner.py', 'README.md']);
});

test('the requested files themselves satisfy the contract; extra preview files neither help nor hurt', () => {
  const vfs = {
    'parser.py': { content: 'class Parser: pass' },
    'cleaner.py': { content: 'class Cleaner: pass' },
    'README.md': { content: '# Pipeline' },
    'index.html': { content: '<html><body>Optional preview companion</body></html>' },
  };
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), []);
});

test('ordinary source discussion does not silently become a deliverables contract', () => {
  for (const prompt of [
    'Why does parser.py import cleaner.py?',
    'Explain parser.py and README.md to me.',
    'Do not modify parser.py or cleaner.py.',
    'The error is in parser.py.',
  ]) {
    assert.deepEqual(requestedDeliverablePaths(prompt), [], prompt);
  }
});

test('explicit multi-file creation works beyond Python without trying to infer architecture', () => {
  assert.deepEqual(
    requestedDeliverablePaths('Create these files named src/index.ts, src/types.ts and README.md for the utility.'),
    ['src/index.ts', 'src/types.ts', 'README.md'],
  );
});

test('paths are bounded to the project and unsafe traversal is never a requested deliverable', () => {
  assert.equal(normalizeRequestedDeliverablePath('./src/app.py'), 'src/app.py');
  assert.equal(normalizeRequestedDeliverablePath('../secret.py'), '');
  assert.equal(normalizeRequestedDeliverablePath('https://example.com/a.py'), '');
});
