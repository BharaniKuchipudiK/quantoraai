/**
 * Proxied catalog photos must be REACHABLE from the opaque-origin preview.
 *
 * THE INCIDENT (boutique storefront). Every product card in Preview rendered a
 * broken-image icon with its alt text, the build failed its own photo proof
 * ("at least 10 loadable catalog photos (have 1)"), and the desk told the user
 * it could not fix it.
 *
 * Nothing was wrong with the model's work. The chain:
 *
 *   1. Our own brief instructs the model to use this exact path
 *      (outcome-gap-detection.js: "Put real <img src=...> or /api/preview-image
 *      photos on every product card. Do not use remote Unsplash URLs that break
 *      in Preview.") — so the model writes `/api/preview-image?u=...`.
 *   2. proxyRemoteCatalogImages then SKIPS that src, because it already contains
 *      the proxy path, so the platform never absolutises it either.
 *   3. The preview shell loads from a blob url, sandboxed WITHOUT
 *      allow-same-origin. Its document has an opaque origin and a `blob:` base
 *      url, so a path-absolute reference has nothing to resolve against.
 *   4. The request never reaches the proxy. Broken image, alt text, failed proof.
 *
 * The platform punished the model for obeying it — the class
 * guided-intake-browser-gate.mjs exists for, and the class CLAUDE.md records for
 * search_hotels: a promise we make to the model that we do not keep.
 *
 * preview-utils.js already states the constraint: "Opaque-origin preview has no
 * HTTP server. Local CSS/JS/images must be inlined." Proxied photos are the one
 * asset class that CANNOT be inlined, so they must be absolute instead.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { absolutizePreviewProxyUrls } from './preview-images.js';

const ORIGIN = 'https://quantoraai.app';

test('[was-red] a relative proxy photo is made reachable from the opaque-origin preview', () => {
  const html = '<img src="/api/preview-image?u=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1" alt="Tailored Cashmere Coat">';
  const out = absolutizePreviewProxyUrls(html, ORIGIN);

  assert.match(out, /src="https:\/\/quantoraai\.app\/api\/preview-image\?u=/, 'the proxy must be addressable without a base url');
  assert.doesNotMatch(out, /src="\/api\/preview-image/, 'no path-absolute proxy url may survive into the sandbox');
});

test('[was-red] the inlined catalog is covered, not just the markup', () => {
  /*
   * inlineVfsAssets shims fetch('products.json') and inlines the catalog, so the
   * image urls the cards actually use arrive through the JSON. Fixing only <img>
   * src attributes would have left every card broken exactly as before.
   */
  const catalog = '{"products":[{"name":"Tailored Cashmere Coat","image":"/api/preview-image?u=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1"}]}';
  const out = absolutizePreviewProxyUrls(catalog, ORIGIN);

  assert.match(out, /"image":"https:\/\/quantoraai\.app\/api\/preview-image/);
  assert.doesNotMatch(out, /"\/api\/preview-image/);
});

test('[was-red] a model-written url keeps its own query string instead of being truncated', () => {
  /*
   * A model obeying the brief writes the inner url unencoded. An Unsplash link
   * carries its own `?w=800&q=80`, which then split into extra parameters of OUR
   * request and reached the proxy as a truncated `u`.
   */
  const raw = '{"image":"/api/preview-image?u=https://images.unsplash.com/photo-1?w=800&q=80"}';
  const out = absolutizePreviewProxyUrls(raw, ORIGIN);

  // Assert the rewrite happened BEFORE parsing it, or a failure here reports
  // "Cannot read properties of null" instead of naming the defect (CLAUDE.md §8).
  const absolute = out.match(/https:\/\/quantoraai\.app[^"]+/);
  assert.ok(
    absolute,
    `the proxy url was never absolutised, so it cannot resolve in the sandbox. Got: ${out}`,
  );
  const u = new URL(absolute[0]).searchParams.get('u');
  assert.equal(u, 'https://images.unsplash.com/photo-1?w=800&q=80', 'the whole photo url must survive as one parameter');
});

test('idempotent: an already-absolute proxy url is never double-wrapped', () => {
  const once = absolutizePreviewProxyUrls('<img src="/api/preview-image?u=https%3A%2F%2Fx.com%2Fa">', ORIGIN);
  assert.equal(absolutizePreviewProxyUrls(once, ORIGIN), once, 'a second pass must be a no-op');
  assert.equal((once.match(/\/api\/preview-image/g) || []).length, 1, 'exactly one proxy hop');
});

test('the preview canvas actually applies it, and applies it last', () => {
  /*
   * The unit above proves the rule; this proves the preview uses it. Order
   * matters: rewritePreviewImageUrls produces proxy urls, so absolutising must
   * happen around it rather than before it.
   */
  const canvas = fs.readFileSync(new URL('../components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /absolutizePreviewProxyUrls\(\s*\n\s*rewritePreviewImageUrls\(/, 'the preview must absolutise the proxy urls it just produced');
  assert.match(canvas, /window\.location\.origin/, 'the origin must come from the real page, not a constant');
});

test('the security invariant this works around is still in force', () => {
  /*
   * The whole reason a relative url cannot resolve is that the sandbox withholds
   * allow-same-origin. If that ever regressed, relative urls would start working
   * and this fix would look unnecessary — while untrusted generated code could
   * read the user's storage. Fail loudly instead.
   */
  const utils = fs.readFileSync(new URL('./preview-utils.js', import.meta.url), 'utf8');
  const fn = utils.slice(utils.indexOf('export function buildPreviewSandbox'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.doesNotMatch(
    body.replace(/if \(trustedRuntimeUrl\)[^\n]*\n/, ''),
    /'allow-same-origin'/,
    'untrusted preview must never get allow-same-origin; only a trusted runtime url may',
  );
});
