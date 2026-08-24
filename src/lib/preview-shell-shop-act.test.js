import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePartnerBuildStatus } from './partner-build-status.js';
import { pickPreviewEntryPath } from './preview-utils.js';
import { ensureShopDeskInVfs } from './studio-preview-helpers.js';
import { buildStudioJobCard } from './studio-job-card.js';
import { countRealPreviewPhotos } from './preview-images.js';
import { previewHtmlHasAddToCartControl } from './shop-preview-ui.js';
import { SHOP_INTAKE_CATALOG_SIZE } from './shop-catalog-scale.js';

test('does not pick SVG assets as the Preview entry', () => {
  assert.equal(pickPreviewEntryPath({
    'foxwolf_explorer_backpack.svg': { content: '<svg></svg>', language: 'svg' },
    'foxwolf_girls_dress.svg': { content: '<svg></svg>', language: 'svg' },
  }), null);
});

test('sanitize replaces Building 100 unique… after intake accept', () => {
  const next = sanitizePartnerBuildStatus(
    { label: 'Building: Diverse collection of at least 100 unique, high-quality merchandise des...' },
    { catalogTarget: 10, intakeAccepted: true },
  );
  assert.match(next.label, /about 10 working catalog photos/i);
  assert.doesNotMatch(next.label, /100/);
});

test('SVG-only shop job seeds HTML with real photos and cart', () => {
  const job = buildStudioJobCard({
    brief: 'Build a Fox & Wolf kids merchandise shop with 100 unique design images',
  });
  const result = ensureShopDeskInVfs({
    'foxwolf_explorer_backpack.svg': { content: '<svg width="40"></svg>', language: 'svg' },
  }, job, { brief: 'Build the shop now with about 10 working catalog photos (not 100 unique AI mockups).' });
  assert.ok(result.vfs['index.html']?.content);
  assert.match(result.vfs['index.html'].content, /Fox|Shop|merchandise|catalog/i);
  assert.ok(countRealPreviewPhotos(result.vfs['index.html'].content) >= SHOP_INTAKE_CATALOG_SIZE);
  assert.ok(previewHtmlHasAddToCartControl(result.vfs['index.html'].content));
});
