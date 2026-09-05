import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentKindForFile,
  describeExcludedAttachments,
  explainNothingToSend,
  partitionAttachments,
  carryDocuments,
  CARRIED_DOCUMENT_TURNS,
  MAX_ATTACHED_DOCUMENTS,
  MAX_ATTACHED_TOTAL_CHARS,
} from './chat-attachments.js';

const image = (name, chars = 100) => ({ name, type: 'image', dataUrl: `data:image/png;base64,${'A'.repeat(chars)}` });
const doc = (name, chars = 100, mimeType = 'application/pdf') => ({ name, type: 'document', mimeType, dataUrl: `data:${mimeType};base64,${'A'.repeat(chars)}` });

test('[was-red] a PDF and a spreadsheet travel as documents; an image travels as an image', () => {
  const out = partitionAttachments([image('photo.png'), doc('Bylaws.pdf'), doc('EC Body.xlsx', 100, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')]);
  assert.equal(out.images.length, 1);
  assert.deepEqual(out.documents.map((d) => d.name), ['Bylaws.pdf', 'EC Body.xlsx']);
  assert.deepEqual(out.excluded, []);
});

test('the composer classifies by type then extension, and says what it reads', () => {
  assert.equal(attachmentKindForFile({ name: 'a.PNG', type: 'image/png' }), 'image');
  assert.equal(attachmentKindForFile({ name: 'Assn Regn Certificate.pdf', type: 'application/pdf' }), 'document');
  assert.equal(attachmentKindForFile({ name: 'members.xlsx', type: '' }), 'document');
  assert.equal(attachmentKindForFile({ name: 'setup.exe', type: 'application/octet-stream' }), 'unsupported');
  const copy = describeExcludedAttachments([{ name: 'setup.exe', reason: 'unsupported' }]);
  assert.match(copy, /setup\.exe \(not a type I can read — I read images \(PNG\/JPG\), PDFs, Word, Excel/);
  assert.doesNotMatch(copy, /readable image/, 'a PDF is never called an unreadable image again');
});

test('limits are applied per kind and as a shared body budget, and each exclusion carries its reason', () => {
  const many = Array.from({ length: MAX_ATTACHED_DOCUMENTS + 1 }, (_, i) => doc(`d${i}.pdf`));
  const counted = partitionAttachments(many);
  assert.equal(counted.documents.length, MAX_ATTACHED_DOCUMENTS);
  assert.deepEqual(counted.excluded, [{ name: `d${MAX_ATTACHED_DOCUMENTS}.pdf`, reason: 'count' }]);

  const big = partitionAttachments([image('a.png', 3_400_000), doc('b.pdf', MAX_ATTACHED_TOTAL_CHARS - 3_400_000 + 50)]);
  assert.equal(big.images.length, 1);
  assert.deepEqual(big.excluded, [{ name: 'b.pdf', reason: 'size' }], 'the shared budget protects the request body');

  const reader = partitionAttachments([{ name: 'huge.pdf', type: 'document', excludedReason: 'size' }, { name: 'x.exe', type: 'file', excludedReason: 'unsupported' }]);
  assert.deepEqual(reader.excluded.map((e) => e.reason), ['size', 'unsupported'], 'the reader\'s reason is trusted over a guess');
  assert.match(explainNothingToSend(reader.excluded), /huge\.pdf is too large/);
});

test('context chips never go over the wire, and a clean turn has no heads-up', () => {
  const out = partitionAttachments([{ name: 'desk', type: 'context' }, doc('a.pdf')]);
  assert.equal(out.documents.length, 1);
  assert.equal(describeExcludedAttachments(out.excluded), '');
  assert.equal(explainNothingToSend([]), 'Add a message so I know what you would like me to do.');
});

test('documents stay with the conversation across the intake handoff, and leave with a new chat', () => {
  const ref = { current: null };
  const fresh = [doc('bylaws.pdf')];
  assert.deepEqual(carryDocuments(ref, 'chat-1', fresh), fresh, 'the turn they arrive on sends them as they are');
  const next = carryDocuments(ref, 'chat-1', []);
  assert.equal(next.length, 1);
  assert.equal(next[0].carried, true, 'the build turn after the designer\'s question still has them, marked as carried');
  assert.equal(carryDocuments(ref, 'chat-2', []).length, 0, 'a new chat starts empty');
  const replaced = carryDocuments(ref, 'chat-1', [doc('form.pdf')]);
  assert.equal(replaced[0].name, 'form.pdf', 'fresh documents replace what was carried');
  for (let i = 0; i < CARRIED_DOCUMENT_TURNS; i += 1) carryDocuments(ref, 'chat-1', []);
  assert.equal(carryDocuments(ref, 'chat-1', []).length, 0, 'and they do not follow the chat forever');
});
