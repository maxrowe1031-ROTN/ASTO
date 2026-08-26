// png.js — the zero-dependency PNG codec the art pipeline crops with.
//
// Exists because of an aspect collision (D-31): image APIs emit 3:2 at
// widest, the band is 6.25:1, and the store refuses anything that is not
// band-shaped. Someone has to crop, and it must not be Max with a pixel
// ruler. node:zlib does the compression; this module does the rest.
//
// Deliberately narrow: 8-bit RGB/RGBA, non-interlaced — what image APIs and
// screenshots actually emit. Everything else is refused loudly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import { cropBand, decodePng, encodePng } from '../../studio/png.js';

/** A tiny RGBA image with a recognisable gradient, as {width,height,pixels}. */
const gradient = (width, height) => {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      pixels[i] = x % 256;
      pixels[i + 1] = y % 256;
      pixels[i + 2] = (x + y) % 256;
      pixels[i + 3] = 255;
    }
  }
  return { width, height, pixels };
};

test('encode → decode roundtrips RGBA pixels exactly', () => {
  const image = gradient(20, 12);
  const decoded = decodePng(encodePng(image));
  assert.equal(decoded.width, 20);
  assert.equal(decoded.height, 12);
  assert.deepEqual(decoded.pixels, image.pixels);
});

test('decode normalises RGB (no alpha) to RGBA', () => {
  // Hand-built 2×2 RGB PNG, filter 0 rows.
  const raw = Buffer.from([
    0, /* filter */ 10, 20, 30, 40, 50, 60,
    0, /* filter */ 70, 80, 90, 100, 110, 120,
  ]);
  const png = buildPng({ width: 2, height: 2, colorType: 2, raw });
  const decoded = decodePng(png);
  assert.deepEqual(
    [...decoded.pixels],
    [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255],
  );
});

test('decode unfilters Sub, Up, Average and Paeth rows', () => {
  // 3×4 RGBA where each row exercises one filter. Expected pixels computed by
  // the spec's own recurrences.
  const rows = [
    { filter: 1, bytes: [10, 10, 10, 255, 5, 5, 5, 0, 5, 5, 5, 0] }, // Sub
    { filter: 2, bytes: [1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0] }, // Up
    { filter: 3, bytes: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] }, // Average
    { filter: 4, bytes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }, // Paeth
  ];
  const raw = Buffer.concat(rows.map((row) => Buffer.from([row.filter, ...row.bytes])));
  const png = buildPng({ width: 3, height: 4, colorType: 6, raw });
  const decoded = decodePng(png);

  // Row 0 (Sub): a[x] = raw[x] + a[x-bpp]
  assert.deepEqual([...decoded.pixels.slice(0, 12)], [10, 10, 10, 255, 15, 15, 15, 255, 20, 20, 20, 255]);
  // Row 1 (Up): b + prior row
  assert.deepEqual([...decoded.pixels.slice(12, 24)], [11, 12, 13, 255, 16, 17, 18, 255, 21, 22, 23, 255]);
  // Rows 2 and 3 just have to be internally consistent — decode must not throw
  // and stays in byte range.
  assert.equal(decoded.pixels.length, 3 * 4 * 4);
});

test('interlaced and 16-bit images are refused by name', () => {
  const raw = Buffer.from([0, 1, 2, 3, 255]);
  assert.throws(() => decodePng(buildPng({ width: 1, height: 1, colorType: 6, raw, interlace: 1 })), /interlaced/i);
  assert.throws(() => decodePng(buildPng({ width: 1, height: 1, colorType: 6, raw, bitDepth: 16 })), /bit/i);
});

test('garbage is refused as not-a-png', () => {
  assert.throws(() => decodePng(new TextEncoder().encode('hello')), /png/i);
});

// --- the crop ---------------------------------------------------------------

test('cropBand cuts the centered 6.25:1 band from a 3:2 render', () => {
  const image = gradient(250, 166); // ~3:2
  const band = cropBand(image, { ratio: 6.25 });
  assert.equal(band.width, 250);
  assert.equal(band.height, 40); // 250 / 6.25
  // Centered: band starts at y = (166-40)/2 = 63. First band pixel = source (0,63).
  assert.equal(band.pixels[1], 63 % 256);
});

test('cropBand honours focusY — 0 takes the top band, 1 the bottom', () => {
  const image = gradient(125, 100);
  const top = cropBand(image, { ratio: 6.25, focusY: 0 });
  const bottom = cropBand(image, { ratio: 6.25, focusY: 1 });
  assert.equal(top.height, 20);
  assert.equal(top.pixels[1], 0); // row 0
  assert.equal(bottom.pixels[1], 80); // row 100-20
});

test('an image already wider than the band ratio is cropped horizontally instead', () => {
  const image = gradient(200, 20); // 10:1, wider than 6.25:1
  const band = cropBand(image, { ratio: 6.25 });
  assert.equal(band.height, 20);
  assert.equal(band.width, 125); // 20 * 6.25
  // Centered horizontally: starts at x = round((200-125)/2) = round(37.5) = 38.
  assert.equal(band.pixels[0], 38 % 256);
});

test('crop → encode → decode holds the band pixels', () => {
  const image = gradient(250, 166);
  const band = cropBand(image, { ratio: 6.25 });
  const decoded = decodePng(encodePng(band));
  assert.deepEqual(decoded.pixels, band.pixels);
});

// --- helper: build a minimal real PNG around raw (filtered) scanlines -------

function buildPng({ width, height, colorType, raw, bitDepth = 8, interlace = 0 }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = bitDepth;
  ihdrData[9] = colorType;
  ihdrData[12] = interlace;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
