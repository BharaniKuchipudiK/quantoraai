/*
 * Generates desktop/build/icon.png — the source icon electron-builder derives
 * every platform icon from (.icns for macOS, .ico for Windows, PNG set for
 * Linux). Run: node desktop/build/make-icon.mjs
 *
 * WHY THIS IS A SCRIPT AND NOT A COMMITTED-ONLY BINARY
 *
 * A 1024x1024 PNG that nobody can regenerate is a liability: the first time
 * the mark changes, whoever holds the source file becomes a dependency. The
 * artwork is a few shapes, so it is cheaper to keep the shapes than to keep a
 * binary and hope someone still has the original.
 *
 * Everything is drawn from signed distance fields and antialiased by the
 * coverage of each pixel, so the output is resolution-independent: change
 * SIZE and the icon is still correct.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;

// macOS leaves ~10% breathing room around the rounded plate, and Apple's grid
// puts the corner radius near 22.4% of the plate. Windows and Linux crop to
// the same square, so one geometry serves all three.
const INSET = SIZE * 0.098;
const PLATE = { x0: INSET, y0: INSET, x1: SIZE - INSET, y1: SIZE - INSET };
const PLATE_RADIUS = (PLATE.x1 - PLATE.x0) * 0.2237;

const PLATE_TOP = [0x1b, 0x1b, 0x22];
const PLATE_BOTTOM = [0x0a, 0x0a, 0x0d];
const MARK = [0xff, 0xff, 0xff];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distance from p to a rounded rectangle; negative inside. */
function roundedRectDistance(px, py, rect, radius) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const halfW = (rect.x1 - rect.x0) / 2 - radius;
  const halfH = (rect.y1 - rect.y0) / 2 - radius;
  const dx = Math.abs(px - cx) - halfW;
  const dy = Math.abs(py - cy) - halfH;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distance from p to a line segment with rounded caps; negative inside. */
function segmentDistance(px, py, ax, ay, bx, by, halfWidth) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - vx * t, wy - vy * t) - halfWidth;
}

// The Q: a ring, and a tail crossing it at the lower right.
const CENTER = { x: SIZE / 2, y: SIZE * 0.484 };
const RING_RADIUS = SIZE * 0.222;
const STROKE = SIZE * 0.076;
const TAIL_ANGLE = Math.PI / 4;
// The tail starts just inside the ring's inner edge, so its round cap is
// hidden under the stroke instead of blobbing into the counter.
const TAIL_INNER = SIZE * 0.172;
const TAIL_OUTER = SIZE * 0.309;

function markDistance(px, py) {
  const dx = px - CENTER.x;
  const dy = py - CENTER.y;
  const ring = Math.abs(Math.hypot(dx, dy) - RING_RADIUS) - STROKE / 2;
  const tail = segmentDistance(
    px, py,
    CENTER.x + Math.cos(TAIL_ANGLE) * TAIL_INNER, CENTER.y + Math.sin(TAIL_ANGLE) * TAIL_INNER,
    CENTER.x + Math.cos(TAIL_ANGLE) * TAIL_OUTER, CENTER.y + Math.sin(TAIL_ANGLE) * TAIL_OUTER,
    STROKE / 2,
  );
  return Math.min(ring, tail);
}

/** Coverage of a pixel, from a distance field, as a 0..1 alpha. */
const coverage = (distance) => clamp01(0.5 - distance);

function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    const shade = y / (SIZE - 1);
    const plateColor = [
      Math.round(PLATE_TOP[0] + (PLATE_BOTTOM[0] - PLATE_TOP[0]) * shade),
      Math.round(PLATE_TOP[1] + (PLATE_BOTTOM[1] - PLATE_TOP[1]) * shade),
      Math.round(PLATE_TOP[2] + (PLATE_BOTTOM[2] - PLATE_TOP[2]) * shade),
    ];
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const plateAlpha = coverage(roundedRectDistance(px, py, PLATE, PLATE_RADIUS));
      const markAlpha = coverage(markDistance(px, py)) * plateAlpha;
      const offset = (y * SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          plateColor[channel] * (1 - markAlpha) + MARK[channel] * markAlpha,
        );
      }
      pixels[offset + 3] = Math.round(plateAlpha * 255);
    }
  }
  return pixels;
}

// ---- minimal PNG writer (RGBA, no filtering) ------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const target = new URL('icon.png', import.meta.url);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const png = encodePng(render(), SIZE);
  writeFileSync(target, png);
  console.log(`wrote ${fileURLToPath(target)} (${SIZE}x${SIZE}, ${png.length} bytes)`);
}
