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

test('gold frames still get photos when the hero already has one', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${'M'.repeat(200)}</svg>`;
  const html = `<!DOCTYPE html><html><body>
    <img src="https://images.unsplash.com/photo-silk" alt="hero">
    <div class="product-card">${svg}<p>Pure Silk</p></div>
  </body></html>`;
  const result = injectMissingShopPhotos(html);
  assert.equal(result.injected, true);
  const photos = result.html.match(/<img\b/gi) || [];
  assert.ok(photos.length >= 2);
  assert.doesNotMatch(result.html, /<svg\b/);
});

test('a CSS-only boutique still gets a collection photo', () => {
  const html = '<!DOCTYPE html><html><body><main><div class="hero">Aaranya gold frame</div></main></body></html>';
  const result = injectMissingShopPhotos(html);
  assert.equal(result.injected, true);
  assert.match(result.html, /<img\b[^>]*src="https:\/\/images\.unsplash\.com/);
});

test('nested catalog and stat cards do not get a repeating photo stack', () => {
  const html = `<!DOCTYPE html><html><body><main>
    <div class="catalog">${'<div class="card gold-card"><p>stat</p></div>'.repeat(8)}</div>
    <div class="product-card"><p>Kanjeevaram</p></div>
    <div class="product-card"><p>Uppada</p></div>
  </main></body></html>`;
  const stacked = html.replace(/<main>/, `<main>${'<img alt="Textile photo" style="width:100%;height:min(52vh,420px);object-fit:cover;display:block" src="https://images.unsplash.com/photo-1">'.repeat(12)}`);
  const result = injectMissingShopPhotos(stacked);
  const photos = result.html.match(/<img\b/gi) || [];
  assert.ok(photos.length <= 6, `expected at most 6 photos, got ${photos.length}`);
  assert.equal((result.html.match(/class="card gold-card"/g) || []).length, 8);
});

test('products.json without image URLs gets catalog photos', () => {
  const catalog = injectProductCatalogImages('[{"id":"a","name":"Kanjeevaram","priceCents":38000}]');
  assert.equal(catalog.changed, true);
  assert.match(catalog.text, /images\.unsplash\.com/);
});

test('cloned Unsplash URLs on every card become distinct photos', () => {
  const clone = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80';
  const html = `<!DOCTYPE html><html><body>
    <div class="product-card"><img src="${clone}" alt="Uppada"><button>Add to Cart</button></div>
    <div class="product-card"><img src="${clone}" alt="Mangalagiri"><button>Add to Cart</button></div>
    <div class="product-card"><img src="${clone}" alt="Kanjeevaram"><button>Add to Cart</button></div>
  </body></html>`;
  const result = injectMissingShopPhotos(html);
  assert.equal(result.injected, true);
  const ids = [...new Set([...result.html.matchAll(/photo-[\w-]+/gi)].map((match) => match[0]))];
  assert.ok(ids.length >= 3, `expected 3 distinct photos, got ${ids.join(',')}`);
});

test('products.json that repeats one image URL gets a unique photo per item', () => {
  const clone = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80';
  const catalog = injectProductCatalogImages(JSON.stringify([
    { id: 'a', name: 'Uppada', image: clone },
    { id: 'b', name: 'Mangalagiri', image: clone },
  ]));
  assert.equal(catalog.changed, true);
  const parsed = JSON.parse(catalog.text);
  assert.notEqual(parsed[0].image, parsed[1].image);
});
