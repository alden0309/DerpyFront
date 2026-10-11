// The players' medallions on the map wear the likeness they chose: the
// painting's hair and clothes tuned through its masks, and turned the way
// they turned it, just as the register and the banner show it. The map is a
// canvas, so the tuned picture is painted once into a small image (the same
// light-keeping recolour the portraits' SVG filters do), kept, and handed to
// the map as an address. Until it's ready, or if the picture can't be read,
// the painting as painted stands in.

import { lookOf, sitterAt, type Sitter } from "../../engine/Appearance";
import type { Character } from "../../engine/Types";
import { maskUrl, thumbUrl } from "../Gallery";
import { recolourSpec, tuningOf, type Tuning } from "../Portrait";

const made = new Map<string, string>();
const pending = new Set<string>();
const failed = new Set<string>();
let ready: (() => void) | null = null;

/** What to call when a tuned medallion is ready (to redraw the map). */
export function onMedallionReady(fn: (() => void) | null): void {
  ready = fn;
}

/** What a tuning changes, as a key. */
function keyOf(s: Sitter, t: Tuning): string {
  return `${s.id}|${t.hair ?? ""}|${t.hairK}|${t.cloth ?? ""}|${t.clothK}|${t.flip ? 1 : 0}`;
}

/**
 * The likeness for a player's medallion: an address an <img> (or the map's
 * canvas) can show. The tuned picture once it's been painted; meanwhile the
 * painting as painted.
 */
export function medallionFace(c: Character, age: number): string | null {
  const a = Math.max(0, age);
  const look = c.look ?? lookOf(c, a);
  const s = sitterAt(look, a, c);
  const t = tuningOf(c.look ?? null, s, a);
  const plain = thumbUrl(s.id);
  if (!t.hair && !t.cloth && !t.flip) return plain;
  const key = keyOf(s, t);
  const got = made.get(key);
  if (got) return got;
  if (
    !pending.has(key) &&
    !failed.has(key) &&
    typeof document !== "undefined"
  ) {
    pending.add(key);
    void paint(s, t)
      .then((url) => {
        if (made.size > 24) made.clear();
        made.set(key, url);
        ready?.();
      })
      .catch(() => failed.add(key))
      .finally(() => pending.delete(key));
  }
  return plain;
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`no picture at ${url}`));
    img.src = url;
  });
}

/** Look a lightness up in a filter's table (as feComponentTransfer does). */
function lookup(table: number[], v: number): number {
  const n = table.length - 1;
  const x = Math.max(0, Math.min(1, v)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return table[i] + (x - i) * (table[i + 1] - table[i]);
}

/** Paint the tuned picture small, and give it back as an address. */
async function paint(s: Sitter, t: Tuning): Promise<string> {
  const src = thumbUrl(s.id);
  if (!src) throw new Error("no picture");
  const pic = await load(src);
  const w = pic.naturalWidth || 144;
  const h = pic.naturalHeight || 180;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(pic, 0, 0, w, h);
  const mUrl = maskUrl(s.id);
  if ((t.hair || t.cloth) && mUrl) {
    const mask = await load(mUrl);
    const out = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(mask, 0, 0, w, h);
    const m = ctx.getImageData(0, 0, w, h).data;
    const d = out.data;
    const layers: { ch: 0 | 1; k: number; gain: number; tab: number[][] }[] =
      [];
    if (t.hair) {
      const spec = recolourSpec(t.hair, s.hl, "hair");
      layers.push({
        ch: 0,
        k: t.hairK,
        gain: spec.gain,
        tab: spec.tables.map((x) => x.split(" ").map(Number)),
      });
    }
    if (t.cloth) {
      const spec = recolourSpec(t.cloth, s.cl, "cloth");
      layers.push({
        ch: 1,
        k: t.clothK,
        gain: spec.gain,
        tab: spec.tables.map((x) => x.split(" ").map(Number)),
      });
    }
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i] / 255;
      const g0 = d[i + 1] / 255;
      const b0 = d[i + 2] / 255;
      const lum = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      let r = r0;
      let g = g0;
      let b = b0;
      for (const L of layers) {
        const a =
          L.k * Math.max(0, Math.min(1, (m[i + L.ch] / 255) * 1.12 - 0.06));
        if (a <= 0) continue;
        const v = Math.min(1, lum * L.gain);
        r = r * (1 - a) + lookup(L.tab[0], v) * a;
        g = g * (1 - a) + lookup(L.tab[1], v) * a;
        b = b * (1 - a) + lookup(L.tab[2], v) * a;
      }
      d[i] = Math.round(r * 255);
      d[i + 1] = Math.round(g * 255);
      d[i + 2] = Math.round(b * 255);
    }
    ctx.putImageData(out, 0, 0);
  }
  if (t.flip) {
    const turned = document.createElement("canvas");
    turned.width = w;
    turned.height = h;
    const tc = turned.getContext("2d");
    if (!tc) throw new Error("no canvas");
    tc.translate(w, 0);
    tc.scale(-1, 1);
    tc.drawImage(canvas, 0, 0);
    return turned.toDataURL("image/png");
  }
  return canvas.toDataURL("image/png");
}
