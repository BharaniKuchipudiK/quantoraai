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
<div class="product-card"><button>Add to Cart</button><span class="price">INR 18000</span></div>
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
