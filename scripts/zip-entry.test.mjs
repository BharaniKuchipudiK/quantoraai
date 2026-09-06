import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32 } from 'node:zlib';
import { deflateRawSync } from 'node:zlib';
import { listZipEntries, readZipEntry, readZipEntryText, xmlText } from './lib/zip-entry.mjs';
import { wordDocumentWords } from './lib/office-words.mjs';

/**
 * A zip written by hand, the way a generator writes one: a local header and
 * data per entry, then the central directory, then the end record. Two
 * methods, because Office writers use both.
 */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, content, method } of entries) {
    const raw = Buffer.from(content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, 'utf8');
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

const DOCUMENT_XML = '<w:document><w:body><w:p><w:r><w:t>Golden Canary Brief GC-123456</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>';

test('reads a stored and a deflated entry back out of a zip by name', () => {
  const zip = buildZip([
    { name: '[Content_Types].xml', content: '<Types/>', method: 0 },
    { name: 'word/document.xml', content: DOCUMENT_XML, method: 8 },
  ]);
  assert.deepEqual(listZipEntries(zip).map((entry) => entry.name), ['[Content_Types].xml', 'word/document.xml']);
  assert.equal(readZipEntryText(zip, '[Content_Types].xml'), '<Types/>');
  assert.equal(readZipEntryText(zip, 'word/document.xml'), DOCUMENT_XML);
  assert.equal(xmlText(readZipEntryText(zip, 'word/document.xml')), 'Golden Canary Brief GC-123456 Second paragraph.');
  // A Word file written from runs keeps its words in document.xml, and the
  // words reader says so.
  assert.deepEqual(wordDocumentWords(zip), {
    words: 'Golden Canary Brief GC-123456 Second paragraph.',
    parts: [{ name: 'word/document.xml', words: 'Golden Canary Brief GC-123456 Second paragraph.' }],
  });
  assert.equal(wordDocumentWords(buildZip([{ name: 'a.txt', content: 'a', method: 0 }])), null);
});

test('a missing entry is null, and a file that is not a zip says so', () => {
  const zip = buildZip([{ name: 'a.txt', content: 'a', method: 0 }]);
  assert.equal(readZipEntry(zip, 'word/document.xml'), null);
  assert.throws(() => readZipEntry(Buffer.from('%PDF-1.4 not a zip at all'), 'a.txt'), /Not a zip file/);
});

test('an unknown compression method is refused by name rather than decoded as garbage', () => {
  const zip = buildZip([{ name: 'odd.bin', content: 'x', method: 12 }]);
  assert.throws(() => readZipEntry(zip, 'odd.bin'), /compression method 12/);
});
