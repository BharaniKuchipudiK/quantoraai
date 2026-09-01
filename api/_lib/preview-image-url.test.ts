/**
 * The proxy must not truncate the URL it was built to serve.
 *
 * THE INCIDENT (2026-09-01, boutique images). The system prompt's own example
 * teaches the model to emit `/api/preview-image?u=https://images.unsplash.com/
 * photo-<id>?w=1200&q=80` — UNENCODED. The platform's query parser splits on
 * `&`, so everything after the first `&` became proxy params and was silently
 * dropped. Any image whose required params follow an `&` (the full Unsplash
 * URLs models copy, with ixid/signature params) lost them upstream → 404 →
 * empty frames the model kept confidently "fixing". The contract is now
 * explicit: `u` is the LAST parameter and owns everything after it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { targetUrl } from './handlers/preview-image.js';

test('[was-red] an unencoded upstream URL keeps every parameter after &', () => {
  const upstream = 'https://images.unsplash.com/photo-15419677?w=1200&q=80&ixid=M3wxMjA3fDB8&auto=format';
  const req = {
    url: `/api/preview-image?u=${upstream}`,
    // What the platform's query parser actually hands the handler: truncated.
    query: { u: 'https://images.unsplash.com/photo-15419677?w=1200', q: '80', ixid: 'M3wxMjA3fDB8', auto: 'format' },
  };
  assert.equal(targetUrl(req), upstream);
});

test('a properly percent-encoded upstream URL still decodes', () => {
  const upstream = 'https://images.unsplash.com/photo-15419677?w=1200&q=80';
  const req = { url: `/api/preview-image?u=${encodeURIComponent(upstream)}`, query: { u: upstream } };
  assert.equal(targetUrl(req), upstream);
});

test('no u parameter means no target', () => {
  assert.equal(targetUrl({ url: '/api/preview-image?w=300', query: { w: '300' } }), '');
  assert.equal(targetUrl({ url: '/api/preview-image', query: {} }), '');
});
