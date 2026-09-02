import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESKTOP_IPC, isAllowedExternalUrl } from './desktop-bridge-contract.js';

/*
 * The preload and the main process each name every channel they use. This
 * pins both to the contract so a rename in one cannot leave the other
 * answering on a channel nobody calls (the deployed-gate-contract pattern).
 */

const here = new URL('.', import.meta.url);
const preload = readFileSync(new URL('../desktop/preload/index.ts', here), 'utf8');
const ipc = readFileSync(new URL('../desktop/main/ipc.ts', here), 'utf8');

test('every IPC channel in the contract is used by both the preload and the main process', () => {
  for (const key of Object.keys(DESKTOP_IPC)) {
    assert.match(preload, new RegExp(`DESKTOP_IPC\\.${key}\\b`), `preload references DESKTOP_IPC.${key}`);
    assert.match(ipc, new RegExp(`DESKTOP_IPC\\.${key}\\b`), `main ipc references DESKTOP_IPC.${key}`);
  }
});

test('neither side names a channel by string literal outside the contract', () => {
  for (const source of [preload, ipc]) {
    assert.doesNotMatch(source, /['"]quantora:[a-z-]+:[a-z-]+['"]/, 'channel literal outside the contract');
  }
});

test('channel names are unique', () => {
  const values = Object.values(DESKTOP_IPC);
  assert.equal(new Set(values).size, values.length);
});

test('only https and mailto links may be handed to the system browser', () => {
  assert.equal(isAllowedExternalUrl('https://quantoraai.app/docs'), true);
  assert.equal(isAllowedExternalUrl('mailto:hello@quantoraai.app'), true);
  assert.equal(isAllowedExternalUrl('http://example.com'), false);
  assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedExternalUrl('quantora://auth/callback?code=x'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('not a url'), false);
});
