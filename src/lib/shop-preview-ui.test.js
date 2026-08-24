import assert from 'node:assert/strict';
import test from 'node:test';
import {
  injectShopCommerceUi,
  previewHtmlHasAddToCartControl,
  previewHtmlHasCurrencySwitcher,
  stripShopCommerceUi,
} from './shop-preview-ui.js';

test('a boutique page without cart or currency gets both in Preview HTML', () => {
  const html = '<!DOCTYPE html><html><body><header>Aaranya</header><main><div class="product-card">Silk</div></main></body></html>';
  const result = injectShopCommerceUi(html);
  assert.equal(result.changed, true);
  assert.equal(previewHtmlHasCurrencySwitcher(result.html), true);
  assert.equal(previewHtmlHasAddToCartControl(result.html), true);
  assert.match(result.html, /USD/);
  assert.match(result.html, /Add to Cart/);
  assert.match(result.html, /Bag 0/);
  assert.match(result.html, /data-quantora-bag/);
  assert.match(result.html, /USD:'\$'/);
  assert.doesNotMatch(result.html, /USD:'<\/html>/);
  assert.match(result.html, /addEventListener\('click'/);
});

test('a shop that already has the injected commerce UI is left alone', () => {
  const html = `<div data-quantora-shop-ui="bar"><select id="quantora-currency"><option>INR</option><option>USD</option></select></div><button>Add to Cart</button>`;
  const result = injectShopCommerceUi(html);
  assert.equal(result.changed, false);
  assert.equal(result.html, html);
});

test('a dead Add to Cart button still gets a working click', () => {
  const html = '<!DOCTYPE html><html><body><header>Aaranya</header><label>Currency <select id="quantora-currency"><option>INR</option><option>USD</option></select></label><div class="product-card"><img src="https://images.unsplash.com/photo-silk" alt="Silk"><button type="button">Add to Cart</button></div></body></html>';
  const result = injectShopCommerceUi(html);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.html, /onclick=/);
  assert.match(result.html, /addEventListener\('click'/);
  assert.match(result.html, /data-quantora-shop-ui/);
});

test('stripShopCommerceUi removes injected boutique chrome', () => {
  const injected = injectShopCommerceUi('<!DOCTYPE html><html><body><main>Shop</main></body></html>').html;
  const stripped = stripShopCommerceUi(injected);
  assert.doesNotMatch(stripped, /data-quantora-shop-ui/);
  assert.doesNotMatch(stripped, /quantora-currency/);
});

