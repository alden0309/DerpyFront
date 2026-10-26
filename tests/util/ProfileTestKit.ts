// PROFILE (r26): what the badge and picture tests share: a Derp Land API
// on a throwaway Postgres (every derpy_ table in it dropped first), test
// accounts, and pictures built by hand (PNGs with extra chunks, JPEGs
// carrying EXIF with a GPS location).

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import type pg from "pg";
import zlib from "zlib";
import { encodeJpeg, type Rgba } from "../../src/server/derpy/ImageCodec";

export const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

export interface TestUser {
  id: number;
  token: string;
  name: string;
}

export interface Kit {
  base: string;
  pool: pg.Pool;
  user(name: string): Promise<TestUser>;
  call(
    path: string,
    opts?: {
      body?: unknown;
      raw?: Uint8Array;
      token?: string;
      method?: string;
      contentType?: string;
      /** ADMIN (r26): more headers (the admin page's POSTs carry an Origin). */
      headers?: Record<string, string>;
    },
  ): Promise<{
    status: number;
    json: any;
    headers: Headers;
    bytes: Buffer;
  }>;
  close(): Promise<void>;
}

/** A fresh Derp Land API on the test database. */
export async function startKit(): Promise<Kit> {
  process.env.DATABASE_URL = TEST_DB;
  const pgm = await import("pg");
  const c = new pgm.default.Client({ connectionString: TEST_DB });
  await c.connect();
  const tables = await c.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'derpy\\_%'",
  );
  if (tables.rows.length)
    await c.query(
      `DROP TABLE IF EXISTS ${tables.rows.map((r) => r.tablename).join(", ")} CASCADE`,
    );
  await c.end();
  const D = await import("../../src/server/derpy/DerpyDb");
  const { register } = await import("../../src/server/derpy/DerpyAuth");
  const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
  const app = express();
  app.use("/derpy/api", derpyApiRouter());
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
  const pool = await D.db();
  return {
    base,
    pool,
    async user(name) {
      const s = await register(name, "hunter22");
      if (typeof s === "string") throw new Error(s);
      return { id: s.account.id, token: s.token, name };
    },
    async call(path, opts = {}) {
      const body =
        opts.raw !== undefined
          ? new Uint8Array(opts.raw)
          : opts.body !== undefined
            ? JSON.stringify(opts.body)
            : undefined;
      const res = await fetch(base + path, {
        method: opts.method ?? (body !== undefined ? "POST" : "GET"),
        headers: {
          ...(opts.raw !== undefined
            ? { "Content-Type": opts.contentType ?? "image/png" }
            : opts.body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...opts.headers, // ADMIN (r26)
        },
        body,
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      let json: unknown = null;
      if ((res.headers.get("content-type") ?? "").includes("json"))
        json = JSON.parse(bytes.toString("utf8"));
      return { status: res.status, json, headers: res.headers, bytes };
    },
    async close() {
      await new Promise((r) => server.close(r));
      await D.closeDerpyDb();
      delete process.env.DATABASE_URL;
    },
  };
}

// ---------------------------------------------------------------- pictures

/** A scene with some shape to it (so a JPEG has work to do). */
export function scene(w: number, h: number, alpha = 255): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const sun = (x - w / 2) ** 2 + (y - h / 3) ** 2 < (w / 5) ** 2;
      data[o] = sun ? 245 : (x * 200) / w;
      data[o + 1] = sun ? 204 : 90 + (y * 120) / h;
      data[o + 2] = sun ? 60 : 200 - (y * 100) / h;
      data[o + 3] = alpha;
    }
  return { width: w, height: h, data };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/**
 * An 8-bit RGBA PNG, with `extra` chunks before the image data and
 * `trailing` bytes after its end.
 */
export function makePng(
  img: Rgba,
  opts: { extra?: [string, Uint8Array][]; trailing?: Uint8Array } = {},
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < img.height; y++)
    rows.push(
      Buffer.from([0]),
      Buffer.from(
        img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4),
      ),
    );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...(opts.extra ?? []).map(([t, d]) => chunk(t, d)),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", new Uint8Array(0)),
    Buffer.from(opts.trailing ?? new Uint8Array(0)),
  ]);
}

/** Just a PNG's header: a picture this size, with no image data. */
export function pngHeaderOnly(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** The latitude a phone would write: 40° 26' 46.302" (as three rationals). */
export const GPS_LATITUDE = Buffer.from([
  0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 1, 0, 0, 0xb4, 0xde, 0, 0, 3,
  0xe8,
]);
export const CAMERA_MAKE = "PhoneMakerX";

/**
 * An EXIF block as a phone writes one: the camera's make, and a GPS
 * location (latitude N 40°26'46", longitude W 79°58'56").
 */
export function exifWithGps(): Buffer {
  // TIFF, big-endian. IFD0: Make, GPSInfo. GPS IFD: lat/lon and their refs.
  const make = Buffer.from(`${CAMERA_MAKE}\0`, "latin1");
  const ifd0At = 8;
  const ifd0Size = 2 + 2 * 12 + 4;
  const makeAt = ifd0At + ifd0Size;
  const gpsAt = makeAt + make.length;
  const gpsSize = 2 + 4 * 12 + 4;
  const latAt = gpsAt + gpsSize;
  const lonAt = latAt + 24;
  const t = Buffer.alloc(lonAt + 24);
  t.write("MM", 0, "latin1");
  t.writeUInt16BE(42, 2);
  t.writeUInt32BE(ifd0At, 4);
  let p = ifd0At;
  const entry = (tag: number, type: number, count: number, value: number) => {
    t.writeUInt16BE(tag, p);
    t.writeUInt16BE(type, p + 2);
    t.writeUInt32BE(count, p + 4);
    t.writeUInt32BE(value, p + 8);
    p += 12;
  };
  t.writeUInt16BE(2, p);
  p += 2;
  entry(0x010f, 2, make.length, makeAt);
  entry(0x8825, 4, 1, gpsAt);
  t.writeUInt32BE(0, p);
  make.copy(t, makeAt);
  p = gpsAt;
  t.writeUInt16BE(4, p);
  p += 2;
  // Two-byte ASCII values sit in the entry itself, left-justified.
  entry(0x0001, 2, 2, 0x4e000000); // "N"
  entry(0x0002, 5, 3, latAt);
  entry(0x0003, 2, 2, 0x57000000); // "W"
  entry(0x0004, 5, 3, lonAt);
  t.writeUInt32BE(0, p);
  GPS_LATITUDE.copy(t, latAt);
  Buffer.from([
    0, 0, 0, 79, 0, 0, 0, 1, 0, 0, 0, 58, 0, 0, 0, 1, 0, 0, 0xdd, 0x7c, 0, 0, 3,
    0xe8,
  ]).copy(t, lonAt);
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);
}

/** A JPEG of `img` carrying EXIF with a GPS location and a comment. */
export function jpegWithGps(img: Rgba): Buffer {
  const plain = encodeJpeg(img, 90);
  const exif = exifWithGps();
  const app1 = Buffer.alloc(4);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(exif.length + 2, 2);
  const note = Buffer.from("<script>alert(1)</script>", "latin1");
  const com = Buffer.alloc(4);
  com[0] = 0xff;
  com[1] = 0xfe;
  com.writeUInt16BE(note.length + 2, 2);
  // After SOI: the EXIF block and a comment, as cameras and editors put them.
  return Buffer.concat([
    plain.subarray(0, 2),
    app1,
    exif,
    com,
    note,
    plain.subarray(2),
  ]);
}

/** The markers of a JPEG's segments, in order, up to its scan. */
export function jpegMarkers(b: Uint8Array): number[] {
  const out: number[] = [];
  let p = 2;
  out.push(0xd8);
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) break;
    const m = b[p + 1];
    out.push(m);
    if (m === 0xda) break;
    p += 2 + ((b[p + 2] << 8) | b[p + 3]);
  }
  return out;
}
