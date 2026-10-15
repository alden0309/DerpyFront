// CQ24 (r24): the winter on the chart, for everyone. What was Hard Winter (a
// map style of the Derp Store, sold in round 21) is now how the base game's
// winter looks, from the first frosts late in November to the thaw in
// early February, and only where it really snowed (engine/Snow.ts decides
// where and when, from the map's own facts). Everywhere else the chart is
// exactly as it was.
//
// How it's drawn, over whatever map style the player chose:
// - a mask of the winter, province by province (each as deep as its winter
//   is, at this stage of it), in map units (MASK_K pixels each), softened at
//   its edges: faded to nothing at the border with country that has no
//   winter, so the snow ends gently and never crosses it, and kept full at
//   the coast (the blur is reckoned over the land only). The mask is the
//   snow's own colour. It's made once for each stage of the winter (a few
//   times a year), not for each redraw;
// - when the chart is redrawn, inside the winter country only: the mask laid
//   over it (the land greyed and whitened toward the snow, as deep as the
//   winter is there), then the snow's flecks and Hard Winter's falling snow,
//   kept to the snow by the same mask, on a canvas only as big as the
//   winter's part of the view. Three draws, no reading back, nothing every
//   frame.
// The ice on the shores and the frozen rivers are the engine's own (where
// harbours are ice-bound and rivers can be crossed on foot), in Hard
// Winter's ice colour.

import { WINTER_PALETTE } from "../DlcIds";
import type { MapDef } from "../engine/Types";
import { scatter } from "./MapStyles";

type C = CanvasRenderingContext2D;

/** Hard Winter's colours for the season: the snow, the ice and the frozen rivers. */
export const WINTER_INK = {
  /** The snow the land is whitened toward. */
  snow: WINTER_PALETTE.land,
  /** The snow's shadows in its flecks. */
  shade: WINTER_PALETTE.accent,
  /** Ice along the frozen shores, and a frozen river. */
  ice: "rgba(234,243,249,0.82)",
  river: "rgba(232,242,248,0.95)",
  /** How far the land under the full winter goes toward the snow. */
  cover: 0.6,
  /** The flecks and the falling snow. */
  flecks: 0.85,
} as const;

/** Mask pixels to a map unit. */
export const MASK_K = 0.4;
/** The soft edge: three box blurs of this radius (mask pixels). */
const BLUR = 2;
/** The band eaten off the winter at its border with country that has none (map units): the blur's reach. */
const ERODE = (BLUR * 3 + 1) / MASK_K;

export interface ChartFrame {
  /** The cached chart's canvas, its size in device pixels. */
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** Map units to device pixels: scale, and the offset. */
  scale: number;
  ox: number;
  oy: number;
}

export class WinterLook {
  private mask: HTMLCanvasElement | null = null;
  private maskKey = "";
  private work: HTMLCanvasElement | null = null;
  private fleckTile: HTMLCanvasElement | null = null;
  /** Each province's snow, as the mask was made. */
  private depth: Float32Array;

  constructor(
    private readonly map: MapDef,
    private readonly paths: Path2D[],
    /** Each province's box in map units: [x0, y0, x1, y1]. */
    private readonly boxes: number[][],
  ) {
    this.depth = new Float32Array(map.provinces.length);
  }

  /** Whether any of the board has snow on it now (as last set). */
  get any(): boolean {
    return this.depth.some((d) => d > 0);
  }

  /** The snow on a province, as the mask has it. */
  snow(p: number): number {
    return this.depth[p] ?? 0;
  }

  /**
   * Set the winter for a day: `snow` is each province's snow (0 to 1), `key`
   * changes only when it does. The mask is made again only for a new key.
   */
  set(key: string, snow: (p: number) => number): void {
    if (key === this.maskKey) return;
    this.maskKey = key;
    for (let p = 0; p < this.depth.length; p++) this.depth[p] = snow(p);
    this.mask = this.any ? this.makeMask() : null;
  }

  /** The winter's mask, in map units (MASK_K pixels each), with soft edges, in the snow's colour. */
  private makeMask(): HTMLCanvasElement | null {
    const W = Math.ceil(this.map.width * MASK_K);
    const H = Math.ceil(this.map.height * MASK_K);
    const canvas = (w: number, h: number) => {
      const x = document.createElement("canvas");
      x.width = w;
      x.height = h;
      return x;
    };
    const snowC = canvas(W, H);
    const landC = canvas(W, H);
    const sc = snowC.getContext("2d", { willReadFrequently: true });
    const lc = landC.getContext("2d", { willReadFrequently: true });
    if (!sc || !lc) return null;
    sc.setTransform(MASK_K, 0, 0, MASK_K, 0, 0);
    lc.setTransform(MASK_K, 0, 0, MASK_K, 0, 0);
    lc.fillStyle = "#fff";
    for (let p = 0; p < this.paths.length; p++) {
      lc.fill(this.paths[p], "evenodd");
      const d = this.depth[p];
      if (d <= 0) continue;
      sc.fillStyle = `rgba(255,255,255,${d})`;
      sc.fill(this.paths[p], "evenodd");
    }
    // Eat a band off the winter where it meets country with none, so the
    // softened edge fades to nothing at the border, never across it.
    sc.globalCompositeOperation = "destination-out";
    sc.lineWidth = ERODE * 2;
    sc.lineJoin = "round";
    sc.strokeStyle = "#000";
    for (let p = 0; p < this.paths.length; p++)
      if (this.depth[p] <= 0) sc.stroke(this.paths[p]);
    const snow = sc.getImageData(0, 0, W, H);
    const land = lc.getImageData(0, 0, W, H);
    const a = new Float32Array(W * H);
    const l = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      a[i] = snow.data[i * 4 + 3] / 255;
      l[i] = land.data[i * 4 + 3] / 255;
    }
    for (let n = 0; n < 3; n++) {
      boxBlur(a, W, H, BLUR);
      boxBlur(l, W, H, BLUR);
    }
    // Reckoned over the land only, so the coast keeps its snow; in the
    // snow's own colour.
    const [r, g, b] = rgb(WINTER_INK.snow);
    const out = snow;
    for (let i = 0; i < W * H; i++) {
      const v = l[i] > 0.02 ? Math.min(1, a[i] / l[i]) : 0;
      out.data[i * 4] = r;
      out.data[i * 4 + 1] = g;
      out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = Math.round(v * 255);
    }
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "copy";
    sc.putImageData(out, 0, 0);
    // Kept on a canvas of its own that's never read back, so drawing it is cheap.
    const final = canvas(W, H);
    final.getContext("2d")?.drawImage(snowC, 0, 0);
    return final;
  }

  /** The snow's flecks: a tile of white specks with their shadows, one tile pixel to a device pixel. */
  private flecks(c: C): CanvasPattern | null {
    if (!this.fleckTile) {
      const t = document.createElement("canvas");
      t.width = 28;
      t.height = 28;
      const x = t.getContext("2d");
      if (x) {
        for (let i = 0; i < 9; i++) {
          // A fixed scatter (golden-angle steps), the same on every screen.
          const fx = ((i * 0.618034 + 0.13) % 1) * 28;
          const fy = ((i * 0.381966 + 0.29 + (i % 3) * 0.21) % 1) * 28;
          const rad = 0.75 + ((i * 7) % 5) * 0.2;
          x.globalAlpha = 0.45;
          x.fillStyle = WINTER_INK.shade;
          x.beginPath();
          x.arc(fx + 0.6, fy + 0.7, rad, 0, Math.PI * 2);
          x.fill();
          x.globalAlpha = 1;
          x.fillStyle = "#ffffff";
          x.beginPath();
          x.arc(fx, fy, rad, 0, Math.PI * 2);
          x.fill();
        }
      }
      this.fleckTile = t;
    }
    return c.createPattern(this.fleckTile, "repeat");
  }

  /**
   * Lay the winter over the chart as it's drawn so far (the land, its
   * colours and the season's washes), inside the provinces `where` allows.
   * `viewScale` is the view's (map units to css px), for the snow's size.
   */
  paint(f: ChartFrame, where: (p: number) => boolean, viewScale: number): void {
    const mask = this.mask;
    if (!mask) return;
    // The winter country in view, and the box around it (device px).
    const clip = new Path2D();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let p = 0; p < this.paths.length; p++) {
      if (this.depth[p] <= 0 || !where(p)) continue;
      const b = this.boxes[p];
      const bx0 = b[0] * f.scale + f.ox;
      const by0 = b[1] * f.scale + f.oy;
      const bx1 = b[2] * f.scale + f.ox;
      const by1 = b[3] * f.scale + f.oy;
      if (bx1 < 0 || by1 < 0 || bx0 > f.w || by0 > f.h) continue;
      clip.addPath(this.paths[p]);
      x0 = Math.min(x0, bx0);
      y0 = Math.min(y0, by0);
      x1 = Math.max(x1, bx1);
      y1 = Math.max(y1, by1);
    }
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(f.w, Math.ceil(x1));
    y1 = Math.min(f.h, Math.ceil(y1));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    const c = f.canvas.getContext("2d");
    if (!c) return;
    const mapToMask = (ctx: C, dx: number, dy: number) =>
      ctx.setTransform(
        f.scale / MASK_K,
        0,
        0,
        f.scale / MASK_K,
        f.ox - dx,
        f.oy - dy,
      );
    c.save();
    c.setTransform(f.scale, 0, 0, f.scale, f.ox, f.oy);
    c.clip(clip, "evenodd");
    // The land whitened toward the snow, as deep as the winter is.
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = WINTER_INK.cover;
    mapToMask(c, 0, 0);
    c.drawImage(mask, 0, 0);
    // The flecks and the falling snow, kept to the snow by the mask, on a
    // canvas the size of the winter's part of the view.
    const work = (this.work ??= document.createElement("canvas"));
    if (work.width < bw || work.height < bh) {
      work.width = Math.max(work.width, bw);
      work.height = Math.max(work.height, bh);
    }
    const w = work.getContext("2d");
    if (w) {
      w.setTransform(1, 0, 0, 1, 0, 0);
      w.globalCompositeOperation = "source-over";
      w.globalAlpha = 1;
      w.clearRect(0, 0, bw, bh);
      w.setTransform(f.scale, 0, 0, f.scale, f.ox - x0, f.oy - y0);
      const pat = this.flecks(w);
      if (pat) {
        // Fixed to the map, the same size on the screen.
        pat.setTransform(new DOMMatrix().scaleSelf(1 / f.scale, 1 / f.scale));
        w.fillStyle = pat;
        w.fillRect(
          (x0 - f.ox) / f.scale,
          (y0 - f.oy) / f.scale,
          bw / f.scale,
          bh / f.scale,
        );
      }
      const pts = scatter("snow", 2600, this.map.width, this.map.height);
      const r0 = 1 / Math.max(0.01, viewScale);
      const mx0 = (x0 - f.ox) / f.scale;
      const my0 = (y0 - f.oy) / f.scale;
      const mx1 = (x1 - f.ox) / f.scale;
      const my1 = (y1 - f.oy) / f.scale;
      w.fillStyle = "#ffffff";
      w.beginPath();
      for (let i = 0; i < pts.length; i += 3) {
        const px = pts[i];
        const py = pts[i + 1];
        if (px < mx0 || py < my0 || px > mx1 || py > my1) continue;
        const rad = (0.6 + pts[i + 2] * 1.2) * r0;
        w.moveTo(px + rad, py);
        w.arc(px, py, rad, 0, Math.PI * 2);
      }
      w.fill();
      w.globalCompositeOperation = "destination-in";
      w.imageSmoothingEnabled = true;
      mapToMask(w, x0, y0);
      w.drawImage(mask, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = WINTER_INK.flecks;
      c.drawImage(work, 0, 0, bw, bh, x0, y0, bw, bh);
    }
    c.restore();
  }
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One box blur of radius r over a w×h field, in place (rows, then columns). */
function boxBlur(a: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++)
      sum += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[x] = sum / span;
      sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
    for (let x = 0; x < w; x++) a[row + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++)
      sum += a[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = sum / span;
      sum +=
        a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
    }
    for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
  }
}
