import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintOfficePreview,
  injectOfficeManifest,
  normalizeOfficeSpec,
  validateOfficeSpec,
  verifyCompiledOfficeArtifact,
} from './office-artifact.js';

function fakeZip(...entries) {
  return Buffer.concat([
    Buffer.from('PK\x03\x04', 'latin1'),
    Buffer.alloc(2000, 0),
    ...entries.map((entry) => Buffer.from(entry)),
  ]);
}

test('normalizes and validates a PowerPoint spec without losing meaningful content', () => {
  const input = {
    title: 'Strategy',
    slides: [
      { type: 'cover', title: 'Strategy', subtitle: 'FY27' },
      { type: 'matrix', title: 'Priorities', bullets: ['A', 'B', 'C', 'D', 'E'] },
    ],
  };
  const result = validateOfficeSpec('powerpoint', input);
  assert.equal(result.valid, true);
  assert.equal(result.spec.slides.length, 2);
  assert.deepEqual(result.spec.slides[1].bullets, ['A', 'B', 'C', 'D']);
});

test('rejects empty Word and Excel specifications', () => {
  assert.equal(validateOfficeSpec('word', { title: 'Empty', sections: [] }).valid, false);
  assert.equal(validateOfficeSpec('excel', { filename: 'Empty', sheets: [] }).valid, false);
});

test('normalizes unique Excel sheet names and preserves number formats', () => {
  const spec = normalizeOfficeSpec('excel', {
    filename: 'Model',
    sheets: [
      { name: 'Summary', data: [[{ value: 1234.5, type: 'Number', format: '$#,##0.00', fontWeight: 'bold' }]] },
      { name: 'Summary', data: [['Second']] },
    ],
  });
  assert.equal(spec.sheets[0].name, 'Summary');
  assert.equal(spec.sheets[1].name, 'Summary 2');
  assert.equal(spec.sheets[0].data[0][0].format, '$#,##0.00');
});

test('verifies structural parity for all three Office formats', () => {
  const pptSpec = normalizeOfficeSpec('powerpoint', { title: 'Deck', slides: [{ title: 'Deck' }, { title: 'Plan', bullets: ['Do it'] }] });
  const pptPreview = '<html><body><section>Deck</section><section>Plan Do it</section></body></html>';
  const ppt = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: fakeZip('[Content_Types].xml', 'ppt/slides/slide1.xml'),
    spec: pptSpec,
    htmlPreview: pptPreview,
  });
  assert.equal(ppt.passed, true, ppt.issues.join('; '));

  const wordSpec = normalizeOfficeSpec('word', { title: 'Report', sections: [{ heading: 'Summary', paragraphs: ['Text'] }] });
  const word = verifyCompiledOfficeArtifact('word', {
    buffer: fakeZip('[Content_Types].xml', 'word/document.xml'),
    spec: wordSpec,
    htmlPreview: '<html><body><h1>Report</h1><h2>Summary</h2><p>Text</p></body></html>',
  });
  assert.equal(word.passed, true, word.issues.join('; '));

  const excelSpec = normalizeOfficeSpec('excel', { filename: 'Book', sheets: [{ name: 'Summary', data: [['A']] }, { name: 'Data', data: [['B']] }] });
  const excel = verifyCompiledOfficeArtifact('excel', {
    buffer: fakeZip('[Content_Types].xml', 'xl/workbook.xml'),
    spec: excelSpec,
    htmlPreview: '<html><body><section data-sheet-name="Summary">Summary</section><section data-sheet-name="Data">Data</section></body></html>',
  });
  assert.equal(excel.passed, true, excel.issues.join('; '));
});

test('fails closed when OOXML or preview parity is broken', () => {
  const spec = normalizeOfficeSpec('powerpoint', { title: 'Deck', slides: [{ title: 'Deck' }, { title: 'Plan' }] });
  const verification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: Buffer.from('not-a-zip'),
    spec,
    htmlPreview: '<html><body><section>Deck</section></body></html>',
  });
  assert.equal(verification.passed, false);
  assert.ok(verification.issues.length >= 2);
});

test('manifest fingerprints the preview before the manifest is injected', () => {
  const html = '<html><body><h1>Report</h1><h2>Summary</h2></body></html>';
  const fingerprint = fingerprintOfficePreview(html);
  const withManifest = injectOfficeManifest(html, {
    kind: 'word',
    spec: { title: 'Report', sections: [{ heading: 'Summary', paragraphs: ['Text'], bullets: [] }] },
    previewFingerprint: fingerprint,
  });
  assert.match(withManifest, /id="quantora-office-manifest"/);
  assert.match(withManifest, new RegExp(fingerprint));
});
