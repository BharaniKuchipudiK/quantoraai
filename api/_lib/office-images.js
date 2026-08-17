import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const JIMP_AUTO = jimpModule.AUTO ?? Jimp.AUTO;
const JIMP_JPEG = jimpModule.MIME_JPEG ?? Jimp.MIME_JPEG ?? 'image/jpeg';
const { imageSize } = require('image-size');

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
