import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { inflateSync } from "zlib";
import {
  allDerpySkins,
  DERPY_PACKS,
  derpyCosmeticsCatalog,
  findPack,
} from "../../src/server/derpy/DerpyCatalog";

const SKINS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../resources/public",
);

interface Png {
  width: number;
  height: number;
  /** RGBA, row-major. */
  rgba: Uint8Array;
}

/** Enough of a PNG decoder for 8-bit RGB, RGBA or palette, non-interlaced. */
function decodePng(file: string): Png {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let palette: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString("latin1");
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); // bit depth
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : data[9] === 3 ? 1 : 0;
      expect(channels).toBeGreaterThan(0);
      expect(data[12]).toBe(0); // not interlaced
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c =
        x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) {
      rgba[i * 4 + k] =
        channels === 1 ? palette![px[i] * 3 + k] : px[i * channels + k];
    }
    rgba[i * 4 + 3] = channels === 4 ? px[i * channels + 3] : 255;
  }
  return { width, height, rgba };
}

/** Mean colour difference between two columns (or rows) of pixels. */
function lineDiff(png: Png, a: number, b: number, vertical: boolean): number {
  let sum = 0;
  const n = vertical ? png.height : png.width;
  for (let i = 0; i < n; i++) {
    const pa = vertical ? i * png.width + a : a * png.width + i;
    const pb = vertical ? i * png.width + b : b * png.width + i;
    for (let k = 0; k < 3; k++) {
      sum += Math.abs(png.rgba[pa * 4 + k] - png.rgba[pb * 4 + k]);
    }
  }
  return sum / (n * 3);
}

describe("the Derp Store catalog", () => {
  const armada = findPack("armada")!;

  test("the Astral Armada is a five-skin pack, dearer than every other", () => {
    expect(armada).toBeDefined();
    expect(armada.displayName).toBe("Astral Armada");
    expect(armada.price).toBe(5000);
    expect(armada.skins).toHaveLength(5);
    for (const other of DERPY_PACKS) {
      if (other !== armada) expect(other.price).toBeLessThan(armada.price);
    }
  });

  test("prices stay where they were", () => {
    expect(
      Object.fromEntries(DERPY_PACKS.map((p) => [p.name, p.price])),
    ).toEqual({
      classics: 1500,
      derpland: 2000,
      florida: 2500,
      ocean: 2500,
      arcade: 3000,
      politics: 3000,
      space: 3500,
      armada: 5000,
    });
  });

  test("every pack has five skins with unique, well-formed names", () => {
    const names = allDerpySkins().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const pack of DERPY_PACKS) expect(pack.skins).toHaveLength(5);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]+$/);
    expect(Object.keys(derpyCosmeticsCatalog().skins ?? {})).toEqual(names);
  });

  test("nothing in the pack borrows a film franchise's names", () => {
    const text = [
      armada.displayName,
      armada.description,
      ...armada.skins.map((s) => s.displayName),
    ]
      .join(" ")
      .toLowerCase();
    for (const word of [
      "star wars",
      "jedi",
      "sith",
      "lightsaber",
      "saber",
      "x-wing",
      "tie fighter",
      "death star",
      "destroyer",
      "droid",
      "trooper",
      "vader",
      "wookiee",
      "rebel",
      "galactic empire",
      "starfleet",
    ]) {
      expect(text).not.toContain(word);
    }
  });

  test.each(DERPY_PACKS.find((p) => p.name === "armada")!.skins)(
    "$name is a 1024×1024 opaque PNG that tiles seamlessly",
    (skin) => {
      const png = decodePng(path.join(SKINS, skin.url));
      expect([png.width, png.height]).toEqual([1024, 1024]);
      for (let i = 3; i < png.rgba.length; i += 4 * 997) {
        expect(png.rgba[i]).toBe(255);
      }
      // Across the wrap (last column to first, last row to first) the image
      // must change no more than it does between neighbours inside it.
      for (const vertical of [true, false]) {
        const seam = lineDiff(png, 1023, 0, vertical);
        let inside = 0;
        for (const at of [255, 511, 767]) {
          inside += lineDiff(png, at, at + 1, vertical);
        }
        inside /= 3;
        expect(seam).toBeLessThan(inside * 1.6 + 3);
      }
    },
  );
});
