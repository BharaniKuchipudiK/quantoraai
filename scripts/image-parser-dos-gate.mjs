#!/usr/bin/env node
/**
 * A crafted image that hangs a production function until the platform kills it.
 *
 * api/generate-office.ts embeds pictures a deck names — a data: URL, or any
 * https: URL, up to 5 MB — and hands the bytes to resizeImageForEmbed. Two
 * separate libraries used to parse them there, and BOTH have a reader that
 * loops forever on a section declaring length zero:
 *
 *   image-size  GHSA-w3rx-r6r6-pgpr (ICNS), GHSA-5p2g-fcmc-qvqq (HEIF, JXL)
 *               sizes anything Jimp could not decode. 16 bytes are enough.
 *   file-type   GHSA-5v7r-6r5c-r473 (ASF), reached from Jimp.read()'s format
 *               sniff. 128 bytes are enough — and this one runs FIRST, so it
 *               was still reachable after the image-size parsers were switched
 *               off. Fixing one of these and calling the class closed is
 *               exactly the failure this gate exists to make impossible.
 *
 * api/_lib/office-images.js carries both guards: disableTypes() for the sizer,
 * and a five-header allowlist in front of the decoder.
 *
 * Nothing else can see this. A unit test that calls resizeImageForEmbed on a
 * crafted file does not fail — it hangs, taking its runner with it, which is
 * why the risky half runs in a child process here with a hard kill.
 *
 * Every payload is asserted three ways, and the middle one is what keeps this
 * honest:
 *
 *   1. GUARDED   the production path returns on these bytes, promptly.
 *   2. UNGUARDED the same bytes still hang the library WITHOUT the guard.
 *      Without this the gate would pass just as happily on payloads that
 *      trigger nothing, and would be measuring its own imagination (§4).
 *   3. REFUSED   the specific mechanism is in place — the parser reports the
 *      type as disabled, or the decoder never sees the bytes at all.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = fileURLToPath(import.meta.url);
const OFFICE_IMAGES = path.join(ROOT, 'api/_lib/office-images.js');

const GUARDED_BUDGET_MS = 8_000;
const UNGUARDED_KILL_MS = 2_500;

/** "icns" | fileLength | "ic07" | 0 — imageOffset += 0, forever. */
function icnsZeroLengthEntry() {
  const buf = Buffer.alloc(16);
  buf.write('icns', 0, 'ascii');
  buf.writeUInt32BE(16, 4);
  buf.write('ic07', 8, 'ascii');
  buf.writeUInt32BE(0, 12);
  return buf;
}

/**
 * An ISOBMFF file whose ipco holds an ispe box of declared size 0, so
 * `currentOffset = ispeBox.offset + ispeBox.size` lands back where it started
 * and findBox returns the same box on the next turn.
 */
function heifZeroSizeIspe() {
  const box = (name, size, extra = Buffer.alloc(0)) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(size, 0);
    head.write(name, 4, 'ascii');
    return Buffer.concat([head, extra]);
  };
  // The ftyp brand must be one image-size recognises, or validate() rejects it.
  const ftyp = box('ftyp', 16, Buffer.concat([Buffer.from('mif1', 'ascii'), Buffer.alloc(4)]));
  const ispe = Buffer.concat([
    (() => { const h = Buffer.alloc(8); h.writeUInt32BE(0, 0); h.write('ispe', 4, 'ascii'); return h; })(),
    Buffer.alloc(20), // room for the width/height reads to stay in range
  ]);
  const ipco = box('ipco', 8 + ispe.length, ispe);
  const iprp = box('iprp', 8 + ipco.length, ipco);
  const meta = box('meta', 12 + iprp.length, Buffer.concat([Buffer.alloc(4), iprp]));
  return Buffer.concat([ftyp, meta]);
}

/** A JXL container whose jxlp box declares size 0 — offset never advances. */
function jxlZeroSizeJxlp() {
  const signature = Buffer.alloc(12);
  signature.writeUInt32BE(12, 0);
  signature.write('JXL ', 4, 'ascii');
  signature.writeUInt32BE(0x0d0a870a, 8);

  const ftyp = Buffer.alloc(20);
  ftyp.writeUInt32BE(20, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write('jxl ', 8, 'ascii');

  const jxlp = Buffer.alloc(24);
  jxlp.writeUInt32BE(0, 0); // the zero that never advances
  jxlp.write('jxlp', 4, 'ascii');

  return Buffer.concat([signature, ftyp, jxlp]);
}

/**
 * ASF_Header_Object, then a sub-header at offset 30 declaring size 0.
 * readHeader() consumes 24 bytes and the reader then ignores size - 24 = -24,
 * putting the tokenizer back exactly where it began.
 */
function asfZeroSizeSubHeader() {
  const buf = Buffer.alloc(128);
  Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c])
    .copy(buf, 0);
  buf.writeBigUInt64LE(0n, 46); // the sub-header size, at 30 + 16
  return buf;
}

const PAYLOADS = [
  { id: 'icns', library: 'image-size', advisory: 'GHSA-w3rx-r6r6-pgpr', guard: 'disabled-type', mime: 'image/x-icns', bytes: icnsZeroLengthEntry() },
  { id: 'heif', library: 'image-size', advisory: 'GHSA-5p2g-fcmc-qvqq', guard: 'disabled-type', mime: 'image/heif', bytes: heifZeroSizeIspe() },
  { id: 'jxl', library: 'image-size', advisory: 'GHSA-5p2g-fcmc-qvqq', guard: 'disabled-type', mime: 'image/jxl', bytes: jxlZeroSizeJxlp() },
  { id: 'asf', library: 'file-type (via Jimp.read)', advisory: 'GHSA-5v7r-6r5c-r473', guard: 'decoder-header', mime: 'image/png', bytes: asfZeroSizeSubHeader() },
];

// ---------------------------------------------------------------- child modes

const mode = process.argv[2];
if (mode) {
  const bytes = Buffer.from(process.argv[3], 'hex');
  const arg = process.argv[4];

  if (mode === '--guarded') {
    const { resizeImageForEmbed } = await import(OFFICE_IMAGES);
    const started = Date.now();
    const out = await resizeImageForEmbed(bytes, arg, 560);
    process.stdout.write(`RETURNED ${Date.now() - started} ${out.width}x${out.height}\n`);
  } else if (mode === '--unguarded-sizer') {
    const { imageSize } = await import(path.join(ROOT, 'node_modules/image-size/dist/index.mjs'));
    process.stdout.write(`COMPLETED ${JSON.stringify(imageSize(bytes))}\n`);
  } else if (mode === '--unguarded-decoder') {
    const jimpModule = createRequire(OFFICE_IMAGES)('jimp');
    const Jimp = jimpModule.Jimp || jimpModule;
    try {
      await Jimp.read(bytes);
      process.stdout.write('COMPLETED decoded\n');
    } catch (error) {
      // Refusing the bytes is still completing: the point of this assertion is
      // only that the library REACHES an answer on them.
      process.stdout.write(`COMPLETED rejected: ${error?.message || error}\n`);
    }
  } else if (mode === '--disabled-type') {
    // disableTypes() mutates ONE module instance, and image-size ships two
    // builds with separate state. office-images.js reaches it through
    // createRequire, so the guard lands on dist/index.cjs; asking dist/index.mjs
    // whether a type is disabled reads a copy nobody guarded and it answers no.
    // The first run of this gate did exactly that and reported the guard missing
    // when it was present. Ask the instance production actually calls.
    await import(OFFICE_IMAGES);
    const { imageSize } = createRequire(OFFICE_IMAGES)('image-size');
    try {
      imageSize(bytes);
      process.stdout.write('NO_THROW\n');
    } catch (error) {
      process.stdout.write(`THREW ${error?.message || error}\n`);
    }
  } else if (mode === '--decoder-header') {
    // The decoder guard is an allowlist, so the observable property is that
    // office-images never calls Jimp.read at all for these bytes. Prove it by
    // making Jimp.read itself the failure: if it is reached, it hangs.
    const { resizeImageForEmbed } = await import(OFFICE_IMAGES);
    const out = await resizeImageForEmbed(bytes, arg, 560);
    process.stdout.write(`NOT_DECODED ${out.resized === false ? 'embedded unchanged' : 'RESIZED'}\n`);
  } else {
    process.stderr.write(`unknown mode ${mode}\n`);
    process.exit(2);
  }
  process.exit(0);
}

// --------------------------------------------------------------------- parent

function run(args, timeoutMs, extraExecArgv = []) {
  return spawnSync(
    process.execPath,
    [...extraExecArgv, SELF, ...args],
    { cwd: ROOT, timeout: timeoutMs, encoding: 'utf8', killSignal: 'SIGKILL' },
  );
}

const failures = [];
console.log('IMAGE PARSER DoS GATE');
console.log('  Neither library has a patched release this repository can take. The guards');
console.log('  are disableTypes() and a decoder-header allowlist, both in');
console.log('  api/_lib/office-images.js. Four payloads, three questions each.\n');

for (const payload of PAYLOADS) {
  const hex = payload.bytes.toString('hex');
  const label = `${payload.id} (${payload.advisory}, ${payload.library}, ${payload.bytes.length} bytes)`;

  // 1. The production path must return.
  const guarded = run(['--guarded', hex, payload.mime], GUARDED_BUDGET_MS);
  const returned = /^RETURNED (\d+) /m.exec(guarded.stdout || '');
  if (!returned) {
    failures.push(
      `${label}: resizeImageForEmbed did NOT return on these bytes. The guard in ` +
      `api/_lib/office-images.js is missing, incomplete, or bypassed — in production ` +
      `this is a function pegged until the platform kills it.` +
      (guarded.stderr ? `\n      stderr: ${guarded.stderr.trim().split('\n').slice(-2).join(' / ')}` : ''),
    );
  }

  // 2. The same bytes must still hang the library itself, or this proves nothing.
  const unguardedMode = payload.guard === 'disabled-type' ? '--unguarded-sizer' : '--unguarded-decoder';
  const unguarded = run([unguardedMode, hex], UNGUARDED_KILL_MS, ['--max-old-space-size=64']);
  const inert = /^COMPLETED /m.test(unguarded.stdout || '');
  if (inert) {
    failures.push(
      `${label}: ${payload.library} reached an answer on this payload WITHOUT the guard, ` +
      `so the payload no longer triggers ${payload.advisory} and assertion 1 above is ` +
      `measuring nothing. Either the library was patched — drop the guard and this ` +
      `payload together — or the payload needs rebuilding against the current parser.`,
    );
  }

  // 3. The specific mechanism must be the reason.
  let mechanism;
  if (payload.guard === 'disabled-type') {
    const disabled = run(['--disabled-type', hex, payload.id], GUARDED_BUDGET_MS);
    const threw = /^THREW (.*)$/m.exec(disabled.stdout || '');
    const expected = `disabled file type: ${payload.id}`;
    mechanism = threw ? threw[1] : null;
    if (!threw || !threw[1].includes(expected)) {
      const what = threw
        ? `raised "${threw[1]}"`
        : /^NO_THROW$/m.test(disabled.stdout || '')
          ? 'returned a size without raising anything'
          : 'produced no output at all — it hung or crashed, so the parser was entered';
      failures.push(
        `${label}: after importing api/_lib/office-images.js, image-size ${what}, where ` +
        `"${expected}" was expected. '${payload.id}' is not in that module's ` +
        `disableTypes() list, or the call is reaching a second image-size instance.`,
      );
    }
  } else {
    const skipped = run(['--decoder-header', hex, payload.mime], GUARDED_BUDGET_MS);
    const notDecoded = /^NOT_DECODED (.*)$/m.exec(skipped.stdout || '');
    mechanism = notDecoded ? `decoder skipped, ${notDecoded[1]}` : null;
    if (!notDecoded) {
      failures.push(
        `${label}: resizeImageForEmbed did not fall through to the unchanged-bytes path ` +
        `for a header no decoder handles. JIMP_DECODABLE_HEADERS in ` +
        `api/_lib/office-images.js is not being consulted before Jimp.read, so these ` +
        `bytes reach file-type's format sniff.`,
      );
    }
  }

  console.log(
    `  ${payload.id.padEnd(5)} ` +
    `production ${(returned ? `${returned[1]}ms` : 'DID NOT RETURN').padEnd(15)} ` +
    `unguarded ${(inert ? 'ANSWERED (payload inert)' : 'never returned (live)').padEnd(25)} ` +
    `${mechanism || 'NOT REFUSED'}`,
  );
}

console.log('');
if (failures.length) {
  console.error(`FAILED — ${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(
  `Image parser DoS gate OK — ${PAYLOADS.length} payloads across ` +
  `${new Set(PAYLOADS.map((p) => p.library)).size} libraries, each proven live and each refused.`,
);
