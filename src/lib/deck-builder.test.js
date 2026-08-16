import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSlides,
  renderDeckHtml,
  normalizeDeck,
  hasSlideHtml,
  extractHtmlDoc,
  escapeHtml,
} from './deck-builder.js';

test('extracts slides from the exact JS data array the model leaks', () => {
  // Mirrors the screenshot: model dumped a slides array instead of HTML.
  const text = `Here is your consulting-grade presentation.
\`\`\`js
const slides = [
  { num: "01", title: "Hardware Paradigm Shift", desc: "Transition from noisy intermediate-scale (NISQ)" },
  { num: "02", title: "Disproportionate Sector Impact", desc: "70%+ of near-term commercial value concentrated" },
];
\`\`\``;
  const slides = extractSlides(text);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].title, 'Hardware Paradigm Shift');
  assert.match(slides[0].subtitle, /noisy intermediate-scale/);
  assert.equal(slides[1].title, 'Disproportionate Sector Impact');
});

test('extracts slides with bullet arrays (points/bullets/items)', () => {
  const text = `[{"title":"Strategy","bullets":["Grow ARR","Cut churn"]},{"heading":"Risks","points":["Regulatory","Supply"]}]`;
  const slides = extractSlides(text);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].bullets, ['Grow ARR', 'Cut churn']);
  assert.equal(slides[1].title, 'Risks');
  assert.deepEqual(slides[1].bullets, ['Regulatory', 'Supply']);
});

test('falls back to markdown headings + bullets', () => {
  const text = `# Title Slide\n\n## Market\n- Big TAM\n- Fast growth\n\n## Ask\n- Raising $5M`;
  const slides = extractSlides(text);
  assert.equal(slides.length, 3);
  assert.equal(slides[1].title, 'Market');
  assert.deepEqual(slides[1].bullets, ['Big TAM', 'Fast growth']);
});

test('renderDeckHtml produces exportable, CDN-free, slide-structured HTML', () => {
  const html = renderDeckHtml([{ title: 'A', subtitle: 'sub', bullets: ['one', 'two'] }], { title: 'My Deck' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /class="slide"/);              // office-export reads .slide
  assert.ok(!/https?:\/\//.test(html), 'must not reference any external URL/CDN');
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /My Deck/);
});

test('renderDeckHtml returns null for no slides (caller shows a clean state)', () => {
  assert.equal(renderDeckHtml([]), null);
  assert.equal(renderDeckHtml(null), null);
});

test('normalizeDeck keeps genuine slide HTML but rebuilds from data', () => {
  const realHtml = '<!doctype html><html><body><section class="slide"><h1>Real</h1></section></body></html>';
  assert.equal(normalizeDeck('```html\n' + realHtml + '\n```'), realHtml);

  const dataOnly = `[{"title":"Rebuilt","desc":"from data"}]`;
  const out = normalizeDeck(dataOnly, { title: 'X' });
  assert.match(out, /<!DOCTYPE html>/);
  assert.match(out, /Rebuilt/);
  assert.match(out, /class="slide"/);
});

test('normalizeDeck returns null when there is nothing slide-like', () => {
  assert.equal(normalizeDeck('just a sentence with no slides'), null);
});

test('hasSlideHtml / extractHtmlDoc guards', () => {
  assert.equal(hasSlideHtml('<div>no doctype</div>'), false);
  assert.equal(hasSlideHtml('<!doctype html><html><section>x</section></html>'), true);
  assert.equal(extractHtmlDoc('no html here'), null);
  assert.match(extractHtmlDoc('```html\n<!DOCTYPE html><html></html>\n```'), /DOCTYPE/);
});

test('escapeHtml neutralises injection from model content', () => {
  const html = renderDeckHtml([{ title: '<script>alert(1)</script>', bullets: ['<img src=x onerror=y>'] }]);
  assert.ok(!/<script>alert/.test(html));
  assert.match(html, /&lt;script&gt;/);
});
