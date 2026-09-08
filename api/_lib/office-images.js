import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const JIMP_AUTO = jimpModule.AUTO ?? Jimp.AUTO;
const JIMP_JPEG = jimpModule.MIME_JPEG ?? Jimp.MIME_JPEG ?? 'image/jpeg';
const { imageSize, disableTypes } = require('image-size');

// The imageSize() call in this module parses bytes a stranger chose. It is
// reached from api/generate-office.ts, which accepts a data: URL or any https:
// URL a deck names (up to 5 MB), and it is the FALLBACK taken precisely when
// Jimp cannot decode the format — so the odd formats land here by design.
//
// Three of image-size's parsers advance a loop by a length the file itself
// declares, and that length may be zero:
//
//   GHSA-w3rx-r6r6-pgpr  ICNS      imageOffset += imageHeader[1]
//   GHSA-5p2g-fcmc-qvqq  HEIF, JXL currentOffset = box.offset + box.size
//
// Sixteen bytes — "icns", a length, "ic07", 0 — spin resizeImageForEmbed
// forever, allocating on every turn of the loop, until Vercel kills the
// function. Reproduced against this exact file, not inferred.
//
// There is nothing to upgrade to: 2.0.2 is the latest published image-size and
// the advisory range is <=2.0.2.
//
// disableTypes is image-size's own switch and lookup checks it BEFORE calling
// calculate(), so a disabled type raises "disabled file type: icns" instead of
// entering the loop. Detection stays safe: every validate() is a magic-byte
// comparison, and the only one that scans (HEIF's) always advances by at least
// eight bytes. jxl-stream is deliberately NOT in this list — its reader
// consumes a fixed number of bits per call and throws at end of input.
//
// Nothing is lost by this. The fallback exists for what Jimp rejects — SVG and
// some WebP — and neither is listed. An image we decline to measure falls to
// the conservative defaults below, which is what an unparseable one already did.
disableTypes(['icns', 'heif', 'jxl']);

/*
 * The magic bytes of the only formats Jimp can decode — @jimp/types bundles
 * exactly bmp, gif, jpeg, png and tiff. Everything else was already destined
 * for the fallback below; it was simply reaching it the slow way, by being
 * sniffed first.
 *
 * That sniff is the problem. Jimp.read() calls file-type's fromBuffer(), whose
 * ASF reader (GHSA-5v7r-6r5c-r473) reads a 24-byte sub-header and then ignores
 * header.size - 24 bytes — so a sub-header declaring size 0 rewinds the
 * tokenizer exactly as far as it just advanced, forever. 128 bytes carrying the
 * ASF_Header_Object GUID hung resizeImageForEmbed on this repository, and it
 * hung BEFORE the disableTypes() guard above could matter: that guard protects
 * the fallback, and this call happens first.
 *
 * So the boundary belongs here rather than in either library. These five headers
 * are what this function is for. Anything else never reaches a parser at all,
 * and takes the same fallback it would have taken anyway.
 */
const JIMP_DECODABLE_HEADERS = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // png
  [0xff, 0xd8, 0xff], //                               jpeg
  [0x47, 0x49, 0x46, 0x38], //                         gif — "GIF8"
  [0x42, 0x4d], //                                     bmp — "BM"
  [0x49, 0x49, 0x2a, 0x00], //                         tiff, little-endian
  [0x4d, 0x4d, 0x00, 0x2a], //                         tiff, big-endian
];

function decodableByJimp(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return false;
  return JIMP_DECODABLE_HEADERS.some(
    (magic) => bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte),
  );
}

/**
 * Resize raw image bytes to at most `maxWidth` pixels wide and return an
 * embeddable data URL plus the final pixel dimensions.
 *
 * This helper deliberately supports both Jimp 0.16.x and 1.x API shapes so a
 * dependency change cannot silently disable Office image resizing again.
 *
 * If Jimp cannot decode the format (SVG, some modern WebP), the original bytes
 * are embedded unchanged and `image-size` supplies the intrinsic dimensions so
 * downstream width/height attributes are at least correct.
 *
 * @param {Buffer} bytes raw image bytes
 * @param {string} [sourceMime] true MIME of the bytes, used only on fallback
 * @param {number} [maxWidth] width cap in pixels
 * @returns {Promise<{ dataUrl: string, width: number, height: number, resized: boolean }>}
 */
export async function resizeImageForEmbed(bytes, sourceMime = 'image/png', maxWidth = 600) {
  let width = maxWidth;
  let height = Math.round(maxWidth * 0.66);

  try {
    if (!Jimp || typeof Jimp.read !== 'function') {
      throw new Error('Jimp image decoder is unavailable.');
    }
    if (!decodableByJimp(bytes)) {
      // Not a header Jimp decodes, so Jimp.read would fail anyway — but only
      // after file-type had sniffed every format it knows, one of which loops.
      throw new Error('Not a format the decoder handles; embedding unchanged.');
    }

    const img = await Jimp.read(bytes);
    if (img.bitmap.width > maxWidth) {
      // Jimp 1.x: resize({ w })
      // Jimp 0.16.x: resize(width, Jimp.AUTO)
      try {
        img.resize({ w: maxWidth });
      } catch {
        img.resize(maxWidth, JIMP_AUTO);
      }
    }

    width = img.bitmap.width;
    height = img.bitmap.height;

    let out;
    if (typeof img.getBufferAsync === 'function') {
      out = await img.getBufferAsync(JIMP_JPEG);
    } else {
      out = await img.getBuffer('image/jpeg');
    }

    return {
      dataUrl: 'data:image/jpeg;base64,' + Buffer.from(out).toString('base64'),
      width,
      height,
      resized: true,
    };
  } catch (error) {
    console.warn('Office image resize fallback:', error?.message || error);
    try {
      const dim = imageSize(bytes);
      if (dim?.width) width = dim.width;
      if (dim?.height) height = dim.height;
    } catch {
      // Unparseable by image-size too; keep conservative defaults.
    }
    return {
      dataUrl: 'data:' + sourceMime + ';base64,' + bytes.toString('base64'),
      width,
      height,
      resized: false,
    };
  }
}
