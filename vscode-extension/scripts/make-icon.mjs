/**
 * Draws the marketplace icon and writes it as a PNG, with no image library:
 * shapes are signed-distance fields sampled per pixel, which anti-aliases for
 * free, and node:zlib does the compression a PNG needs.
 *
 * Run with `npm run icon`. The result is committed — the marketplace needs the
 * file, not the recipe.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const BG = [0x3b, 0x5b, 0xdb]; // --accent, legible on light and dark listings
const FG = [0xff, 0xff, 0xff];

/* ---------- geometry ---------- */

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Distance from a point to a rounded box centred on the canvas. */
function roundedBox(x, y, half, radius) {
  const dx = Math.abs(x - SIZE / 2) - half + radius;
  const dy = Math.abs(y - SIZE / 2) - half + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));

  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1));

  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** A cubic curve, flattened once into segments the distance test can use. */
function curve(x0, y0, x1, y1) {
  const cx = (x0 + x1) / 2;
  const points = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const u = 1 - t;
    points.push([
      u * u * u * x0 + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * x1,
      u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1,
    ]);
  }

  return points;
}

/* ---------- the drawing ---------- */

const ROOT = [78, 128];
const LEAVES = [
  [186, 70],
  [186, 128],
  [186, 186],
];
const LINKS = LEAVES.map(([x, y]) => curve(ROOT[0], ROOT[1], x, y));

/** Coverage of the foreground glyph at a point, 0..1. */
function glyph(x, y) {
  let cover = 0;
  for (const points of LINKS) {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const d = segmentDistance(
        x,
        y,
        points[i - 1][0],
        points[i - 1][1],
        points[i][0],
        points[i][1],
      );
      if (d < best) best = d;
    }
    cover = Math.max(cover, clamp01(1.5 - (best - 3.6)));
  }
  cover = Math.max(cover, clamp01(1.5 - (Math.hypot(x - ROOT[0], y - ROOT[1]) - 15)));
  for (const [lx, ly] of LEAVES) {
    cover = Math.max(cover, clamp01(1.5 - (Math.hypot(x - lx, y - ly) - 11)));
  }

  return cover;
}

const pixels = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let cursor = 0;
for (let y = 0; y < SIZE; y++) {
  pixels[cursor++] = 0; // PNG per-scanline filter: none
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const alpha = clamp01(0.5 - roundedBox(px, py, SIZE / 2, 52));
    const g = glyph(px, py);
    pixels[cursor++] = Math.round(mix(BG[0], FG[0], g));
    pixels[cursor++] = Math.round(mix(BG[1], FG[1], g));
    pixels[cursor++] = Math.round(mix(BG[2], FG[2], g));
    pixels[cursor++] = Math.round(alpha * 255);
  }
}

/* ---------- PNG container ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
// bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icon.png');
writeFileSync(out, png);
console.log(`icon: ${SIZE}x${SIZE} RGBA, ${(png.length / 1024).toFixed(1)} KB -> ${out}`);
