import { inflateRawSync } from 'node:zlib';

/**
 * A minimal ZIP reader for Office files (.xlsx/.docx/.pptx are ZIP archives of
 * XML). Dependency-free on purpose: the platform's only ZIP dependency writes
 * archives, and pulling a spreadsheet library into every chat cold start for
 * the occasional attachment is the wrong trade. Handles what Office writes —
 * stored (0) and deflate (8) entries, sizes read from the central directory so
 * data-descriptor entries work — and refuses anything else by name.
 *
 * The size budget is a guard against archive bombs: it is enforced on the
 * declared sizes AND on the inflater's output, since the two may disagree.
 */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_BYTES = 65_535;

export const DEFAULT_ZIP_BUDGET_BYTES = 32 * 1024 * 1024;

export function readZipEntries(
  bytes: Uint8Array,
  options: { wanted?: (name: string) => boolean; maxTotalBytes?: number } = {},
): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxTotal = options.maxTotalBytes ?? DEFAULT_ZIP_BUDGET_BYTES;
  const wanted = options.wanted ?? (() => true);
  if (buf.length < 22) throw new Error('not a zip archive');

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - MAX_COMMENT_BYTES); i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const entryCount = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);

  const entries = new Map<string, Uint8Array>();
  let position = directoryOffset;
  let declaredTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (position + 46 > buf.length || buf.readUInt32LE(position) !== CENTRAL_SIGNATURE) {
      throw new Error('corrupt central directory');
    }
    const method = buf.readUInt16LE(position + 10);
    const compressedSize = buf.readUInt32LE(position + 20);
    const uncompressedSize = buf.readUInt32LE(position + 24);
    const nameLength = buf.readUInt16LE(position + 28);
    const extraLength = buf.readUInt16LE(position + 30);
    const commentLength = buf.readUInt16LE(position + 32);
    const localOffset = buf.readUInt32LE(position + 42);
    const name = buf.toString('utf8', position + 46, position + 46 + nameLength);
    position += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`corrupt local header for ${name}`);
    }
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buf.length) throw new Error(`truncated entry ${name}`);
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);

    declaredTotal += uncompressedSize;
    if (declaredTotal > maxTotal) throw new Error('archive expands beyond the size budget');
    let data: Buffer;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: maxTotal });
    else throw new Error(`unsupported compression method ${method} for ${name}`);
    entries.set(name, new Uint8Array(data));
  }
  return entries;
}
