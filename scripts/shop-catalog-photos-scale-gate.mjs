#!/usr/bin/env node
/**
 * Merchandise / large-catalog shop gate — HONEST contract.
 *
 * The desk shows exactly what the model built:
 *  - A shell whose product cards reference the model's OWN image files gets those
 *    wired in as Preview-loadable photos (data-URI). Real photos, model's choice.
 *  - A shell with NO images is NEVER fabricated into a stock-photo catalog: no
 *    invented products, no picsum stock photos. It stays an honest (empty) shell
 *    so the gap is visible and the model is asked to fill it — the opposite of the
 *    old "inject Statue-of-Liberty stock photos and call it done" behavior.
 */
import assert from 'node:assert/strict';
import { ensureShopDeskInVfs } from '../src/lib/studio-preview-helpers.js';
import { buildStudioJobCard } from '../src/lib/studio-job-card.js';
import { countRealPreviewPhotos, previewHtmlHasRealPhotos } from '../src/lib/preview-images.js';
import { previewHtmlHasAddToCartControl } from '../src/lib/shop-preview-ui.js';

const BRIEF = 'Build Fox & Wolf kids merchandise shop with 100 unique design images and a full website.';
const shell = (body) => `<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head>
<body>
<header><nav>Home · Shop · About</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="background:#fff;min-height:50vh">${body}</main>
<footer>© Fox & Wolf</footer>
</body></html>`;

const job = buildStudioJobCard({ brief: BRIEF });
assert.equal(job.purpose, 'A shop website');

// 1) An imageless shell (CSS gold frames, no real <img>) is NOT fabricated into a
//    stock-photo shop. No picsum, no invented products.json — an honest gap.
const bare = ensureShopDeskInVfs(
  { 'index.html': { content: shell('<div class="gold-frame" style="border:2px solid #c4a35a;height:200px"></div>'), language: 'html' } },
  job,
  { brief: BRIEF },
);
const bareHtml = bare.vfs['index.html'].content;
assert.equal(previewHtmlHasRealPhotos(bareHtml), false, 'an imageless shell must NOT be fabricated into stock photos');
assert.doesNotMatch(bareHtml, /picsum\.photos/, 'no picsum stock photos may be injected');
assert.ok(!bare.vfs['products.json'], 'no fabricated products.json for an imageless shell');

// 2) A shell whose cards reference the model's OWN image files → those files are
//    wired in as Preview-loadable data-URI photos (real, model-chosen), and the
//    Add to Cart control is preserved.
const withAssets = {
  'index.html': {
    content: shell(
      Array.from({ length: 6 }, (_, i) =>
        `<div class="product-card"><img src="fox_${i}.svg" alt="p${i}"><button>Add to Cart</button></div>`).join(''),
    ),
    language: 'html',
  },
};
for (let i = 0; i < 6; i += 1) {
  withAssets[`fox_${i}.svg`] = {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1f2937"/><text x="200" y="160" text-anchor="middle" fill="#fff" font-size="28">Fox ${i}</text></svg>`,
    language: 'svg',
  };
}
const wired = ensureShopDeskInVfs(withAssets, job, { brief: BRIEF });
const wiredHtml = wired.vfs['index.html'].content;
assert.equal(previewHtmlHasRealPhotos(wiredHtml), true, 'the model-shipped image files must be wired in as real photos');
assert.ok(countRealPreviewPhotos(wiredHtml) >= 6, `need ≥6 wired photos, got ${countRealPreviewPhotos(wiredHtml)}`);
assert.doesNotMatch(wiredHtml, /picsum\.photos/, 'wiring uses the model’s own images, never picsum');
assert.equal(previewHtmlHasAddToCartControl(wiredHtml), true, 'Add to Cart must be preserved');

console.log(
  'Shop catalog photos honest gate passed: imageless shells stay honest (no fabrication); '
  + `model-shipped image files are wired in as ${countRealPreviewPhotos(wiredHtml)} real photos.`,
);
