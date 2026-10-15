// CQ24 (r24): the winter on the chart, for everyone. What was Hard Winter (a
// map style of the Derp Store, sold in round 21) is now how the base game's
// winter looks, from the first frosts late in November to the thaw in
// early February, and only where it really snowed (engine/Snow.ts decides
// where and when, from the map's own facts). Everywhere else the chart is
// exactly as it was.
//
// How it's drawn, over whatever map style the player chose:
// - a mask of the winter, province by province (each as deep as its winter
//   is, at this stage of it), in map units at half a pixel each, softened at
//   its edges: faded to nothing at the border with country that has no
//   winter, so the snow ends gently and never crosses it, and kept full at
//   the coast (the blur is reckoned over the land only). It's made once for
//   each stage of the winter (a few times a year), not for each redraw;
// - when the chart is redrawn, the winter country's part of it is copied,
//   given Hard Winter's treatment (its colours greyed and whitened toward
//   the snow, the snow's flecks, falling snow), and laid back through the
//   mask, inside the winter country only. A few full-chart blends, as the
//   map styles cost, and nothing every frame.
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
  /** Ice along the frozen shores, and a frozen river. */
  ice: "rgba(234,243,249,0.82)",
  river: "rgba(232,242,248,0.95)",
  /** How far the colours under the snow are greyed, and whitened. */
  grey: 0.4,
  whiten: 0.5,
  /** The snow's own white laid over, and its flecks. */
  cover: 0.18,
  flecks: 0.8,
} as const;

/** Mask pixels to a map unit. */
const K = 0.5;
/** The soft edge: three box blurs of this radius (mask pixels). */
const BLUR = 2;
/** The band eaten off the winter at its border with country that has none (map units): the blur's reach. */
const ERODE = (BLUR * 3 + 1) / K;

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
  /** Each province's snow, as the mask was made. */
  private depth: Float32Array;

  constructor(
    private readonly map: MapDef,
    private readonly paths: Path2D[],
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
    if (key === this.maskKey && this.mask) return;
    this.maskKey = key;
    for (let p = 0; p < this.depth.length; p++) this.depth[p] = snow(p);
    this.mask = this.any ? this.makeMask() : null;
  }

  /** The winter's mask, in map units (K pixels each), with soft edges. */
  private makeMask(): HTMLCanvasElement | null {
    const W = Math.ceil(this.mapWidth() * K);
    const H = Math.ceil(this.mapHeight() * K);
    const snowC = document.createElement("canvas");
    snowC.width = W;
    snowC.height = H;
    const landC = document.createElement("canvas");
    landC.width = W;
    landC.height = H;
    const sc = snowC.getContext("2d");
    const lc = landC.getContext("2d");
    if (!sc || !lc) return null;
    sc.setTransform(K, 0, 0, K, 0, 0);
    lc.setTransform(K, 0, 0, K, 0, 0);
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
    // Reckoned over the land only, so the coast keeps its snow.
    const out = snow;
    for (let i = 0; i < W * H; i++) {
      const v = l[i] > 0.02 ? Math.min(1, a[i] / l[i]) : 0;
      out.data[i * 4] = 255;
      out.data[i * 4 + 1] = 255;
      out.data[i * 4 + 2] = 255;
      out.data[i * 4 + 3] = Math.round(v * 255);
    }
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "copy";
    sc.putImageData(out, 0, 0);
    return snowC;
  }

  private mapWidth(): number {
    return this.map.width;
  }

  private mapHeight(): number {
    return this.map.height;
  }

  /** The snow's flecks: a tile of white specks, one tile pixel to a device pixel. */
  private fleckTile: HTMLCanvasElement | null = null;
  private flecks(c: C): CanvasPattern | null {
    if (!this.fleckTile) {
      const t = document.createElement("canvas");
      t.width = 26;
      t.height = 26;
      const x = t.getContext("2d");
      if (x) {
        x.fillStyle = "#ffffff";
        for (let i = 0; i < 9; i++) {
          // A fixed scatter (golden-angle steps), the same on every screen.
          const fx = (i * 0.618034 + 0.13) % 1;
          const fy = (i * 0.381966 + 0.29 + (i % 3) * 0.21) % 1;
          x.beginPath();
          x.arc(fx * 26, fy * 26, 0.7 + ((i * 7) % 5) * 0.18, 0, Math.PI * 2);
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
   * `scale` is the view's (map units to css px), for the flecks' size.
   */
  paint(f: ChartFrame, where: (p: number) => boolean, viewScale: number): void {
    const mask = this.mask;
    if (!mask) return;
    const clip = new Path2D();
    let n = 0;
    for (let p = 0; p < this.paths.length; p++) {
      if (this.depth[p] <= 0 || !where(p)) continue;
      clip.addPath(this.paths[p]);
      n++;
    }
    if (!n) return;
    const work = (this.work ??= document.createElement("canvas"));
    if (work.width !== f.w || work.height !== f.h) {
      work.width = f.w;
      work.height = f.h;
    }
    const w = work.getContext("2d");
    const c = f.canvas.getContext("2d");
    if (!w || !c) return;
    // The chart as it is, given Hard Winter's treatment all over...
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.globalCompositeOperation = "copy";
    w.globalAlpha = 1;
    w.drawImage(f.canvas, 0, 0);
    const blend = (op: GlobalCompositeOperation, color: string, alpha: number) => {
      w.globalCompositeOperation = op;
      w.globalAlpha = alpha;
      w.fillStyle = color;
      w.fillRect(0, 0, f.w, f.h);
    };
    blend("saturation", "#808080", WINTER_INK.grey);
    blend("screen", "#dfe8ee", WINTER_INK.whiten);
    blend("source-over", WINTER_INK.snow, WINTER_INK.cover);
    // ...the snow's flecks (the same size on screen, fixed to the map) and
    // the falling snow, in map units...
    w.globalCompositeOperation = "source-over";
    w.setTransform(f.scale, 0, 0, f.scale, f.ox, f.oy);
    const pat = this.flecks(w);
    if (pat) {
      pat.setTransform(new DOMMatrix().scaleSelf(1 / f.scale, 1 / f.scale));
      w.globalAlpha = WINTER_INK.flecks * 0.8;
      w.fillStyle = pat;
      w.fillRect(0, 0, this.mapWidth(), this.mapHeight());
    }
    const pts = scatter("snow", 2600, this.mapWidth(), this.mapHeight());
    const r0 = 1 / Math.max(0.01, viewScale);
    w.globalAlpha = WINTER_INK.flecks;
    w.fillStyle = "#ffffff";
    w.beginPath();
    for (let i = 0; i < pts.length; i += 3) {
      const rad = (0.5 + pts[i + 2] * 1.1) * r0;
      w.moveTo(pts[i] + rad, pts[i + 1]);
      w.arc(pts[i], pts[i + 1], rad, 0, Math.PI * 2);
    }
    w.fill();
    // ...kept only where the winter is, as deep as it is there.
    w.globalAlpha = 1;
    w.globalCompositeOperation = "destination-in";
    w.imageSmoothingEnabled = true;
    w.setTransform(f.scale / K, 0, 0, f.scale / K, f.ox, f.oy);
    w.drawImage(mask, 0, 0);
    // Then laid on the chart, inside the winter country only.
    c.save();
    c.setTransform(f.scale, 0, 0, f.scale, f.ox, f.oy);
    c.clip(clip, "evenodd");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.drawImage(work, 0, 0);
    c.restore();
  }
}

/** One box blur of radius r over a w×h field, in place (rows, then columns). */
function boxBlur(a: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[x] = sum / span;
      const out = a[row + Math.max(0, x - r)];
      const inn = a[row + Math.min(w - 1, x + r + 1)];
      sum += inn - out;
    }
    for (let x = 0; x < w; x++) a[row + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += a[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = sum / span;
      const out = a[Math.max(0, y - r) * w + x];
      const inn = a[Math.min(h - 1, y + r + 1) * w + x];
      sum += inn - out;
    }
    for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
  }
}
