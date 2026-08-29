/**
 * End-to-end proof of the Cursor-style Coding Desk loop for shops:
 * observe oversize ask → interrupt → agree → inject runnable catalog.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPartnerInterrupt } from './studio-partner-interrupt.js';
import {
  SHOP_INTAKE_CATALOG_SIZE,
  expandShopIntakeAccept,
} from './shop-catalog-scale.js';
import { countRealPreviewPhotos } from './preview-images.js';
import { injectShopCommerceUi, previewHtmlHasAddToCartControl } from './shop-preview-ui.js';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';

const FOX = 'Build a full Fox & Wolf kids merchandise shop website with 100 unique design images, product pages, and checkout.';

const FOX_SHELL = `<!DOCTYPE html><html><head><title>Fox & Wolf Kids</title></head>
<body>
<header><nav>Shop</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="min-height:60vh;background:#fff"></main>
<footer>Fox & Wolf</footer>
</body></html>`;

test('proof: oversize ask interrupts before any model turn', () => {
  const interrupt = assessPartnerInterrupt({ message: FOX });
  assert.equal(interrupt.blockModel, true);
  assert.match(interrupt.reply, /Hold on/i);
  assert.match(interrupt.reply, /Agree/i);
  assert.ok(interrupt.chips.some((c) => /Agree|Start with/i.test(c.label)));
});

/*
 * This used to assert that agreeing to "start with 10" made Preview show ten
 * real photos. Those photos were picsum stock injected by the platform — the
 * fabrication path that produced the "Statue of Liberty / Shop 6 ₹3,050" build,
 * and the reason ensureShopPhotosInVfs refuses to do it.
 *
 * The stock pool is now deleted, so the honest behaviour is what is pinned: the
 * brief still expands to a capped catalog target, the commerce UI is still
 * added, and a shell the model shipped with no images shows NO photos rather
 * than ten invented ones.
 */
test('proof: agree expands to a 10-item brief, and Preview gains cart without invented photos', () => {
  const agree = expandShopIntakeAccept('start with 10', [FOX]);
  assert.equal(agree.expanded, true);
  assert.equal(agree.catalogTarget, SHOP_INTAKE_CATALOG_SIZE);

  const shop = injectShopCommerceUi(FOX_SHELL);
  assert.ok(shop.changed || previewHtmlHasAddToCartControl(shop.html));
  assert.ok(previewHtmlHasAddToCartControl(shop.html));
  assert.equal(countRealPreviewPhotos(shop.html), 0,
    'a shell with no images must stay empty rather than be stocked with fakes');
});

test('proof: if the turn still dies, outcome spine offers a next move — not Connection Error only', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'timeout',
    turnDeadlineSec: 90,
    shopIntakeAsk: assessPartnerInterrupt({ message: FOX }).assessment,
  });
  assert.match(outcome.text, /What failed|working product photos|Start with/i);
  assert.equal(/^\s*⚠️ \*\*Connection Error/i.test(outcome.text), false);
  assert.ok(outcome.continueSet?.items?.length >= 1);
});
