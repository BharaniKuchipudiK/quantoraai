import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileOfficeArtifact, composePresentation } from '../generate-office.js';
import { normalizeOfficeSpec, verifyCompiledOfficeArtifact } from './office-artifact.js';

const require = createRequire(import.meta.url);
const pptxgenModule: any = require('pptxgenjs');
const PptxGenJS: any = pptxgenModule.default || pptxgenModule;
const { Jimp } = require('jimp');

async function tinyPngDataUrl() {
  const buf = await new Jimp({ width: 40, height: 30, color: 0x22aa55ff }).getBuffer('image/png');
  return 'data:image/png;base64,' + buf.toString('base64');
}

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

test('canonical PowerPoint compiler passes the same structural verification gate used in production', async () => {
  const spec = normalizeOfficeSpec('powerpoint', await sampleSpec());
  const compiled = await compileOfficeArtifact('powerpoint', spec);
  const verification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/<section\b/gi) || []).length, spec.slides.length);
  assert.ok(compiled.buffer.length > 5000);
});

test('canonical Word compiler creates a real OOXML document and preview with matching sections', async () => {
  const spec = normalizeOfficeSpec('word', {
    title: 'Operating Model Review',
    sections: [
      { heading: 'Executive summary', paragraphs: ['Quantora should use one canonical artifact contract.'], bullets: ['Verified before download', 'Human review remains explicit'] },
      { heading: 'Controls', paragraphs: ['Compilation failures fail closed rather than degrading output.'] },
    ],
  });
  const compiled = await compileOfficeArtifact('word', spec);
  const verification = verifyCompiledOfficeArtifact('word', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/<h2\b/gi) || []).length, 2);
  assert.equal(compiled.buffer.subarray(0, 2).toString('latin1'), 'PK');
});

test('canonical Excel compiler preserves every worksheet and passes workbook verification', async () => {
  const spec = normalizeOfficeSpec('excel', {
    filename: 'Reliability_Model',
    sheets: [
      {
        name: 'Summary',
        data: [
          [{ value: 'Metric', fontWeight: 'bold' }, { value: 'Value', fontWeight: 'bold' }],
          ['Preview parity', { value: 100, type: 'Number', format: '0%' }],
        ],
      },
      {
        name: 'Controls',
        data: [
          ['Control', 'Status'],
          ['OOXML verification', 'Required'],
          ['Human approval', 'Required'],
        ],
      },
    ],
  });
  const compiled = await compileOfficeArtifact('excel', spec);
  const verification = verifyCompiledOfficeArtifact('excel', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/data-sheet-name=/gi) || []).length, 2, 'both worksheets are represented in preview');
  assert.equal(compiled.buffer.subarray(0, 2).toString('latin1'), 'PK');
});
