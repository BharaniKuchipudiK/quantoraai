import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedPreviewImageUrl,
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
