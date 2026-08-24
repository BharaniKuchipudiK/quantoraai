#!/usr/bin/env node
/**
 * Start-with-10 / Fox & Wolf shop must reach a Preview-ready HTML document with
 * ≥1 loadable img (data-URI) within a tight bound — not hang on “getting ready”
 * while Review already shows foxwolf_*.svg files.
 *
 * Also: job card must stay a shop (not “Start with 10 / The page still runs”),
 * and the embed shell must re-signal embed-ready so assembly churn cannot leave
 * the parent waiting forever.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildStudioJobCard } from '../src/lib/studio-job-card.js';
import { ensureShopDeskInVfs } from '../src/lib/studio-preview-helpers.js';
import {
  PREVIEW_EMBED_SHELL_HTML,
  prepareCodeForPreview,
  injectPreviewHarness,
} from '../src/lib/preview-utils.js';
import { countRealPreviewPhotos } from '../src/lib/preview-images.js';
import { expandShopIntakeAccept } from '../src/lib/shop-catalog-scale.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATH_EMBED_HTML = readFileSync(join(HERE, '../public/preview/embed.html'), 'utf8');

const FOX_BRIEF = 'Build Fox & Wolf kids merchandise shop with 100 unique design images and a full website.';
const SAMPLE_SVG = (n) => (
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">`
  + `<rect width="120" height="80" fill="#${(n * 37).toString(16).padStart(6, '0').slice(0, 6)}"/>`
  + `<text x="60" y="44" text-anchor="middle" fill="#fff" font-size="14">foxwolf_${n}</text>`
  + `</svg>`
);

const SHELL = `<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head>
<body>
<header><nav>Home · Shop · About</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="background:#fff;min-height:40vh">
  <div class="product-card"><img src="foxwolf_1.svg" alt="Design 1"><button type="button">Add to Cart</button></div>
  <div class="product-card"><img src="foxwolf_2.svg" alt="Design 2"><button type="button">Add to Cart</button></div>
  <div class="product-card"><img src="foxwolf_3.svg" alt="Design 3"><button type="button">Add to Cart</button></div>
</main>
<footer>© Fox & Wolf</footer>
</body></html>`;

function buildStartWith10Vfs() {
  const vfs = {
    'index.html': { content: SHELL, language: 'html' },
  };
  for (let i = 1; i <= 10; i += 1) {
    vfs[`foxwolf_${i}.svg`] = { content: SAMPLE_SVG(i), language: 'svg' };
  }
  return vfs;
}

const intake = expandShopIntakeAccept('Start with 10', [FOX_BRIEF]);
assert.equal(intake.expanded, true, 'Start with 10 must expand against the oversize brief');

const job = buildStudioJobCard({
  brief: 'Start with 10',
  existing: buildStudioJobCard({ brief: FOX_BRIEF }),
  vfs: buildStartWith10Vfs(),
});
assert.equal(job.purpose, 'A shop website');
assert.equal(job.mustWork.includes('The page still runs'), false);

const ensured = ensureShopDeskInVfs(buildStartWith10Vfs(), job, { brief: intake.text });
assert.equal(ensured.changed || Boolean(ensured.vfs['index.html']), true);
const html = ensured.vfs['index.html'].content;
const prepared = prepareCodeForPreview(html, ensured.vfs);
assert.ok(countRealPreviewPhotos(prepared) >= 1, 'prepared Preview needs ≥1 reliable photo');
assert.match(prepared, /data:image\/svg\+xml/, 'VFS SVGs must be wired as data-URIs');
assert.doesNotMatch(prepared, /src="foxwolf_\d+\.svg"/, 'relative SVG srcs must not survive prepare');
assert.match(PREVIEW_EMBED_SHELL_HTML, /setTimeout\(signalReady/, 'shell must re-post embed-ready');
assert.match(PATH_EMBED_HTML, /setTimeout\(signalReady/, 'path embed shell must re-post embed-ready');

const READY_MS = 12_000;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const started = Date.now();
  await page.setContent(`<!DOCTYPE html><html><body>
<iframe id="f" sandbox="allow-scripts allow-same-origin"></iframe>
<script>
  window.__embedReady = false;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__quantora === true && e.data.kind === 'embed-ready') {
      window.__embedReady = true;
    }
  });
</script>
</body></html>`);

  // Assign srcdoc from Node — never embed raw shell HTML inside a <script> tag
  // (a literal </script> in the shell would terminate the parent script).
  await page.locator('#f').evaluate((iframe, shell) => {
    iframe.srcdoc = shell;
  }, PREVIEW_EMBED_SHELL_HTML);

  await page.waitForFunction(() => window.__embedReady === true, null, { timeout: READY_MS });
  const embedMs = Date.now() - started;

  await page.evaluate((harnessed) => {
    const iframe = document.getElementById('f');
    iframe.contentWindow.postMessage({ __quantoraPreviewHtml: harnessed }, '*');
  }, injectPreviewHarness(prepared));

  await page.waitForFunction(() => {
    const doc = document.getElementById('f')?.contentDocument;
    if (!doc) return false;
    return Array.from(doc.querySelectorAll('img')).some((img) => img.naturalWidth > 0);
  }, null, { timeout: READY_MS });

  const imgStats = await page.evaluate(() => {
    const doc = document.getElementById('f')?.contentDocument;
    if (!doc) return [];
    return Array.from(doc.querySelectorAll('img')).map((img) => ({
      src: (img.getAttribute('src') || '').slice(0, 48),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    }));
  });
  const painted = imgStats.filter((row) => row.naturalWidth > 0);
  assert.ok(painted.length >= 1, `need ≥1 painted img; got ${JSON.stringify(imgStats.slice(0, 5))}`);
  assert.ok(Date.now() - started < READY_MS, 'whole Start-with-10 Preview path must finish inside the ready bound');
  console.log(
    `Preview-ready gate passed in ${Date.now() - started}ms (embed-ready ${embedMs}ms) — `
    + `${painted.length} painted img(s), ${countRealPreviewPhotos(prepared)} reliable src(s), job=${job.purpose}.`,
  );
} finally {
  await browser.close();
}
