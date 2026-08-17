import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintOfficePreview,
  injectOfficeManifest,
  normalizeOfficeSpec,
  validateOfficeSpec,
  verifyCompiledOfficeArtifact,
  verifyPresentationCommunicationQuality,
} from './office-artifact.js';

function fakeZip(...entries) {
  return Buffer.concat([
    Buffer.from('PK\x03\x04', 'latin1'),
    Buffer.alloc(2000, 0),
    ...entries.map((entry) => Buffer.from(entry)),
  ]);
}

function previewDocument(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}</style></head><body>${body}</body></html>`;
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
  const ppt = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: fakeZip('[Content_Types].xml', 'ppt/slides/slide1.xml'),
    spec: pptSpec,
    htmlPreview: previewDocument('<section><h1>Deck</h1></section><section><h2>Plan</h2><p>Do it</p></section>'),
  });
  assert.equal(ppt.passed, true, ppt.issues.join('; '));

  const wordSpec = normalizeOfficeSpec('word', { title: 'Report', sections: [{ heading: 'Summary', paragraphs: ['Text'] }] });
  const word = verifyCompiledOfficeArtifact('word', {
    buffer: fakeZip('[Content_Types].xml', 'word/document.xml'),
    spec: wordSpec,
    htmlPreview: previewDocument('<h1>Report</h1><section><h2>Summary</h2><p>Text</p></section>'),
  });
  assert.equal(word.passed, true, word.issues.join('; '));

  const excelSpec = normalizeOfficeSpec('excel', { filename: 'Book', sheets: [{ name: 'Summary', data: [['A']] }, { name: 'Data', data: [['B']] }] });
  const excel = verifyCompiledOfficeArtifact('excel', {
    buffer: fakeZip('[Content_Types].xml', 'xl/workbook.xml'),
    spec: excelSpec,
    htmlPreview: previewDocument('<section data-sheet-name="Summary"><h2>Summary</h2><table><tr><td>A</td></tr></table></section><section data-sheet-name="Data"><h2>Data</h2><table><tr><td>B</td></tr></table></section>'),
  });
  assert.equal(excel.passed, true, excel.issues.join('; '));
});

test('negative golden: rejects generic AI consulting slide pattern before release', () => {
  const result = verifyPresentationCommunicationQuality({
    version: 2,
    title: 'AI Travel Agent',
    archetype: 'strategy',
    communicationStandard: 'consulting',
    slides: [
      { type: 'cover', title: 'AI Travel Agent' },
      {
        type: 'bullets',
        title: 'Should You Build an AI Travel Agent?',
        bullets: ['Pros', 'Cons'],
        images: [{ url: 'https://example.com/aircraft.jpg', caption: 'Aircraft' }],
      },
      { type: 'bullets', title: 'Pros & Cons', bullets: ['Faster planning', 'Integration risk'] },
      { type: 'bullets', title: 'Recommendation', bullets: ['Proceed carefully'] },
      { type: 'bullets', title: 'Next Steps', bullets: ['Pilot'] },
    ],
  });

  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /assertion-led executive headline/i.test(issue)));
  assert.ok(result.issues.some((issue) => /decorative stock imagery/i.test(issue)));
  assert.ok(result.issues.some((issue) => /executive_summary/i.test(issue)));
  assert.ok(result.issues.some((issue) => /analytical\/evidence composition/i.test(issue)));
});

test('accepts an assertion-led, evidence-aware consulting storyline', () => {
  const result = verifyPresentationCommunicationQuality({
    version: 2,
    title: 'AI Travel Agent Strategy',
    archetype: 'strategy',
    communicationStandard: 'consulting',
    decisionAsk: 'Approve a controlled discovery and pilot before transactional autonomy.',
    sourceNotes: ['Qualitative strategic assessment; no external quantitative evidence was supplied.'],
    slides: [
      { type: 'cover', title: 'AI travel agents can create value, but autonomy should be earned in stages' },
      {
        type: 'executive_summary',
        title: 'Planning assistance is attractive now while autonomous booking remains the material control boundary',
        bullets: ['Planning productivity can improve without transaction risk', 'Provider reliability remains uneven', 'Human approval should gate consequential actions'],
        insight: 'Start with assisted planning and verification; defer autonomous booking until controls prove reliable.',
      },
      {
        type: 'framework',
        title: 'Value concentrates in planning and orchestration while transaction execution carries the highest control burden',
        framework: [
          { heading: 'Discover', detail: 'Research and compare options', status: 'green' },
          { heading: 'Decide', detail: 'Synthesize trade-offs and recommendations', status: 'green' },
          { heading: 'Transact', detail: 'Book only behind explicit approval and provider confirmation', status: 'amber' },
        ],
        insight: 'Separate low-risk cognition from high-consequence execution.',
      },
      {
        type: 'comparison',
        title: 'A staged copilot model offers better control than jumping directly to autonomous booking',
        options: [
          { name: 'Copilot', summary: 'Assist research and planning', pros: ['Fast learning'], cons: ['Human effort remains'], recommended: true },
          { name: 'Autonomous agent', summary: 'Execute bookings end to end', pros: ['Maximum automation'], cons: ['Higher transaction and reliability risk'] },
        ],
        insight: 'The copilot path preserves learning while containing irreversible-action risk.',
      },
      {
        type: 'roadmap',
        title: 'Three controlled stages can prove value before Quantora accepts transactional responsibility',
        actions: [
          { title: 'Planning pilot', timing: 'Stage 1', status: 'green', detail: 'Research, compare and construct itineraries' },
          { title: 'Verified handoff', timing: 'Stage 2', status: 'amber', detail: 'Provider-confirmed availability with human approval' },
          { title: 'Selective execution', timing: 'Stage 3', status: 'amber', detail: 'Only after reliability and audit controls pass' },
        ],
        recommendation: 'Approve Stage 1 and define measurable reliability gates before progressing.',
      },
    ],
  });

  assert.equal(result.passed, true, result.issues.join('; '));
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
  const html = previewDocument('<h1>Report</h1><h2>Summary</h2><p>Text</p>');
  const fingerprint = fingerprintOfficePreview(html);
  const withManifest = injectOfficeManifest(html, {
    kind: 'word',
    spec: { title: 'Report', sections: [{ heading: 'Summary', paragraphs: ['Text'], bullets: [] }] },
    previewFingerprint: fingerprint,
  });
  assert.match(withManifest, /id="quantora-office-manifest"/);
  assert.match(withManifest, new RegExp(fingerprint));
});
