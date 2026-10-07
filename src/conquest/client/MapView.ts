// Derpy Conquest's map: provinces, borders, rivers, armies and what's going
// on, drawn on a canvas you can drag and zoom (mouse, trackpad or fingers).
// Four ways to look at it: by nation (names stretched across their land,
// as on old maps), by terrain, by what the land makes, and by people.

import type { World } from "../engine/Map";
import { armyMen, people } from "../engine/Queries";
import type { Army, GameState, Good, MapDef, Terrain } from "../engine/Types";
import { GOOD_COLORS } from "./Text";

export type MapMode = "nation" | "terrain" | "economy" | "people";

export interface Geo {
  width: number;
  height: number;
  arcs: number[][];
  rings: number[][][];
  rivers: number[][];
}

export const TERRAIN_TINT: Record<Terrain, string> = {
  plains: "#ece0b4",
  forest: "#d2d6a8",
  hills: "#e2d1a2",
  mountains: "#d3c3a6",
  jungle: "#c4d1a2",
  desert: "#f1e2b4",
  marsh: "#cfd6b8",
  tundra: "#e9e9e0",
};

const OCEAN_TOP = "#2f6577";
const OCEAN_BOTTOM = "#204a5a";
const PARCHMENT = [236, 224, 184];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  const m = c.map((v, i) =>
    Math.round(v * (1 - amount) + PARCHMENT[i] * amount),
  );
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

interface DecodedArc {
  left: number;
  right: number;
  pts: Float32Array;
}

/** One pass of Chaikin smoothing, keeping the ends where they are. */
function smooth(pts: number[]): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const out = [pts[0], pts[1]];
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[i * 2 + 2];
    const y1 = pts[i * 2 + 3];
    out.push(
      0.75 * x0 + 0.25 * x1,
      0.75 * y0 + 0.25 * y1,
      0.25 * x0 + 0.75 * x1,
      0.25 * y0 + 0.75 * y1,
    );
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

function decodeArc(raw: number[]): DecodedArc {
  const pts: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 2; i < raw.length; i += 2) {
    x += raw[i];
    y += raw[i + 1];
    pts.push(x, y);
  }
  return { left: raw[0], right: raw[1], pts: new Float32Array(smooth(pts)) };
}

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface MapCallbacks {
  click(p: number | null, army: Army | null, e: PointerEvent): void;
  rightClick(p: number | null): void;
  hover(p: number | null): void;
}

export interface Overlay {
  state: GameState;
  me: number;
  /** Fractional current day, for moving armies smoothly. */
  dayNow: number;
  selectedProv: number | null;
  selectedArmy: number | null;
  /** Province -> real time (ms) of a recent battle there. */
  battles: Map<number, number>;
  /** Where the selected army would go (path preview). */
  preview: number[] | null;
  mode: MapMode;
  /** Open land the player could settle right now. */
  colonizable: Set<number>;
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  view: View = { scale: 0.4, tx: 0, ty: 0 };
  private arcs: DecodedArc[] = [];
  private provPaths: Path2D[] = [];
  private provBox: [number, number, number, number][] = [];
  private coast = new Path2D();
  private borders = new Path2D();
  private nationBorders = new Path2D();
  private rivers = new Path2D();
  private ownersKey = "";
  private nationLabels: NationLabel[] = [];
  private armyHits: {
    army: Army;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  private hovered: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinch: {
    dist: number;
    scale: number;
    cx: number;
    cy: number;
  } | null = null;
  overlay: Overlay | null = null;
  needsDraw = true;

  constructor(
    private readonly map: MapDef,
    private readonly world: World,
    private readonly geo: Geo,
    private readonly cb: MapCallbacks,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cq-map";
    this.ctx = this.canvas.getContext("2d")!;
    this.buildPaths();
    this.attachInput();
  }

  // ---------------------------------------------------------------- shapes

  private buildPaths(): void {
    this.arcs = this.geo.arcs.map(decodeArc);
    const arcPts = (ref: number) => {
      const a = this.arcs[ref >= 0 ? ref : ~ref];
      return { a, reversed: ref < 0 };
    };
    this.provPaths = this.geo.rings.map((rings, p) => {
      const path = new Path2D();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const ring of rings) {
        let first = true;
        for (const ref of ring) {
          const { a, reversed } = arcPts(ref);
          const n = a.pts.length / 2;
          for (let k = 0; k < n; k++) {
            const i = reversed ? n - 1 - k : k;
            const x = a.pts[i * 2];
            const y = a.pts[i * 2 + 1];
            if (first) {
              path.moveTo(x, y);
              first = false;
            } else if (k > 0) {
              path.lineTo(x, y);
            }
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
        path.closePath();
      }
      this.provBox[p] = [minX, minY, maxX, maxY];
      return path;
    });
    for (const a of this.arcs) {
      const target = a.left < 0 || a.right < 0 ? this.coast : this.borders;
      this.addArc(target, a);
    }
    for (const r of this.geo.rivers) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < r.length; i += 2) {
        x += r[i];
        y += r[i + 1];
        if (i === 0) this.rivers.moveTo(x / 2, y / 2);
        else this.rivers.lineTo(x / 2, y / 2);
      }
    }
  }

  private addArc(path: Path2D, a: DecodedArc): void {
    path.moveTo(a.pts[0], a.pts[1]);
    for (let i = 2; i < a.pts.length; i += 2)
      path.lineTo(a.pts[i], a.pts[i + 1]);
  }

  /** Rebuilds the thick borders between different owners, when owners change. */
  private refreshOwners(s: GameState): void {
    const key = s.provinces.map((p) => p.owner).join(",");
    if (key === this.ownersKey) return;
    this.ownersKey = key;
    this.nationBorders = new Path2D();
    for (const a of this.arcs) {
      if (a.left < 0 || a.right < 0) continue;
      if (s.provinces[a.left].owner !== s.provinces[a.right].owner)
        this.addArc(this.nationBorders, a);
    }
    // Nation names stretched along the lie of their land.
    const by = new Map<number, number[]>();
    s.provinces.forEach((p, i) => {
      if (p.owner < 0 || s.nations[p.owner].kind === "crown") return;
      let list = by.get(p.owner);
      if (!list) by.set(p.owner, (list = []));
      list.push(i);
    });
    this.nationLabels = [];
    for (const [n, provs] of by) {
      const label = this.curveLabel(
        s.nations[n].name.replace(/^the /, "").toUpperCase(),
        provs,
        s.nations[n].color,
      );
      if (label) this.nationLabels.push(label);
    }
    this.nationLabels.sort((a, b) => b.length - a.length);
  }

  /**
   * A label for a nation: a gentle curve through its provinces along their
   * long axis, as long as the land is.
   */
  private curveLabel(
    name: string,
    provs: number[],
    color: string,
  ): NationLabel | null {
    let sw = 0;
    let mx = 0;
    let my = 0;
    const pts = provs.map((p) => {
      const b = this.provBox[p];
      const r = Math.sqrt(Math.max(1, (b[2] - b[0]) * (b[3] - b[1]))) / 2;
      const w = r;
      const d = this.map.provinces[p];
      sw += w;
      mx += d.x * w;
      my += d.y * w;
      return { x: d.x, y: d.y, w, r };
    });
    mx /= sw;
    my /= sw;
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const q of pts) {
      cxx += q.w * (q.x - mx) ** 2;
      cyy += q.w * (q.y - my) ** 2;
      cxy += q.w * (q.x - mx) * (q.y - my);
    }
    const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    let ux = Math.cos(angle);
    let uy = Math.sin(angle);
    // Always read left to right.
    if (ux < 0) {
      ux = -ux;
      uy = -uy;
    }
    const vx = -uy;
    const vy = ux;
    let tMin = Infinity;
    let tMax = -Infinity;
    let thick = 0;
    const proj = pts.map((q) => {
      const t = (q.x - mx) * ux + (q.y - my) * uy;
      const o = (q.x - mx) * vx + (q.y - my) * vy;
      tMin = Math.min(tMin, t - q.r * 0.8);
      tMax = Math.max(tMax, t + q.r * 0.8);
      thick += q.w * (o * o);
      return { t, o, w: q.w, r: q.r };
    });
    const avgR = sw / pts.length;
    thick = Math.sqrt(thick / sw) * 2 + avgR * 1.2;
    const length = (tMax - tMin) * 0.86;
    if (length <= 0) return null;
    // The curve: offsets smoothed along the axis.
    const sigma = Math.max(avgR, (tMax - tMin) / 4);
    const samples: [number, number][] = [];
    const K = 16;
    for (let i = 0; i <= K; i++) {
      const t = tMin + (tMax - tMin) * (0.07 + (0.86 * i) / K);
      let num = 0;
      let den = 0;
      for (const q of proj) {
        const g = q.w * Math.exp(-((t - q.t) ** 2) / (2 * sigma * sigma));
        num += g * q.o;
        den += g;
      }
      const o = den > 0 ? num / den : 0;
      samples.push([mx + ux * t + vx * o, my + uy * t + vy * o]);
    }
    const size = Math.min(thick * 0.55, (length / name.length) * 1.25);
    return { name, samples, length, size, color };
  }

  // ---------------------------------------------------------------- view

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.needsDraw = true;
  }

  private get cssWidth() {
    return this.canvas.width / this.dpr;
  }

  private get cssHeight() {
    return this.canvas.height / this.dpr;
  }

  private minScale(): number {
    return (
      Math.min(
        this.cssWidth / this.geo.width,
        this.cssHeight / this.geo.height,
      ) * 0.9
    );
  }

  private clampView(): void {
    const v = this.view;
    v.scale = Math.max(this.minScale(), Math.min(9, v.scale));
    const w = this.geo.width * v.scale;
    const h = this.geo.height * v.scale;
    const margin = 120;
    v.tx = Math.min(margin, Math.max(this.cssWidth - w - margin, v.tx));
    v.ty = Math.min(margin, Math.max(this.cssHeight - h - margin, v.ty));
    if (w < this.cssWidth) v.tx = (this.cssWidth - w) / 2;
    if (h < this.cssHeight) v.ty = (this.cssHeight - h) / 2;
    this.needsDraw = true;
  }

  /** Centres the map on a province. */
  focus(p: number, scale?: number): void {
    const def = this.map.provinces[p];
    if (scale) this.view.scale = scale;
    this.view.tx = this.cssWidth / 2 - def.x * this.view.scale;
    this.view.ty = this.cssHeight / 2 - def.y * this.view.scale;
    this.clampView();
  }

  zoomBy(
    factor: number,
    cx = this.cssWidth / 2,
    cy = this.cssHeight / 2,
  ): void {
    const v = this.view;
    const mx = (cx - v.tx) / v.scale;
    const my = (cy - v.ty) / v.scale;
    v.scale *= factor;
    v.scale = Math.max(this.minScale(), Math.min(9, v.scale));
    v.tx = cx - mx * v.scale;
    v.ty = cy - my * v.scale;
    this.clampView();
  }

  private toMap(cx: number, cy: number): [number, number] {
    return [
      (cx - this.view.tx) / this.view.scale,
      (cy - this.view.ty) / this.view.scale,
    ];
  }

  provinceAt(cx: number, cy: number): number | null {
    const [mx, my] = this.toMap(cx, cy);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let p = 0; p < this.provPaths.length; p++) {
      const b = this.provBox[p];
      if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
      if (this.ctx.isPointInPath(this.provPaths[p], mx, my, "evenodd"))
        return p;
    }
    // Specks of islands: the nearest small one within a few pixels.
    let best: number | null = null;
    let bestD = 14;
    this.map.provinces.forEach((def, p) => {
      if (def.areaKm2 > 4000) return;
      const d = Math.hypot(
        def.x * this.view.scale + this.view.tx - cx,
        def.y * this.view.scale + this.view.ty - cy,
      );
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  private armyAt(cx: number, cy: number): Army | null {
    for (let i = this.armyHits.length - 1; i >= 0; i--) {
      const h = this.armyHits[i];
      if (
        cx >= h.x - 3 &&
        cx <= h.x + h.w + 3 &&
        cy >= h.y - 3 &&
        cy <= h.y + h.h + 3
      )
        return h.army;
    }
    return null;
  }

  // ---------------------------------------------------------------- input

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.cb.rightClick(
        this.provinceAt(e.clientX - r.left, e.clientY - r.top),
      );
    });
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        this.zoomBy(
          Math.exp(-delta * 0.0018),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      },
      { passive: false },
    );
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect();
      this.pointers.set(e.pointerId, {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
      if (this.pointers.size === 1) {
        this.dragStart = { x: e.clientX, y: e.clientY, moved: false };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          scale: this.view.scale,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
        if (this.dragStart) this.dragStart.moved = true;
      }
    });
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === "mouse") {
          const p = this.provinceAt(x, y);
          if (p !== this.hovered) {
            this.hovered = p;
            this.needsDraw = true;
            this.cb.hover(p);
          }
        }
        return;
      }
      this.pointers.set(e.pointerId, { x, y });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const target = (this.pinch.scale * dist) / Math.max(1, this.pinch.dist);
        this.zoomBy(target / this.view.scale, this.pinch.cx, this.pinch.cy);
        return;
      }
      if (this.dragStart && this.pointers.size === 1) {
        if (
          Math.hypot(
            e.clientX - this.dragStart.x,
            e.clientY - this.dragStart.y,
          ) > 6
        )
          this.dragStart.moved = true;
        if (this.dragStart.moved) {
          this.view.tx += x - prev.x;
          this.view.ty += y - prev.y;
          this.clampView();
        }
      }
    });
    const end = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const wasClick =
        this.pointers.size === 1 && this.dragStart && !this.dragStart.moved;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (e.type === "pointerup" && wasClick && e.button === 0) {
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        this.cb.click(this.provinceAt(x, y), this.armyAt(x, y), e);
      }
      if (this.pointers.size === 0) this.dragStart = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (this.hovered !== null) {
        this.hovered = null;
        this.needsDraw = true;
        this.cb.hover(null);
      }
    });
  }

  // ---------------------------------------------------------------- drawing

  private fillFor(s: GameState, p: number, o: Overlay): string {
    const prov = s.provinces[p];
    const def = this.map.provinces[p];
    switch (o.mode) {
      case "terrain":
        return TERRAIN_TINT[def.terrain];
      case "economy": {
        const good = this.world.raw[p];
        let value = 0;
        for (const v of Object.values(prov.made)) value += v ?? 0;
        if (prov.owner < 0 || value <= 0) return mix(GOOD_COLORS[good], 0.78);
        return mix(
          GOOD_COLORS[good],
          Math.max(0.05, 0.6 - Math.min(0.55, value / 60)),
        );
      }
      case "people": {
        const folk = people(prov);
        const density = folk / Math.max(500, def.areaKm2);
        return ramp(Math.min(1, Math.sqrt(density / 0.25)));
      }
      default: {
        if (prov.owner < 0) {
          if (prov.colony) return mix(s.nations[prov.colony.by].color, 0.72);
          return TERRAIN_TINT[def.terrain];
        }
        const n = s.nations[prov.owner];
        return mix(n.color, n.kind === "native" ? 0.42 : 0.14);
      }
    }
  }

  /** Where an army is drawn right now, in map units. */
  private armySpot(a: Army, dayNow: number): [number, number] {
    const from = this.map.provinces[a.prov];
    if (a.depart < 0 || a.path.length === 0) return [from.x, from.y];
    const to = this.map.provinces[a.path[0]];
    const t = Math.max(
      0,
      Math.min(1, (dayNow - a.depart) / Math.max(1, a.arrive - a.depart)),
    );
    return [from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t];
  }

  draw(now: number): void {
    const o = this.overlay;
    const ctx = this.ctx;
    const v = this.view;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, this.cssHeight);
    grad.addColorStop(0, OCEAN_TOP);
    grad.addColorStop(1, OCEAN_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    if (!o) return;
    const s = o.state;
    this.refreshOwners(s);

    ctx.setTransform(
      dpr * v.scale,
      0,
      0,
      dpr * v.scale,
      dpr * v.tx,
      dpr * v.ty,
    );
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Shallow water along the coast, as on old charts.
    ctx.strokeStyle = "rgba(160, 205, 215, 0.3)";
    ctx.lineWidth = 9 / v.scale;
    ctx.stroke(this.coast);
    ctx.strokeStyle = "rgba(190, 225, 230, 0.3)";
    ctx.lineWidth = 4 / v.scale;
    ctx.stroke(this.coast);

    // Only draw what's on screen.
    const [vx0, vy0] = this.toMap(0, 0);
    const [vx1, vy1] = this.toMap(this.cssWidth, this.cssHeight);
    const visible = (p: number) => {
      const b = this.provBox[p];
      return !(b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1);
    };
    for (let p = 0; p < this.provPaths.length; p++) {
      if (!visible(p)) continue;
      ctx.fillStyle = this.fillFor(s, p, o);
      ctx.fill(this.provPaths[p], "evenodd");
      if (this.map.provinces[p].areaKm2 < 4000 && v.scale < 3) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2.5 / v.scale;
        ctx.stroke(this.provPaths[p]);
      }
    }
    // Enemy-held land: hatched in the occupier's colour.
    if (o.mode === "nation") {
      for (let p = 0; p < this.provPaths.length; p++) {
        const prov = s.provinces[p];
        if (prov.occupier < 0 || !visible(p)) continue;
        ctx.save();
        ctx.clip(this.provPaths[p], "evenodd");
        ctx.strokeStyle = s.nations[prov.occupier].color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2.2 / v.scale;
        const b = this.provBox[p];
        const step = 9 / v.scale;
        ctx.beginPath();
        for (let x = b[0] - (b[3] - b[1]); x < b[2]; x += step) {
          ctx.moveTo(x, b[3]);
          ctx.lineTo(x + (b[3] - b[1]), b[1]);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.hovered !== null) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill(this.provPaths[this.hovered], "evenodd");
    }

    ctx.strokeStyle = "rgba(70, 55, 35, 0.3)";
    ctx.lineWidth = Math.max(0.5, 0.8 / v.scale);
    ctx.setLineDash([3 / v.scale, 2.5 / v.scale]);
    ctx.stroke(this.borders);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(82, 130, 160, 0.75)";
    ctx.lineWidth = Math.min(1.2, 1.1 / v.scale);
    ctx.stroke(this.rivers);
    if (o.mode === "nation") {
      ctx.strokeStyle = "rgba(45, 32, 20, 0.8)";
      ctx.lineWidth = 1.9 / v.scale;
      ctx.stroke(this.nationBorders);
    }
    ctx.strokeStyle = "rgba(25, 45, 55, 0.9)";
    ctx.lineWidth = 1.2 / v.scale;
    ctx.stroke(this.coast);

    if (o.selectedProv !== null) {
      ctx.strokeStyle = "#fff8e1";
      ctx.lineWidth = 3.2 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
      ctx.strokeStyle = "rgba(20,20,20,0.85)";
      ctx.lineWidth = 1 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
    }

    // ---- names
    if (o.mode === "nation") this.drawNationLabels();

    // ---- screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x: number) => x * v.scale + v.tx;
    const sy = (y: number) => y * v.scale + v.ty;
    const onScreen = (x: number, y: number, m = 30) =>
      x > -m && y > -m && x < this.cssWidth + m && y < this.cssHeight + m;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (v.scale >= 1.1 || o.mode !== "nation") {
      ctx.font = `${v.scale > 3 ? 13 : 11}px "IM Fell English", Georgia, serif`;
      for (let p = 0; p < this.provPaths.length; p++) {
        const def = this.map.provinces[p];
        const b = this.provBox[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y, 80)) continue;
        if ((b[2] - b[0]) * v.scale < def.name.length * 6) continue;
        ctx.fillStyle = "rgba(45,32,20,0.82)";
        ctx.fillText(def.name, x, y + 14);
      }
    }

    // Resources on the economy view.
    if (o.mode === "economy" && v.scale >= 0.7) {
      for (let p = 0; p < this.provPaths.length; p++) {
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y)) continue;
        this.goodDot(x, y - 4, this.world.raw[p]);
      }
    }

    // Where you could found a colony right now.
    if (o.colonizable.size) {
      ctx.lineWidth = 1.6;
      for (const p of o.colonizable) {
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y, 20)) continue;
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = "rgba(35,95,50,0.95)";
        ctx.fillStyle = "rgba(235,250,225,0.8)";
        ctx.beginPath();
        ctx.arc(x, y - 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y - 2);
        ctx.lineTo(x + 3.5, y - 2);
        ctx.moveTo(x, y - 5.5);
        ctx.lineTo(x, y + 1.5);
        ctx.stroke();
      }
    }

    // Colonies under way, sieges, ports and forts.
    const day = o.dayNow;
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      const def = this.map.provinces[p];
      const x = sx(def.x);
      const y = sy(def.y);
      if (!onScreen(x, y)) continue;
      if (prov.colony) {
        const c = prov.colony;
        this.ring(
          x,
          y - 2,
          9,
          s.nations[c.by].color,
          (day - c.start) / Math.max(1, c.done - c.start),
        );
        this.tent(x, y - 2);
      }
      if (prov.siege) {
        this.ring(
          x,
          y - 22,
          9,
          s.nations[prov.siege.by].color,
          prov.siege.progress / 100,
        );
        this.swords(x, y - 22, 5, "#3b2b1a");
      }
      if (v.scale >= 2.2 && prov.owner >= 0) {
        let gx = x - 8;
        if (prov.b.port) {
          this.anchor(gx, y + 27);
          gx += 14;
        }
        if (prov.b.fort) this.tower(gx, y + 27, prov.b.fort);
      }
      if (prov.mods.some((m) => m.key === "revolt")) this.flame(x + 14, y - 10);
    }
    for (const [p, at] of o.battles) {
      const age = now - at;
      if (age > 5000) {
        o.battles.delete(p);
        continue;
      }
      const def = this.map.provinces[p];
      ctx.globalAlpha = 1 - age / 5000;
      this.swords(
        sx(def.x) + 16,
        sy(def.y) - 16,
        8 + 2 * Math.sin(age / 120),
        "#7a1d14",
      );
      ctx.globalAlpha = 1;
    }

    // Path of the selected army, and the preview of a move.
    const sel =
      o.selectedArmy !== null
        ? s.armies.find((a) => a.id === o.selectedArmy)
        : undefined;
    const drawPath = (
      from: [number, number],
      path: number[],
      color: string,
    ) => {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx(from[0]), sy(from[1]));
      for (const q of path)
        ctx.lineTo(sx(this.map.provinces[q].x), sy(this.map.provinces[q].y));
      ctx.stroke();
      ctx.setLineDash([]);
      const last = path[path.length - 1];
      if (last !== undefined) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          sx(this.map.provinces[last].x),
          sy(this.map.provinces[last].y),
          5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };
    if (sel && sel.path.length)
      drawPath(this.armySpot(sel, day), sel.path, "rgba(255,250,235,0.95)");
    if (sel && o.preview?.length)
      drawPath(this.armySpot(sel, day), o.preview, "rgba(255,215,110,0.95)");

    // Armies: a tag per army with its strength, in its nation's colour.
    this.armyHits = [];
    const stacks = new Map<string, number>();
    const sorted = [...s.armies].sort(
      (a, b) =>
        Number(a.owner === o.me) - Number(b.owner === o.me) || a.id - b.id,
    );
    for (const a of sorted) {
      const mine = a.owner === o.me;
      const hostile =
        o.me >= 0 &&
        s.wars.some(
          (w) =>
            (w.a === o.me && w.b === a.owner) ||
            (w.b === o.me && w.a === a.owner),
        );
      const important = mine || hostile || a.id === o.selectedArmy;
      if (!important && v.scale < 0.9) continue;
      const [mx, my] = this.armySpot(a, day);
      const x = sx(mx);
      const y = sy(my);
      if (!onScreen(x, y, 40)) continue;
      const key = `${Math.round(x / 8)},${Math.round(y / 8)}`;
      const slot = stacks.get(key) ?? 0;
      stacks.set(key, slot + 1);
      const nation = s.nations[a.owner];
      const men = armyMen(a);
      const label =
        important && v.scale >= 1.2
          ? men >= 1000
            ? `${(men / 1000).toFixed(1)}k`
            : `${Math.round(men)}`
          : `${a.regs.length}`;
      ctx.font = important
        ? "700 11px 'Alegreya Sans', system-ui, sans-serif"
        : "700 9px 'Alegreya Sans', system-ui, sans-serif";
      const h = important ? 17 : 13;
      const w = Math.max(
        important ? 22 : 14,
        ctx.measureText(label).width + (important ? 12 : 8),
      );
      const bx = x - w / 2 + slot * (w + 3);
      const by = y - h / 2 - 2;
      const selected = a.id === o.selectedArmy;
      ctx.globalAlpha = important ? 1 : 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      this.roundRect(bx + 1, by + 2, w, h, 3);
      ctx.fill();
      ctx.fillStyle = nation.color;
      this.roundRect(bx, by, w, h, 3);
      ctx.fill();
      ctx.lineWidth = selected ? 3 : mine || hostile ? 1.8 : 1;
      ctx.strokeStyle = selected
        ? "#fff6c8"
        : mine
          ? "#fbf3dc"
          : hostile
            ? "#e04a35"
            : "rgba(20,20,20,0.6)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 2.5;
      ctx.strokeText(label, bx + w / 2, by + h / 2 + 0.5);
      ctx.fillText(label, bx + w / 2, by + h / 2 + 0.5);
      // Supply and morale bars under your own armies.
      if (mine && important && v.scale >= 1.2) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(bx, by + h + 1, w, 3);
        ctx.fillStyle =
          a.regs.reduce((m, r) => m + r.morale * r.men, 0) / Math.max(1, men) >
          0.5
            ? "#7fc36b"
            : "#e0a03a";
        ctx.fillRect(
          bx,
          by + h + 1,
          (w * a.regs.reduce((m, r) => m + r.morale * r.men, 0)) /
            Math.max(1, men),
          3,
        );
      }
      ctx.globalAlpha = 1;
      if (a.retreating) this.whiteFlag(bx + w + 6, by + 2);
      this.armyHits.push({ army: a, x: bx, y: by, w, h });
    }
    this.needsDraw = false;
  }

  /** Nation names along their curves, letter-spaced to span the land. */
  private drawNationLabels(): void {
    const ctx = this.ctx;
    const v = this.view;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const placed: [number, number, number, number][] = [];
    for (const l of this.nationLabels) {
      const sizePx = Math.min(64, l.size * v.scale);
      if (sizePx < 10) continue;
      const pts = l.samples.map(
        ([x, y]) =>
          [x * v.scale + v.tx, y * v.scale + v.ty] as [number, number],
      );
      // Bounding box for collisions.
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x - sizePx / 2);
        y0 = Math.min(y0, y - sizePx / 2);
        x1 = Math.max(x1, x + sizePx / 2);
        y1 = Math.max(y1, y + sizePx / 2);
      }
      if (x1 < 0 || y1 < 0 || x0 > this.cssWidth || y0 > this.cssHeight)
        continue;
      if (placed.some((r) => r[0] < x1 && x0 < r[2] && r[1] < y1 && y0 < r[3]))
        continue;
      placed.push([x0, y0, x1, y1]);
      // Arc length along the curve.
      const seg: number[] = [0];
      for (let i = 1; i < pts.length; i++)
        seg.push(
          seg[i - 1] +
            Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
        );
      const total = seg[seg.length - 1];
      ctx.font = `${sizePx}px "IM Fell English SC", "IM Fell English", Georgia, serif`;
      const widths = [...l.name].map((ch) => ctx.measureText(ch).width);
      const textW = widths.reduce((m, x) => m + x, 0);
      const gap =
        l.name.length > 1
          ? Math.max(0, (total - textW) / (l.name.length - 1))
          : 0;
      const spacing = Math.min(gap, sizePx * 1.4);
      const used = textW + spacing * (l.name.length - 1);
      let at = (total - used) / 2;
      const pointAt = (d: number): [number, number, number] => {
        let i = 1;
        while (i < seg.length - 1 && seg[i] < d) i++;
        const t = (d - seg[i - 1]) / Math.max(0.001, seg[i] - seg[i - 1]);
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        return [
          ax + (bx - ax) * t,
          ay + (by - ay) * t,
          Math.atan2(by - ay, bx - ax),
        ];
      };
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, sizePx / 7);
      ctx.strokeStyle = "rgba(250,242,220,0.55)";
      ctx.fillStyle = darken(l.color, 0.55, 0.78);
      [...l.name].forEach((ch, i) => {
        const [x, y, ang] = pointAt(at + widths[i] / 2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.strokeText(ch, 0, 0);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        at += widths[i] + spacing;
      });
    }
  }

  private goodDot(x: number, y: number, good: Good): void {
    const ctx = this.ctx;
    ctx.fillStyle = GOOD_COLORS[good];
    ctx.strokeStyle = "rgba(40,28,18,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private tent(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#3b2b1a";
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y + 3.5);
    ctx.lineTo(x, y - 4);
    ctx.lineTo(x + 4.5, y + 3.5);
    ctx.closePath();
    ctx.fill();
  }

  private swords(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.6, r / 3.5);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.moveTo(x - r * 0.9, y + r * 0.35);
    ctx.lineTo(x - r * 0.35, y + r * 0.9);
    ctx.moveTo(x + r * 0.9, y + r * 0.35);
    ctx.lineTo(x + r * 0.35, y + r * 0.9);
    ctx.stroke();
  }

  private anchor(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "#1f3f4c";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y - 4.5, 1.6, 0, Math.PI * 2);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x - 3, y - 1.5);
    ctx.lineTo(x + 3, y - 1.5);
    ctx.moveTo(x - 4.5, y + 1);
    ctx.quadraticCurveTo(x - 3.5, y + 4.5, x, y + 4);
    ctx.quadraticCurveTo(x + 3.5, y + 4.5, x + 4.5, y + 1);
    ctx.stroke();
  }

  private tower(x: number, y: number, level: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(x - 4, y - 3, 8, 7);
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 4 + i * 3, y - 5.5, 2, 2.5);
    ctx.fillStyle = "#f4e9cd";
    ctx.font = "700 7px system-ui, sans-serif";
    ctx.fillText(String(level), x, y + 1);
  }

  private flame(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#c2411f";
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.quadraticCurveTo(x + 5, y, x + 2.5, y + 4);
    ctx.quadraticCurveTo(x, y + 6, x - 2.5, y + 4);
    ctx.quadraticCurveTo(x - 5, y, x, y - 6);
    ctx.fill();
  }

  private whiteFlag(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "#3b2b1a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "#fbf6e8";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8, y + 2.5);
    ctx.lineTo(x, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private ring(
    x: number,
    y: number,
    r: number,
    color: string,
    frac: number,
  ): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,250,235,0.88)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)),
    );
    ctx.stroke();
  }

  private roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

interface NationLabel {
  name: string;
  /** Points along the curve, in map units. */
  samples: [number, number][];
  length: number;
  /** Letter height in map units. */
  size: number;
  color: string;
}

/** Density colours for the people view: parchment to deep red-brown. */
export function ramp(t: number): string {
  const a = [240, 228, 196];
  const b = [214, 150, 86];
  const c = [122, 38, 26];
  const mixc = (x: number[], y: number[], k: number) =>
    x.map((v, i) => Math.round(v + (y[i] - v) * k));
  const rgb = t < 0.5 ? mixc(a, b, t * 2) : mixc(b, c, (t - 0.5) * 2);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function darken(hex: string, amount: number, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))},${alpha})`;
}
