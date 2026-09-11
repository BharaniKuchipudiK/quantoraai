import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isPythonRuntimeCommand, parsePythonRuntimeCommand, tokenizeDeskCommand } from './python-runtime-command.js';

test('Python scripts, unittest and pytest are parsed without invoking a shell', () => {
  assert.deepEqual(parsePythonRuntimeCommand('python3 parser.py "sample data.csv"'), {
    ok: true, kind: 'script', path: 'parser.py', args: ['sample data.csv'], packages: [],
  });
  assert.deepEqual(parsePythonRuntimeCommand('python -m unittest discover -v'), {
    ok: true, kind: 'module', module: 'unittest', args: ['discover', '-v'], packages: [],
  });
  assert.deepEqual(parsePythonRuntimeCommand('pytest -q'), {
    ok: true, kind: 'module', module: 'pytest', args: ['-q'], packages: ['pytest'],
  });
});

test('Python runtime rejects shell paths, arbitrary modules and malformed quoting', () => {
  assert.equal(parsePythonRuntimeCommand('python3 ../secret.py').ok, false);
  assert.equal(parsePythonRuntimeCommand('python -m http.server').ok, false);
  assert.equal(tokenizeDeskCommand('python3 "open.py').ok, false);
  assert.equal(isPythonRuntimeCommand('npm test'), false);
  assert.equal(isPythonRuntimeCommand('python3 app.py'), true);
});

test('Python execution is ephemeral, bounded and locked away from page/network capabilities', () => {
  const runtime = readFileSync(new URL('./python-runtime.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('./python-runtime.worker.js', import.meta.url), 'utf8');
  assert.match(runtime, /One worker per command[\s\S]+new Worker\(/);
  assert.match(runtime, /PYTHON_MAX_FILES = 200/);
  assert.match(runtime, /PYTHON_MAX_WORKSPACE_BYTES = 2 \* 1024 \* 1024/);
  for (const capability of ['fetch', 'postMessage', 'close', 'WebSocket', 'XMLHttpRequest', 'indexedDB']) {
    assert.match(worker, new RegExp(`['"]${capability}['"]`), `${capability} must be removed before generated code runs`);
  }
  assert.match(worker, /credentials: 'omit'/);
  assert.match(worker, /lockGeneratedCodeAwayFromBrowserCapabilities\(\);[\s\S]+runPythonAsync/);
});
