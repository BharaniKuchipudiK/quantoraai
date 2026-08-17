import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resizeImageForEmbed } from './office-images.js';

const require = createRequire(import.meta.url);
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const JIMP_PNG = jimpModule.MIME_PNG ?? Jimp.MIME_PNG ?? 'image/png';

async function makePng(width, height) {
  let img;

  if (jimpModule.Jimp) {
    img = new Jimp({ width, height, color: 0xff0000ff });
  } else {
    img = await new Promise((resolve, reject) => {
      new Jimp(width, height, 0xff0000ff, (error, image) => {
        if (error) reject(error);
        else resolve(image);
      });
    });
  }

  if (typeof img.getBufferAsync === 'function') {
    return img.getBufferAsync(JIMP_PNG);
  }
  return img.getBuffer('image/png');
}

test('downscales an oversized image to the 600px width cap', async () => {
  const bytes = await makePng(1200, 800);
  const out = await resizeImageForEmbed(bytes, 'image/png');

  assert.equal(out.resized, true, 'should have gone through the real jimp resize path');
  assert.equal(out.width, 600, 'width must be capped at 600px');
  assert.equal(out.height, 400, 'height must scale proportionally (800/1200 * 600)');
  assert.match(out.dataUrl, /^data:image\/jpeg;base64,/, 'resized output is re-encoded JPEG');
});

test('leaves an already-small image at its native size', async () => {
  const bytes = await makePng(320, 240);
  const out = await resizeImageForEmbed(bytes, 'image/png');

  assert.equal(out.resized, true);
  assert.equal(out.width, 320, 'small images are not upscaled');
  assert.equal(out.height, 240);
});

test('falls back to original bytes and honest MIME when jimp cannot decode', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  const out = await resizeImageForEmbed(svg, 'image/svg+xml');

  assert.equal(out.resized, false, 'undecodable formats must not claim to be resized');
  assert.match(out.dataUrl, /^data:image\/svg\+xml;base64,/, 'fallback keeps the true source MIME, not a guessed png/jpeg');
  assert.ok(out.width > 0 && out.height > 0, 'dimensions still populated');
});
