import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOP_CATALOG_CAP,
  SHOP_INTAKE_CATALOG_SIZE,
  assessShopBuildAsk,
  requestedShopCatalogSize,
  shopCatalogScaleNote,
  shopCatalogTargetSize,
  shopCatalogWasCapped,
  shopPhotoTurnFailureCopy,
} from './shop-catalog-scale.js';
import {
  countRealPreviewPhotos,
  injectMissingShopPhotos,
  previewHtmlHasRealPhotos,
} from './preview-images.js';
import { ensureShopDeskInVfs, vfsLooksLikeShop } from './studio-preview-helpers.js';
import { looksLikeShopDesk, probeRunningDesk } from './studio-desk-context.js';
import { buildStudioJobCard } from './studio-job-card.js';
import { deriveStudioMission, toShortMissionGoal } from './studio-mission.js';
import { previewHtmlHasAddToCartControl, previewHtmlHasCurrencySwitcher } from './shop-preview-ui.js';

const FOX_BRIEF = 'Build a full Fox & Wolf kids merchandise shop website with 100 unique design images, product pages, and checkout.';

const FOX_SHELL = `<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head>
<body>
<header><nav>Shop</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="min-height:60vh;background:#fff"></main>
<footer>Fox & Wolf</footer>
</body></html>`;

test('100 unique designs caps at the honest intake catalog size', () => {
  assert.equal(requestedShopCatalogSize(FOX_BRIEF), 100);
  assert.equal(shopCatalogWasCapped(FOX_BRIEF), true);
  assert.equal(shopCatalogTargetSize(FOX_BRIEF), SHOP_INTAKE_CATALOG_SIZE);
  assert.match(shopCatalogScaleNote(FOX_BRIEF), /10/);
  assert.match(shopCatalogScaleNote(FOX_BRIEF), /100/);
});

test('oversize merchandise asks offer Start with 10 intake chips', () => {
  const ask = assessShopBuildAsk(FOX_BRIEF);
  assert.equal(ask.oversize, true);
  assert.equal(ask.proposedCatalogSize, SHOP_INTAKE_CATALOG_SIZE);
  assert.equal(ask.catalogTarget, SHOP_INTAKE_CATALOG_SIZE);
  assert.match(ask.userCopy, /can’t generate 100|can't generate 100/i);
  assert.ok(ask.chips.some((chip) => chip.id === 'shop-intake-start-10'));
  assert.match(ask.chips.find((chip) => chip.id === 'shop-intake-start-10').label, /Start with 10/);
  assert.match(shopPhotoTurnFailureCopy({ timedOut: true, assessment: ask }), /Start with 10/);
});

test('typed start with 10 expands to the intake chip brief using the prior Fox ask', async () => {
  const { expandShopIntakeAccept, isShopIntakeAcceptShorthand } = await import('./shop-catalog-scale.js');
  assert.equal(isShopIntakeAcceptShorthand('start with 10'), true);
  assert.equal(isShopIntakeAcceptShorthand('Start with 10 photos.'), true);
  assert.equal(isShopIntakeAcceptShorthand('build a shop with 10 photos'), false);
  const expanded = expandShopIntakeAccept('start with 10', [FOX_BRIEF]);
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.catalogTarget, SHOP_INTAKE_CATALOG_SIZE);
  assert.equal(expanded.userAsked, 100);
  assert.match(expanded.text, /about 10 working catalog photos/i);
  assert.match(expanded.text, /not 100 unique/i);
  assert.match(expanded.text, /preview-image/i);
  assert.equal(shopCatalogTargetSize(expanded.text), SHOP_INTAKE_CATALOG_SIZE);
});

test('cold only 10 without a prior oversize shop does not expand into a shop build', async () => {
  const { expandShopIntakeAccept } = await import('./shop-catalog-scale.js');
  const cold = expandShopIntakeAccept('only 10', []);
  assert.equal(cold.expanded, false);
  assert.equal(cold.text, 'only 10');
});

test('senior partner interrupts oversize shop asks before the model burns a turn', async () => {
  const { assessPartnerInterrupt } = await import('./studio-partner-interrupt.js');
  const interrupt = assessPartnerInterrupt({ message: FOX_BRIEF, priorUserMessages: [] });
  assert.ok(interrupt);
  assert.equal(interrupt.blockModel, true);
  assert.equal(interrupt.kind, 'shop-catalog-oversize');
  assert.match(interrupt.reply, /Hold on/i);
  assert.match(interrupt.reply, /Proposal/i);
  assert.match(interrupt.reply, /Agree/i);
  assert.ok(interrupt.chips.some((chip) => /Agree|Start with 10/i.test(chip.label)));
  assert.equal(
    assessPartnerInterrupt({ message: 'start with 10', priorUserMessages: [FOX_BRIEF] }),
    null,
  );
});

test('ordinary shop briefs are not oversize intake', () => {
  const ask = assessShopBuildAsk('Build a small boutique with 8 sarees and checkout');
  assert.equal(ask.oversize, false);
  assert.equal(ask.chips.length, 0);
  assert.equal(ask.userCopy, '');
});

test('non-shop counts do not trigger shop intake honesty', () => {
  const checklist = assessShopBuildAsk('Give me 20 items for a camping checklist');
  assert.equal(checklist.oversize, false);
  assert.equal(checklist.chips.length, 0);
  assert.equal(checklist.userCopy, '');

  const gallery = assessShopBuildAsk('Build a gallery showing 100 images');
  assert.equal(gallery.oversize, false);
  assert.equal(gallery.chips.length, 0);
});

test('Fox & Wolf collection shell is a shop desk even without products.json', () => {
  assert.equal(looksLikeShopDesk({ html: FOX_SHELL }), true);
  assert.equal(vfsLooksLikeShop({ 'index.html': { content: FOX_SHELL, language: 'html' } }), true);
});

test('merchandise brief becomes a shop job that requires photos and cart', () => {
  const job = buildStudioJobCard({ brief: FOX_BRIEF });
  assert.equal(job.purpose, 'A shop website');
  assert.match(job.mustWork.join(' '), /photos/i);
  assert.match(job.mustWork.join(' '), /Cart|currency/i);
});

test('Fox & Wolf empty shell gets real photos, cart, currency — not gold-frame success', () => {
  const job = buildStudioJobCard({ brief: FOX_BRIEF });
  const before = {
    'index.html': { content: FOX_SHELL, language: 'html' },
  };
  const next = ensureShopDeskInVfs(before, job, { brief: FOX_BRIEF });
  assert.equal(next.changed, true);
  const html = next.vfs['index.html'].content;
  assert.equal(previewHtmlHasRealPhotos(html), true);
  assert.ok(countRealPreviewPhotos(html) >= 6, `expected ≥6 photos, got ${countRealPreviewPhotos(html)}`);
  assert.equal(previewHtmlHasAddToCartControl(html), true);
  assert.equal(previewHtmlHasCurrencySwitcher(html), true);
  assert.ok(next.vfs['products.json'], 'products.json must be scaffolded');
  const catalog = JSON.parse(next.vfs['products.json'].content);
  assert.ok(catalog.length <= SHOP_CATALOG_CAP);
  assert.ok(catalog.length >= 6);
  assert.match(catalog[0].image, /^data:image\//);
  assert.match(next.scaleNote || '', /24|100/);

  const probed = probeRunningDesk({ html, vfs: next.vfs, job });
  assert.equal(probed.facts.hasPhotos, true);
  assert.equal(probed.facts.hasCart, true);
  assert.equal(probed.facts.hasCurrency, true);
  assert.ok(probed.facts.photoCount >= 6);
});

test('injectMissingShopPhotos fills a blank collection main', () => {
  const result = injectMissingShopPhotos(FOX_SHELL, { brief: FOX_BRIEF });
  assert.equal(result.injected, true);
  assert.ok(countRealPreviewPhotos(result.html) >= 6);
});

test('mission goal stays Fox & Wolf shop after an images complaint follow-up', () => {
  assert.match(toShortMissionGoal(FOX_BRIEF), /Fox\s*&\s*Wolf/i);
  const mission = deriveStudioMission({
    conversationContext: { goal: 'Why the images are not there on the website' },
    messages: [
      { sender: 'user', text: FOX_BRIEF },
      { sender: 'user', text: 'Why the images are not there? Preview still has no product photos. The gold frames are not images.' },
    ],
    hasPreview: true,
  });
  assert.match(mission.goal, /Fox\s*&\s*Wolf/i);
  assert.doesNotMatch(mission.goal, /why the images/i);
});

test('complaint follow-up alone does not become the mission build ask', () => {
  const mission = deriveStudioMission({
    messages: [
      { sender: 'user', text: FOX_BRIEF },
      { sender: 'user', text: 'Why are the design images not on the website shop?' },
    ],
    hasPreview: true,
  });
  assert.match(mission.goal, /Fox\s*&\s*Wolf/i);
  assert.doesNotMatch(mission.goal, /^Why/i);
});

test('a poetry collection page is not treated as a shop desk', () => {
  const html = `<!DOCTYPE html><html><body>
<header><h1>Autumn Poetry Collection</h1></header>
<main><p>Verse one.</p></main>
<footer>© 2026</footer>
</body></html>`;
  assert.equal(looksLikeShopDesk({ html }), false);
  assert.equal(vfsLooksLikeShop({ 'index.html': { content: html, language: 'html' } }), false);
});

test('injected catalog survives an unrelated follow-up brief', () => {
  const job = buildStudioJobCard({ brief: FOX_BRIEF });
  const first = ensureShopDeskInVfs(
    { 'index.html': { content: FOX_SHELL, language: 'html' } },
    job,
    { brief: FOX_BRIEF },
  );
  const cardsBefore = (first.vfs['index.html'].content.match(/data-quantora-shop-card="true"/g) || []).length;
  assert.ok(cardsBefore >= 6);
  const second = ensureShopDeskInVfs(first.vfs, job, { brief: 'Change the heading color to navy' });
  const cardsAfter = (second.vfs['index.html'].content.match(/data-quantora-shop-card="true"/g) || []).length;
  assert.equal(cardsAfter, cardsBefore);
  assert.equal(second.changed, false);
});

test('HTML product cards above the platform cap are trimmed', () => {
  const cards = Array.from({ length: 40 }, (_, i) => (
    `<div class="product-card"><p>Item ${i + 1}</p></div>`
  )).join('');
  const html = `<!DOCTYPE html><html><body><main>${cards}</main></body></html>`;
  const result = injectMissingShopPhotos(html, { brief: FOX_BRIEF });
  const kept = (result.html.match(/class="product-card"/g) || []).length;
  assert.ok(kept <= 24, `expected ≤24 cards, got ${kept}`);
  assert.ok(countRealPreviewPhotos(result.html) >= 6);
});
