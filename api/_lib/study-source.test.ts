import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestStudySource, STUDY_SOURCE_MAX_BYTES, STUDY_SOURCE_VERSION } from './study-source.js';

const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

test('accepts a bounded image as visual-only Study source without inventing OCR text', async () => {
  const result = await ingestStudySource({ filename: 'diagram.png', mimeType: 'image/png', dataBase64: tinyPng });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source.version, STUDY_SOURCE_VERSION);
  assert.equal(result.source.kind, 'image');
  assert.equal(result.source.extraction, 'visual_only');
  assert.deepEqual(result.source.pages, []);
  assert.equal(result.source.pageCount, null);
  assert.match(result.source.sourceId, /^src_[0-9a-f]{24}$/);
});

test('source id is deterministic for identical bytes', async () => {
  const a = await ingestStudySource({ filename: 'a.png', mimeType: 'image/png', dataBase64: tinyPng });
  const b = await ingestStudySource({ filename: 'b.png', mimeType: 'image/png', dataBase64: tinyPng });
  assert.equal(a.ok && b.ok ? a.source.sourceId : '', a.ok && b.ok ? b.source.sourceId : 'different');
});

test('sanitises path-like filenames before returning public provenance', async () => {
  const result = await ingestStudySource({ filename: '../private\\diagram.png', mimeType: 'image/png', dataBase64: tinyPng });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(!result.source.filename.includes('/'));
  assert.ok(!result.source.filename.includes('\\'));
});

test('rejects unsupported source types', async () => {
  const result = await ingestStudySource({ filename: 'notes.txt', mimeType: 'text/plain', dataBase64: Buffer.from('hello').toString('base64') });
  assert.deepEqual(result, { ok: false, reason: 'study_source_type_unsupported' });
});

test('rejects missing, malformed, or oversized payloads before parsing', async () => {
  assert.deepEqual(await ingestStudySource({ filename: 'x.pdf', mimeType: 'application/pdf' }), { ok: false, reason: 'study_source_invalid_or_too_large' });
  const tooLarge = Buffer.alloc(STUDY_SOURCE_MAX_BYTES + 1, 1).toString('base64');
  assert.deepEqual(await ingestStudySource({ filename: 'x.png', mimeType: 'image/png', dataBase64: tooLarge }), { ok: false, reason: 'study_source_invalid_or_too_large' });
});

test('malformed PDF fails closed rather than returning partial or guessed text', async () => {
  const result = await ingestStudySource({ filename: 'broken.pdf', mimeType: 'application/pdf', dataBase64: Buffer.from('not a pdf').toString('base64') });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'study_source_pdf_unreadable');
});
