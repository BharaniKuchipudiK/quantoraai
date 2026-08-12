import assert from 'node:assert/strict';
import test from 'node:test';
import {
  injectPreviewHarness,
  isCriticalResourceError,
  isIgnorableRuntimeError,
  PREVIEW_EMBED_SHELL_HTML,
  PREVIEW_TAILWIND_PROBE_ID,
  usesTailwindCdn,
} from './preview-utils.js';

test('detects Tailwind CDN usage', () => {
  assert.equal(usesTailwindCdn('<script src="https://cdn.tailwindcss.com"></script>'), true);
  assert.equal(usesTailwindCdn('<style>body{color:red}</style>'), false);
});

test('injects harness into head', () => {
  const html = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';
  const out = injectPreviewHarness(html);
  assert.match(out, /__quantora:true/);
  assert.match(out, /kind:'loaded'/);
  assert.match(out, new RegExp(`id="${PREVIEW_TAILWIND_PROBE_ID}"`));
  assert.match(out, new RegExp(`getElementById\\('${PREVIEW_TAILWIND_PROBE_ID}'\\)`));
});

test('treats Tailwind script load failures as critical', () => {
  assert.equal(
    isCriticalResourceError('Failed to load SCRIPT: https://cdn.tailwindcss.com'),
    true
  );
  assert.equal(isIgnorableRuntimeError('Failed to load SCRIPT: https://cdn.tailwindcss.com'), false);
});

test('still ignores opaque script errors', () => {
  assert.equal(isIgnorableRuntimeError('Script error.'), true);
});

test('embed shell html includes relaxed csp and postMessage bridge', () => {
  assert.match(PREVIEW_EMBED_SHELL_HTML, /frame-ancestors 'self'/);
  assert.match(PREVIEW_EMBED_SHELL_HTML, /__quantoraPreviewHtml/);
});
