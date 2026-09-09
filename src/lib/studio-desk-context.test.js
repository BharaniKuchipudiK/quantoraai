import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDeskChatClaims } from './desk-chat-claim-filter.js';
import {
  buildCodingTurnPacket,
  buildDeskContextPacket,
  buildTruthChecks,
  codingTurnRequestFields,
  describeMissingShopUi,
  deskChecksRegressed,
  formatDeskContextForPrompt,
  mergeLiveDeskProbe,
  probeRunningDesk,
  sanitizeDeskContext,
} from './studio-desk-context.js';

const shopPhoto = (n) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#333"/><text>quantora-photo-${n}</text></svg>`);
const shopHtml = `<!DOCTYPE html><html><body>
<header>Aaranya</header>
<img src="${shopPhoto(1)}" alt="Dharmavaram">
<div class="product-card"><img src="${shopPhoto(2)}" alt="Uppada"><button>Add to Cart</button><span class="price">INR 18000</span></div>
<select id="quantora-currency"><option>INR</option><option>USD</option></select>
<script data-quantora-shop-ui="script"></script>
</body></html>`;

test('observing a page does not prove a click happened or every control works', () => {
  const packet = buildDeskContextPacket({ html: shopHtml });
  const observed = mergeLiveDeskProbe(packet, { pageRendered: true, hasCart: true });
  const click = observed.checks.find((check) => check.id === 'cart-click');
  assert.equal(click?.state, 'unverified');
  assert.equal(observed.facts.bagIncremented, undefined);
  const safe = sanitizeDeskContext(observed);
  assert.equal(safe.facts.bagIncremented, undefined);
  assert.match(filterDeskChatClaims('Add to Cart is working.', safe, 'coding'), /has not confirmed Add to Cart/);
  for (const original of packet.checks.filter((check) => check.id.startsWith('truth-'))) {
    assert.deepEqual(observed.checks.find((check) => check.id === original.id), original);
  }
});

test('a running boutique packet names files, catalog, and live Preview facts', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"},{"id":"uppada","name":"Uppada Jamdani"}]', language: 'json' },
    },
  });
  assert.equal(packet.facts.shop, true);
  assert.equal(packet.facts.hasPhotos, true);
  assert.equal(packet.facts.hasCart, true);
  assert.equal(packet.facts.hasCurrency, true);
  assert.deepEqual(packet.catalog.map((item) => item.name), ['Dharmavaram Silk', 'Uppada Jamdani']);
  assert.ok(packet.files.includes('index.html'));
  /*
   * This fixture's "Add to Cart" buttons carry no handler and no script, so
   * they really are dead. The shop probe and the generic check are reporting
   * DIFFERENT facts and both are true: `cart` says the control is present,
   * `truth-dead-control` says it is not wired to anything. Presence was the
   * only half being measured before.
   */
  assert.deepEqual(packet.failed, ['truth-dead-control']);
  assert.equal(packet.checks.find((check) => check.id === 'catalog').state, 'unverified');
  assert.equal(packet.checks.find((check) => check.id === 'cart').state, 'unverified');
  assert.equal(packet.checks.find((check) => check.id === 'currency').state, 'unverified');
  const prompt = formatDeskContextForPrompt(packet);
  assert.match(prompt, /LIVE PREVIEW FACTS/);
  assert.match(prompt, /photos=/);
  assert.match(prompt, /Dharmavaram Silk/);
  assert.match(prompt, /Never claim a control/);
});

test('Travel never receives a coding desk packet', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    studioDomain: 'travel',
    vfs: { 'index.html': { content: shopHtml } },
  });
  assert.equal(packet, null);
});

test('a calculator packet probes display and keys', () => {
  const html = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const packet = buildDeskContextPacket({
    html,
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
    vfs: { 'index.html': { content: html } },
  });
  assert.equal(packet.facts.calculator, true);
  // The "1" key in this fixture has no handler, so it genuinely does nothing.
  // calc-key reports the key is PRESENT; truth-dead-control reports it is not
  // WIRED. Both are true, and only the first was ever measured.
  assert.deepEqual(packet.failed, ['truth-dead-control']);
  assert.equal(packet.checks.find((check) => check.id === 'calc-display').state, 'unverified');
  assert.equal(packet.checks.find((check) => check.id === 'calc-key').state, 'unverified');
});

test('a data-testid in source is not a passing calculator check', () => {
  const html = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const packet = buildDeskContextPacket({
    html,
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
    vfs: { 'App.jsx': { content: html } },
  });
  assert.equal(packet.checks.find((check) => check.id === 'calc-display').ok, false);
  const missing = mergeLiveDeskProbe(packet, { hasCalculatorDisplay: false, hasCalculatorKey: false });
  assert.equal(missing.checks.find((check) => check.id === 'calc-display').ok, false);
  assert.equal(missing.checks.find((check) => check.id === 'calc-display').state, 'fix');
  const live = mergeLiveDeskProbe(packet, { hasCalculatorDisplay: true, hasCalculatorKey: true });
  assert.equal(live.checks.find((check) => check.id === 'calc-display').ok, true);
  assert.equal(live.checks.find((check) => check.id === 'calc-key').ok, true);
});

test('sanitize drops oversized untrusted fields', () => {
  const clean = sanitizeDeskContext({
    job: { purpose: 'x'.repeat(400), mustWork: ['a', 'b', 'c', 'd', 'e'] },
    files: Array.from({ length: 40 }, (_, i) => `f${i}.html`),
    facts: { hasCart: true, photoCount: '3' },
  });
  assert.equal(clean.job.purpose.length, 120);
  assert.equal(clean.job.mustWork.length, 4);
  assert.equal(clean.files.length, 24);
  assert.equal(clean.facts.photoCount, 3);
  assert.equal(clean.facts.hasCart, true);
});

test('probes regress only when a passing check starts failing', () => {
  const before = [{ id: 'photos', ok: true }, { id: 'cart', ok: false }];
  const after = [{ id: 'photos', ok: false }, { id: 'cart', ok: false }, { id: 'currency', ok: false }];
  assert.equal(deskChecksRegressed(before, after), true);
  assert.equal(deskChecksRegressed(before, [{ id: 'photos', ok: true }, { id: 'cart', ok: true }]), false);
  assert.equal(deskChecksRegressed(before, [{ id: 'currency', ok: false }]), true);
  assert.equal(deskChecksRegressed(
    [{ id: 'calc-display', ok: false, state: 'unverified', sourceOk: true }],
    [{ id: 'calc-display', ok: false, state: 'fix', sourceOk: false }],
  ), true);
  assert.equal(deskChecksRegressed(
    [{ id: 'job-add-item', ok: false, state: 'unverified' }],
    [{ id: 'job-add-item', ok: false, state: 'fix' }],
  ), false);
});

test('photos stay unverified without live decode even when HTML has photos', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"}]', language: 'json' },
    },
  });
  assert.equal(packet.facts.hasPhotos, true);
  const photos = packet.checks.find((check) => check.id === 'photos');
  assert.equal(photos.ok, false);
  assert.equal(photos.state, 'unverified');
  assert.equal(photos.sourceOk, true);
});

test('a partial live probe without photo counts cannot keep photos green from source alone', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"}]', language: 'json' },
    },
  });
  assert.equal(packet.facts.hasPhotos, true);
  const merged = mergeLiveDeskProbe(packet, { hasCart: true, bagIncremented: true });
  assert.equal(merged.facts.hasPhotos, true);
  const photos = merged.checks.find((check) => check.id === 'photos');
  assert.equal(photos.ok, false);
  assert.equal(photos.state, 'unverified');
  assert.equal(photos.sourceOk, true);
});

test('catalog and cart-click only pass from the live page', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"}]', language: 'json' },
    },
  });
  assert.equal(packet.checks.find((check) => check.id === 'catalog').ok, false);
  const live = mergeLiveDeskProbe(packet, {
    hasCart: true,
    hasCurrency: true,
    photoCount: 2,
    uniquePhotoCount: 2,
    catalogCount: 2,
    bagIncremented: true,
  });
  assert.equal(live.facts.catalogCount, 2);
  assert.ok(live.checks.some((check) => check.id === 'catalog' && check.ok === true));
  assert.ok(live.checks.some((check) => check.id === 'cart-click' && check.ok === true));
});

test('a catalog that repeats one photo fails the photos check', () => {
  const clone = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#333"/><text>quantora-photo-1</text></svg>');
  const html = `<!DOCTYPE html><html><body>
    <div class="product-card"><img src="${clone}" alt="Uppada"><button>Add to Cart</button></div>
    <div class="product-card"><img src="${clone}" alt="Mangalagiri"><button>Add to Cart</button></div>
  </body></html>`;
  const probed = probeRunningDesk({
    html,
    vfs: {
      'index.html': { content: html },
      'products.json': { content: '[{"id":"a","name":"Uppada"},{"id":"b","name":"Mangalagiri"}]' },
    },
    job: { purpose: 'A shop website', mustWork: ['Product images are real photos'] },
  });
  assert.equal(probed.facts.hasPhotos, true);
  assert.equal(probed.facts.hasDistinctPhotos, false);
  assert.ok(probed.checks.some((check) => check.id === 'photos' && check.ok === false));
});

const todoHtml = '<!DOCTYPE html><html><body><h1>My day</h1><input type="text"><button>Add</button><ul><li>Ship the gate</li></ul></body></html>';
const todoJob = { purpose: 'A to-do list', mustWork: ['Items can still be added', 'Keep this a to-do list'] };

test('a desk that is neither a shop nor a calculator still gets review criteria', () => {
  const packet = buildDeskContextPacket({
    html: todoHtml,
    job: todoJob,
    vfs: { 'index.html': { content: todoHtml } },
  });
  assert.equal(packet.facts.shop, false);
  assert.equal(packet.facts.calculator, false);
  assert.ok(packet.checks.length > 0);
  assert.equal(packet.checks.find((check) => check.id === 'job-add-item').state, 'unverified');
  /*
   * This fixture's Add button has no handler, no id and no script — it really
   * does nothing when clicked. The old expectation of zero failures was
   * asserting that a page with a dead control has nothing wrong with it, which
   * is the exact blindness these generic checks exist to remove.
   *
   * What the test still pins is the original point: an UNVERIFIED job
   * criterion is not a failure.
   */
  assert.deepEqual(packet.failed, ['truth-dead-control']);
  assert.match(packet.nextBeat, /does nothing when clicked/);
});

test('the prompt tells the model what Preview was never asked', () => {
  const packet = buildDeskContextPacket({ html: todoHtml, job: todoJob, vfs: { 'index.html': { content: todoHtml } } });
  const prompt = formatDeskContextForPrompt(mergeLiveDeskProbe(packet, { itemAdded: false }));
  assert.match(prompt, /FAILED CHECKS: Adding an item does nothing on the running Preview/);
  assert.match(prompt, /UNVERIFIED \(Preview was never asked[^)]*\): Not checked on Preview: Keep this a to-do list/);
});

test('a shop desk keeps its own probes and gains no generic rows', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work', 'Keep this a shop, not a different app'] },
    vfs: { 'index.html': { content: shopHtml }, 'products.json': { content: '[{"id":"a","name":"Silk"}]' } },
  });
  /*
   * The intent this pins is "no vague job-* placeholder when real probes
   * exist", and that still holds. truth-* rows are evidence, not placeholders —
   * a shop can have a dead control too — so they are filtered out of the
   * shop-probe comparison rather than the expectation being loosened.
   */
  const shopProbes = packet.checks.map((check) => check.id).filter((id) => !id.startsWith('truth-')).sort();
  assert.deepEqual(shopProbes, ['cart', 'catalog', 'currency', 'photos']);
  assert.equal(packet.checks.some((check) => check.id.startsWith('job-')), false);
  assert.ok(packet.checks.some((check) => check.id.startsWith('truth-')), 'a shop is still a build');
});

test('a calculator desk keeps its own probes and gains no generic rows', () => {
  const html = '<main><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></main>';
  const probed = probeRunningDesk({
    html,
    vfs: { 'App.jsx': { content: html } },
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display', 'Keep this a calculator, not a different app'] },
  });
  // Same reasoning as the shop case above: calculator probes unchanged, and
  // probeRunningDesk is the low-level probe rather than the packet, so it
  // carries no truth-* rows at all.
  assert.deepEqual(probed.checks.map((check) => check.id).filter((id) => !id.startsWith('truth-')).sort(),
    ['calc-display', 'calc-key']);
});

test('sanitize keeps a criterion unverified across the wire', () => {
  const clean = sanitizeDeskContext({
    job: todoJob,
    files: ['index.html'],
    checks: [
      { id: 'job-add-item', ok: false, state: 'unverified', label: 'Not checked on Preview yet: Items can still be added' },
      { id: 'job-controls', ok: false, label: 'Controls on the running Preview do not respond' },
    ],
    facts: { itemAdded: true },
  });
  assert.equal(clean.checks[0].state, 'unverified');
  assert.equal(clean.checks[1].state, 'fix');
  assert.deepEqual(clean.failed, ['job-controls']);
  assert.equal(clean.facts.itemAdded, true);
  assert.equal('controlResponded' in clean.facts, false);
});

test('a first coding turn with a VFS sends deskContext and capped previewCode', () => {
  const packet = buildCodingTurnPacket({
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"}]', language: 'json' },
    },
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
  });
  assert.ok(packet.files.includes('index.html'));
  assert.match(packet.previewCode, /Aaranya/);
  assert.ok(packet.previewCode.length <= 80_000);
  const body = codingTurnRequestFields({ isCodingRequest: true, refineDesk: false, packet });
  assert.equal(body.refineMode, undefined);
  assert.ok(body.deskContext);
  assert.equal(body.previewCode, packet.previewCode);
  assert.ok(Array.isArray(body.deskContext.files));
  assert.ok(body.deskContext.facts);
  assert.ok(Array.isArray(body.deskContext.checks));
  assert.match(formatDeskContextForPrompt(body.deskContext), /PREVIEW SOURCE: attached/);
  const chatOnly = codingTurnRequestFields({ isCodingRequest: false, refineDesk: false, packet });
  assert.equal('previewCode' in chatOnly, false);
  assert.equal('previewCode' in chatOnly.deskContext, false);
});

test('Travel, Study, Finance, and Research never receive a coding packet', () => {
  for (const studioDomain of ['travel', 'education', 'finance', 'research']) {
    assert.equal(buildCodingTurnPacket({
      vfs: { 'index.html': { content: shopHtml } },
      studioDomain,
    }), null);
    assert.deepEqual(codingTurnRequestFields({
      isCodingRequest: true,
      packet: buildCodingTurnPacket({ vfs: { 'index.html': { content: shopHtml } }, studioDomain }),
    }), {});
  }
});

const driveCleanerHtml = `<!DOCTYPE html><html><head><title>Drive Cleaner Agent</title></head><body>
<main>
  <h1>Drive Cleaner</h1>
  <p>Scan and remove duplicate files from Google Drive.</p>
  <button type="button">Scan Drive</button>
  <ul class="file-catalog"><li>Report Q3.pdf</li><li>Vacation.jpg</li></ul>
</main>
</body></html>`;

test('Drive cleaner job cards do not classify as shop desks', () => {
  const job = {
    purpose: 'Drive Cleaner Agent dashboard',
    mustWork: ['Interactive controls still work', 'Do not replace this with a different product'],
  };
  const probed = probeRunningDesk({
    html: driveCleanerHtml,
    vfs: { 'index.html': { content: driveCleanerHtml } },
    job,
  });
  assert.equal(probed.facts.shop, false);
  assert.ok(probed.checks.every((check) => !['photos', 'cart', 'currency', 'catalog'].includes(check.id)));
});

test('a visible class=display readout counts as calculator display in source facts', () => {
  const html = '<!DOCTYPE html><html><body><div class="display">9 * 6 = 54</div><button>1</button></body></html>';
  const probed = probeRunningDesk({
    html,
    vfs: { 'index.html': { content: html } },
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
  });
  assert.equal(probed.facts.hasCalculatorDisplay, true);
  assert.equal(probed.facts.hasCalculatorKey, true);
});

test('scientific calculator jobs require sin/cos on Preview', () => {
  const basic = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const scientific = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button><button>sin</button><button>cos</button></body></html>';
  const job = { purpose: 'A scientific calculator', mustWork: ['Scientific keys (sin/cos) appear on Preview'] };
  const missing = probeRunningDesk({ html: basic, vfs: { 'index.html': { content: basic } }, job });
  assert.equal(missing.facts.wantsScientific, true);
  assert.equal(missing.facts.hasScientificKeys, false);
  assert.equal(missing.checks.find((row) => row.id === 'calc-scientific').ok, false);
  const packet = buildDeskContextPacket({
    html: scientific,
    job,
    vfs: { 'index.html': { content: scientific } },
  });
  assert.equal(packet.facts.hasScientificKeys, true);
  assert.equal(packet.checks.find((row) => row.id === 'calc-scientific').state, 'unverified');
});


/*
 * FIXTURES FROM A REAL FAILING SCREEN (Kaapi Bharat storefront).
 *
 * One screen showed, at the same time:
 *   ok  Currency switcher is on Preview
 *   ok  1 catalog item
 *   fix Add to Cart missing from Preview
 *   fix Add to Cart missing from Preview      <- printed twice
 *   "Preview still has no currency switcher or Add to Cart"
 *
 * Three separate defects, all of the same kind: the platform stating
 * something about itself that its own evidence contradicted.
 */

test('the shop-UI warning never names a control that is present', () => {
  // Exactly the screenshot: currency IS on Preview, cart is not.
  assert.equal(
    describeMissingShopUi({ shop: true, hasCart: false, hasCurrency: true }),
    'Preview still has no Add to Cart. Chat cannot add that until it appears on the desk.',
  );
  assert.equal(
    describeMissingShopUi({ shop: true, hasCart: true, hasCurrency: false }),
    'Preview still has no currency switcher. Chat cannot add that until it appears on the desk.',
  );
  assert.match(
    describeMissingShopUi({ shop: true, hasCart: false, hasCurrency: false }),
    /Add to Cart or currency switcher/,
  );
  // Nothing missing → no warning at all, not an empty accusation.
  assert.equal(describeMissingShopUi({ shop: true, hasCart: true, hasCurrency: true }), '');
  assert.equal(describeMissingShopUi({ shop: false }), '');
  assert.equal(describeMissingShopUi(null), '');
});

test('a catalog that renders 1 of 18 is a failure, not a green "1 catalog item"', () => {
  const packet = {
    facts: { shop: true, catalogCount: 18, hasCart: true, hasCurrency: true },
    checks: [{ id: 'catalog' }],
  };
  const merged = mergeLiveDeskProbe(packet, { catalogCount: 1 });
  const catalog = merged.checks.find((check) => check.id === 'catalog');
  assert.equal(catalog.ok, false, 'a shortfall must not pass');
  assert.equal(catalog.label, 'Only 1 of 18 catalog items reached Preview');
  assert.ok(merged.failed.includes('catalog'));
});

test('a catalog that renders everything still passes', () => {
  const packet = {
    facts: { shop: true, catalogCount: 18, hasCart: true, hasCurrency: true },
    checks: [{ id: 'catalog' }],
  };
  const merged = mergeLiveDeskProbe(packet, { catalogCount: 18 });
  const catalog = merged.checks.find((check) => check.id === 'catalog');
  assert.equal(catalog.ok, true);
  assert.equal(catalog.label, '18 catalog items');
});

test('a missing Add to Cart is reported once, not twice', () => {
  const packet = {
    facts: { shop: true, catalogCount: 3, hasCart: false, hasCurrency: true },
    checks: [{ id: 'catalog' }],
  };
  const merged = mergeLiveDeskProbe(packet, { hasCart: false, bagIncremented: false });
  const cartRows = merged.checks.filter((check) => /Add to Cart missing/i.test(check.label || ''));
  assert.equal(cartRows.length, 1, 'the same sentence must not appear under two ids');
  assert.equal(merged.checks.some((check) => check.id === 'cart-click'), false,
    'there is no click to report when there is no control');
});

test('a present Add to Cart that does not increment is still reported', () => {
  const packet = {
    facts: { shop: true, catalogCount: 3, hasCart: true, hasCurrency: true },
    checks: [{ id: 'catalog' }],
  };
  const merged = mergeLiveDeskProbe(packet, { hasCart: true, bagIncremented: false });
  const click = merged.checks.find((check) => check.id === 'cart-click');
  assert.equal(click.ok, false);
  assert.equal(click.label, 'Add to Cart did not increment the bag');
});

/*
 * THE GATE ONLY KNEW TWO VOCABULARIES.
 *
 * buildDeskChecks had deep checks for shops (photos, cart, currency, catalog)
 * and calculators (display, keys, scientific). Everything else — a scheduling
 * board, a dashboard, a CRM, a booking system — got exactly ONE check, and it
 * was a placeholder that is never verified:
 *
 *   "Not checked on Preview yet: Interactive controls still work"
 *
 * It is also why "0 catalog photos" appeared on a scheduler: shop was the only
 * vocabulary available, so shop words came out.
 */
const SCHEDULER_HTML = '<!DOCTYPE html><html><body>'
  + '<svg><rect width="10" height="10"/></svg>'
  + '<button id="zoom-in">Zoom in</button>'
  + '<a href="#missing">Critical path</a>'
  + '<p>Lorem ipsum dolor sit amet</p>'
  + '</body></html>';

test('a build that is neither shop nor calculator still gets real checks', () => {
  const checks = buildTruthChecks(SCHEDULER_HTML, ['index.html']);
  const failing = checks.filter((check) => !check.ok).map((check) => check.label);
  assert.ok(failing.some((l) => /control on the page does nothing/.test(l)));
  assert.ok(failing.some((l) => /link points nowhere/.test(l)));
  assert.ok(failing.some((l) => /placeholder text left in/.test(l)));
});

test('a clean build is UNVERIFIED until the page is probed, never passed', () => {
  const html = '<!DOCTYPE html><html><body><h1 id="top">Board</h1>'
    + '<button onclick="zoom()">Zoom in</button><a href="#top">Back to top</a>'
    + '<script>function zoom(){}</script></body></html>';
  /*
   * A FINDING is sound from source; an ABSENCE is not. The desk-job gate
   * caught the first version reporting ok:true from reading HTML — "a desk
   * whose page was never probed reported a passing check" — which is the rule
   * this codebase enforces everywhere else.
   */
  const fromSource = buildTruthChecks(html, ['index.html']);
  assert.ok(fromSource.length >= 4);
  assert.ok(fromSource.every((check) => check.state === 'unverified'),
    'not finding a defect in source is not proof the page works');
  assert.ok(fromSource.every((check) => check.ok === false));

  const probed = buildTruthChecks(html, ['index.html'], { livePresent: true });
  assert.ok(probed.every((check) => check.ok), probed.filter((c) => !c.ok).map((c) => c.label).join('; '));
  assert.ok(probed.some((check) => /Every control is wired/.test(check.label)),
    'once probed, a pass reads as a pass rather than as an absence');
});

test('the generic checks reach the packet a user actually sees', () => {
  const packet = buildDeskContextPacket({
    vfs: { 'index.html': { content: SCHEDULER_HTML } },
    job: { purpose: 'A production scheduling board', mustWork: ['Interactive controls still work'] },
    html: SCHEDULER_HTML,
    studioDomain: 'coding',
  });
  const ids = packet.checks.map((check) => check.id);
  assert.ok(ids.includes('truth-dead-control'), 'the panel, not just the proof plane');
  assert.ok(packet.failed.includes('truth-dead-control'));
});

test('an empty or unparseable desk yields no generic checks rather than throwing', () => {
  // A check that throws must not take the panel down with it.
  assert.deepEqual(buildTruthChecks('', []), []);
  assert.deepEqual(buildTruthChecks('   ', []), []);
  assert.ok(Array.isArray(buildTruthChecks('<<<not html>>>', [])));
});
