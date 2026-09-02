import test from 'node:test';
import assert from 'node:assert/strict';
import { getDesktopBridge } from './desktop-bridge.js';
import { DESKTOP_BRIDGE_KEY, DESKTOP_BRIDGE_VERSION } from '../../shared/desktop-bridge-contract.js';

function fullBridge(overrides = {}) {
  return {
    version: DESKTOP_BRIDGE_VERSION,
    host: () => {},
    auth: { status: () => {}, signIn: () => {}, signOut: () => {}, onChanged: () => {} },
    openExternal: () => {},
    ...overrides,
  };
}

test('the website has no bridge', () => {
  assert.equal(getDesktopBridge({}), null);
  assert.equal(getDesktopBridge(undefined), null);
});

test('a bridge of the expected shape and version is recognised', () => {
  const bridge = fullBridge();
  assert.equal(getDesktopBridge({ [DESKTOP_BRIDGE_KEY]: bridge }), bridge);
});

test('a version mismatch or a missing method is treated as no bridge, never as a partial one', () => {
  assert.equal(getDesktopBridge({ [DESKTOP_BRIDGE_KEY]: fullBridge({ version: DESKTOP_BRIDGE_VERSION + 1 }) }), null);
  const missingSignOut = fullBridge();
  delete missingSignOut.auth.signOut;
  assert.equal(getDesktopBridge({ [DESKTOP_BRIDGE_KEY]: missingSignOut }), null);
  assert.equal(getDesktopBridge({ [DESKTOP_BRIDGE_KEY]: 'not-an-object' }), null);
});
