import assert from 'node:assert/strict';
import test from 'node:test';
import {
  injectMissingShopPhotos,
  injectProductCatalogImages,
  isAllowedPreviewImageUrl,
  previewHtmlHasRealPhotos,
  rewritePreviewImageUrls,
} from './preview-images.js';

test('only known photo hosts are allowed through the Preview proxy', () => {
  assert.equal(isAllowedPreviewImageUrl('https://images.unsplash.com/photo-123?q=80'), true);
  assert.equal(isAllowedPreviewImageUrl('http://images.unsplash.com/photo-123'), false);
  assert.equal(isAllowedPreviewImageUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedPreviewImageUrl('https://evil.example/photo.jpg'), false);
});

test('Preview rewrites Unsplash photos to the Quantora proxy so they can load', () => {
  const html = '<img src="https://images.unsplash.com/photo-silk" alt="Kanjeevaram">';
  const out = rewritePreviewImageUrls(html, 'https://quantoraai.app');
  assert.match(out, /\/api\/preview-image\?u=/);
  assert.match(out, /images\.unsplash\.com/);
  assert.equal(rewritePreviewImageUrls(html, ''), html);
});

test('a boutique card with a large SVG gets a real Unsplash photo', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${'M'.repeat(200)}</svg>`;
  const html = `<!DOCTYPE html><html><body><div class="product-card">${svg}<p>Pure Gold Zari Kanjeevaram</p></div></body></html>`;
  const result = injectMissingShopPhotos(html);
  assert.equal(result.injected, true);
  assert.equal(previewHtmlHasRealPhotos(result.html), true);
  assert.match(result.html, /images\.unsplash\.com/);
});

test('a shop that already has photos is not rewritten into a different catalog', () => {
  const html = '<article class="product-card"><img src="https://images.unsplash.com/photo-silk" alt="saree"></article>';
  const result = injectMissingShopPhotos(html);
  assert.equal(result.injected, false);
  assert.equal(result.html, html);
});

test('products.json without image URLs gets catalog photos', () => {
  const catalog = injectProductCatalogImages('[{"id":"a","name":"Kanjeevaram","priceCents":38000}]');
  assert.equal(catalog.changed, true);
  assert.match(catalog.text, /images\.unsplash\.com/);
});
