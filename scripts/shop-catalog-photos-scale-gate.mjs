#!/usr/bin/env node
/**
 * Merchandise / large-catalog shop gate:
 * A Fox & Wolf–style shell (header/nav/footer, blank body) must leave Preview
 * with ≥6 real <img> srcs, currency, and Add to Cart — never empty-frame success.
 */
import assert from 'node:assert/strict';
import { ensureShopDeskInVfs } from '../src/lib/studio-preview-helpers.js';
import { buildStudioJobCard } from '../src/lib/studio-job-card.js';
import { probeRunningDesk } from '../src/lib/studio-desk-context.js';
import { countRealPreviewPhotos, previewHtmlHasRealPhotos } from '../src/lib/preview-images.js';
import { previewHtmlHasAddToCartControl, previewHtmlHasCurrencySwitcher } from '../src/lib/shop-preview-ui.js';
import { SHOP_CATALOG_CAP, shopCatalogWasCapped } from '../src/lib/shop-catalog-scale.js';

const BRIEF = 'Build Fox & Wolf kids merchandise shop with 100 unique design images and a full website.';
const SHELL = `<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head>
<body>
<header><nav>Home · Shop · About</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="background:#fff;min-height:50vh"><div class="gold-frame" style="border:2px solid #c4a35a;height:200px"></div></main>
<footer>© Fox & Wolf</footer>
</body></html>`;

const job = buildStudioJobCard({ brief: BRIEF });
assert.equal(job.purpose, 'A shop website');
assert.equal(shopCatalogWasCapped(BRIEF), true);

const next = ensureShopDeskInVfs(
  { 'index.html': { content: SHELL, language: 'html' } },
  job,
  { brief: BRIEF },
);
assert.equal(next.changed, true, 'shop desk inject must change the VFS');
const html = next.vfs['index.html'].content;
assert.equal(previewHtmlHasRealPhotos(html), true, 'Preview must have real img photos');
assert.ok(countRealPreviewPhotos(html) >= 6, `need ≥6 photos, got ${countRealPreviewPhotos(html)}`);
assert.equal(previewHtmlHasAddToCartControl(html), true, 'Add to Cart required');
assert.equal(previewHtmlHasCurrencySwitcher(html), true, 'Currency required');
assert.ok(next.vfs['products.json'], 'products.json required');
const catalog = JSON.parse(next.vfs['products.json'].content);
assert.ok(catalog.length <= SHOP_CATALOG_CAP, `catalog capped at ${SHOP_CATALOG_CAP}`);
assert.ok(catalog.every((row) => /^data:image\//.test(row.image)), 'each SKU needs a loadable data-URI photo');

const probed = probeRunningDesk({ html, vfs: next.vfs, job });
assert.equal(probed.facts.hasPhotos, true);
assert.equal(probed.facts.hasCart, true);
assert.equal(probed.facts.hasCurrency, true);
assert.ok(probed.facts.photoCount >= 6);

console.log(
  `Shop catalog photos scale gate passed. ${probed.facts.photoCount} photos, `
  + `${catalog.length} catalog items (cap ${SHOP_CATALOG_CAP}), cart+currency on Preview.`,
);
