// PROFILE (r26): profile pictures. What an upload may be (read by its bytes:
// PNG or JPEG, never SVG or anything dressed up as a picture), how big, the
// re-encode that keeps only the pixels (a JPEG carrying a GPS location comes
// out without it), the day's limit, serving (a year's cache, as an image
// only), falling back to the monogram, and moderation (reports, the owner
// removing and blocking, and nobody else).
//
// The database part needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=...
// (every derpy_ table in it is dropped first). Skipped without one.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  MONOGRAM_COLORS,
  monogramColor,
  parsePic,
  picSrc,
  PRESETS,
  presetUnlocked,
} from "../../src/derpland/Pictures";
import {
  decodeJpeg,
  decodePng,
  encodeJpeg,
  ImageError,
  reencodePicture,
  sniffImage,
} from "../../src/server/derpy/ImageCodec";
import {
  CAMERA_MAKE,
  GPS_LATITUDE,
  jpegMarkers,
  jpegWithGps,
  type Kit,
  makePng,
  pngHeaderOnly,
  scene,
  startKit,
  TEST_DB,
  type TestUser,
} from "../util/ProfileTestKit";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "..", "testdata", "pictures");

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImageError) return e.code;
    throw e;
  }
  return "ok";
}

const has = (b: Uint8Array, s: string | Uint8Array) =>
  Buffer.from(b).includes(
    typeof s === "string" ? Buffer.from(s, "latin1") : Buffer.from(s),
  );

describe("what an upload may be", () => {
  test("its bytes say what it is, whatever it's called", () => {
    expect(sniffImage(makePng(scene(8, 8)))).toBe("png");
    expect(sniffImage(encodeJpeg(scene(8, 8)))).toBe("jpeg");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(Buffer.from("GIF89a...."))).toBe("gif");
    expect(
      sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="x"></svg>')),
    ).toBe("markup");
    expect(sniffImage(Buffer.from("﻿  <svg onload=alert(1)>"))).toBe("markup");
    expect(sniffImage(Buffer.from("<html><script>x</script>"))).toBe("markup");
    expect(sniffImage(Buffer.from("just some text"))).toBe("unknown");
  });

  test("SVG, WebP, GIF and anything else are refused; PNG and JPEG are read", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(codeOf(() => reencodePicture(svg))).toBe("bad_type");
    expect(
      codeOf(() => reencodePicture(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))),
    ).toBe("bad_type");
    expect(
      codeOf(() => reencodePicture(Buffer.from("GIF89a\x01\0\x01\0"))),
    ).toBe("bad_type");
    expect(codeOf(() => reencodePicture(makePng(scene(64, 64))))).toBe("ok");
    expect(codeOf(() => reencodePicture(encodeJpeg(scene(64, 64))))).toBe("ok");
  });

  test("a file dressed up as a picture is refused", () => {
    // A PNG's signature, then a page.
    const fakePng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("<html><script>alert(1)</script></html>"),
    ]);
    expect(codeOf(() => reencodePicture(fakePng))).toBe("bad_image");
    // A JPEG's first bytes, then a script.
    const fakeJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]),
      Buffer.from("<script>alert(1)</script>"),
    ]);
    expect(codeOf(() => reencodePicture(fakeJpeg))).toBe("bad_image");
    // A real PNG with one byte changed fails its checksum.
    const png = makePng(scene(40, 40));
    png[40] ^= 0xff;
    expect(codeOf(() => reencodePicture(png))).toBe("bad_image");
  });

  test("too wide or tall (read from the header, before any of it is unpacked), or too small", () => {
    expect(codeOf(() => reencodePicture(pngHeaderOnly(5000, 5000)))).toBe(
      "too_big",
    );
    expect(codeOf(() => reencodePicture(makePng(scene(1100, 40))))).toBe(
      "too_big",
    );
    expect(codeOf(() => reencodePicture(makePng(scene(16, 16))))).toBe(
      "too_small",
    );
  });

  test("progressive JPEGs aren't read; restart markers are", () => {
    const prog = fs.readFileSync(path.join(FIXTURES, "progressive.jpg"));
    expect(codeOf(() => reencodePicture(prog))).toBe("unsupported");
    const rst = decodeJpeg(
      fs.readFileSync(path.join(FIXTURES, "restart.jpg")),
      1024,
    );
    expect([rst.width, rst.height]).toEqual([96, 64]);
    // The yellow sun in the middle, the green strip along the bottom.
    const px = (x: number, y: number) =>
      Array.from(rst.data.subarray((y * 96 + x) * 4, (y * 96 + x) * 4 + 3));
    const near = (a: number[], b: number[]) =>
      a.every((v, i) => Math.abs(v - b[i]) < 24);
    expect(near(px(48, 32), [245, 204, 60])).toBe(true);
    expect(near(px(10, 58), [71, 176, 114])).toBe(true);
    expect(near(px(5, 5), [59, 127, 196])).toBe(true);
  });
});

describe("the re-encode keeps the picture and nothing else", () => {
  test("a JPEG carrying EXIF with a GPS location comes out without it", () => {
    const input = jpegWithGps(scene(320, 240));
    // The upload really does carry it.
    expect(has(input, "Exif")).toBe(true);
    expect(has(input, CAMERA_MAKE)).toBe(true);
    expect(has(input, GPS_LATITUDE)).toBe(true);
    expect(has(input, "<script>")).toBe(true);
    const { jpeg } = reencodePicture(input);
    expect(has(jpeg, "Exif")).toBe(false);
    expect(has(jpeg, CAMERA_MAKE)).toBe(false);
    expect(has(jpeg, GPS_LATITUDE)).toBe(false);
    expect(has(jpeg, "<script>")).toBe(false);
    // Only a bare JFIF header, the tables, the frame and the scan.
    expect(jpegMarkers(jpeg)).toEqual([0xd8, 0xe0, 0xdb, 0xc0, 0xc4, 0xda]);
    expect(jpeg.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    const back = decodeJpeg(jpeg, 1024);
    expect([back.width, back.height]).toEqual([256, 256]);
  });

  test("a PNG's text, EXIF and anything after its end are dropped", () => {
    const input = makePng(scene(300, 300), {
      extra: [
        ["tEXt", Buffer.from("Comment\0<script>alert(1)</script>", "latin1")],
        ["eXIf", Buffer.from("MM\0*\0\0\0\x08GPS-HOME-40.4461N", "latin1")],
      ],
      trailing: Buffer.from("<html><script>alert(2)</script></html>"),
    });
    expect(decodePng(input, 1024).width).toBe(300);
    const { jpeg } = reencodePicture(input);
    for (const s of ["<script>", "GPS-HOME", "<html>", "eXIf", "tEXt"])
      expect(has(jpeg, s), s).toBe(false);
    expect(jpegMarkers(jpeg)[1]).toBe(0xe0);
  });

  test("the middle square, 256 pixels across, laid on the panel's grey where see-through, kept small", () => {
    // 400×200: the middle 200×200 is kept. Fully see-through: all grey.
    const clear = reencodePicture(makePng(scene(400, 200, 0)));
    const img = decodeJpeg(clear.jpeg, 1024);
    expect([img.width, img.height]).toEqual([256, 256]);
    const mid = Array.from(
      img.data.subarray((128 * 256 + 128) * 4, (128 * 256 + 128) * 4 + 3),
    );
    for (const [v, want] of mid.map((v, i) => [v, [0x2a, 0x2a, 0x30][i]]))
      expect(Math.abs(v - want)).toBeLessThan(6);
    // Even noise (the worst case) fits in about 100 KB.
    const noise = scene(256, 256);
    for (let i = 0; i < noise.data.length; i++)
      if (i % 4 !== 3) noise.data[i] = (i * 2654435761) >>> 24;
    const r = reencodePicture(makePng(noise));
    expect(r.jpeg.length).toBeLessThanOrEqual(100 * 1024);
    // A real scene is far smaller.
    expect(reencodePicture(makePng(scene(256, 256))).jpeg.length).toBeLessThan(
      40 * 1024,
    );
  });

  test("the decoders read real pictures: a PNG, and the JPEG they write", () => {
    const png = decodePng(
      fs.readFileSync(path.join(FIXTURES, "scene.png")),
      1024,
    );
    expect([png.width, png.height]).toEqual([96, 64]);
    const src = scene(64, 48);
    const back = decodeJpeg(encodeJpeg(src, 90), 1024);
    let se = 0;
    for (let i = 0; i < src.data.length; i++)
      if (i % 4 !== 3) se += (src.data[i] - back.data[i]) ** 2;
    const psnr =
      10 * Math.log10((255 * 255) / (se / ((src.data.length / 4) * 3)));
    expect(psnr).toBeGreaterThan(32);
  });
});

describe("picture strings and fallbacks", () => {
  test("presets, monograms and uploads parse; anything else is the monogram", () => {
    expect(parsePic("p:musket")).toEqual({ kind: "preset", id: "musket" });
    expect(parsePic("m:3")).toEqual({ kind: "mono", n: 3 });
    expect(parsePic("u:12:0123456789ab")).toEqual({
      kind: "upload",
      account: 12,
      version: "0123456789ab",
    });
    for (const bad of [
      "p:nope",
      "m:99",
      "m:-1",
      "u:12:../../etc",
      "u:x:0123456789ab",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ])
      expect(parsePic(bad), String(bad)).toBeNull();
    expect(picSrc("p:dome")).toBe("/derpland/pics/dome.svg");
    expect(picSrc("u:12:0123456789ab")).toBe(
      "/derpy/api/pictures/12/0123456789ab.jpg",
    );
    expect(picSrc("m:2")).toBeNull();
    expect(picSrc("p:nope")).toBeNull();
    expect(monogramColor("m:2", "Alden")).toBe(MONOGRAM_COLORS[2]);
    // Unknown: the colour the name picks, as before pictures.
    expect(monogramColor("p:nope", "Alden")).toBe(monogramColor(null, "Alden"));
  });

  test("every preset has its picture, drawn as plain SVG with no script or links", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(30);
    expect(PRESETS.length).toBeLessThanOrEqual(40);
    const dir = path.join(
      HERE,
      "..",
      "..",
      "resources",
      "public",
      "derpland",
      "pics",
    );
    for (const p of PRESETS) {
      const svg = fs.readFileSync(path.join(dir, `${p.id}.svg`), "utf8");
      expect(svg.startsWith("<svg"), p.id).toBe(true);
      expect(svg, p.id).not.toMatch(
        /<script|on\w+=|href|<image|<foreignObject/i,
      );
    }
  });

  test("presets a badge unlocks need it", () => {
    const laurel = PRESETS.find((p) => p.id === "laurel")!;
    const gold = PRESETS.find((p) => p.id === "goldbanana")!;
    expect(presetUnlocked(laurel, new Set())).toBe(false);
    expect(presetUnlocked(laurel, new Set(["df-wins-10"]))).toBe(true);
    expect(presetUnlocked(gold, new Set(["df-wins-10"]))).toBe(false);
    expect(presetUnlocked(gold, new Set(["ch-weeks-10"]))).toBe(true);
  });
});

describe.skipIf(!TEST_DB)("pictures, against Postgres", () => {
  let kit: Kit;
  let alden: TestUser;
  let pat: TestUser;
  let gary: TestUser;
  let L: typeof import("../../src/server/derpy/DerpyLooks");
  let PIC: typeof import("../../src/server/derpy/DerpyPictures");

  beforeAll(async () => {
    kit = await startKit();
    L = await import("../../src/server/derpy/DerpyLooks");
    PIC = await import("../../src/server/derpy/DerpyPictures");
    alden = await kit.user("Pic_Alden");
    pat = await kit.user("Pic_Pat");
    gary = await kit.user("Pic_Gary");
    // The owner: found by account id, as Mr. Based's access is.
    await kit.pool.query(
      "UPDATE derpy_accounts SET based_access = true, based_granted_as = 'alden' WHERE id = $1",
      [alden.id],
    );
  }, 60_000);

  beforeEach(async () => {
    await kit.pool.query("DELETE FROM derpy_picture_log");
    PIC.REPORTS.clear();
  });

  afterAll(async () => {
    await kit?.close();
  });

  const upload = (u: TestUser, raw: Uint8Array, contentType?: string) =>
    kit.call("/pictures/upload", { token: u.token, raw, contentType });

  test("an upload is drawn again, worn, and served for a year as an image only", async () => {
    const r = await upload(pat, jpegWithGps(scene(500, 400)), "image/jpeg");
    expect(r.status).toBe(200);
    const pic = parsePic(r.json.picture);
    expect(pic).toMatchObject({ kind: "upload", account: pat.id });
    const me = await kit.call("/me", { token: pat.token });
    expect(me.json.picture).toBe(r.json.picture);

    const img = await kit.call(
      picSrc(r.json.picture)!.replace("/derpy/api", ""),
    );
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("content-security-policy")).toContain("sandbox");
    expect(img.headers.get("pragma")).toBeNull();
    // What's served is the re-encode: no EXIF, no GPS, no camera, no comment.
    expect(img.bytes.length).toBeLessThanOrEqual(100 * 1024);
    expect(has(img.bytes, "Exif")).toBe(false);
    expect(has(img.bytes, GPS_LATITUDE)).toBe(false);
    expect(has(img.bytes, CAMERA_MAKE)).toBe(false);
    expect(has(img.bytes, "<script>")).toBe(false);
    expect(decodeJpeg(img.bytes, 1024).width).toBe(256);
    // And what's kept in Postgres is the same small JPEG.
    const row = (
      await kit.pool.query(
        "SELECT data FROM derpy_pictures WHERE account_id = $1",
        [pat.id],
      )
    ).rows[0];
    expect(Buffer.compare(row.data, img.bytes)).toBe(0);
  });

  test("SVG, a disguised file, and too much are refused, whatever they claim to be", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect((await upload(gary, svg, "image/png")).json.error).toBe("bad_type");
    const disguised = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("<script>alert(1)</script>"),
    ]);
    const d = await upload(gary, disguised, "image/png");
    expect(d.status).toBe(422);
    expect(d.json.error).toBe("bad_image");
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 7);
    const b = await upload(gary, big);
    expect(b.status).toBe(413);
    expect(b.json.error).toBe("too_large");
    // Signed out: nothing.
    expect(
      (await kit.call("/pictures/upload", { raw: makePng(scene(64, 64)) }))
        .status,
    ).toBe(401);
    // Nothing was kept or worn.
    const me = await kit.call("/me", { token: gary.token });
    expect(me.json.picture).toBeNull();
  });

  test("five uploads a day: the sixth waits", async () => {
    // Four earlier today, and one from two days ago that no longer counts.
    await kit.pool.query(
      `INSERT INTO derpy_picture_log (account_id, kind, version, created_at)
       SELECT $1, 'upload', 'aaaaaaaaaaaa', now() - interval '1 hour'
       FROM generate_series(1, 4)`,
      [gary.id],
    );
    await kit.pool.query(
      `INSERT INTO derpy_picture_log (account_id, kind, created_at)
       VALUES ($1, 'upload', now() - interval '2 days')`,
      [gary.id],
    );
    expect(
      (await kit.call("/pictures/mine", { token: gary.token })).json.left,
    ).toBe(1);
    const fifth = await upload(gary, makePng(scene(64, 64)));
    expect(fifth.status).toBe(200);
    const sixth = await upload(gary, makePng(scene(64, 64)));
    expect(sixth.status).toBe(429);
    expect(sixth.json.error).toBe("rate_limited");
    // Choosing a preset is still fine.
    const chose = await kit.call("/pictures/choose", {
      token: gary.token,
      body: { picture: "p:fox" },
    });
    expect(chose.json.picture).toBe("p:fox");
  });

  test("presets: unlocked ones by their badge, and nobody else's upload", async () => {
    const choose = (picture: string | null) =>
      kit.call("/pictures/choose", { token: gary.token, body: { picture } });
    expect((await choose("p:musket")).json.picture).toBe("p:musket");
    expect((await choose("m:4")).json.picture).toBe("m:4");
    const locked = await choose("p:laurel");
    expect(locked.status).toBe(403);
    expect(locked.json.error).toBe("locked");
    await kit.pool.query(
      "INSERT INTO derpy_badges (account_id, key) VALUES ($1, 'df-wins-10')",
      [gary.id],
    );
    expect((await choose("p:laurel")).json.picture).toBe("p:laurel");
    const theirs = (await kit.call("/me", { token: pat.token })).json.picture;
    expect((await choose(theirs)).status).toBe(400);
    expect((await choose("javascript:alert(1)")).status).toBe(400);
    expect((await choose(null)).json.picture).toBeNull();
  });

  test("fallbacks: an unknown version, a broken picture string, a removed upload", async () => {
    expect(
      (await kit.call(`/pictures/${pat.id}/000000000000.jpg`)).status,
    ).toBe(404);
    expect((await kit.call(`/pictures/${pat.id}/x.svg`)).status).toBe(404);
    expect((await kit.call(`/pictures/nope/000000000000.jpg`)).status).toBe(
      404,
    );
    // A picture string that isn't one shows the monogram (null), everywhere.
    await kit.pool.query(
      "UPDATE derpy_accounts SET picture = 'p:../../x' WHERE id = $1",
      [gary.id],
    );
    L.forgetLook(gary.id);
    const prof = await kit.call(`/players/${gary.name}`);
    expect(prof.json.picture).toBeNull();
    const board = await kit.call("/leaderboard?game=overall");
    expect(
      board.json.players.find(
        (p: { username: string }) => p.username === gary.name,
      ).pic,
    ).toBeUndefined();
  });

  test("reports, and the owner's moderation: remove, block, dismiss; nobody else", async () => {
    const up = await upload(gary, makePng(scene(120, 120)));
    expect(up.status).toBe(200);
    const g = parsePic(up.json.picture) as { version: string };
    const report = (u: TestUser, account: number, version: string) =>
      kit.call("/pictures/report", {
        token: u.token,
        body: { account, version },
      });
    expect((await report(gary, gary.id, g.version)).json.error).toBe(
      "yourself",
    );
    expect((await report(pat, gary.id, "000000000000")).status).toBe(404);
    expect((await report(pat, gary.id, g.version)).status).toBe(200);
    expect((await report(pat, gary.id, g.version)).status).toBe(200); // once is kept

    // Nobody but the owner finds the moderation routes: not even someone
    // given Mr. Based by hand (the owner is the one marked under his name).
    await kit.pool.query(
      "UPDATE derpy_accounts SET based_access = true WHERE id = $1",
      [pat.id],
    );
    for (const u of [pat, gary]) {
      expect(
        (await kit.call("/pictures/moderation", { token: u.token })).status,
      ).toBe(404);
      const r = await kit.call("/pictures/moderation/remove", {
        token: u.token,
        body: { account: gary.id, block: true },
      });
      expect(r.status).toBe(404);
    }
    expect((await kit.call("/pictures/moderation")).status).toBe(401);
    // /me says so only to the owner.
    expect(
      (await kit.call("/me", { token: pat.token })).json.moderator,
    ).toBeUndefined();
    expect((await kit.call("/me", { token: alden.token })).json.moderator).toBe(
      true,
    );

    const view = await kit.call("/pictures/moderation", { token: alden.token });
    expect(view.status).toBe(200);
    const reported = view.json.reported.find(
      (r: { accountId: number }) => r.accountId === gary.id,
    );
    expect(reported).toMatchObject({
      username: gary.name,
      version: g.version,
      reports: 1,
      reporters: [pat.name],
      worn: true,
    });
    expect(
      view.json.recent.some(
        (r: { accountId: number }) => r.accountId === gary.id,
      ),
    ).toBe(true);

    // Dismissed: its reports go, the picture stays.
    const dis = await kit.call("/pictures/moderation/dismiss", {
      token: alden.token,
      body: { account: gary.id, version: g.version },
    });
    expect(
      dis.json.reported.some(
        (r: { accountId: number }) => r.accountId === gary.id,
      ),
    ).toBe(false);

    // The others see it in their lists before it's removed.
    await kit.pool.query(
      "INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING",
      [pat.id, gary.id],
    );
    const { forgetAllSocial } =
      await import("../../src/server/derpy/DerpySocial");
    forgetAllSocial();
    const before = await kit.call("/social/state", { token: pat.token });
    expect(before.json.looks[gary.id].pic).toBe(up.json.picture);

    // Removed and blocked: gone at once, everywhere.
    await report(pat, gary.id, g.version);
    const rem = await kit.call("/pictures/moderation/remove", {
      token: alden.token,
      body: { account: gary.id, block: true },
    });
    expect(rem.status).toBe(200);
    expect(
      rem.json.blocked.some(
        (b: { accountId: number }) => b.accountId === gary.id,
      ),
    ).toBe(true);
    expect(
      rem.json.reported.some(
        (r: { accountId: number }) => r.accountId === gary.id,
      ),
    ).toBe(false);
    expect(
      (await kit.call(picSrc(up.json.picture)!.replace("/derpy/api", "")))
        .status,
    ).toBe(404);
    expect(
      (await kit.call("/me", { token: gary.token })).json.picture,
    ).toBeNull();
    expect((await kit.call(`/players/${gary.name}`)).json.picture).toBeNull();
    const after = await kit.call("/social/state", { token: pat.token });
    expect(after.json.looks[gary.id]?.pic ?? null).toBeNull();
    // It can't upload again; presets are still fine.
    const again = await upload(gary, makePng(scene(64, 64)));
    expect(again.status).toBe(403);
    expect(again.json.error).toBe("uploads_blocked");
    expect(
      (await kit.call("/pictures/mine", { token: gary.token })).json.blocked,
    ).toBe(true);

    // Unblocked: it may again.
    const un = await kit.call("/pictures/moderation/block", {
      token: alden.token,
      body: { account: gary.id, blocked: false },
    });
    expect(
      un.json.blocked.some(
        (b: { accountId: number }) => b.accountId === gary.id,
      ),
    ).toBe(false);
    expect((await upload(gary, makePng(scene(64, 64)))).status).toBe(200);
  });

  test("each moderation action writes one audit line, in ADMIN's shape, inside its own transaction", async () => {
    const u = await kit.user("Pic_Audit");
    expect((await upload(u, makePng(scene(80, 80)))).status).toBe(200);
    const lines: {
      e: import("../../src/server/derpy/DerpyPictures").PictureAudit;
      inTx: boolean;
    }[] = [];
    const audit = async (
      e: import("../../src/server/derpy/DerpyPictures").PictureAudit,
      q?: unknown,
    ) => {
      lines.push({ e, inTx: q !== undefined && q !== kit.pool });
    };
    const version = (
      await kit.pool.query(
        "SELECT version FROM derpy_pictures WHERE account_id = $1",
        [u.id],
      )
    ).rows[0].version;
    await kit.pool.query(
      "INSERT INTO derpy_picture_reports (account_id, version, reporter_id) VALUES ($1, $2, $3)",
      [u.id, version, pat.id],
    );
    await PIC.dismissReports(u.id, version, { reason: "fine", audit });
    await PIC.dismissReports(u.id, version, { audit }); // nothing left: no line
    await PIC.blockUploads(u.id, { blocked: true, audit });
    await PIC.blockUploads(u.id, { blocked: true, audit }); // no change: no line
    await PIC.removePicture(u.id, { block: false, reason: "rude", audit });
    expect(lines.map((l) => l.e.action)).toEqual([
      "reports.dismiss",
      "pictures.block",
      "pictures.remove",
    ]);
    expect(lines.every((l) => l.inTx)).toBe(true);
    expect(lines[2].e).toMatchObject({
      target: { type: "account", id: u.id, name: "Pic_Audit" },
      reason: "rude",
      before: { upload: version, uploadsBlocked: true },
      after: { picture: null, upload: null, uploadsBlocked: true },
    });
    // An audit that fails takes the change back with it.
    await kit.call("/pictures/moderation/block", {
      token: alden.token,
      body: { account: u.id, blocked: false },
    });
    expect((await upload(u, makePng(scene(80, 80)))).status).toBe(200);
    const failing = async () => {
      throw new Error("audit down");
    };
    await expect(
      PIC.removePicture(u.id, { block: true, audit: failing }),
    ).rejects.toThrow("audit down");
    const still = await kit.pool.query(
      "SELECT a.picture_blocked, p.version FROM derpy_accounts a JOIN derpy_pictures p ON p.account_id = a.id WHERE a.id = $1",
      [u.id],
    );
    expect(still.rows[0].picture_blocked).toBe(false);
    // The admin page's panel and Overview read the same.
    const panel = await PIC.accountPicture(u.id);
    expect(panel).toMatchObject({
      uploadsBlocked: false,
      upload: { worn: true, reports: 0 },
    });
    const overview = await PIC.picturesOverview();
    expect(overview.map((l) => l.label)).toEqual([
      "Reported pictures",
      "Pictures uploaded this week",
    ]);
  });

  test("a rename keeps the picture: it goes by account", async () => {
    const u = await kit.user("Pic_Mike");
    await kit.call("/pictures/choose", {
      token: u.token,
      body: { picture: "p:owl" },
    });
    const r = await kit.call("/username", {
      token: u.token,
      body: { username: "Pic_Michael" },
    });
    expect(r.status).toBe(200);
    expect((await kit.call("/players/Pic_Michael")).json.picture).toBe("p:owl");
    // The name given up still finds them (held for 7 days), picture and all.
    expect((await kit.call("/players/Pic_Mike")).json.picture).toBe("p:owl");
  });
});
