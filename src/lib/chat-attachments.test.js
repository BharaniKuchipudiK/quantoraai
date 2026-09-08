import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentKindForFile,
  describeExcludedAttachments,
  explainNothingToSend,
  partitionAttachments,
  carryDocuments,
  CARRIED_DOCUMENT_TURNS,
  CARRIED_IMAGE_TURNS,
  MAX_CARRIED_ATTACHMENT_SESSIONS,
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

test('[was-red] a photographed solution stays available for three follow-up turns in the same chat', () => {
  const ref = { current: null };
  const first = partitionAttachments([image('working.png')]);
  assert.equal(first.images.length, 1);
  assert.deepEqual(carryDocuments(ref, 'study-chat', first.documents), []);

  for (let turn = 0; turn < CARRIED_IMAGE_TURNS; turn += 1) {
    const followUp = partitionAttachments([]);
    assert.deepEqual(carryDocuments(ref, 'study-chat', followUp.documents), []);
    assert.deepEqual(followUp.images, first.images, `follow-up ${turn + 1} lost the original pixels`);
  }

  const expired = partitionAttachments([]);
  carryDocuments(ref, 'study-chat', expired.documents);
  assert.equal(expired.images.length, 0, 'image context must expire instead of following the chat forever');
});

test('carried image pixels never cross into a different chat', () => {
  const ref = { current: null };
  const first = partitionAttachments([image('assessment.png')]);
  carryDocuments(ref, 'study-a', first.documents);

  const otherChat = partitionAttachments([]);
  carryDocuments(ref, 'study-b', otherChat.documents);
  assert.equal(otherChat.images.length, 0);
});

test('[was-red] interleaved chats keep their own carried image context', () => {
  const ref = { current: null };
  const sourceA = partitionAttachments([image('a-working.png', 80)]);
  const sourceB = partitionAttachments([image('b-working.png', 120)]);
  carryDocuments(ref, 'study-a', sourceA.documents);
  carryDocuments(ref, 'study-b', sourceB.documents);

  const followUpA = partitionAttachments([]);
  carryDocuments(ref, 'study-a', followUpA.documents);
  assert.deepEqual(followUpA.images, sourceA.images, 'chat B must not overwrite chat A source context');

  const followUpB = partitionAttachments([]);
  carryDocuments(ref, 'study-b', followUpB.documents);
  assert.deepEqual(followUpB.images, sourceB.images, 'returning to chat B must recover chat B source context');
});

test('[was-red] carried attachment sessions are a bounded LRU instead of an unbounded heap cache', () => {
  const ref = { current: null };
  const sources = [];

  for (let i = 0; i < MAX_CARRIED_ATTACHMENT_SESSIONS; i += 1) {
    const source = partitionAttachments([image(`working-${i}.png`, 80 + i)]);
    sources.push(source);
    carryDocuments(ref, `study-${i}`, source.documents);
  }

  // Touch the oldest so the second-oldest becomes the LRU entry.
  const touchOldest = partitionAttachments([]);
  carryDocuments(ref, 'study-0', touchOldest.documents);
  assert.deepEqual(touchOldest.images, sources[0].images);

  const newest = partitionAttachments([image('working-newest.png', 160)]);
  carryDocuments(ref, 'study-newest', newest.documents);

  const evicted = partitionAttachments([]);
  carryDocuments(ref, 'study-1', evicted.documents);
  assert.equal(evicted.images.length, 0, 'least-recent attachment session should be evicted once the hard cap is exceeded');

  const retained = partitionAttachments([]);
  carryDocuments(ref, 'study-0', retained.documents);
  assert.deepEqual(retained.images, sources[0].images, 'recently used attachment context should survive LRU eviction');
});

test('fresh source attachments replace stale carried context across image and document kinds', () => {
  const ref = { current: null };

  const firstImage = partitionAttachments([image('old-working.png')]);
  carryDocuments(ref, 'study-chat', firstImage.documents);

  const freshDocument = partitionAttachments([doc('mark-scheme.pdf')]);
  assert.deepEqual(carryDocuments(ref, 'study-chat', freshDocument.documents).map((entry) => entry.name), ['mark-scheme.pdf']);
  assert.equal(freshDocument.images.length, 0, 'a fresh document must not silently inherit an older image');

  const afterDocument = partitionAttachments([]);
  const carriedDocument = carryDocuments(ref, 'study-chat', afterDocument.documents);
  assert.equal(afterDocument.images.length, 0);
  assert.deepEqual(carriedDocument.map((entry) => entry.name), ['mark-scheme.pdf']);
  assert.equal(carriedDocument[0].carried, true);

  const freshImage = partitionAttachments([image('new-working.png')]);
  carryDocuments(ref, 'study-chat', freshImage.documents);
  const afterImage = partitionAttachments([]);
  const documentsWhileImageIsActive = carryDocuments(ref, 'study-chat', afterImage.documents);
  assert.equal(documentsWhileImageIsActive.length, 0, 'recent image context takes precedence over older document carry');
  assert.deepEqual(afterImage.images, freshImage.images);
});

test('an unsupported or oversize fresh source clears old image context instead of answering against stale pixels', () => {
  const ref = { current: null };
  const first = partitionAttachments([image('old-working.png')]);
  carryDocuments(ref, 'study-chat', first.documents);

  const refused = partitionAttachments([{ name: 'new-source.exe', type: 'file', excludedReason: 'unsupported' }]);
  assert.deepEqual(carryDocuments(ref, 'study-chat', refused.documents), []);
  assert.equal(refused.images.length, 0);

  const next = partitionAttachments([]);
  carryDocuments(ref, 'study-chat', next.documents);
  assert.equal(next.images.length, 0, 'the rejected fresh source must not fall back to an unrelated old image');
});
