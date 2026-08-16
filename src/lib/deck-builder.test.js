import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSlides,
  renderDeckHtml,
  normalizeDeck,
  hasSlideHtml,
  extractHtmlDoc,
  escapeHtml,
  mdInline,
  looksLikeClarifyingReply,
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

test('mdInline renders bold/italic/code instead of raw asterisks', () => {
  assert.equal(mdInline('**Core Structure**'), '<strong>Core Structure</strong>');
  assert.equal(mdInline('a `code` b'), 'a <code>code</code> b');
  assert.ok(!mdInline('**bold**').includes('*'));
});

test('rendered bullets have no raw ** markers', () => {
  const html = renderDeckHtml([{ title: 'T', bullets: ['**Bold point** here'] }]);
  assert.match(html, /<strong>Bold point<\/strong>/);
  assert.ok(!/\*\*/.test(html));
});

test('refuses to build a deck from a clarifying/outline reply (the pptx bug)', () => {
  // The exact failure: model outlined an approach and asked which style to use.
  const reply = `Here's how we'll approach this:
1. **Core Narrative Structure**: commercial inflection by 2030
2. **Visual Framework**: clean slide masters

Would you like the McKinsey-style game plan narrative, or Accenture's phased roadmap approach?`;
  assert.equal(looksLikeClarifyingReply(reply), true);
  assert.equal(normalizeDeck(reply, { title: 'X' }), null);
});

test('a genuine markdown outline (no questions) splits into multiple slides', () => {
  const deck = `## Market\n- Big TAM\n- Fast growth\n\n## Strategy\n- Land and expand\n- Cut churn`;
  const slides = extractSlides(deck);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].title, 'Market');
  assert.equal(slides[1].title, 'Strategy');
});
