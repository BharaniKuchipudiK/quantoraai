import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_MODAL_Z_INDEX,
  authGoogleWellStyle,
  authModalCardStyle,
  authModalOverlayStyle,
} from './auth-modal-styles.js';

test('auth modal sits above landing chrome and does not inherit blend filters', () => {
  const overlay = authModalOverlayStyle();
  assert.equal(overlay.zIndex >= 10000, true);
  assert.equal(overlay.isolation, 'isolate');
  assert.equal(overlay.mixBlendMode, 'normal');
  assert.equal(AUTH_MODAL_Z_INDEX, overlay.zIndex);

  const dark = authModalCardStyle(false);
  assert.equal(dark.background, '#111827');
  assert.equal(dark.color, '#ffffff');
  assert.equal(dark.isolation, 'isolate');

  const light = authModalCardStyle(true);
  assert.equal(light.background, '#ffffff');
  assert.equal(light.color, '#0f172a');
});

test('Google button sits on a light well so the iframe stays visible', () => {
  const well = authGoogleWellStyle();
  assert.equal(well.background, '#ffffff');
  assert.equal(well.colorScheme, 'light');
});
