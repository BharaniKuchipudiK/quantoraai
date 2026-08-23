import assert from 'node:assert/strict';
import test from 'node:test';
import { detectOutcomeGaps, injectGapContinues } from './outcome-gap-detection.js';

test('a boutique website reply without payments or shipping gets those follow-up chips', () => {
  const gaps = detectOutcomeGaps(
    'develop a website for a boutique that sells sarees and ready made dresses',
    'I built Varnika Heritage with a catalog and cart.\n\n```html\n<!DOCTYPE html><html><body>shop</body></html>\n```',
  );
  const labels = gaps.map((gap) => gap.label);
  assert.ok(labels.includes('Add a payment gateway'));
  assert.ok(labels.includes('Domestic or international?'));
  assert.ok(labels.includes('Add real product photos'));
  assert.equal(labels.includes('Publish this site'), false);
});

test('commerce chips still appear when the model omitted quantora-continues', () => {
  const gaps = detectOutcomeGaps(
    'website for my saree boutique',
    'Here is the shop.',
  );
  const chips = injectGapContinues(null, gaps);
  assert.ok(chips.items.some((item) => /payment/i.test(item.label)));
  assert.ok(chips.items.some((item) => /Domestic or international/i.test(item.label)));
});

test('a boutique with real product photos may offer Publish', () => {
  const gaps = detectOutcomeGaps(
    'website for my saree boutique',
    'Built.\n```html\n<img src="https://images.unsplash.com/photo-silk" alt="saree">\n```',
  );
  assert.ok(gaps.some((gap) => gap.label === 'Publish this site'));
  assert.equal(gaps.some((gap) => gap.label === 'Add real product photos'), false);
});

test('Travel missing ratings and links asks for live Places stays, not invented URLs', () => {
  const gaps = detectOutcomeGaps(
    'Can you give me the ratings and links to the properties',
    'Here are three hotels in Asakusa.',
    { studioDomain: 'travel' },
  );
  const labels = gaps.map((gap) => gap.label);
  assert.ok(labels.includes('Look up live stays'));
  assert.equal(labels.includes('Add direct links'), false);
});

test('Study does not get boutique website continue chips', () => {
  const gaps = detectOutcomeGaps(
    'help me learn the Newton laws',
    'Here is a mini-quiz on force.',
    { studioDomain: 'education' },
  );
  assert.equal(gaps.some((gap) => /payment|publish/i.test(gap.label)), false);
});

test('Preview facts suppress a photo chip even when chat HTML omitted images', () => {
  const gaps = detectOutcomeGaps(
    'website for my saree boutique',
    'I added high-resolution photos.',
    { deskFacts: { hasPhotos: true, photoCount: 4 } },
  );
  assert.equal(gaps.some((gap) => gap.label === 'Add real product photos'), false);
});

test('failed desk probes become continue chips ahead of chat vibes', () => {
  const gaps = detectOutcomeGaps(
    'please include a currency converter',
    'Done — currency is on the boutique.',
    { deskChecks: [{ id: 'currency', ok: false, label: 'Currency switcher missing from Preview' }] },
  );
  assert.equal(gaps[0].id, 'gap-currency');
});

test('an Office deck gets presentation chips, not Vercel publish', () => {
  const gaps = detectOutcomeGaps(
    'pre-kick off HAM SAM presentation',
    'The PowerPoint is in Preview.',
    { officeKind: 'powerpoint' },
  );
  const labels = gaps.map((gap) => gap.label);
  assert.ok(labels.includes('Tighten the storyline'));
  assert.equal(labels.some((label) => /publish|vercel/i.test(label)), false);
});
