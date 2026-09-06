/*
 * ONE ENTRY OUT OF A ZIP, WITH NOTHING BUT NODE.
 *
 * A Word, Excel or PowerPoint file is a zip, and the only way to prove the
 * deployed Office generator produced the document it was asked for is to open
 * the file it handed the browser and read the part that carries the words
 * (word/document.xml, ppt/slides/slide1.xml, xl/sharedStrings.xml). The
 * repository's zip libraries are transitive dependencies of the generators,
 * not of the gates, so the gate reads the format itself: the end-of-central-
 * directory record, the central directory, the local header, and inflateRaw.
 * Stored (0) and deflated (8) entries are the two methods Office writers use.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xffff;

function findEndOfCentralDirectory(buffer) {
  const floor = Math.max(0, buffer.length - EOCD_MIN_LENGTH - MAX_COMMENT_LENGTH);
  for (let offset = buffer.length - EOCD_MIN_LENGTH; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/** Every entry's name, method, sizes and local header offset, from the central directory. */
export function listZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('Not a zip file: no end-of-central-directory record.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`Corrupt zip: central directory entry ${index} is missing its signature.`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, size, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The bytes of one named entry, or null when the zip has no such entry. */
export function readZipEntry(input, entryName) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entry = listZipEntries(buffer).find((candidate) => candidate.name === entryName);
  if (!entry) return null;
  const local = entry.localOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    throw new Error(`Corrupt zip: "${entryName}" has no local header where the central directory says it is.`);
  }
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Zip entry "${entryName}" uses compression method ${entry.method}, which this reader does not handle.`);
}

/** The text of one entry, or null. */
export function readZipEntryText(input, entryName) {
  const bytes = readZipEntry(input, entryName);
  return bytes === null ? null : bytes.toString('utf8');
}

/** The words of an Office XML part: tags removed, whitespace folded. */
export function xmlText(xml) {
  return String(xml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
