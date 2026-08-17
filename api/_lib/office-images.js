import { createRequire } from 'node:module';

// jimp 1.x exports the class as a NAMED export; image-size 2.x exports a NAMED
// `imageSize` function. The pre-1.x / pre-2.x shape (`require('jimp')` /
// `require('image-size')(bytes)`) throws at runtime — which is exactly how the
// server-side resize silently never ran, embedding every image at full size.
const require = createRequire(import.meta.url);
const { Jimp } = require('jimp');
const { imageSize } = require('image-size');

/**
 * Resize raw image bytes to at most `maxWidth` pixels wide and return an
 * embeddable data URL plus the final pixel dimensions.
 *
 * Word (and, to a lesser extent, PowerPoint) render an embedded image at the
 * payload's native pixel size and ignore HTML width/height, so the only
 * reliable way to cap the on-page size is to shrink the actual pixels.
 *
 * If jimp cannot decode the format (SVG, some modern WebP), the original bytes
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
    const img = await Jimp.read(bytes);
    if (img.bitmap.width > maxWidth) img.resize({ w: maxWidth });
    width = img.bitmap.width;
    height = img.bitmap.height;
    const out = await img.getBuffer('image/jpeg');
    return { dataUrl: 'data:image/jpeg;base64,' + out.toString('base64'), width, height, resized: true };
  } catch {
    try {
      const dim = imageSize(bytes);
      if (dim?.width) width = dim.width;
      if (dim?.height) height = dim.height;
    } catch {
      // Unparseable by image-size too; keep the conservative defaults.
    }
    return { dataUrl: 'data:' + sourceMime + ';base64,' + bytes.toString('base64'), width, height, resized: false };
  }
}
