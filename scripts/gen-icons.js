'use strict';
/*
 * scripts/gen-icons.js — dependency-free PNG icon generator for the extension.
 *
 * Renders the script's icon motif (from the userscript @icon): a dark slate
 * circle with a sky-blue ring and a sky-blue right half-disc ("dark circle /
 * light half") into extension/icons/icon{16,32,48,128}.png.
 *
 * Implementation: pure per-pixel raster math with 3x3 supersampling for clean
 * edges, encoded into PNG (RGBA8) via Node's built-in zlib deflate and a
 * hand-rolled CRC-32. No canvas, no npm packages.
 *
 * Deterministic: identical inputs produce byte-identical PNGs.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'extension', 'icons');
const SIZES = [16, 32, 48, 128];

// Motif colors (match the @icon SVG): dark circle fill + sky-blue accent.
const DARK = [30, 41, 59];   // #1e293b
const SKY = [56, 189, 248];  // #38bdf8
// Geometry in the 0..100 icon viewBox: circle r=46 with stroke width 8,
// right half-disc (r=46) filled with the accent color.
const R_OUTER = 50;          // stroke outer edge (46 + 8/2)
const R_INNER = 42;          // stroke inner edge (46 - 8/2)
const HALF_X = 50;           // half-disc boundary (vertical diameter)
const CENTER = 50;           // circle center in both axes

// —— PNG encoding (RGBA8, no interlace) ——

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  // PNG chunk framing is big-endian: length(4BE) type(4) data crc(4BE).
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter: adaptive (per-row byte 0 below)
  ihdr[12] = 0;  // interlace: none
  // Raw scanlines: each row prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// —— Raster math (3x3 supersampled) ——

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // samples per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, opaque = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 100;
          const v = ((y + (sy + 0.5) / SS) / size) * 100;
          const dx = u - CENTER;
          const dy = v - CENTER;
          const dist = Math.sqrt(dx * dx + dy * dy);
          let sample = null;
          if (dist <= R_OUTER) {
            // Right half-disc (u >= center) paints the accent color over
            // both the inner fill and the ring; the left side keeps the
            // dark inner fill with the blue ring on the outer edge.
            if (u >= HALF_X || dist > R_INNER) sample = SKY;
            else sample = DARK;
          }
          if (sample) {
            r += sample[0]; g += sample[1]; b += sample[2];
            a += 255;
            opaque++;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (opaque > 0) {
        rgba[i] = Math.round(r / opaque);
        rgba[i + 1] = Math.round(g / opaque);
        rgba[i + 2] = Math.round(b / opaque);
        rgba[i + 3] = Math.round(a / (SS * SS));
      }
    }
  }
  return rgba;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  for (const size of SIZES) {
    const png = encodePng(size, size, renderIcon(size));
    const file = path.join(OUT_DIR, `icon${size}.png`);
    fs.writeFileSync(file, png);
    written.push(`${file} (${png.length} bytes)`);
  }
  console.log('[gen-icons] generated deterministic RGBA PNG icons:');
  for (const w of written) console.log('  ' + w);
}

main();
