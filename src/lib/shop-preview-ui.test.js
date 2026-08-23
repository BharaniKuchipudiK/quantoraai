import assert from 'node:assert/strict';
import test from 'node:test';
import {
  injectShopCommerceUi,
  previewHtmlHasAddToCartControl,
  previewHtmlHasCurrencySwitcher,
} from './shop-preview-ui.js';

test('a boutique page without cart or currency gets both in Preview HTML', () => {
  const html = '<!DOCTYPE html><html><body><header>Aaranya</header><main><div class="product-card">Silk</div></main></body></html>';
  const result = injectShopCommerceUi(html);
  assert.equal(result.changed, true);
  assert.equal(previewHtmlHasCurrencySwitcher(result.html), true);
  assert.equal(previewHtmlHasAddToCartControl(result.html), true);
  assert.match(result.html, /USD/);
  assert.match(result.html, /Add to Cart/);
});

test('a shop that already has currency and cart is left alone', () => {
  const html = '<select id="currency"><option>INR</option><option>USD</option></select><button>Add to Cart</button>';
  const result = injectShopCommerceUi(html);
  assert.equal(result.changed, false);
  assert.equal(result.html, html);
});
