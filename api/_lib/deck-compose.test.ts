import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { composePresentation } from '../generate-office.js';

const require = createRequire(import.meta.url);
const pptxgenModule: any = require('pptxgenjs');
const PptxGenJS: any = pptxgenModule.default || pptxgenModule;
const { Jimp } = require('jimp');

async function tinyPngDataUrl() {
  const buf = await new Jimp({ width: 40, height: 30, color: 0x22aa55ff }).getBuffer('image/png');
  return 'data:image/png;base64,' + buf.toString('base64');
}

// A representative deck that exercises EVERY slide type the schema allows, plus
// an embedded image — the exact surface that used to render blank or crash.
async function sampleSpec() {
  return {
    title: 'Quantora Strategy Review',
    slides: [
      { type: 'cover', title: 'Quantora Strategy Review', subtitle: 'FY26 outlook', author: 'Strategy Team' },
      { type: 'section', title: 'Where we stand' },
      { type: 'bullets', title: 'Momentum', subtitle: 'Three signals', bullets: ['Signups up 40%', 'Churn down', 'NPS 62'] },
      { type: 'bullets', title: 'Product', bullets: ['Decks ship', 'Preview parity'], images: [{ url: await tinyPngDataUrl(), caption: 'demo' }] },
      { type: 'data_viz', title: 'Revenue by quarter', data: [{ label: 'Q1', value: 50 }, { label: 'Q2', value: 75 }, { label: 'Q3', value: 110 }] },
      { type: 'matrix', title: 'Priorities', bullets: ['Now: reliability', 'Next: growth', 'Later: platform', 'Never: scope creep'] },
      { type: 'quote', quote: 'Ship the thing that actually works.', author: 'The team' },
    ],
  };
}

test('composePresentation renders every slide type into a valid .pptx', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const spec = await sampleSpec();

  const { slideImages, imageCount } = await composePresentation(pptx, spec);

  assert.equal(slideImages.length, spec.slides.length, 'one image-list per slide');
  assert.equal(imageCount, 1, 'the one embedded image is counted');
  assert.equal(slideImages[3].length, 1, 'the image slide carries its resolved data URL');

  const buffer: any = await pptx.write({ outputType: 'nodebuffer' });
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  assert.ok(buf.length > 5000, 'produced a non-trivial file');
  // PK\x03\x04 — a real OOXML zip, not an error string.
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'output is a zip container');
});

test('composePresentation tolerates a minimal / under-specified spec', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const { slideImages, imageCount } = await composePresentation(pptx, { title: 'Bare', slides: [{ title: 'Just a title' }] });
  assert.equal(imageCount, 0);
  assert.equal(slideImages.length, 1);
  const buffer: any = await pptx.write({ outputType: 'nodebuffer' });
  assert.ok((Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).length > 1000);
});
