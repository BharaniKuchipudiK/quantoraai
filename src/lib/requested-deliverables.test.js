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

test('sentence punctuation after the final filename does not erase that deliverable', () => {
  assert.deepEqual(
    requestedDeliverablePaths('Create two files: broken.py and README.md.'),
    ['broken.py', 'README.md'],
  );
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

function pythonFiles() {
  return {
    'parser.py': { content: 'def parse(rows):\n    return list(rows)\n' },
    'cleaner.py': { content: 'def clean(rows):\n    return [row for row in rows if row is not None]\n' },
    'README.md': { content: '# Pipeline\nRun with Python 3.\n' },
  };
}

for (const [label, entry] of [
  ['null', null],
  ['undefined', undefined],
  ['boolean', false],
  ['number', 7],
  ['filename-only object', { language: 'python' }],
  ['non-text content', { content: 7 }],
  ['null content', { content: null }],
  ['code field instead of file content', { code: 'def parse(rows): return rows' }],
]) {
  test(`[was-red] Python deliverables reject ${label}, not merely count its filename`, () => {
    const vfs = pythonFiles();
    vfs['parser.py'] = entry;
    assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py']);
  });
}

for (const [label, source] of [
  ['doctype document', '<!DOCTYPE html><html><body><pre>def parse(): pass</pre></body></html>'],
  ['HTML root', '<html lang="en"><body>Python utility</body></html>'],
  ['BOM and whitespace', '\uFEFF \n<!doctype html><html><body>Python utility</body></html>'],
  ['leading HTML comment', '<!-- Generated utility -->\n<!doctype html><html><body>Code panel</body></html>'],
]) {
  test(`[was-red] ${label} saved as parser.py is not a Python source deliverable`, () => {
    const vfs = pythonFiles();
    vfs['parser.py'] = { content: source };
    vfs['index.html'] = { content: '<html><body>Working companion</body></html>' };
    assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py']);
  });
}

test('[was-red] a README entry without text is not a delivered file', () => {
  const vfs = pythonFiles();
  vfs['README.md'] = {};
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['README.md']);
});

test('explicitly requested empty Python scaffolds remain files, not verified implementations', () => {
  const prompt = 'Create a 3-file Python utility scaffold (parser.py, cleaner.py and README.md), leaving all files empty.';
  assert.deepEqual(missingRequestedDeliverables(prompt, {
    'parser.py': { content: '' }, 'cleaner.py': '', 'README.md': { content: ' \n' },
  }), []);
});

test('Python source containing HTML or Excel XML strings remains a source file', () => {
  const vfs = pythonFiles();
  vfs['parser.py'] = { content: '"""<!DOCTYPE html><html>Example</html>"""\ndef parse(rows):\n    return rows\n' };
  vfs['cleaner.py'] = { content: '# <html> is documentation, not the source format\nWORKBOOK = "<Workbook><Worksheet /></Workbook>"\n' };
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), []);
});

test('plain-text VFS entries and normalized paths retain their existing support', () => {
  const vfs = Object.fromEntries(Object.entries(pythonFiles()).map(([path, entry]) => [`./${path}`, entry.content]));
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), []);
});

test('an intentionally empty Python package initializer is still a real file', () => {
  const prompt = 'Create a 3-file Python utility (pipeline/__init__.py, pipeline/parser.py and README.md).';
  const vfs = {
    'pipeline/__init__.py': { content: '' },
    'pipeline/parser.py': { content: 'def parse(rows): return rows\n' },
    'README.md': { content: '# Package\n' },
  };
  assert.deepEqual(missingRequestedDeliverables(prompt, vfs), []);
  // Empty is a real initializer; an absent content field is not a file.
  vfs['pipeline/__init__.py'] = {};
  assert.deepEqual(missingRequestedDeliverables(prompt, vfs), ['pipeline/__init__.py']);
});

test('the first source-content guard does not change website or React file contracts', () => {
  for (const [prompt, vfs] of [
    ['Create a 3-file website (index.html, styles.css and script.js).', {
      'index.html': { content: '<html><body>Existing site</body></html>' },
      'styles.css': { content: '' }, 'script.js': { content: '' },
    }],
    ['Create a 3-file React project (src/App.jsx, src/main.jsx and package.json).', {
      'src/App.jsx': { content: 'export default function App() { return <main>Working</main>; }' },
      'src/main.jsx': { content: 'import App from "./App.jsx";' },
      'package.json': { content: '{"dependencies":{"react":"^18.2.0"}}' },
    }],
  ]) {
    assert.deepEqual(missingRequestedDeliverables(prompt, vfs), []);
    const first = Object.keys(vfs)[0];
    delete vfs[first];
    assert.deepEqual(missingRequestedDeliverables(prompt, vfs), [first]);
  }
});

test('source inspection never rewrites a file, drops the working preview, or certifies execution', () => {
  const vfs = pythonFiles();
  vfs['parser.py'] = { content: '<html><body>Wrong format</body></html>' };
  vfs['index.html'] = { content: '<html><body>Previous working preview</body></html>' };
  for (const entry of Object.values(vfs)) Object.freeze(entry);
  Object.freeze(vfs);
  const before = JSON.stringify(vfs);
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py']);
  assert.equal(JSON.stringify(vfs), before);
  // This contract does not parse Python or attest that a supplied program ran.
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, {
    ...pythonFiles(), 'parser.py': { content: 'not valid Python syntax' },
  }), []);
});


test('leading model-controlled HTML comments are bounded and cannot conceal a document', () => {
  const vfs = pythonFiles();
  vfs['parser.py'] = { content: '<!-- note -->\n'.repeat(5000) + '<html><body>Not Python</body></html>' };
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py']);
  vfs['parser.py'] = { content: '<!-- unfinished HTML comment' };
  assert.deepEqual(missingRequestedDeliverables(PYTHON_ASK, vfs), ['parser.py']);
});
