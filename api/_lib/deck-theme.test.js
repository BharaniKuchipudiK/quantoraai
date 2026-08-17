import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySlide,
  normalizeChartData,
  renderPreviewSlide,
  buildDeckPreviewHtml,
} from './deck-theme.js';

test('classifySlide honours an explicit valid type', () => {
  assert.equal(classifySlide({ type: 'quote' }, 3), 'quote');
  assert.equal(classifySlide({ type: 'DATA_VIZ' }, 3), 'data_viz');
});

test('classifySlide infers a deliberate type when none is given', () => {
  assert.equal(classifySlide({}, 0), 'cover', 'first slide defaults to cover');
  assert.equal(classifySlide({ data: [{ label: 'Q1', value: 5 }] }, 2), 'data_viz');
  assert.equal(classifySlide({ quote: 'Hi' }, 2), 'quote');
  assert.equal(classifySlide({ bullets: ['a'] }, 2), 'bullets');
  assert.equal(classifySlide({ title: 'Only a title' }, 2), 'section');
});

test('normalizeChartData keeps clean numeric rows and drops junk', () => {
  const rows = normalizeChartData([
    { label: 'Q1', value: 50 },
    { label: 'Q2', value: '75' },
    { label: '', value: 9 },
    { label: 'Bad', value: 'NaN' },
    'nonsense',
  ]);
  assert.deepEqual(rows, [
    { label: 'Q1', value: 50 },
    { label: 'Q2', value: 75 },
  ]);
});

test('renderPreviewSlide renders each type without leaking unescaped input', () => {
  const html = renderPreviewSlide({ type: 'bullets', title: 'A & B <x>', bullets: ['<script>'] }, 1, 3);
  assert.match(html, /A &amp; B &lt;x&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('data_viz preview actually renders the data as bars (not a blank slide)', () => {
  const html = renderPreviewSlide({ type: 'data_viz', title: 'Rev', data: [{ label: 'Q1', value: 100 }] }, 1, 2);
  assert.match(html, /Q1/);
  assert.match(html, /100/);
});

test('quote preview renders the quote text', () => {
  const html = renderPreviewSlide({ type: 'quote', quote: 'Stay hungry', author: 'SJ' }, 1, 2);
  assert.match(html, /Stay hungry/);
  assert.match(html, /SJ/);
});

test('buildDeckPreviewHtml wraps every slide and is a full document', () => {
  const html = buildDeckPreviewHtml({
    title: 'Deck',
    slides: [{ type: 'cover', title: 'Hello' }, { type: 'bullets', title: 'Body', bullets: ['x'] }],
  });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Hello/);
  assert.match(html, /Body/);
});
