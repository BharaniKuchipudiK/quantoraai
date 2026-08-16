import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConsultingDeck, buildDeck } from './deck-render.js';

const fullSpec = {
  title: 'Quantum 2030',
  slides: [
    { layout: 'cover', title: 'Quantum Computing in 2030', subtitle: 'A consulting perspective' },
    { layout: 'section', title: 'Market Landscape', subtitle: 'Where value forms' },
    { layout: 'bullets', title: 'Value concentrates in three sectors', bullets: ['**Finance**', 'Pharma', 'Logistics'] },
    { layout: 'stat', title: 'The prize', stats: [{ value: '$5B', label: 'market by 2030' }, { value: '70%', label: 'value concentration' }] },
    { layout: 'chart', title: 'Market growth', chart: { type: 'bar', caption: 'Source: analysis', data: [{ label: '2024', value: 12 }, { label: '2030', value: 48 }] }, bullets: ['4x growth'] },
    { layout: 'chart', title: 'Split', chart: { type: 'donut', data: [{ label: 'Finance', value: 40 }, { label: 'Pharma', value: 35 }] } },
    { layout: 'two-column', title: 'Then vs now', columns: [{ heading: 'Today', bullets: ['NISQ'] }, { heading: '2030', bullets: ['Fault-tolerant'] }] },
    { layout: 'quote', quote: 'The winners will move first.', attribution: 'BCG' },
    { layout: 'close', title: 'Recommended next steps', bullets: ['Stand up a CoE'] },
  ],
};

test('renderConsultingDeck produces self-contained, export-safe, slide-structured HTML', () => {
  const html = renderConsultingDeck(fullSpec);
  assert.match(html, /<!DOCTYPE html>/);
  const slideCount = (html.match(/<section class="slide/g) || []).length;
  assert.equal(slideCount, 9);
  assert.ok(!/https?:\/\//.test(html), 'must reference no external URL/CDN');
  assert.ok(!/<img\s/i.test(html), 'no <img> tags — visuals are inline SVG');
});

test('renders every layout + inline SVG charts', () => {
  const html = renderConsultingDeck(fullSpec);
  assert.match(html, /cover-h/);         // cover
  assert.match(html, /sec-num/);         // section
  assert.match(html, /class="stat"/);    // stat
  assert.match(html, /<svg /);           // chart svg present
  assert.match(html, /<rect /);          // bar chart
  assert.match(html, /<circle /);        // donut chart
  assert.match(html, /class="cols"/);    // two-column
  assert.match(html, /blockquote/);      // quote
});

test('markdown bold renders; no raw ** leaks', () => {
  const html = renderConsultingDeck(fullSpec);
  assert.match(html, /<strong>Finance<\/strong>/);
  assert.ok(!/\*\*/.test(html));
});

test('content is HTML-escaped (no injection)', () => {
  const html = renderConsultingDeck({ title: 'T', slides: [{ layout: 'bullets', title: '<script>x</script>', bullets: ['ok'] }] });
  assert.ok(!/<script>x/.test(html));
  assert.match(html, /&lt;script&gt;/);
});

test('buildDeck: JSON spec → consulting deck', () => {
  const text = '```json\n{"title":"D","slides":[{"layout":"cover","title":"Hello"},{"layout":"bullets","title":"T","bullets":["a","b"]}]}\n```';
  const html = buildDeck(text, { title: 'D' });
  assert.match(html, /Hello/);
  assert.match(html, /class="slide/);
});

test('buildDeck: markdown fallback still yields a consulting deck', () => {
  const text = '## Market\n- Big TAM\n- Fast growth\n\n## Strategy\n- Land and expand';
  const html = buildDeck(text, { title: 'D' });
  assert.ok(html);
  assert.match(html, /Market/);
  assert.match(html, /class="slide/);
});

test('buildDeck: a clarifying/question reply yields null (never scraped)', () => {
  const text = "Here's how we'll approach this:\n1. **Structure**\nWould you like McKinsey or Accenture style?";
  assert.equal(buildDeck(text, { title: 'D' }), null);
});

test('buildDeck: prefers the model\'s own self-contained slide HTML', () => {
  const real = '<!doctype html><html><body><section class="slide"><h1>Real</h1></section></body></html>';
  assert.equal(buildDeck('```html\n' + real + '\n```'), real);
});
