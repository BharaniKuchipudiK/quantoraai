import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedPreviewImageUrl,
  isReliablePreviewPhotoSrc,
  previewHtmlHasRealPhotos,
  rewritePreviewImageUrls,
  countRealPreviewPhotos,
} from './preview-images.js';

test('only known photo hosts are allowed through the Preview proxy', () => {
  assert.equal(isAllowedPreviewImageUrl('https://images.unsplash.com/photo-123?q=80'), true);
  assert.equal(isAllowedPreviewImageUrl('http://images.unsplash.com/photo-123'), false);
  assert.equal(isAllowedPreviewImageUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedPreviewImageUrl('https://evil.example/photo.jpg'), false);
});

test('svg data-URIs still display, but are not counted as real photos', () => {
  const svg = 'data:image/svg+xml;charset=utf-8,%3Csvg';
  // A self-contained svg still decodes in Preview (used only as the onerror guard)...
  assert.equal(isReliablePreviewPhotoSrc(svg), true);
  // ...but it is NOT a real photograph, so the injector will replace it.
  // A same-origin proxied photograph and a raster data URI are real photos.
  const proxied = '/api/preview-image?u=https%3A%2F%2Fpicsum.photos%2Fseed%2Fx%2F1200%2F800';
  // A bare remote host is not reliable in Preview (must be proxied).
  assert.equal(isReliablePreviewPhotoSrc('https://images.unsplash.com/photo-123'), false);
});

test('Preview rewrites Unsplash photos to the Quantora proxy so they can load', () => {
  const html = '<img src="https://images.unsplash.com/photo-silk" alt="Kanjeevaram">';
  const out = rewritePreviewImageUrls(html, 'https://quantoraai.app');
  assert.match(out, /\/api\/preview-image\?u=/);
  assert.match(out, /images\.unsplash\.com/);
  assert.equal(rewritePreviewImageUrls(html, ''), html);
});

/*
 * source.unsplash.com was shut down in 2023. Keeping it on the allowlist
 * handed every model a guaranteed dead frame that passed every shape check —
 * the 2026-09-01 boutique catalog used it for its whole services section.
 * A host that can never serve an image must not be offered as allowed.
 */
test('[was-red] the retired source.unsplash.com host is not allowed', () => {
  assert.equal(isAllowedPreviewImageUrl('https://source.unsplash.com/featured/400x300?tailor'), false);
});

test('the living unsplash CDN host stays allowed', () => {
  assert.equal(isAllowedPreviewImageUrl('https://images.unsplash.com/photo-1541167760496?w=1200&q=80'), true);
});
