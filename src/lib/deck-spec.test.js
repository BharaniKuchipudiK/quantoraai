import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeckSpec, normalizeSlide, normalizeSpec, specFromSlides, SLIDE_LAYOUT } from './deck-spec.js';

test('parses a fenced JSON deck spec', () => {
  const text = 'Here is your presentation.\n```json\n{"title":"Quantum 2030","slides":[{"layout":"cover","title":"Quantum Computing in 2030"},{"layout":"bullets","title":"Value concentrates in 3 sectors","bullets":["Finance","Pharma","Logistics"]}]}\n```';
  const spec = parseDeckSpec(text);
  assert.equal(spec.title, 'Quantum 2030');
  assert.equal(spec.slides.length, 2);
  assert.equal(spec.slides[0].layout, 'cover');
  assert.deepEqual(spec.slides[1].bullets, ['Finance', 'Pharma', 'Logistics']);
});

test('parses an inline (unfenced) spec with loose JSON', () => {
  const text = `Sure. {title:'Deck', slides:[{layout:'stat', title:'Market', stats:[{value:'$5B', label:'by 2030'}]},]}`;
  const spec = parseDeckSpec(text);
  assert.ok(spec);
  assert.equal(spec.slides[0].layout, 'stat');
  assert.equal(spec.slides[0].stats[0].value, '$5B');
});

test('normalizeSlide infers layout from content when missing/invalid', () => {
  assert.equal(normalizeSlide({ title: 'x', chart: { type: 'bar', data: [{ label: 'a', value: 1 }] } }).layout, SLIDE_LAYOUT.CHART);
  assert.equal(normalizeSlide({ title: 'x', stats: [{ value: '9', label: 'y' }] }).layout, SLIDE_LAYOUT.STAT);
  assert.equal(normalizeSlide({ title: 'x', columns: [{ heading: 'a' }, { heading: 'b' }] }).layout, SLIDE_LAYOUT.TWO_COLUMN);
  assert.equal(normalizeSlide({ title: 'x', bullets: ['a'] }).layout, SLIDE_LAYOUT.BULLETS);
  assert.equal(normalizeSlide({ layout: 'nonsense', title: 'x', bullets: ['a'] }).layout, SLIDE_LAYOUT.BULLETS);
});

test('normalizeChart drops invalid points and requires numeric data', () => {
  const s = normalizeSlide({ layout: 'chart', title: 't', chart: { type: 'pie', data: [{ label: 'a', value: '5' }, { label: '', value: 3 }, { label: 'b', value: 'x' }] } });
  assert.equal(s.chart.type, 'bar'); // 'pie' → default bar
  assert.deepEqual(s.chart.data, [{ label: 'a', value: 5 }]);
});

test('empty slides and specs are rejected', () => {
  assert.equal(normalizeSlide({ layout: 'bullets' }), null);
  assert.equal(normalizeSpec({ slides: [] }), null);
  assert.equal(parseDeckSpec('just a sentence, no spec'), null);
});

test('specFromSlides makes the first slide a cover', () => {
  const spec = specFromSlides([{ title: 'A', bullets: ['x'] }, { title: 'B', bullets: ['y'] }], 'Deck');
  assert.equal(spec.slides[0].layout, SLIDE_LAYOUT.COVER);
  assert.equal(spec.slides[1].layout, SLIDE_LAYOUT.BULLETS);
});
