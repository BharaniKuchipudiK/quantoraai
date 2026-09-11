import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProofEvidence, proofFailureCopy } from './proof-control-plane.js';

const brief = 'Write a 3-file Python utility (parser.py, cleaner.py and README.md).';
const plan = { isCodingTurn: true, mode: 'execute', intent: { kind: 'app_build' }, displayUserText: brief };

function files() {
  return {
    'parser.py': { content: 'def parse(rows): return list(rows)\n' },
    'cleaner.py': { content: 'def clean(rows): return [row for row in rows if row]\n' },
    'README.md': { content: '# Utility\n' },
    'index.html': { content: '<!DOCTYPE html><html><body><h1>Optional companion</h1></body></html>' },
  };
}

for (const [label, entry] of [
  ['missing source payload', { language: 'python' }],
  ['HTML masquerading as Python', { content: '<html><body><pre>Python code here</pre></body></html>' }],
]) {
  test(`[was-red] actual proof evaluator rejects ${label} even with a running companion`, () => {
    const vfs = files();
    vfs['parser.py'] = entry;
    const before = JSON.stringify(vfs);
    const result = evaluateProofEvidence(plan, { vfs, brief, embedReady: true });
    assert.equal(result.evidence.hasHtml, true);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingDeliverables, ['parser.py']);
    assert.deepEqual(result.gaps, [
      'requested deliverable parser.py',
      'Python execution verification not run',
    ]);
    assert.equal(JSON.stringify(vfs), before);
  });
}

test('valid source files plus a companion still require Python execution evidence', () => {
  const result = evaluateProofEvidence(plan, { vfs: files(), brief, embedReady: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingDeliverables, []);
  assert.deepEqual(result.gaps, ['Python execution verification not run']);
});

test('source availability does not invent Python execution', () => {
  const vfs = files();
  delete vfs['index.html'];
  const result = evaluateProofEvidence(plan, { vfs, brief });
  assert.deepEqual(result.missingDeliverables, []);
  assert.equal(result.evidence.hasHtml, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps, [
    'runnable Preview (HTML or React VFS)',
    'Python execution verification not run',
  ]);
});

test('real Python execution evidence replaces the irrelevant browser Preview requirement', () => {
  const vfs = files();
  delete vfs['index.html'];
  const runtimeEvidence = {
    ok: true,
    runtime: 'Python 3.14 (Pyodide)',
    level: 'syntax',
    command: 'python -m py_compile parser.py cleaner.py',
    files: ['parser.py', 'cleaner.py'],
  };
  const result = evaluateProofEvidence(plan, { vfs, brief, runtimeEvidence });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.hasHtml, false);
  assert.equal(result.evidence.python, runtimeEvidence);
  assert.deepEqual(result.gaps, []);
});

test('failed Python execution remains a failed proof even beside a working companion page', () => {
  const result = evaluateProofEvidence(plan, {
    vfs: files(),
    brief,
    runtimeEvidence: { ok: false, level: 'syntax', output: 'SyntaxError' },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps, ['Python execution verification failed']);
  assert.match(proofFailureCopy(result, plan), /Python proof did not pass/);
  assert.match(proofFailureCopy(result, plan), /will not call them working until Python executes successfully/);
});

test('website and React proof use the unchanged browser contract', () => {
  const html = files()['index.html'];
  for (const [request, vfs] of [
    ['Create a 3-file website (index.html, styles.css and script.js).', {
      'index.html': html, 'styles.css': { content: '' }, 'script.js': { content: '' },
    }],
    ['Create a 3-file React project (src/App.jsx, src/main.jsx and package.json).', {
      'src/App.jsx': { content: 'export default function App() { return <main>Working</main>; }' },
      'src/main.jsx': { content: 'import App from "./App.jsx";' },
      'package.json': { content: '{"dependencies":{"react":"^18.2.0"}}' },
    }],
  ]) {
    const result = evaluateProofEvidence(plan, { vfs, brief: request, embedReady: true });
    assert.equal(result.ok, true);
    assert.equal(result.evidence.hasHtml, true);
    assert.deepEqual(result.missingDeliverables, []);
  }
});
