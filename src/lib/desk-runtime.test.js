import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopRuntimeBlocker, getDeskRuntime, runDesktopCommand, runDesktopGit } from './desk-runtime.js';
import { DESKTOP_BRIDGE_KEY, DESKTOP_BRIDGE_VERSION } from '../../shared/desktop-bridge-contract.js';

function fakeBridge(runtime) {
  return {
    version: DESKTOP_BRIDGE_VERSION,
    host: () => {},
    auth: { status: () => {}, signIn: () => {}, signOut: () => {}, onChanged: () => {} },
    openExternal: () => {},
    runtime: { info: () => {}, attach: () => {}, detach: () => {}, sync: () => {}, run: () => {}, git: () => {}, ...runtime },
  };
}

test('the website runs on WebContainer; the desktop on the bridge', () => {
  assert.equal(getDeskRuntime({}).kind, 'webcontainer');
  const bridge = fakeBridge();
  assert.deepEqual(getDeskRuntime({ [DESKTOP_BRIDGE_KEY]: bridge }), { kind: 'desktop', bridge });
});

test('a desktop command syncs the desk files first, then runs in the folder', async () => {
  const calls = [];
  const bridge = fakeBridge({
    sync: async (entries) => { calls.push(['sync', entries]); return { ok: true, written: entries.length }; },
    run: async (line) => { calls.push(['run', line]); return { ok: true, output: 'quantora-42', exitCode: 0 }; },
  });
  const vfs = { 'index.html': { content: '<!DOCTYPE html><html><body>x</body></html>' } };
  const result = await runDesktopCommand(bridge, vfs, 'echo quantora-42');
  assert.deepEqual(result, { ok: true, output: 'quantora-42' });
  assert.equal(calls[0][0], 'sync');
  assert.deepEqual(calls[0][1], [{ path: 'index.html', content: vfs['index.html'].content }]);
  assert.deepEqual(calls[1], ['run', 'echo quantora-42']);
});

test('a refused sync stops the command before it runs', async () => {
  let ran = false;
  const bridge = fakeBridge({
    sync: async () => ({ ok: false, error: 'Refused to sync: ../x is outside the attached folder.' }),
    run: async () => { ran = true; return { ok: true, output: 'never' }; },
  });
  const result = await runDesktopCommand(bridge, { 'a.txt': { content: 'a' } }, 'ls');
  assert.equal(result.ok, false);
  assert.match(result.output, /Refused to sync/);
  assert.equal(ran, false);
});

test('a failing command reports the exit code rather than an empty success', async () => {
  const bridge = fakeBridge({
    sync: async () => ({ ok: true, written: 1 }),
    run: async () => ({ ok: false, output: '', exitCode: 2 }),
  });
  const result = await runDesktopCommand(bridge, { 'a.txt': { content: 'a' } }, 'false');
  assert.deepEqual(result, { ok: false, output: '(exit 2)' });
});

test('desktop git syncs then forwards the action and message', async () => {
  const calls = [];
  const bridge = fakeBridge({
    sync: async () => ({ ok: true, written: 1 }),
    git: async (request) => { calls.push(request); return { ok: true, output: '[desk] first' }; },
  });
  const result = await runDesktopGit(bridge, { 'a.txt': { content: 'a' } }, { action: 'commit', message: 'first' });
  assert.deepEqual(result, { ok: true, output: '[desk] first' });
  assert.deepEqual(calls, [{ action: 'commit', message: 'first' }]);
});

test('the blocker asks for a folder only on the desktop and only until one is attached', () => {
  assert.equal(desktopRuntimeBlocker(null), '');
  assert.match(desktopRuntimeBlocker({ attached: false }), /Attach a folder/);
  assert.equal(desktopRuntimeBlocker({ attached: true }), '');
});
