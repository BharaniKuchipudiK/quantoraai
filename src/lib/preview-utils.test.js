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
  decidePreviewTrustStatus,
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
  assert.match(out, /kind:'shop-probe'/);
  assert.match(out, /photoCount: photoCount/);
  assert.match(out, /uniquePhotoCount: uniquePhotoCount/);
  assert.match(out, /hasCurrency: hasCurrency/);
  assert.match(out, /hasCalculatorDisplay/);
  assert.match(out, /hasCalculatorKey/);
  assert.match(out, /catalogCount: catalogCount/);
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

test('font and other stylesheet misses are styling problems, not a rewrite loop', () => {
  assert.equal(
    isCriticalResourceError('Failed to load LINK: https://fonts.googleapis.com/css2?family=Cormorant'),
    true,
  );
});

test('opaque-origin catalog fetch failures do not count as a crash', () => {
  assert.equal(
    isIgnorableRuntimeError('Unhandled promise rejection: Failed to fetch'),
    true,
  );
  assert.equal(
    isIgnorableRuntimeError('Unhandled promise rejection: TypeError: Failed to fetch'),
    true,
  );
});

test('inlines products.json fetch so the boutique catalog can run without a server', () => {
  const html = `<!DOCTYPE html><html><head></head><body>
<script>fetch('products.json').then((r)=>r.json()).then((items)=>{window.__catalog=items})</script>
</body></html>`;
  const prepared = prepareCodeForPreview(html, {
    'products.json': { content: '[{"id":"a","name":"Dharmavaram"}]' },
  });
  assert.match(prepared, /Promise\.resolve\(new Response\(/);
  assert.match(prepared, /Dharmavaram/);
  assert.doesNotMatch(prepared, /fetch\('products\.json'\)/);
});

test('inlines relative VFS SVG imgs so opaque Preview can paint them', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#111"/></svg>';
  const html = `<!DOCTYPE html><html><body>
<img src="foxwolf_1.svg" alt="Fox">
<img src="./assets/foxwolf_2.svg" alt="Wolf">
</body></html>`;
  const prepared = prepareCodeForPreview(html, {
    'foxwolf_1.svg': { content: svg },
    'assets/foxwolf_2.svg': { content: svg },
  });
  assert.match(prepared, /data:image\/svg\+xml/);
  assert.doesNotMatch(prepared, /src="foxwolf_1\.svg"/);
  assert.doesNotMatch(prepared, /src="\.\/assets\/foxwolf_2\.svg"/);
});

test('rewrites relative products.json image paths to data URIs when inlining', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#222"/></svg>';
  const html = `<!DOCTYPE html><html><body>
<script>fetch('products.json').then((r)=>r.json()).then((items)=>{window.__catalog=items})</script>
</body></html>`;
  const prepared = prepareCodeForPreview(html, {
    'foxwolf_1.svg': { content: svg },
    'products.json': { content: '[{"id":"a","name":"Fox","image":"foxwolf_1.svg"}]' },
  });
  assert.match(prepared, /data:image\/svg\+xml/);
  assert.doesNotMatch(prepared, /"image":"foxwolf_1\.svg"/);
});

test('embed shell posts embed-ready more than once', () => {
  assert.match(PREVIEW_EMBED_SHELL_HTML, /setTimeout\(signalReady/);
});

test('path embed URL can cache-bust remounts', async () => {
  const { getPreviewEmbedPathUrl, canUseBlobPreviewEmbed, isPreviewEmbedFrameSrc } = await import('./preview-utils.js');
  assert.equal(getPreviewEmbedPathUrl(), '/preview/embed.html');
  assert.match(getPreviewEmbedPathUrl('3-0'), /\?r=3-0$/);
  assert.equal(typeof canUseBlobPreviewEmbed(), 'boolean');
  assert.equal(isPreviewEmbedFrameSrc('https://quantoraai.app/preview/embed.html?r=1'), true);
  assert.equal(isPreviewEmbedFrameSrc('blob:https://quantoraai.app/abc'), true);
  assert.equal(isPreviewEmbedFrameSrc('https://quantoraai.app/'), false);
  assert.equal(isPreviewEmbedFrameSrc('https://quantoraai.app/desk'), false);
});

test('harness strips base/refresh that yank the iframe onto the SPA', async () => {
  const { injectPreviewHarness, buildPreviewSrcDoc, isHtmlPreviewDocument } = await import('./preview-utils.js');
  const out = injectPreviewHarness(`<!DOCTYPE html><html><head>
<base href="https://quantoraai.app/">
<meta http-equiv="refresh" content="0;url=/">
</head><body><h1>Shop</h1><a href="/">Home</a><a href=/>Root</a>
<form action="/"><button type="submit">Go</button></form>
<form action=/><button type="submit">Bare</button></form>
<script>location.href='/'</script></body></html>`);
  assert.doesNotMatch(out, /<base\s+href=/i);
  assert.doesNotMatch(out, /http-equiv=["']?refresh/i);
  assert.doesNotMatch(out, /<a\s+href=["']\/["']/i);
  assert.doesNotMatch(out, /href=\/(?=[\s>])/i);
  assert.doesNotMatch(out, /action=["']\/["']/i);
  assert.doesNotMatch(out, /action=\/(?=[\s>])/i);
  assert.doesNotMatch(out, /<script>location\.href\s*=\s*['"]\/['"]/i);
  assert.match(out, /Preview blocked navigation/);
  assert.match(out, /Object\.defineProperty\(window\.location, 'href'/);
  assert.match(out, /preview-alive/);
  assert.doesNotMatch(out, /kind:'preview-escape'/);
  assert.match(out, /Preview blocked form navigation/);
  assert.equal(isHtmlPreviewDocument('<!DOCTYPE html><html><body>x</body></html>'), true);
  assert.equal(isHtmlPreviewDocument('export default function App(){return 1}'), false);
  const srcDoc = buildPreviewSrcDoc('<!DOCTYPE html><html><head></head><body><h1>Hi</h1></body></html>');
  assert.match(srcDoc, /Content-Security-Policy/);
  assert.match(srcDoc, /<h1>Hi<\/h1>/);
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

test('a React routing error page is never trusted as a clean preview', () => {
  const prepared = prepareCodeForPreview("import React from 'react'; export default function App(){return <main/>}", {});
  assert.equal(assembledPreviewHasUsableCss(prepared), false);
  assert.equal(decidePreviewTrustStatus({ assembledHtml: prepared }), 'failed');
});

test('a CSS patch is never trusted as a clean preview', () => {
  const prepared = prepareCodeForPreview('<<<<\n.key{color:red}\n====\n.key{color:blue}\n>>>>', {});
  assert.equal(decidePreviewTrustStatus({ assembledHtml: prepared }), 'failed');
});

test('unstyled assembled HTML is degraded, not clean', () => {
  const html = '<!DOCTYPE html><html><body><button>7</button></body></html>';
  assert.equal(decidePreviewTrustStatus({ assembledHtml: html }), 'degraded');
});
