import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPreviewSandbox,
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

// SECURITY REGRESSION GUARD — do not weaken. Untrusted generated code runs in
// the default (no wcUrl) preview path; if it ever gains `allow-same-origin` it
// can read the app's localStorage API keys. These assertions fail the build if
// that protection is removed.
test('preview sandbox denies allow-same-origin to untrusted generated code', () => {
  const sandbox = buildPreviewSandbox({ trustedRuntimeUrl: null });
  assert.doesNotMatch(sandbox, /allow-same-origin/, 'untrusted embed must be opaque-origin');
  assert.match(sandbox, /allow-scripts/);
  // default call (no args) must be equally safe
  assert.doesNotMatch(buildPreviewSandbox(), /allow-same-origin/);
});

test('preview sandbox grants allow-same-origin only to the WebContainer runtime', () => {
  const sandbox = buildPreviewSandbox({ trustedRuntimeUrl: 'https://abc.webcontainer.io' });
  assert.match(sandbox, /allow-same-origin/, 'WebContainer needs same-origin for its own cross-origin host');
  assert.match(sandbox, /allow-scripts/);
});
