// PROFILE (r26): the pictures people upload, decoded to pixels and drawn
// again as a fresh JPEG, so nothing but the picture itself is ever kept or
// served: no EXIF (camera, GPS location), no text chunks, no colour
// profiles, nothing appended after the image, no script. Plain TypeScript
// on Node's own zlib: the site has no image library (sharp isn't installed,
// and canvas has no native binary where the site is built).
//
// What it reads: PNG (any standard colour type and depth, not interlaced)
// and baseline JPEG (the kind browsers and cameras write). Anything else,
// WebP, GIF, SVG or other markup and anything disguised as an image, is
// refused by its bytes, never by its name or its Content-Type. The page's
// picture picker always sends a PNG it drew itself, so people may still
// choose a WebP (their browser reads it).

import zlib from "zlib";

/** What the bytes say a file is. */
export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "markup" | "unknown";

/** An image as RGBA bytes, row by row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

export type ImageErrorCode =
  /** Not a PNG or a JPEG (WebP, GIF, SVG, HTML, anything else). */
  | "bad_type"
  /** Says it's a PNG or JPEG but isn't one that can be read. */
  | "bad_image"
  /** A kind of PNG or JPEG this doesn't read (interlaced, progressive...). */
  | "unsupported"
  /** Wider or taller than allowed. */
  | "too_big"
  /** Smaller than allowed. */
  | "too_small";

export class ImageError extends Error {
  constructor(
    readonly code: ImageErrorCode,
    detail = "",
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const bad = (detail: string) => new ImageError("bad_image", detail);

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = "";
  for (let i = 0; i < n && at + i < b.length; i++)
    s += String.fromCharCode(b[at + i]);
  return s;
}

/** What a file is, by its first bytes. */
export function sniffImage(b: Uint8Array): ImageKind {
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    ascii(b, 1, 3) === "PNG" &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP")
    return "webp";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "gif";
  const head = Buffer.from(b.subarray(0, 2048))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<") || head.includes("<svg") || head.includes("<html"))
    return "markup";
  return "unknown";
}

// ---------------------------------------------------------------- PNG

/**
 * Reads a PNG into RGBA. Every chunk's checksum is checked; only the image's
 * own chunks are read (IHDR, PLTE, tRNS, IDAT), so text, EXIF, colour
 * profiles and anything after IEND are never looked at.
 */
export function decodePng(buf: Uint8Array, maxSide: number): Rgba {
  if (sniffImage(buf) !== "png") throw bad("not a PNG");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let hdr: {
    width: number;
    height: number;
    depth: number;
    type: number;
  } | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let ended = false;
  while (p + 12 <= buf.length) {
    const len = dv.getUint32(p);
    if (len > buf.length - p - 12) throw bad("chunk runs past the end");
    const type = ascii(buf, p + 4, 4);
    const data = buf.subarray(p + 8, p + 8 + len);
    const crc = dv.getUint32(p + 8 + len);
    if (zlib.crc32(buf.subarray(p + 4, p + 8 + len)) >>> 0 !== crc)
      throw bad(`bad checksum on ${type}`);
    p += 12 + len;
    if (hdr === null) {
      if (type !== "IHDR" || len !== 13) throw bad("no IHDR first");
      const ih = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const width = ih.getUint32(0);
      const height = ih.getUint32(4);
      const depth = data[8];
      const ctype = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw bad("unknown method");
      if (data[12] !== 0) throw new ImageError("unsupported", "interlaced");
      const okDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!okDepths[ctype]?.includes(depth)) throw bad("bad colour type");
      if (width < 1 || height < 1) throw bad("empty");
      if (width > maxSide || height > maxSide)
        throw new ImageError("too_big", `${width}x${height}`);
      hdr = { width, height, depth, type: ctype };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      ended = true;
      break;
    }
    // Every other chunk (tEXt, iTXt, zTXt, eXIf, iCCP, ...) is skipped.
  }
  if (hdr === null || !ended || idat.length === 0) throw bad("incomplete");
  const { width, height, depth, type } = hdr;
  if (type === 3 && (palette === null || palette.length % 3 !== 0))
    throw bad("no palette");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type] as number;
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const expected = height * (rowBytes + 1);
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  } catch {
    throw bad("image data doesn't inflate");
  }
  if (raw.length < expected) throw bad("image data too short");

  // Undo each row's filter.
  const px = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y > 0 ? px[prev + i] : 0;
      const c = y > 0 && i >= bpp ? px[prev + i - bpp] : 0;
      let v: number;
      switch (f) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw bad("unknown filter");
      }
      px[row + i] = v & 0xff;
    }
  }

  // Samples to RGBA (16-bit samples keep their high byte).
  const out = new Uint8Array(width * height * 4);
  const maxV = (1 << Math.min(depth, 8)) - 1;
  const sample = (row: number, x: number, ch: number): number => {
    if (depth === 8) return px[row + x * channels + ch];
    if (depth === 16) return px[row + (x * channels + ch) * 2];
    const bit = (x * channels + ch) * depth;
    return (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & maxV;
  };
  const sample16 = (row: number, x: number, ch: number): number =>
    depth === 16
      ? (px[row + (x * channels + ch) * 2] << 8) |
        px[row + (x * channels + ch) * 2 + 1]
      : sample(row, x, ch);
  const scale = (v: number) => (depth >= 8 ? v : Math.round((v * 255) / maxV));
  const key = (i: number) =>
    trns && trns.length >= i * 2 + 2
      ? (trns[i * 2] << 8) | trns[i * 2 + 1]
      : -1;
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r: number, g: number, b: number;
      let a = 255;
      switch (type) {
        case 0: {
          r = g = b = scale(sample(row, x, 0));
          if (sample16(row, x, 0) === key(0)) a = 0;
          break;
        }
        case 2:
          r = sample(row, x, 0);
          g = sample(row, x, 1);
          b = sample(row, x, 2);
          if (
            sample16(row, x, 0) === key(0) &&
            sample16(row, x, 1) === key(1) &&
            sample16(row, x, 2) === key(2)
          )
            a = 0;
          break;
        case 3: {
          const i = sample(row, x, 0);
          if (i * 3 + 2 >= palette!.length) throw bad("index past palette");
          r = palette![i * 3];
          g = palette![i * 3 + 1];
          b = palette![i * 3 + 2];
          a = trns && i < trns.length ? trns[i] : 255;
          break;
        }
        case 4:
          r = g = b = sample(row, x, 0);
          a = sample(row, x, 1);
          break;
        default:
          r = sample(row, x, 0);
          g = sample(row, x, 1);
          b = sample(row, x, 2);
          a = sample(row, x, 3);
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------- JPEG, shared

/** The position in a block's zig-zag order of each coefficient (natural order). */
const ZIGZAG = Uint8Array.from([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
]);

/** COS[x * 8 + u] = C(u)/2 · cos((2x + 1)uπ/16): the DCT's basis, both ways. */
const COS = (() => {
  const t = new Float64Array(64);
  for (let x = 0; x < 8; x++)
    for (let u = 0; u < 8; u++)
      t[x * 8 + u] =
        ((u === 0 ? Math.SQRT1_2 : 1) / 2) *
        Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
/** Baseline JPEG's coefficients fit in 10 bits and a sign (DC differences in 11). */
const clampCoef = (v: number) => (v < -1023 ? -1023 : v > 1023 ? 1023 : v);

// ---------------------------------------------------------------- JPEG decoding

interface Huffman {
  maxcode: Int32Array;
  valptr: Int32Array;
  mincode: Int32Array;
  vals: Uint8Array;
}

function buildHuffman(counts: Uint8Array, vals: Uint8Array): Huffman {
  const maxcode = new Int32Array(18).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    const n = counts[l - 1];
    valptr[l] = k;
    mincode[l] = code;
    code += n;
    k += n;
    if (code > 1 << l) throw bad("bad Huffman table");
    maxcode[l] = n > 0 ? code - 1 : -1;
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  if (k > vals.length) throw bad("short Huffman table");
  return { maxcode, valptr, mincode, vals };
}

interface Component {
  id: number;
  h: number;
  v: number;
  tq: number;
  td: number;
  ta: number;
  /** Blocks across and down this component's plane. */
  bw: number;
  bh: number;
  plane: Uint8Array;
  pred: number;
}

/**
 * Reads a baseline JPEG into RGBA. Only the image's own segments are read
 * (tables, frame, scan); APPn (EXIF, GPS, XMP, colour profiles), comments
 * and anything after the end are skipped. Progressive and arithmetic-coded
 * JPEGs, and CMYK ones, are "unsupported".
 */
export function decodeJpeg(buf: Uint8Array, maxSide: number): Rgba {
  if (sniffImage(buf) !== "jpeg") throw bad("not a JPEG");
  const qt: (Uint16Array | null)[] = [null, null, null, null];
  const dc: (Huffman | null)[] = [null, null, null, null];
  const ac: (Huffman | null)[] = [null, null, null, null];
  let frame: {
    width: number;
    height: number;
    comps: Component[];
    hmax: number;
    vmax: number;
    mcusX: number;
    mcusY: number;
  } | null = null;
  let restart = 0;
  let scanned = false;
  let p = 2;
  const u16 = (at: number) => (buf[at] << 8) | buf[at + 1];

  while (p < buf.length) {
    if (buf[p] !== 0xff) throw bad("expected a marker");
    while (buf[p] === 0xff && p < buf.length) p++;
    const m = buf[p++];
    if (m === 0xd9) break; // EOI: anything after it is never read
    if (m >= 0xd0 && m <= 0xd7) continue; // a stray RST
    if (p + 2 > buf.length) throw bad("truncated");
    const len = u16(p);
    if (len < 2 || p + len > buf.length) throw bad("segment runs past the end");
    const seg = buf.subarray(p + 2, p + len);
    p += len;
    switch (m) {
      case 0xdb: {
        let i = 0;
        while (i < seg.length) {
          const pq = seg[i] >> 4;
          const tq = seg[i] & 15;
          if (tq > 3 || pq > 1) throw bad("bad DQT");
          const t = new Uint16Array(64);
          for (let k = 0; k < 64; k++)
            t[k] = pq
              ? (seg[i + 1 + 2 * k] << 8) | seg[i + 2 + 2 * k]
              : seg[i + 1 + k];
          if (i + 1 + 64 * (pq + 1) > seg.length) throw bad("short DQT");
          qt[tq] = t;
          i += 1 + 64 * (pq + 1);
        }
        break;
      }
      case 0xc4: {
        let i = 0;
        while (i < seg.length) {
          const tc = seg[i] >> 4;
          const th = seg[i] & 15;
          if (tc > 1 || th > 3 || i + 17 > seg.length) throw bad("bad DHT");
          const counts = seg.subarray(i + 1, i + 17);
          let n = 0;
          for (const c of counts) n += c;
          if (n > 256 || i + 17 + n > seg.length) throw bad("bad DHT");
          const t = buildHuffman(counts, seg.slice(i + 17, i + 17 + n));
          (tc === 0 ? dc : ac)[th] = t;
          i += 17 + n;
        }
        break;
      }
      case 0xdd:
        if (seg.length < 2) throw bad("bad DRI");
        restart = (seg[0] << 8) | seg[1];
        break;
      case 0xc0:
      case 0xc1: {
        if (frame) throw bad("two frames");
        if (seg[0] !== 8) throw new ImageError("unsupported", "not 8-bit");
        const height = (seg[1] << 8) | seg[2];
        const width = (seg[3] << 8) | seg[4];
        const n = seg[5];
        if (width < 1 || height < 1) throw new ImageError("unsupported", "DNL");
        if (width > maxSide || height > maxSide)
          throw new ImageError("too_big", `${width}x${height}`);
        if (n !== 1 && n !== 3)
          throw new ImageError("unsupported", `${n} components`);
        if (seg.length < 6 + 3 * n) throw bad("short SOF");
        const comps: Component[] = [];
        for (let c = 0; c < n; c++) {
          const h = n === 1 ? 1 : seg[7 + 3 * c] >> 4;
          const v = n === 1 ? 1 : seg[7 + 3 * c] & 15;
          if (h < 1 || h > 2 || v < 1 || v > 2)
            throw new ImageError("unsupported", "sampling");
          comps.push({
            id: seg[6 + 3 * c],
            h,
            v,
            tq: seg[8 + 3 * c] & 3,
            td: 0,
            ta: 0,
            bw: 0,
            bh: 0,
            plane: new Uint8Array(0),
            pred: 0,
          });
        }
        const hmax = Math.max(...comps.map((c) => c.h));
        const vmax = Math.max(...comps.map((c) => c.v));
        const mcusX = Math.ceil(width / (8 * hmax));
        const mcusY = Math.ceil(height / (8 * vmax));
        for (const c of comps) {
          c.bw = mcusX * c.h;
          c.bh = mcusY * c.v;
          c.plane = new Uint8Array(c.bw * 8 * c.bh * 8);
        }
        frame = { width, height, comps, hmax, vmax, mcusX, mcusY };
        break;
      }
      case 0xda: {
        if (!frame) throw bad("scan before frame");
        if (scanned) throw new ImageError("unsupported", "more than one scan");
        const n = seg[0];
        if (n !== frame.comps.length)
          throw new ImageError("unsupported", "a scan of some components");
        for (let i = 0; i < n; i++) {
          const c = frame.comps.find((x) => x.id === seg[1 + 2 * i]);
          if (!c) throw bad("scan names an unknown component");
          c.td = seg[2 + 2 * i] >> 4;
          c.ta = seg[2 + 2 * i] & 15;
          if (c.td > 3 || c.ta > 3 || !dc[c.td] || !ac[c.ta] || !qt[c.tq])
            throw bad("scan needs a missing table");
        }
        p = decodeScan(buf, p, frame, qt, dc, ac, restart);
        scanned = true;
        break;
      }
      default:
        if (m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce)
          throw new ImageError("unsupported", "progressive");
        if (m >= 0xc3 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          throw new ImageError("unsupported", "lossless or arithmetic");
        if (m === 0xc9 || m === 0xcb || m === 0xcd)
          throw new ImageError("unsupported", "arithmetic");
      // APP0-APP15 (EXIF, GPS, XMP, ICC...), COM and the rest: skipped.
    }
  }
  if (!frame || !scanned) throw bad("no image");

  const { width, height, comps, hmax, vmax } = frame;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (c: Component) =>
        c.plane[
          Math.floor((y * c.v) / vmax) * c.bw * 8 + Math.floor((x * c.h) / hmax)
        ];
      const o = (y * width + x) * 4;
      const Y = at(comps[0]);
      if (comps.length === 1) {
        out[o] = out[o + 1] = out[o + 2] = Y;
      } else {
        const cb = at(comps[1]) - 128;
        const cr = at(comps[2]) - 128;
        out[o] = clampByte(Y + 1.402 * cr);
        out[o + 1] = clampByte(Y - 0.344136 * cb - 0.714136 * cr);
        out[o + 2] = clampByte(Y + 1.772 * cb);
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Decodes a scan's entropy-coded data; returns where the data ends. */
function decodeScan(
  buf: Uint8Array,
  start: number,
  frame: {
    comps: Component[];
    mcusX: number;
    mcusY: number;
  },
  qt: (Uint16Array | null)[],
  dc: (Huffman | null)[],
  ac: (Huffman | null)[],
  restart: number,
): number {
  let p = start;
  let bits = 0;
  let nbits = 0;
  const bit = (): number => {
    if (nbits === 0) {
      let b = 0;
      if (p < buf.length) {
        b = buf[p];
        if (b === 0xff) {
          const next = buf[p + 1];
          if (next === 0x00) p += 2;
          else b = 0; // a marker: pad with zeros, don't read past it
        } else p++;
      }
      bits = b;
      nbits = 8;
    }
    nbits--;
    return (bits >> nbits) & 1;
  };
  const receive = (s: number): number => {
    let v = 0;
    for (let i = 0; i < s; i++) v = (v << 1) | bit();
    return v;
  };
  const extend = (v: number, s: number) =>
    v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
  const decode = (h: Huffman): number => {
    let code = bit();
    let l = 1;
    while (code > h.maxcode[l]) {
      code = (code << 1) | bit();
      l++;
      if (l > 16) throw bad("bad Huffman code");
    }
    const i = h.valptr[l] + code - h.mincode[l];
    if (i < 0 || i >= h.vals.length) throw bad("bad Huffman code");
    return h.vals[i];
  };

  const coef = new Float64Array(64);
  const tmp = new Float64Array(64);
  const block = (c: Component, bx: number, by: number) => {
    const q = qt[c.tq]!;
    coef.fill(0);
    const t = decode(dc[c.td]!);
    if (t > 11) throw bad("bad DC");
    c.pred += t === 0 ? 0 : extend(receive(t), t);
    coef[0] = c.pred * q[0];
    for (let k = 1; k < 64; ) {
      const rs = decode(ac[c.ta]!);
      const r = rs >> 4;
      const s = rs & 15;
      if (s === 0) {
        if (r !== 15) break;
        k += 16;
        continue;
      }
      k += r;
      if (k > 63) throw bad("coefficients run past the block");
      coef[ZIGZAG[k]] = extend(receive(s), s) * q[k];
      k++;
    }
    // Inverse DCT: rows, then columns.
    for (let v = 0; v < 8; v++)
      for (let x = 0; x < 8; x++) {
        let s = 0;
        for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * coef[v * 8 + u];
        tmp[v * 8 + x] = s;
      }
    const stride = c.bw * 8;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let s = 0;
        for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x];
        c.plane[(by * 8 + y) * stride + bx * 8 + x] = clampByte(s + 128);
      }
  };

  const { comps, mcusX, mcusY } = frame;
  const single = comps.length === 1;
  // One component alone isn't interleaved: its MCUs are its own blocks.
  const total = single
    ? Math.ceil(comps[0].bw) * Math.ceil(comps[0].bh)
    : mcusX * mcusY;
  for (const c of comps) c.pred = 0;
  for (let n = 0; n < total; n++) {
    if (restart > 0 && n > 0 && n % restart === 0) {
      // Drop what's left of the byte, find the RSTn marker, start again.
      nbits = 0;
      while (
        p + 1 < buf.length &&
        !(buf[p] === 0xff && buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7)
      )
        p++;
      if (p + 1 < buf.length) p += 2;
      for (const c of comps) c.pred = 0;
    }
    if (single) {
      const c = comps[0];
      block(c, n % c.bw, Math.floor(n / c.bw));
    } else {
      const mx = n % mcusX;
      const my = Math.floor(n / mcusX);
      for (const c of comps)
        for (let by = 0; by < c.v; by++)
          for (let bx = 0; bx < c.h; bx++)
            block(c, mx * c.h + bx, my * c.v + by);
    }
  }
  // On to the next marker.
  while (
    p + 1 < buf.length &&
    !(
      buf[p] === 0xff &&
      buf[p + 1] !== 0x00 &&
      !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7)
    )
  )
    p++;
  return p;
}

// ---------------------------------------------------------------- JPEG encoding

const STD_LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const STD_CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99,
];

// The standard Huffman tables (ITU T.81, Annex K.3).
const DC_LUMA_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_CHROMA_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUMA_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUMA_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const AC_CHROMA_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHROMA_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51,
  0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1,
  0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24,
  0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a,
  0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66,
  0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82,
  0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,
  0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
  0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

/** symbol → [code, length]. */
function huffmanCodes(
  bits: number[],
  vals: number[],
): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < bits[l - 1]; i++) out.set(vals[k++], [code++, l]);
    code <<= 1;
  }
  return out;
}

const HUFF = {
  dcLuma: huffmanCodes(DC_LUMA_BITS, DC_VALS),
  dcChroma: huffmanCodes(DC_CHROMA_BITS, DC_VALS),
  acLuma: huffmanCodes(AC_LUMA_BITS, AC_LUMA_VALS),
  acChroma: huffmanCodes(AC_CHROMA_BITS, AC_CHROMA_VALS),
};

function scaledTable(base: number[], quality: number): Uint8Array {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return Uint8Array.from(base, (v) =>
    Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))),
  );
}

/**
 * Writes RGBA (alpha ignored: flatten first) as a baseline JPEG, full
 * colour resolution (4:4:4), with a bare JFIF header and nothing else.
 */
export function encodeJpeg(img: Rgba, quality = 86): Buffer {
  const { width, height, data } = img;
  const lq = scaledTable(STD_LUMA_Q, quality);
  const cq = scaledTable(STD_CHROMA_Q, quality);
  const bytes: number[] = [];
  const u16 = (v: number) => bytes.push((v >> 8) & 0xff, v & 0xff);
  const marker = (m: number) => bytes.push(0xff, m);

  marker(0xd8);
  // JFIF: version 1.1, no density units, 1:1, no thumbnail.
  marker(0xe0);
  u16(16);
  bytes.push(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0);
  u16(1);
  u16(1);
  bytes.push(0, 0);
  marker(0xdb);
  u16(2 + 65 * 2);
  bytes.push(0);
  for (let k = 0; k < 64; k++) bytes.push(lq[ZIGZAG[k]]);
  bytes.push(1);
  for (let k = 0; k < 64; k++) bytes.push(cq[ZIGZAG[k]]);
  marker(0xc0);
  u16(17);
  bytes.push(8);
  u16(height);
  u16(width);
  bytes.push(3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1);
  marker(0xc4);
  const tables: [number, number[], number[]][] = [
    [0x00, DC_LUMA_BITS, DC_VALS],
    [0x10, AC_LUMA_BITS, AC_LUMA_VALS],
    [0x01, DC_CHROMA_BITS, DC_VALS],
    [0x11, AC_CHROMA_BITS, AC_CHROMA_VALS],
  ];
  u16(2 + tables.reduce((n, [, b, v]) => n + 17 + v.length, 0));
  for (const [id, b, v] of tables) bytes.push(id, ...b, ...v);
  marker(0xda);
  u16(12);
  bytes.push(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);

  let acc = 0;
  let nacc = 0;
  const put = (code: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      acc = (acc << 1) | ((code >> i) & 1);
      if (++nacc === 8) {
        bytes.push(acc);
        if (acc === 0xff) bytes.push(0);
        acc = 0;
        nacc = 0;
      }
    }
  };
  const sym = (t: Map<number, [number, number]>, s: number) => {
    const c = t.get(s);
    if (!c) throw new Error(`no Huffman code for ${s}`);
    put(c[0], c[1]);
  };
  const category = (v: number) => {
    let a = Math.abs(v);
    let n = 0;
    while (a) {
      n++;
      a >>= 1;
    }
    return n;
  };
  const value = (v: number, n: number) => put(v < 0 ? v + (1 << n) - 1 : v, n);

  const f = new Float64Array(64);
  const tmp = new Float64Array(64);
  const preds = [0, 0, 0];
  const plane = new Float64Array(64 * 3);
  const bw = Math.ceil(width / 8);
  const bh = Math.ceil(height / 8);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const sx = Math.min(width - 1, bx * 8 + x);
          const sy = Math.min(height - 1, by * 8 + y);
          const o = (sy * width + sx) * 4;
          const r = data[o];
          const g = data[o + 1];
          const b = data[o + 2];
          const i = y * 8 + x;
          plane[i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          plane[64 + i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
          plane[128 + i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      for (let c = 0; c < 3; c++) {
        const q = c === 0 ? lq : cq;
        // Forward DCT: rows, then columns.
        for (let y = 0; y < 8; y++)
          for (let u = 0; u < 8; u++) {
            let s = 0;
            for (let x = 0; x < 8; x++)
              s += COS[x * 8 + u] * plane[c * 64 + y * 8 + x];
            tmp[y * 8 + u] = s;
          }
        for (let v = 0; v < 8; v++)
          for (let u = 0; u < 8; u++) {
            let s = 0;
            for (let y = 0; y < 8; y++) s += COS[y * 8 + v] * tmp[y * 8 + u];
            f[v * 8 + u] = s;
          }
        const dcT = c === 0 ? HUFF.dcLuma : HUFF.dcChroma;
        const acT = c === 0 ? HUFF.acLuma : HUFF.acChroma;
        const dcv = clampCoef(Math.round(f[0] / q[0]));
        const diff = dcv - preds[c];
        preds[c] = dcv;
        const dn = category(diff);
        sym(dcT, dn);
        if (dn) value(diff, dn);
        let run = 0;
        for (let k = 1; k < 64; k++) {
          const z = ZIGZAG[k];
          const v = clampCoef(Math.round(f[z] / q[z]));
          if (v === 0) {
            run++;
            continue;
          }
          while (run > 15) {
            sym(acT, 0xf0);
            run -= 16;
          }
          const n = category(v);
          sym(acT, (run << 4) | n);
          value(v, n);
          run = 0;
        }
        if (run > 0) sym(acT, 0x00);
      }
    }
  if (nacc > 0) put((1 << (8 - nacc)) - 1, 8 - nacc);
  marker(0xd9);
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------- the picture

/**
 * The middle square of an image, resized to `size` and laid on `bg` where
 * it's see-through (a tent filter: bilinear going up, averaging going down).
 */
export function squareThumb(
  img: Rgba,
  size: number,
  bg: [number, number, number],
): Rgba {
  const side = Math.min(img.width, img.height);
  const ox = (img.width - side) >> 1;
  const oy = (img.height - side) >> 1;
  const weights = resampleWeights(side, size);
  const d = img.data;
  // Across first, premultiplied, so see-through edges don't bleed the
  // colour they hide.
  const mid = new Float32Array(size * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < size; x++) {
      const [from, ws] = weights[x];
      const o = (y * size + x) * 4;
      for (let k = 0; k < ws.length; k++) {
        const i = ((y + oy) * img.width + ox + from + k) * 4;
        const a = (d[i + 3] / 255) * ws[k];
        mid[o] += d[i] * a;
        mid[o + 1] += d[i + 1] * a;
        mid[o + 2] += d[i + 2] * a;
        mid[o + 3] += a;
      }
    }
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const [from, ws] = weights[y];
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < ws.length; k++) {
        const i = ((from + k) * size + x) * 4;
        r += mid[i] * ws[k];
        g += mid[i + 1] * ws[k];
        b += mid[i + 2] * ws[k];
        a += mid[i + 3] * ws[k];
      }
      const o = (y * size + x) * 4;
      const rest = 1 - Math.min(1, Math.max(0, a));
      out[o] = clampByte(r + bg[0] * rest);
      out[o + 1] = clampByte(g + bg[1] * rest);
      out[o + 2] = clampByte(b + bg[2] * rest);
      out[o + 3] = 255;
    }
  }
  return { width: size, height: size, data: out };
}

/** For each output index: the first source index and the weights from there. */
function resampleWeights(from: number, to: number): [number, number[]][] {
  const scale = from / to;
  const support = Math.max(1, scale);
  const out: [number, number[]][] = [];
  for (let i = 0; i < to; i++) {
    const center = (i + 0.5) * scale - 0.5;
    const lo = Math.max(0, Math.floor(center - support + 1));
    const hi = Math.min(from - 1, Math.ceil(center + support - 1));
    const ws: number[] = [];
    let sum = 0;
    for (let j = lo; j <= hi; j++) {
      const w = Math.max(0, 1 - Math.abs(j - center) / support);
      ws.push(w);
      sum += w;
    }
    if (sum === 0) {
      out.push([Math.min(from - 1, Math.max(0, Math.round(center))), [1]]);
      continue;
    }
    out.push([lo, ws.map((w) => w / sum)]);
  }
  return out;
}

export interface PictureLimits {
  /** Widest or tallest an upload may be, in pixels. */
  maxSide: number;
  /** Narrowest or shortest. */
  minSide: number;
  /** The stored picture's side. */
  size: number;
  /** The most bytes a stored picture may take. */
  maxBytes: number;
  /** What shows through a see-through picture. */
  background: [number, number, number];
}

export const PICTURE_LIMITS: PictureLimits = {
  maxSide: 1024,
  minSide: 32,
  size: 256,
  maxBytes: 100 * 1024,
  background: [0x2a, 0x2a, 0x30],
};

/**
 * An upload made into the picture that's kept: read as a PNG or a JPEG
 * (whatever it claims to be), its middle square resized and drawn again as
 * a plain JPEG. Throws an ImageError when it can't be.
 */
export function reencodePicture(
  input: Uint8Array,
  limits: PictureLimits = PICTURE_LIMITS,
): { jpeg: Buffer; quality: number } {
  const kind = sniffImage(input);
  let img: Rgba;
  if (kind === "png") img = decodePng(input, limits.maxSide);
  else if (kind === "jpeg") img = decodeJpeg(input, limits.maxSide);
  else throw new ImageError("bad_type", kind);
  if (img.width < limits.minSide || img.height < limits.minSide)
    throw new ImageError("too_small", `${img.width}x${img.height}`);
  const thumb = squareThumb(img, limits.size, limits.background);
  for (const quality of [86, 72, 58, 44]) {
    const jpeg = encodeJpeg(thumb, quality);
    if (jpeg.length <= limits.maxBytes) return { jpeg, quality };
  }
  throw new ImageError("bad_image", "won't fit");
}
