import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { signingPolicy, desktopBuildConfig } = require('./signing-policy.cjs');

/*
 * Two failures this closes, both of which cost a whole release run to find:
 *
 *   1. Demanding a credential that is not there. `notarize: true` with no
 *      Apple account fails at the last step of a twenty-minute job, or worse,
 *      silently produces something that cannot be opened.
 *   2. Shipping unsigned when signing was configured. A release that quietly
 *      drops the certificate is a release every user is told is damaged.
 *
 * So both directions are asserted, per CLAUDE.md §2: the gate has to fail in
 * the state it exists to catch, not merely pass in the happy one.
 */

const DEVELOPER_ID = { CSC_LINK: 'base64-cert', CSC_KEY_PASSWORD: 'pw' };
const APPLE_ACCOUNT = {
  APPLE_ID: 'dev@quantoraai.app',
  APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop',
  APPLE_TEAM_ID: 'TEAM123456',
};

test('with no credentials the build is unsigned on purpose, and never asks Apple for anything', () => {
  const policy = signingPolicy({});
  assert.deepEqual(policy, { macSign: false, macNotarize: false, winSign: false });

  const config = desktopBuildConfig({});
  assert.equal(config.mac.identity, null, 'signing is skipped explicitly, not by accident');
  assert.equal(config.mac.hardenedRuntime, false);
  assert.equal(config.mac.notarize, false, 'notarising an unsigned app is impossible; never ask');
});

test('a Developer ID certificate turns on signing and the hardened runtime', () => {
  const config = desktopBuildConfig({ ...DEVELOPER_ID });
  assert.equal(config.mac.hardenedRuntime, true, 'notarisation later requires it');
  assert.equal(config.mac.entitlements, 'build/entitlements.mac.plist');
  assert.ok(!('identity' in config.mac), 'the certificate must not be overridden by a skip');
});

test('notarisation waits for the whole Apple account, not just the certificate', () => {
  assert.equal(signingPolicy({ ...DEVELOPER_ID }).macNotarize, false);
  assert.equal(signingPolicy({ ...DEVELOPER_ID, ...APPLE_ACCOUNT }).macNotarize, true);
  // Credentials without a certificate cannot notarise either.
  assert.equal(signingPolicy({ ...APPLE_ACCOUNT }).macNotarize, false);
  for (const missing of Object.keys(APPLE_ACCOUNT)) {
    const partial = { ...DEVELOPER_ID, ...APPLE_ACCOUNT, [missing]: '' };
    assert.equal(signingPolicy(partial).macNotarize, false, `${missing} is required`);
  }
});

test('blank and whitespace-only secrets count as absent', () => {
  // An unset GitHub secret interpolates to an empty string, not undefined.
  assert.equal(signingPolicy({ CSC_LINK: '' }).macSign, false);
  assert.equal(signingPolicy({ CSC_LINK: '   ' }).macSign, false);
  assert.equal(signingPolicy({ WIN_CSC_LINK: '' }).winSign, false);
  assert.equal(signingPolicy({ WIN_CSC_LINK: 'cert' }).winSign, true);
});

test('every platform is given the generated icon, and the deep-link scheme survives', () => {
  const config = desktopBuildConfig({});
  assert.equal(config.mac.icon, 'build/icon.png');
  assert.equal(config.win.icon, 'build/icon.png');
  assert.equal(config.linux.icon, 'build/icon.png');
  // Sign-in comes back through quantora://auth/callback; losing this
  // registration breaks the handoff on a packaged build only.
  assert.deepEqual(config.protocols, [{ name: 'Quantora', schemes: ['quantora'] }]);
  assert.deepEqual(config.asarUnpack, ['**/node_modules/node-pty/**']);
});
