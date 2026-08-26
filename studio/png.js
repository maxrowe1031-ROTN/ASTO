// png.js — a zero-dependency PNG codec, deliberately narrow (design.md D-31).
//
// WHY THIS EXISTS. The band is 6.25:1 and no image API emits that shape — the
// widest common render is 3:2. Someone has to crop every render before the
// art-store will accept it, and that someone must not be Max with a pixel
// ruler. HR-1 rules out an image library; node:zlib is a built-in, and the
// rest of PNG is chunk arithmetic this file can own.
//
// NARROW ON PURPOSE: 8-bit, RGB or RGBA, non-interlaced — what image APIs and
// screenshots actually produce. Everything else is refused by name rather
// than half-decoded. Output is always RGBA so callers handle one layout.
//
// Pure in the boundary-law sense: no fs, no fetch, no globals — bytes in,
// bytes out. node:zlib is compression math, not I/O.

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// --- decode -----------------------------------------------------------------

/**
 * bytes → { width, height, pixels } with pixels always RGBA, 4 bytes/pixel.
 * Throws with a named reason on anything outside the supported subset.
 */
export function decodePng(bytes) {
  const data = toBuffer(bytes);
  if (data.length < 8 + 25 || !SIGNATURE.every((b, i) => data[i] === b)) {
    throw new Error('not a PNG (signature missing)');
  }

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];

  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body[8];
      const colorType = body[9];
      const interlace = body[12];
      if (bitDepth !== 8) throw new Error(`unsupported PNG: ${bitDepth}-bit (only 8-bit)`);
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`unsupported PNG: color type ${colorType} (only RGB and RGBA)`);
      }
      if (interlace !== 0) throw new Error('unsupported PNG: interlaced');
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length + type + data + crc
  }

  if (width === 0 || height === 0 || channels === 0) throw new Error('not a PNG (no IHDR)');
  if (idat.length === 0) throw new Error('not a PNG (no image data)');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) {
    throw new Error('corrupt PNG: image data shorter than its dimensions');
  }

  // Unfilter into `lines`, then normalise to RGBA.
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    unfilterRow(filter, row, out, prior, channels);
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    pixels[dst] = lines[src];
    pixels[dst + 1] = lines[src + 1];
    pixels[dst + 2] = lines[src + 2];
    pixels[dst + 3] = channels === 4 ? lines[src + 3] : 255;
  }
  return { width, height, pixels };
}

function unfilterRow(filter, row, out, prior, bpp) {
  const above = (x) => (prior ? prior[x] : 0);
  switch (filter) {
    case 0: // None
      row.copy(out);
      return;
    case 1: // Sub
      for (let x = 0; x < row.length; x += 1) {
        out[x] = (row[x] + (x >= bpp ? out[x - bpp] : 0)) & 0xff;
      }
      return;
    case 2: // Up
      for (let x = 0; x < row.length; x += 1) out[x] = (row[x] + above(x)) & 0xff;
      return;
    case 3: // Average
      for (let x = 0; x < row.length; x += 1) {
        const left = x >= bpp ? out[x - bpp] : 0;
        out[x] = (row[x] + ((left + above(x)) >> 1)) & 0xff;
      }
      return;
    case 4: // Paeth
      for (let x = 0; x < row.length; x += 1) {
        const left = x >= bpp ? out[x - bpp] : 0;
        const up = above(x);
        const upLeft = x >= bpp ? (prior ? prior[x - bpp] : 0) : 0;
        out[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      }
      return;
    default:
      throw new Error(`corrupt PNG: unknown filter ${filter}`);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// --- encode -----------------------------------------------------------------

/** { width, height, pixels: RGBA } → PNG bytes. Filter 0 rows — simple and honest. */
export function encodePng({ width, height, pixels }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('encodePng needs positive integer dimensions');
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new Error('encodePng needs RGBA pixels of exactly width×height×4 bytes');
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // compression 0, filter 0, interlace 0 — already zeroed.

  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- crop -------------------------------------------------------------------

/** Pixel-rectangle crop. Bounds are clamped to the image. */
export function crop({ width, height, pixels }, rect) {
  const x0 = Math.max(0, Math.min(width, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(height, Math.round(rect.y)));
  const w = Math.max(1, Math.min(width - x0, Math.round(rect.width)));
  const h = Math.max(1, Math.min(height - y0, Math.round(rect.height)));

  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const srcStart = ((y0 + y) * width + x0) * 4;
    out.set(pixels.subarray(srcStart, srcStart + w * 4), y * w * 4);
  }
  return { width: w, height: h, pixels: out };
}

/**
 * The pipeline's crop: the largest `ratio` band that fits the image.
 * A taller-than-band image loses rows (focusY chooses which: 0 keeps the top,
 * 1 the bottom, default centered); a wider-than-band image loses columns from
 * both sides. The scene prompt confines content to the middle band, which is
 * exactly what makes the default the right one.
 */
export function cropBand(image, { ratio, focusY = 0.5 } = {}) {
  if (!(ratio > 0)) throw new Error('cropBand needs a positive ratio');
  const bandHeight = Math.round(image.width / ratio);
  if (bandHeight <= image.height) {
    const y = (image.height - bandHeight) * clamp01(focusY);
    return crop(image, { x: 0, y, width: image.width, height: bandHeight });
  }
  const bandWidth = Math.round(image.height * ratio);
  const x = (image.width - bandWidth) / 2;
  return crop(image, { x, y: 0, width: bandWidth, height: image.height });
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// --- shared -----------------------------------------------------------------

const toBuffer = (bytes) => {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  throw new Error('not a PNG (expected bytes)');
};

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

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
