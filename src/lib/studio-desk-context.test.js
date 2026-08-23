import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeskContextPacket,
  chipsFromDeskProbes,
  deskChecksRegressed,
  formatDeskContextForPrompt,
  mergeLiveDeskProbe,
  probeRunningDesk,
  sanitizeDeskContext,
} from './studio-desk-context.js';

const shopHtml = `<!DOCTYPE html><html><body>
<header>Aaranya</header>
<img src="https://images.unsplash.com/photo-silk" alt="Dharmavaram">
<div class="product-card"><img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c" alt="Uppada"><button>Add to Cart</button><span class="price">INR 18000</span></div>
<select id="quantora-currency"><option>INR</option><option>USD</option></select>
<script data-quantora-shop-ui="script"></script>
</body></html>`;

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
  assert.equal(packet.failed.length, 0);
  const prompt = formatDeskContextForPrompt(packet);
  assert.match(prompt, /LIVE PREVIEW FACTS/);
  assert.match(prompt, /photos=/);
  assert.match(prompt, /Dharmavaram Silk/);
  assert.match(prompt, /Never claim a control/);
});

test('missing cart and currency become failed checks and chips', () => {
  const html = '<!DOCTYPE html><html><body><div class="product-card">saree boutique</div></body></html>';
  const probed = probeRunningDesk({
    html,
    vfs: { 'index.html': { content: html }, 'products.json': { content: '[]' } },
    job: { purpose: 'A shop website', mustWork: ['Product images are real photos'] },
  });
  assert.equal(probed.facts.hasCart, false);
  assert.equal(probed.facts.hasCurrency, false);
  const chips = chipsFromDeskProbes(probed.checks);
  assert.ok(chips.some((chip) => chip.id === 'gap-cart'));
  assert.ok(chips.some((chip) => chip.id === 'gap-currency'));
  assert.ok(chips.some((chip) => chip.id === 'gap-photos'));
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
  assert.equal(packet.failed.length, 0);
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

test('a live cart click is merged into Preview checks', () => {
  const packet = buildDeskContextPacket({
    html: shopHtml,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: shopHtml, language: 'html' },
      'products.json': { content: '[{"id":"dharma","name":"Dharmavaram Silk"}]', language: 'json' },
    },
  });
  const merged = mergeLiveDeskProbe(packet, { hasCart: true, bagIncremented: false });
  assert.equal(merged.facts.bagIncremented, false);
  assert.ok(merged.checks.some((check) => check.id === 'cart-click' && check.ok === false));
  assert.ok(chipsFromDeskProbes(merged.checks).some((chip) => chip.id === 'gap-cart-click'));
  assert.match(formatDeskContextForPrompt(merged), /CART CLICK: bag did not increment/);
});

test('probes regress only when a passing check starts failing', () => {
  const before = [{ id: 'photos', ok: true }, { id: 'cart', ok: false }];
  const after = [{ id: 'photos', ok: false }, { id: 'cart', ok: false }, { id: 'currency', ok: false }];
  assert.equal(deskChecksRegressed(before, after), true);
  assert.equal(deskChecksRegressed(before, [{ id: 'photos', ok: true }, { id: 'cart', ok: true }]), false);
  assert.equal(deskChecksRegressed(before, [{ id: 'currency', ok: false }]), true);
});

test('live Preview cart and currency win over a failed HTML regex check', () => {
  const html = '<!DOCTYPE html><html><body><div class="product-card">saree boutique</div></body></html>';
  const packet = buildDeskContextPacket({
    html,
    job: { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] },
    vfs: {
      'index.html': { content: html },
      'products.json': { content: '[{"id":"a","name":"Uppada"}]' },
    },
  });
  assert.equal(packet.facts.hasCart, false);
  assert.equal(packet.facts.hasCurrency, false);
  const merged = mergeLiveDeskProbe(packet, {
    hasCart: true,
    hasCurrency: true,
    photoCount: 2,
    uniquePhotoCount: 2,
    bagIncremented: true,
  });
  assert.equal(merged.facts.hasCart, true);
  assert.equal(merged.facts.hasCurrency, true);
  assert.equal(merged.facts.hasPhotos, true);
  assert.ok(merged.checks.some((check) => check.id === 'cart' && check.ok === true));
  assert.ok(merged.checks.some((check) => check.id === 'currency' && check.ok === true));
  assert.ok(merged.checks.some((check) => check.id === 'photos' && check.ok === true));
  const chips = chipsFromDeskProbes(merged.checks);
  assert.equal(chips.some((chip) => chip.id === 'gap-cart'), false);
  assert.equal(chips.some((chip) => chip.id === 'gap-currency'), false);
  assert.equal(chips.some((chip) => chip.id === 'gap-photos'), false);
});

test('an older live probe without photo counts does not wipe HTML photo facts', () => {
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
  assert.ok(merged.checks.some((check) => check.id === 'photos' && check.ok === true));
});

test('a catalog that repeats one photo fails the photos check', () => {
  const clone = 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80';
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
  assert.equal(packet.failed.length, 0);
  assert.equal(packet.nextBeat, '');
});

test('the running page decides the generic beat, and unverified stays out of it', () => {
  const packet = buildDeskContextPacket({ html: todoHtml, job: todoJob, vfs: { 'index.html': { content: todoHtml } } });
  const broken = mergeLiveDeskProbe(packet, { itemAdded: false });
  assert.equal(broken.checks.find((check) => check.id === 'job-add-item').state, 'fix');
  assert.equal(broken.nextBeat, 'Adding an item does nothing on the running Preview');
  assert.deepEqual(broken.failed, ['job-add-item']);
  assert.ok(chipsFromDeskProbes(broken.checks).some((chip) => chip.id === 'gap-add-item'));

  const fixed = mergeLiveDeskProbe(packet, { itemAdded: true });
  assert.equal(fixed.checks.find((check) => check.id === 'job-add-item').state, 'ok');
  assert.equal(fixed.nextBeat, '');
  assert.deepEqual(fixed.failed, []);
  assert.equal(chipsFromDeskProbes(fixed.checks).length, 0);
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
  assert.deepEqual(packet.checks.map((check) => check.id).sort(), ['cart', 'catalog', 'currency', 'photos']);
  assert.equal(packet.checks.some((check) => check.id.startsWith('job-')), false);
});

test('a calculator desk keeps its own probes and gains no generic rows', () => {
  const html = '<main><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></main>';
  const probed = probeRunningDesk({
    html,
    vfs: { 'App.jsx': { content: html } },
    job: { purpose: 'A working calculator', mustWork: ['Number buttons still change the display', 'Keep this a calculator, not a different app'] },
  });
  assert.deepEqual(probed.checks.map((check) => check.id).sort(), ['calc-display', 'calc-key']);
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
