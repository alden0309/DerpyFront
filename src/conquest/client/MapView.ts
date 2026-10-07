// Derpy Conquest's map: provinces, borders, rivers, armies and what's going
// on, drawn on a canvas you can drag and zoom (mouse, trackpad or fingers).

import { armyMen } from "../engine/Queries";
import type { Army, GameState, MapDef, Terrain } from "../engine/Types";

export interface Geo {
  width: number;
  height: number;
  arcs: number[][];
  rings: number[][][];
  rivers: number[][];
}

const TERRAIN_TINT: Record<Terrain, string> = {
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
  /** Mode the map shows: owners, or terrain/goods for planning. */
  mode: "political" | "terrain";
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
  private nationLabels: {
    name: string;
    x: number;
    y: number;
    size: number;
    color: string;
  }[] = [];
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
    // Nation names sit over the middle of their land, sized to fit it.
    const acc = new Map<
      number,
      {
        x: number;
        y: number;
        w: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      }
    >();
    s.provinces.forEach((p, i) => {
      if (p.owner < 0) return;
      const def = this.map.provinces[i];
      const b = this.provBox[i];
      const w = def.areaKm2;
      const e = acc.get(p.owner) ?? {
        x: 0,
        y: 0,
        w: 0,
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };
      e.x += def.x * w;
      e.y += def.y * w;
      e.w += w;
      e.minX = Math.min(e.minX, b[0]);
      e.maxX = Math.max(e.maxX, b[2]);
      e.minY = Math.min(e.minY, b[1]);
      e.maxY = Math.max(e.maxY, b[3]);
      acc.set(p.owner, e);
    });
    this.nationLabels = [...acc.entries()].map(([n, e]) => ({
      name: s.nations[n].name.replace(/^the /, "").toUpperCase(),
      x: e.x / e.w,
      y: e.y / e.w,
      // Map units the label may span: most of the land's width, but not
      // much more than its height allows.
      size: Math.min((e.maxX - e.minX) * 0.8, (e.maxY - e.minY) * 2.2),
      color: s.nations[n].color,
    }));
    this.nationLabels.sort((a, b) => b.size - a.size);
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

  private fillFor(s: GameState, p: number, mode: Overlay["mode"]): string {
    const prov = s.provinces[p];
    const def = this.map.provinces[p];
    if (mode === "terrain" || prov.owner < 0) {
      if (prov.colony && mode !== "terrain")
        return mix(s.nations[prov.colony.by].color, 0.7);
      return TERRAIN_TINT[def.terrain];
    }
    const n = s.nations[prov.owner];
    return mix(n.color, n.kind === "native" ? 0.35 : 0.12);
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
    // Shallow water along the coast.
    ctx.strokeStyle = "rgba(160, 205, 215, 0.35)";
    ctx.lineWidth = 7 / v.scale;
    ctx.stroke(this.coast);
    ctx.strokeStyle = "rgba(190, 225, 230, 0.35)";
    ctx.lineWidth = 3 / v.scale;
    ctx.stroke(this.coast);

    // Only draw what's on screen.
    const [vx0, vy0] = this.toMap(0, 0);
    const [vx1, vy1] = this.toMap(this.cssWidth, this.cssHeight);
    for (let p = 0; p < this.provPaths.length; p++) {
      const b = this.provBox[p];
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      ctx.fillStyle = this.fillFor(s, p, o.mode);
      ctx.fill(this.provPaths[p], "evenodd");
      // Tiny islands get an outline so they can be found.
      if (this.map.provinces[p].areaKm2 < 4000 && v.scale < 3) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2.5 / v.scale;
        ctx.stroke(this.provPaths[p]);
      }
    }
    if (this.hovered !== null) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill(this.provPaths[this.hovered], "evenodd");
    }

    ctx.strokeStyle = "rgba(70, 55, 35, 0.32)";
    ctx.lineWidth = Math.max(0.5, 0.8 / v.scale);
    ctx.stroke(this.borders);
    ctx.strokeStyle = "rgba(82, 130, 160, 0.75)";
    ctx.lineWidth = Math.min(1.2, 1.1 / v.scale);
    ctx.stroke(this.rivers);
    ctx.strokeStyle = "rgba(45, 32, 20, 0.85)";
    ctx.lineWidth = 1.9 / v.scale;
    ctx.stroke(this.nationBorders);
    ctx.strokeStyle = "rgba(25, 50, 60, 0.9)";
    ctx.lineWidth = 1.1 / v.scale;
    ctx.stroke(this.coast);

    if (o.selectedProv !== null) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
      ctx.strokeStyle = "rgba(20,20,20,0.8)";
      ctx.lineWidth = 1 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
    }

    // ---- screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x: number) => x * v.scale + v.tx;
    const sy = (y: number) => y * v.scale + v.ty;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Nation names when zoomed out; province names when zoomed in.
    if (v.scale < 1.6) {
      const placed: [number, number, number, number][] = [];
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,248,230,0.75)";
      ctx.fillStyle = "rgba(40,28,18,0.85)";
      for (const l of this.nationLabels) {
        const widthPx = l.size * v.scale;
        const size = Math.min(26, widthPx / (l.name.length * 0.68));
        if (size < 9) continue;
        ctx.font = `600 ${size}px Georgia, "Palatino Linotype", serif`;
        const w = ctx.measureText(l.name).width;
        const x = sx(l.x);
        const y = sy(l.y);
        const rect: [number, number, number, number] = [
          x - w / 2,
          y - size / 2,
          x + w / 2,
          y + size / 2,
        ];
        if (
          placed.some(
            (r) =>
              r[0] < rect[2] &&
              rect[0] < r[2] &&
              r[1] < rect[3] &&
              rect[1] < r[3],
          )
        )
          continue;
        placed.push(rect);
        ctx.strokeText(l.name, x, y);
        ctx.fillText(l.name, x, y);
      }
    }
    if (v.scale >= 1.1) {
      ctx.font = `${v.scale > 3 ? 13 : 11}px Georgia, "Palatino Linotype", serif`;
      for (let p = 0; p < this.provPaths.length; p++) {
        const def = this.map.provinces[p];
        const b = this.provBox[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (
          x < -80 ||
          y < -20 ||
          x > this.cssWidth + 80 ||
          y > this.cssHeight + 20
        )
          continue;
        if ((b[2] - b[0]) * v.scale < def.name.length * 5.5) continue;
        ctx.fillStyle = "rgba(45,32,20,0.78)";
        ctx.fillText(def.name, x, y + 14);
      }
    }

    // Where you could found a colony right now.
    if (o.colonizable.size) {
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      for (const p of o.colonizable) {
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (
          x < -20 ||
          y < -20 ||
          x > this.cssWidth + 20 ||
          y > this.cssHeight + 20
        )
          continue;
        ctx.strokeStyle = "rgba(40,120,60,0.9)";
        ctx.fillStyle = "rgba(220,255,220,0.55)";
        ctx.beginPath();
        ctx.arc(x, y - 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(30,100,50,0.95)";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillText("+", x, y - 2);
      }
      ctx.setLineDash([]);
    }

    // Colonies under way and sieges.
    const day = o.dayNow;
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      const def = this.map.provinces[p];
      const x = sx(def.x);
      const y = sy(def.y);
      if (
        x < -30 ||
        y < -30 ||
        x > this.cssWidth + 30 ||
        y > this.cssHeight + 30
      )
        continue;
      if (prov.colony) {
        const c = prov.colony;
        this.ring(
          x,
          y - 2,
          9,
          s.nations[c.by].color,
          (day - c.start) / Math.max(1, c.done - c.start),
        );
        ctx.font = "11px sans-serif";
        ctx.fillText("⛺", x, y - 2);
      }
      if (prov.siege) {
        const frac =
          (day - prov.siege.start) /
          Math.max(1, prov.siege.done - prov.siege.start);
        this.ring(x, y - 20, 9, s.nations[prov.siege.by].color, frac);
        ctx.font = "11px sans-serif";
        ctx.fillText("🏰", x, y - 20);
      }
      if (v.scale >= 2.2 && prov.owner >= 0 && (prov.port || prov.fort)) {
        ctx.font = "10px sans-serif";
        const icons = `${prov.port ? "⚓" : ""}${prov.fort ? "🛡".repeat(1) : ""}`;
        ctx.fillText(icons, x, y + 27);
      }
    }
    for (const [p, at] of o.battles) {
      const age = now - at;
      if (age > 5000) {
        o.battles.delete(p);
        continue;
      }
      const def = this.map.provinces[p];
      ctx.globalAlpha = 1 - age / 5000;
      ctx.font = `${18 + 6 * Math.sin(age / 120)}px sans-serif`;
      ctx.fillText("⚔️", sx(def.x) + 16, sy(def.y) - 16);
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
      drawPath(this.armySpot(sel, day), sel.path, "rgba(255,255,255,0.95)");
    if (sel && o.preview?.length)
      drawPath(this.armySpot(sel, day), o.preview, "rgba(255,230,120,0.95)");

    // Armies: a tag per army with its regiments, in its nation's colour.
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
      // Zoomed out, only your armies and your enemies' show.
      if (!important && v.scale < 0.9) continue;
      const [mx, my] = this.armySpot(a, day);
      const x = sx(mx);
      const y = sy(my);
      if (
        x < -40 ||
        y < -40 ||
        x > this.cssWidth + 40 ||
        y > this.cssHeight + 40
      )
        continue;
      const key = `${Math.round(x / 8)},${Math.round(y / 8)}`;
      const slot = stacks.get(key) ?? 0;
      stacks.set(key, slot + 1);
      const nation = s.nations[a.owner];
      const detailed = important && v.scale >= 1.4;
      const label = detailed
        ? `${a.regs.length} · ${(armyMen(a) / 1000).toFixed(1)}k`
        : `${a.regs.length}`;
      ctx.font = important
        ? "bold 11px system-ui, sans-serif"
        : "bold 9px system-ui, sans-serif";
      const h = important ? 17 : 13;
      const w = Math.max(
        important ? 20 : 14,
        ctx.measureText(label).width + (important ? 12 : 8),
      );
      const bx = x - w / 2 + slot * (w + 3);
      const by = y - h / 2 - 2;
      const selected = a.id === o.selectedArmy;
      ctx.globalAlpha = important ? 1 : 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      this.roundRect(bx + 1, by + 2, w, h, 5);
      ctx.fill();
      ctx.fillStyle = nation.color;
      this.roundRect(bx, by, w, h, important ? 5 : 4);
      ctx.fill();
      ctx.lineWidth = selected ? 3 : mine ? 1.8 : hostile ? 1.8 : 1;
      ctx.strokeStyle = selected
        ? "#fff6c8"
        : mine
          ? "#ffffff"
          : hostile
            ? "#ff5a4a"
            : "rgba(20,20,20,0.6)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 2.5;
      ctx.strokeText(label, bx + w / 2, by + h / 2 + 0.5);
      ctx.fillText(label, bx + w / 2, by + h / 2 + 0.5);
      ctx.globalAlpha = 1;
      if (a.retreating) {
        ctx.font = "10px sans-serif";
        ctx.fillText("🏳", bx + w + 6, by + h / 2);
      }
      this.armyHits.push({ army: a, x: bx, y: by, w, h });
    }
    this.needsDraw = false;
  }

  private ring(
    x: number,
    y: number,
    r: number,
    color: string,
    frac: number,
  ): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,250,235,0.85)";
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
    ctx.fillStyle = "#222";
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
