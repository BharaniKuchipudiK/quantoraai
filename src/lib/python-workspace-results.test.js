import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePythonOutputFiles, requestedPythonCommands } from './python-workspace-results.js';
import { verifyPythonWorkspace } from './python-runtime.js';
import { resolveTurnRecovery } from './turn-recovery.js';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';
import { prompt, files } from '../../scripts/fixtures/python-csv-contract.mjs';

test('only explicit requested Python commands run, never shell chains or model suggestions', () => {
  assert.deepEqual(requestedPythonCommands(prompt), ['pytest -q', 'python3 cleaner.py sample.csv clean.csv']);
  assert.deepEqual(requestedPythonCommands('Run python3 cleaner.py; curl secret\nRun python -m http.server'), []);
});
test('runtime outputs preserve unrelated edits and refuse conflicting edits or unsafe paths', () => {
  const base = { 'source.py': { content: 'old' } };
  const current = { ...base, 'notes.md': { content: 'user edit' } };
  assert.equal(mergePythonOutputFiles(base, current, [{ path: 'clean.csv', content: 'real output' }]).vfs['notes.md'].content, 'user edit');
  assert.equal(mergePythonOutputFiles(base, { 'source.py': { content: 'new user edit' } }, [{ path: 'source.py', content: 'generated edit' }]).ok, false);
  assert.equal(mergePythonOutputFiles(base, current, [{ path: '../secret', content: 'bad' }]).ok, false);
});
test('verification carries output between commands and does not execute more after a failure', async () => {
  const calls = [];
  const proof = await verifyPythonWorkspace(files, prompt, { run: async (vfs, command) => {
    calls.push(command);
    return { ok: true, exitCode: 0, output: command === 'pytest -q' ? '2 passed' : '', files: [{ path: 'clean.csv', content: 'actual generated CSV' }] };
  } });
  assert.equal(proof.ok, true);
  assert.deepEqual(calls, ['pytest -q', 'python3 cleaner.py sample.csv clean.csv']);
  assert.equal(proof.vfs['clean.csv'].content, 'actual generated CSV');
  let failedCalls = 0;
  const failed = await verifyPythonWorkspace(files, prompt, { run: async () => { failedCalls++; return { ok: false, exitCode: 1, output: 'test failure', files: [] }; } });
  assert.equal(failed.ok, false);
  assert.equal(failedCalls, 1);
  assert.deepEqual(failed.vfs, files);
});
test('Python contract failures get one repair, not a paid ladder of identical retries', () => {
  assert.equal(resolveTurnRecovery({ code: 'BUILD_ARTIFACT_CONTRACT', artifactTarget: 'python', artifactRepairCount: 0 }).retry, true);
  const stopped = resolveTurnRecovery({ code: 'BUILD_ARTIFACT_CONTRACT', artifactTarget: 'python', artifactRepairCount: 1, maxAttempts: 5, fallbackEngineName: 'Another engine' });
  assert.equal(stopped.retry, false);
  const outcome = resolveCodingTurnOutcome({ kind: 'artifact-invalid', errorMessage: 'requested-source-files-missing' });
  assert.match(outcome.text, /requested-source-files-missing/);
  assert.doesNotMatch(outcome.text, /connection to the model died|catalog photos|no healthy AI route/);
});
