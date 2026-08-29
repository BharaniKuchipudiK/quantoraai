import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { briefWantsNoImages, briefWantsOnlineSelling, briefWantsProductCatalog } from './commerce-intent.js';

test('a venue noun is not a request to sell online', () => {
  for (const brief of [
    'a one-page site for a coffee shop called Ember & Oak',
    'a barber shop website with opening hours',
    'a landing page for a book store',
    'a page describing our product',
  ]) {
    assert.equal(briefWantsOnlineSelling(brief), false, `should not read as commerce: ${brief}`);
  }
});

test('an explicit selling signal is commerce', () => {
  for (const brief of [
    'an online boutique to sell handmade jewelry',
    'sell products online with a checkout',
    'an e-commerce storefront with a product catalogue of sarees',
    'add to cart and a payment gateway',
  ]) {
    assert.equal(briefWantsOnlineSelling(brief), true, `should read as commerce: ${brief}`);
  }
});

test('only a genuine catalog brief carries the product-photo bar', () => {
  assert.equal(briefWantsProductCatalog('an e-commerce storefront with a product catalog of sarees'), true);
  assert.equal(briefWantsProductCatalog('a page to sell a subscription with a checkout'), false);
  assert.equal(briefWantsProductCatalog('a one-page site for a coffee shop'), false);
});

test('catalog and catalogue spellings both count', () => {
  assert.equal(briefWantsProductCatalog('an online store with a product catalog'), true);
  assert.equal(briefWantsProductCatalog('an online store with a product catalogue'), true);
});

test('asking for no images is respected', () => {
  for (const brief of [
    'One HTML file, no images.',
    'a landing page without photos',
    'text-only page',
    'do not include images',
  ]) {
    assert.equal(briefWantsNoImages(brief), true, `should detect a no-images ask: ${brief}`);
  }
  assert.equal(briefWantsNoImages('a gallery with images'), false);
});

test('commerce intent has exactly one definition', () => {
  // This concept was written four times and the copies drifted, which is how
  // "a coffee shop" became an online store. If a new inline copy appears, this
  // fails instead of silently disagreeing with the shared module.
  const offenders = [];
  for (const file of ['api/_lib/verify-build.ts', 'src/lib/outcome-gap-detection.js']) {
    const src = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    // The old commerce signature specifically: shop|store|cart in one alternation.
    // (verify-build's page-STRUCTURE check lists venue nouns and is not commerce.)
    if (/shop\|store\|cart/.test(src)) offenders.push(file);
    assert.match(src, /commerce-intent/, `${file} must use the shared commerce-intent module`);
  }
  assert.deepEqual(offenders, [], 'inline shop-detection regex reintroduced');
});
