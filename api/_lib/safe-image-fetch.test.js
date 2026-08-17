import test from 'node:test';
import assert from 'node:assert/strict';
import { isDisallowedImageHostname, isPrivateOrSpecialIp, resolvePublicImageTarget } from './safe-image-fetch.js';

test('blocks private, loopback, link-local and reserved IPv4 ranges', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.10.1', '172.31.255.254', '192.168.1.20', '198.18.0.1',
    '224.0.0.1', '255.255.255.255',
  ]) {
    assert.equal(isPrivateOrSpecialIp(address), true, address);
  }
  assert.equal(isPrivateOrSpecialIp('8.8.8.8'), false);
  assert.equal(isPrivateOrSpecialIp('1.1.1.1'), false);
});

test('blocks private/special IPv6 and mapped loopback addresses', () => {
  assert.equal(isPrivateOrSpecialIp('::1'), true);
  assert.equal(isPrivateOrSpecialIp('fd00::1'), true);
  assert.equal(isPrivateOrSpecialIp('fe80::1'), true);
  assert.equal(isPrivateOrSpecialIp('ff02::1'), true);
  assert.equal(isPrivateOrSpecialIp('2001:db8::1'), true);
  assert.equal(isPrivateOrSpecialIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrSpecialIp('2606:4700:4700::1111'), false);
});

test('blocks local and internal hostname conventions', () => {
  for (const hostname of ['localhost', 'app.localhost', 'printer.local', 'service.internal', 'router.home.arpa', 'metadata.google.internal']) {
    assert.equal(isDisallowedImageHostname(hostname), true, hostname);
  }
  assert.equal(isDisallowedImageHostname('images.example.com'), false);
});

test('rejects unsafe URL schemes, credentials and ports before network access', async () => {
  await assert.rejects(() => resolvePublicImageTarget('http://example.com/a.png'), /HTTPS/);
  await assert.rejects(() => resolvePublicImageTarget('https://user:pass@example.com/a.png'), /credentials/);
  await assert.rejects(() => resolvePublicImageTarget('https://example.com:8443/a.png'), /standard HTTPS port/);
  await assert.rejects(() => resolvePublicImageTarget('https://127.0.0.1/a.png'), /private or reserved/);
  await assert.rejects(() => resolvePublicImageTarget('https://169.254.169.254/latest/meta-data'), /private or reserved/);
});
