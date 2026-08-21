import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembledPreviewHasUsableCss,
  buildPreviewSandbox,
  injectPreviewHarness,
  isCriticalResourceError,
  isIgnorableRuntimeError,
  PREVIEW_EMBED_SHELL_HTML,
  PREVIEW_TAILWIND_PROBE_ID,
  pickPreviewEntry,
  prepareCodeForPreview,
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

test('inlines styles.css and script.js so split-file calculators render in an opaque iframe', () => {
  const html = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
</head><body>
<div class="display">0</div>
<button class="key">7</button>
<script src="script.js"></script>
</body></html>`;
  const prepared = prepareCodeForPreview(html, {
    'styles.css': { content: '.key{display:grid;border-radius:40px;background:#1c1c1e;color:#fff}' },
    'script.js': { content: 'console.log("ready")' },
  });
  assert.match(prepared, /id="vfs-styles"/);
  assert.match(prepared, /\.key\{display:grid/);
  assert.match(prepared, /console\.log\("ready"\)/);
  assert.doesNotMatch(prepared, /href="styles\.css"/);
  assert.doesNotMatch(prepared, /src="script\.js"/);
  assert.match(prepared, /fonts\.googleapis\.com/);
  assert.equal(assembledPreviewHasUsableCss(html), false);
  assert.equal(assembledPreviewHasUsableCss(prepared), true);
});

test('appends unlinked script.js so calculator logic still runs', () => {
  const html = '<!DOCTYPE html><html><head></head><body><button>7</button></body></html>';
  const prepared = prepareCodeForPreview(html, {
    'script.js': { content: 'window.__calcReady = true;' },
  });
  assert.match(prepared, /window\.__calcReady = true;/);
});

test('preview entry prefers index.html over sibling CSS/JS files', () => {
  assert.match(pickPreviewEntry({
    'styles.css': { content: 'body{color:red}' },
    'script.js': { content: 'void 0' },
    'index.html': { content: '<!DOCTYPE html><html><body>ok</body></html>' },
  }), /<!DOCTYPE html>/);
});

test('preserves self-contained Office/V2 slide CSS through preview preparation and harness injection', () => {
  const html = '<!DOCTYPE html><html><head><style>.slide{aspect-ratio:16/9;background:#0B1F33}.kpi{font-weight:700}</style></head><body><section class="slide"><div class="kpi">99%</div></section></body></html>';
  const prepared = prepareCodeForPreview(html, {});
  const harnessed = injectPreviewHarness(prepared);
  assert.match(harnessed, /\.slide\{aspect-ratio:16\/9;background:#0B1F33\}/);
  assert.match(harnessed, /\.kpi\{font-weight:700\}/);
  assert.match(harnessed, /<section class="slide">/);
});

test('does not dump CSS patches into the iframe body', () => {
  const dump = '<<<<\n.key{color:red}\n====\n.key{color:blue}\n>>>>';
  const prepared = prepareCodeForPreview(dump, {});
  assert.match(prepared, /Preview needs a complete HTML page/);
  assert.doesNotMatch(prepared, /<<<</);
});

test('React source is never converted by deleting imports in the iframe fallback', () => {
  const react = "import React from 'react'; import { Plus } from 'lucide-react'; export default function App(){return <Plus/>}";
  const prepared = prepareCodeForPreview(react, {});
  assert.match(prepared, /React preview routing error/);
  assert.match(prepared, /Quantora project runtime/);
  assert.doesNotMatch(prepared, /unpkg\.com\/react/);
  assert.doesNotMatch(prepared, /text\/babel/);
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
