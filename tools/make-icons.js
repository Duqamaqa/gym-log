/* Generates the app icons (PNG) with no dependencies: node tools/make-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map(function (_, n) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Dumbbell on a dark blue background. Coordinates are in a 0..1 unit square. */
function pixel(x, y) {
  const bg = [17, 24, 39];
  const fg = [59, 130, 246];
  const white = [255, 255, 255];
  const inRect = function (x0, y0, x1, y1) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
  // bar
  if (inRect(0.26, 0.47, 0.74, 0.53)) return white;
  // inner plates
  if (inRect(0.2, 0.3, 0.28, 0.7) || inRect(0.72, 0.3, 0.8, 0.7)) return fg;
  // outer plates
  if (inRect(0.13, 0.37, 0.2, 0.63) || inRect(0.8, 0.37, 0.87, 0.63)) return fg;
  return bg;
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = pixel((x + 0.5) / size, (y + 0.5) / size);
      raw[row + 1 + x * 3] = c[0];
      raw[row + 2 + x * 3] = c[1];
      raw[row + 3 + x * 3] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]].forEach(function (f) {
  fs.writeFileSync(path.join(outDir, f[0]), png(f[1]));
  console.log('wrote icons/' + f[0]);
});
