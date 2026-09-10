import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { describeQirDurability } from './qir-durability.js';

const goal = 'Act as a Data Engineer and write a modular 3-file Python utility (parser.py, cleaner.py, and README.md).';
const completeRun = () => ({ runId: 'run-existing', status: 'COMPLETE', goal: { statement: goal } });
const pageOnly = () => ({ 'index.html': { content: '<!doctype html><html><body>parser.py cleaner.py README.md</body></html>' } });
const files = () => ({ 'parser.py': { content: 'class Parser: pass' }, 'cleaner.py': { content: 'class Cleaner: pass' }, 'README.md': { content: '# Pipeline' } });

// Execute the actual hook body with synchronous React primitives. Effects do
// not run: this tests the render-time data handoff, not a network/store stub.
const hookSource = readFileSync(new URL('../hooks/useQirCodingRun.js', import.meta.url), 'utf8')
  .replace(/^import .* from 'react';\r?\n/, '')
  .replace('export function useQirCodingRun', 'function useQirCodingRun');
function readHook(options, run, error = null) {
  let state = 0;
  const invoke = new Function('useCallback', 'useEffect', 'useRef', 'useState',
    `${hookSource}\nreturn useQirCodingRun;`);
  const hook = invoke((fn) => fn, () => {}, (current) => ({ current }),
    () => [state++ === 0 ? run : error, () => {}]);
  return hook({ enabled: true, sessionId: 'session', artifactRef: 'artifact-current', code: '<html></html>', ...options });
}

test('[was-red] the real hook-to-header path cannot certify a webpage instead of requested files', () => {
  const run = completeRun();
  const vfs = pageOnly();
  const description = describeQirDurability(readHook({ goal, vfs }, run));
  assert.equal(description.label, 'Run · INCOMPLETE');
  for (const name of ['parser.py', 'cleaner.py', 'README.md']) assert.ok(description.detail.includes(name));
  assert.ok(description.detail.includes(run.runId));
  assert.equal(description.recording, true, 'a file gap is not a fabricated storage outage');
  assert.equal(run.status, 'COMPLETE', 'historical journal snapshots are not rewritten by presentation');
  assert.deepEqual(Object.keys(vfs), ['index.html'], 'generated work remains intact');
});

test('[was-red] an acknowledgement does not erase the durable requested-file contract', () => {
  for (const followup of ['', 'Excellent work', 'Please proceed', 'Can we improve the styling?']) {
    assert.equal(describeQirDurability(readHook({ goal: followup, vfs: pageOnly() }, completeRun())).label, 'Run · INCOMPLETE');
  }
});

test('[was-red] partial delivery identifies only the missing paths', () => {
  const vfs = { ...pageOnly(), 'parser.py': { content: 'pass' } };
  const description = describeQirDurability(readHook({ goal, vfs }, completeRun()));
  assert.equal(description.label, 'Run · INCOMPLETE');
  assert.ok(description.detail.includes('cleaner.py'));
  assert.ok(description.detail.includes('README.md'));
  assert.ok(!description.detail.includes('parser.py'));
});

test('[was-red] current explicit file requirements override an unrelated historical goal', () => {
  const run = { runId: 'old-web-run', status: 'COMPLETE', goal: { statement: 'Create a website' } };
  assert.equal(describeQirDurability(readHook({ goal, vfs: pageOnly() }, run)).label, 'Run · INCOMPLETE');
});

test('a new explicit contract is not contaminated by an older contract', () => {
  const nextGoal = 'Create a 2-file utility (main.py, guide.md).';
  const nextVfs = { 'main.py': { content: 'pass' }, 'guide.md': { content: '# Guide' } };
  const description = describeQirDurability(readHook({ goal: nextGoal, vfs: nextVfs }, completeRun()));
  assert.equal(description.label, 'Run · COMPLETE');
});

test('fulfilled named files do not acquire a new warning or fabricated execution proof', () => {
  const run = completeRun();
  const description = describeQirDurability(readHook({ goal, vfs: files() }, run));
  assert.deepEqual(description, { label: 'Run · COMPLETE', detail: 'Durable Run run-existing', recording: true });
});

test('[was-red] each render checks current files, not a latched successful inventory', () => {
  const run = completeRun();
  assert.equal(describeQirDurability(readHook({ goal, vfs: files() }, run)).label, 'Run · COMPLETE');
  assert.equal(describeQirDurability(readHook({ goal, vfs: pageOnly() }, run)).label, 'Run · INCOMPLETE');
  assert.equal(describeQirDurability(readHook({ goal, vfs: files() }, run)).label, 'Run · COMPLETE');
});

test('nonterminal, paused and failed statuses retain their existing meaning', () => {
  for (const status of ['QUEUED', 'EXECUTING', 'VERIFYING', 'REPAIRING', 'REPLANNING', 'PAUSED', 'WAITING_FOR_CAPACITY', 'FAILED_TERMINAL']) {
    const description = describeQirDurability(readHook({ goal, vfs: pageOnly() }, { ...completeRun(), status }));
    assert.equal(description.label, `Run · ${status}`);
  }
});

test('ordinary website discussions do not create file delivery obligations', () => {
  const discussion = 'Explain what parser.py and cleaner.py do on this website.';
  const run = { runId: 'web-run', status: 'COMPLETE', goal: { statement: discussion } };
  assert.equal(describeQirDurability(readHook({ goal: discussion, vfs: pageOnly() }, run)).label, 'Run · COMPLETE');
});

test('path normalization is the existing requested-deliverables contract', () => {
  const vfs = { './parser.py': { content: 'pass' }, '/cleaner.py': { content: 'pass' }, 'README.md': { content: '# Guide' } };
  assert.equal(describeQirDurability(readHook({ goal, vfs }, completeRun())).label, 'Run · COMPLETE');
});

test('absent inventory remains unknown, rather than invented missing files', () => {
  for (const vfs of [undefined, null, 'not-a-vfs', []]) {
    const result = describeQirDurability(readHook({ goal, vfs }, completeRun()));
    assert.equal(result.label, 'Run · COMPLETE');
  }
});

test('existing storage warnings and absent-run semantics are preserved', () => {
  const options = { goal, vfs: pageOnly() };
  assert.equal(describeQirDurability(readHook(options, null)), null);
  assert.equal(describeQirDurability(readHook(options, null, { reason: 'storage-unconfigured' })).label, 'Run · not recording');
  assert.equal(describeQirDurability(readHook(options, null, { reason: 'persist-failed' })).label, 'Run · not saved');
});

test('[was-red] a known empty current workspace cannot certify requested files', () => {
  assert.equal(describeQirDurability(readHook({ goal, vfs: {} }, completeRun())).label, 'Run · INCOMPLETE');
});

test('legacy callers without current workspace context retain their behavior', () => {
  const result = describeQirDurability({ run: completeRun() });
  assert.equal(result.label, 'Run · COMPLETE');
});
