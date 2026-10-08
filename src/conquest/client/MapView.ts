// Derpy Conquest's map: provinces, borders, rivers, armies, ships and what's
// going on, drawn on a canvas you can drag and zoom (mouse, trackpad or
// fingers). Four ways to look at it: by nation (names stretched across
// their land, as on old maps), by terrain, by what the land makes, and by
// people.
//
// It's drawn in two layers. The chart itself (land, borders, names, ports)
// is drawn once into an offscreen canvas and only redrawn when something
// on it changes or the view settles somewhere new; while you drag or zoom,
// that picture is just moved. Things that move (armies, ships, parties,
// sieges) are drawn on top every frame.

import type { World } from "../engine/Map";
import { armyMen, countRegs, people, settlers } from "../engine/Queries";
import type {
  Army,
  GameState,
  MapDef,
  Mission,
  RegType,
  Terrain,
} from "../engine/Types";
import {
  anchor,
  coffeeRing,
  compassRose,
  explorer,
  flame,
  goodDot,
  marginNote,
  palisade,
  ring,
  ship,
  soldier,
  swords,
  tent,
  tower,
  unknownMark,
  whiteFlag,
} from "./MapArt";
import {
  drawSprite,
  drawSpriteTilted,
  loadSprites,
  sprite,
  SpriteName,
  spriteWidth,
} from "./Sprites";
import { GOOD_COLORS } from "./Text";

export type MapMode = "nation" | "terrain" | "economy" | "people";

export interface ChartLabel {
  text: string;
  x: number;
  y: number;
  kind: "sea" | "land";
  angle: number;
}

export interface Geo {
  width: number;
  height: number;
  arcs: number[][];
  rings: number[][][];
  rivers: number[][];
  /** Land beyond the board (South America), half-cell, delta-encoded. */
  backdrop?: number[][];
  labels?: ChartLabel[];
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
const UNKNOWN_FILL = "#d6cfba";

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

/** The map's shapes, fetched once and shared by everything that draws it. */
let geoPromise: Promise<Geo> | null = null;
export function loadGeo(): Promise<Geo> {
  geoPromise ??= import("../data/americas-geo.json?url").then(async (m) => {
    const res = await fetch(m.default);
    return (await res.json()) as Geo;
  });
  return geoPromise;
}

/** Each province's outline as a path, for drawing small maps. */
export function provincePaths(geo: Geo): Path2D[] {
  const arcs = geo.arcs.map(decodeArc);
  return geo.rings.map((rings) => {
    const path = new Path2D();
    for (const ring of rings) {
      let first = true;
      for (const ref of ring) {
        const a = arcs[ref >= 0 ? ref : ~ref];
        const reversed = ref < 0;
        const n = a.pts.length / 2;
        for (let k = 0; k < n; k++) {
          const i = reversed ? n - 1 - k : k;
          if (first) {
            path.moveTo(a.pts[i * 2], a.pts[i * 2 + 1]);
            first = false;
          } else if (k > 0) path.lineTo(a.pts[i * 2], a.pts[i * 2 + 1]);
        }
      }
      path.closePath();
    }
    return path;
  });
}

/** Delta-encoded half-cell points to map units. */
function decodeHalf(raw: number[]): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < raw.length; i += 2) {
    x += raw[i];
    y += raw[i + 1];
    out.push([x / 2, y / 2]);
  }
  return out;
}

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface MapCallbacks {
  click(p: number | null, army: Army | null, e: PointerEvent): void;
  /** `at`: where on the page, for a popup there. */
  rightClick(p: number | null, at: { x: number; y: number }): void;
  hover(p: number | null): void;
}

export interface Overlay {
  state: GameState;
  me: number;
  /** Fractional current day, for moving armies smoothly. */
  dayNow: number;
  /** The clock is running (armies on the move march; paused, they halt). */
  running: boolean;
  selectedProv: number | null;
  selectedArmy: number | null;
  /** Province -> real time (ms) of a recent battle there. */
  battles: Map<number, number>;
  /** Where the selected army would go (path preview). */
  preview: number[] | null;
  mode: MapMode;
  /** Open land the player could settle right now. */
  colonizable: Set<number>;
  /** Land the player has surveyed (null: they know everything). */
  explored: Set<number> | null;
}

/** Which figure stands for an army: its most numerous kind of regiment. */
export function figureOf(a: Army): RegType {
  const counts = countRegs(a);
  const order: RegType[] = [
    "militia",
    "regulars",
    "dragoons",
    "artillery",
    "warriors",
    "riders",
  ];
  let best: RegType = a.regs[0]?.type ?? "militia";
  let bestN = -1;
  for (const t of order) {
    const n = counts[t] ?? 0;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/** Coarse water grid for sailing routes (one cell per GRID map units). */
const GRID = 6;

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  view: View = { scale: 0.4, tx: 0, ty: 0 };
  private arcs: DecodedArc[] = [];
  private provPaths: Path2D[] = [];
  /** Where each army was drawn last frame, to ease it along. */
  private armyDrawn = new Map<number, { x: number; y: number; t: number }>();
  private provBox: [number, number, number, number][] = [];
  private coast = new Path2D();
  private borders = new Path2D();
  private nationBorders = new Path2D();
  private rivers = new Path2D();
  private backdrop = new Path2D();
  /** All the board's land, and its land by kind of country. */
  private land = new Path2D();
  private terrainPaths: Partial<Record<Terrain, Path2D>> = {};
  /** Where two neighbours' shared border is, for marching between them. */
  private borderMid = new Map<string, [number, number]>();
  /** Routes for single hops (by land through the border, by sea round it). */
  private hops = new Map<string, [number, number][]>();
  private patterns = new Map<string, CanvasPattern>();
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
  private longPress = 0;
  overlay: Overlay | null = null;
  needsDraw = true;

  // The cached chart.
  private base = document.createElement("canvas");
  private bctx = this.base.getContext("2d")!;
  private baseView: View | null = null;
  private baseDpr = 1;
  private baseMargin = 0;
  private baseDirty = true;
  private lastBaseAt = -1e9;
  private viewChangedAt = 0;

  // Sailing routes, by port.
  private water: Uint8Array | null = null;
  private gw = 0;
  private gh = 0;
  private routes = new Map<number, [number, number][]>();

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
    loadSprites(() => this.markDirty());
    // Names are drawn in the period types; redraw once they've loaded.
    void document.fonts?.ready.then(() => this.markDirty());
  }

  /** Something on the chart changed (owners, buildings, the view mode). */
  markDirty(): void {
    this.baseDirty = true;
    this.needsDraw = true;
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
    const borderLen = new Map<string, number>();
    for (const a of this.arcs) {
      const target = a.left < 0 || a.right < 0 ? this.coast : this.borders;
      this.addArc(target, a);
      // The middle of the longest stretch of border two provinces share.
      if (a.left >= 0 && a.right >= 0) {
        const key = pairOf(a.left, a.right);
        const n = a.pts.length / 2;
        if (n > (borderLen.get(key) ?? 0)) {
          borderLen.set(key, n);
          const i = Math.floor(n / 2) * 2;
          this.borderMid.set(key, [a.pts[i], a.pts[i + 1]]);
        }
      }
    }
    this.provPaths.forEach((path, p) => {
      this.land.addPath(path);
      const t = this.map.provinces[p].terrain;
      const kind: Terrain | null =
        t === "jungle" ? "forest" : t === "tundra" ? null : t;
      if (kind && kind !== "plains" && kind !== "desert") {
        (this.terrainPaths[kind] ??= new Path2D()).addPath(path);
      }
    });
    for (const r of this.geo.rivers) {
      const pts = decodeHalf(r);
      pts.forEach(([x, y], i) =>
        i === 0 ? this.rivers.moveTo(x, y) : this.rivers.lineTo(x, y),
      );
    }
    for (const r of this.geo.backdrop ?? []) {
      const pts = decodeHalf(r);
      pts.forEach(([x, y], i) =>
        i === 0 ? this.backdrop.moveTo(x, y) : this.backdrop.lineTo(x, y),
      );
      this.backdrop.closePath();
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
      // One name per stretch of joined-up land, as big as that land allows:
      // a pair of trading posts doesn't get a name across half the sea.
      const name = s.nations[n].name.replace(/^the /, "").toUpperCase();
      const clusters = this.clusters(provs);
      clusters.sort((a, b) => this.areaOf(b) - this.areaOf(a));
      clusters.forEach((cl, i) => {
        const area = this.areaOf(cl);
        if (i > 0 && cl.length < 3) return;
        const label = this.curveLabel(name, cl, s.nations[n].color);
        if (!label) return;
        // Letters no taller than the land is wide.
        label.size = Math.min(label.size, Math.sqrt(area) * 0.32);
        this.nationLabels.push(label);
      });
    }
    this.nationLabels.sort((a, b) => b.length - a.length);
  }

  /** Provinces split into groups joined over land. */
  private clusters(provs: number[]): number[][] {
    const set = new Set(provs);
    const seen = new Set<number>();
    const out: number[][] = [];
    for (const p of provs) {
      if (seen.has(p)) continue;
      const group: number[] = [];
      const queue = [p];
      seen.add(p);
      while (queue.length) {
        const u = queue.pop()!;
        group.push(u);
        for (const [q] of this.map.provinces[u].nb)
          if (set.has(q) && !seen.has(q)) {
            seen.add(q);
            queue.push(q);
          }
      }
      out.push(group);
    }
    return out;
  }

  /** Rough area of some provinces, in square map units. */
  private areaOf(provs: number[]): number {
    let a = 0;
    for (const p of provs) {
      const b = this.provBox[p];
      a += (b[2] - b[0]) * (b[3] - b[1]) * 0.6;
    }
    return a;
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
      const d = this.map.provinces[p];
      sw += r;
      mx += d.x * r;
      my += d.y * r;
      return { x: d.x, y: d.y, w: r, r };
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

  // ---------------------------------------------------------------- sea routes

  /** Which coarse cells are water, from the drawn land itself. */
  private buildWater(): void {
    const gw = Math.ceil(this.geo.width / GRID);
    const gh = Math.ceil(this.geo.height / GRID);
    const c = document.createElement("canvas");
    c.width = gw;
    c.height = gh;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.setTransform(1 / GRID, 0, 0, 1 / GRID, 0, 0);
    x.fillStyle = "#000";
    for (const p of this.provPaths) x.fill(p, "evenodd");
    x.fill(this.backdrop);
    const data = x.getImageData(0, 0, gw, gh).data;
    const water = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) water[i] = data[i * 4 + 3] < 40 ? 1 : 0;
    this.water = water;
    this.gw = gw;
    this.gh = gh;
  }

  /** The nearest water cell to a point, or -1. */
  private nearestWater(x: number, y: number): number {
    if (!this.water) this.buildWater();
    const water = this.water!;
    const gw = this.gw;
    const gh = this.gh;
    const px = Math.floor(x / GRID);
    const py = Math.floor(y / GRID);
    for (let r = 0; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = px + dx;
          const cy = py + dy;
          if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
          if (water[cy * gw + cx]) return cy * gw + cx;
        }
    }
    return -1;
  }

  /** Pull a chain of water cells tight: keep only the turns. */
  private tighten(cells: number[]): [number, number][] {
    const water = this.water!;
    const gw = this.gw;
    const clear = (a: number, b: number) => {
      const ax = a % gw;
      const ay = (a - ax) / gw;
      const bx = b % gw;
      const by = (b - bx) / gw;
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let i = 1; i < steps; i++) {
        const x = Math.round(ax + ((bx - ax) * i) / steps);
        const y = Math.round(ay + ((by - ay) * i) / steps);
        if (!water[y * gw + x]) return false;
      }
      return true;
    };
    const kept = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !clear(cells[i], cells[j])) j--;
      kept.push(cells[j]);
      i = j;
    }
    return kept.map((c) => {
      const x = c % gw;
      return [(x + 0.5) * GRID, ((c - x) / gw + 0.5) * GRID];
    });
  }

  /** A route over water between two places, never crossing land. */
  private waterRoute(
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): [number, number][] | null {
    const start = this.nearestWater(ax, ay);
    const goal = this.nearestWater(bx, by);
    if (start < 0 || goal < 0) return null;
    const water = this.water!;
    const gw = this.gw;
    const gh = this.gh;
    const prev = new Int32Array(gw * gh).fill(-2);
    prev[start] = -1;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      if (c === goal) break;
      const x = c % gw;
      const y = (c - x) / gw;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (!water[n] || prev[n] !== -2) continue;
          prev[n] = c;
          queue.push(n);
        }
    }
    if (prev[goal] === -2) return null;
    const cells: number[] = [];
    for (let c = goal; c >= 0; c = prev[c]) cells.push(c);
    cells.reverse();
    return [[ax, ay], ...this.tighten(cells), [bx, by]];
  }

  /**
   * The way between two provinces for one hop: overland through the middle
   * of their shared border, or by sea round the coast.
   */
  private hopPath(from: number, to: number, sea: boolean): [number, number][] {
    const key = `${from}>${to}${sea ? "s" : ""}`;
    const cached = this.hops.get(key);
    if (cached) return cached;
    const a = this.map.provinces[from];
    const b = this.map.provinces[to];
    let path: [number, number][] = [
      [a.x, a.y],
      [b.x, b.y],
    ];
    if (sea) path = this.waterRoute(a.x, a.y, b.x, b.y) ?? path;
    else {
      const mid = this.borderMid.get(pairOf(from, to));
      if (mid)
        path = [
          [a.x, a.y],
          [mid[0], mid[1]],
          [b.x, b.y],
        ];
    }
    this.hops.set(key, path);
    return path;
  }

  /** A port's route out to Europe (east, or round the Horn), in map units. */
  private routeFrom(port: number): [number, number][] {
    const cached = this.routes.get(port);
    if (cached) return cached;
    if (!this.water) this.buildWater();
    const water = this.water!;
    const gw = this.gw;
    const gh = this.gh;
    const def = this.map.provinces[port];
    const px = Math.floor(def.x / GRID);
    const py = Math.floor(def.y / GRID);
    // Nearest water to the port.
    let start = -1;
    for (let r = 0; r < 40 && start < 0; r++) {
      for (let dy = -r; dy <= r && start < 0; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
          if (water[y * gw + x]) {
            start = y * gw + x;
            break;
          }
        }
    }
    const route: [number, number][] = [[def.x, def.y]];
    if (start < 0) {
      this.routes.set(port, route);
      return route;
    }
    const prev = new Int32Array(gw * gh).fill(-2);
    prev[start] = -1;
    const queue = [start];
    let end = -1;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % gw;
      const y = (c - x) / gw;
      if (x === gw - 1 || y === gh - 1) {
        end = c;
        break;
      }
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (!water[n] || prev[n] !== -2) continue;
          prev[n] = c;
          queue.push(n);
        }
    }
    if (end < 0) {
      this.routes.set(port, route);
      return route;
    }
    const cells: number[] = [];
    for (let c = end; c >= 0; c = prev[c]) cells.push(c);
    cells.reverse();
    // Pull the string tight: skip ahead while the straight line stays at sea.
    const clear = (a: number, b: number) => {
      const ax = a % gw;
      const ay = (a - ax) / gw;
      const bx = b % gw;
      const by = (b - bx) / gw;
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let i = 1; i < steps; i++) {
        const x = Math.round(ax + ((bx - ax) * i) / steps);
        const y = Math.round(ay + ((by - ay) * i) / steps);
        if (!water[y * gw + x]) return false;
      }
      return true;
    };
    let i = 0;
    const kept = [cells[0]];
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !clear(cells[i], cells[j])) j--;
      kept.push(cells[j]);
      i = j;
    }
    for (const c of kept) {
      const x = c % gw;
      const y = (c - x) / gw;
      route.push([(x + 0.5) * GRID, (y + 0.5) * GRID]);
    }
    // Sail on past the edge.
    const last = route[route.length - 1];
    route.push(
      last[0] >= (gw - 1) * GRID
        ? [last[0] + 200, last[1]]
        : [last[0], last[1] + 200],
    );
    this.routes.set(port, route);
    return route;
  }

  // ---------------------------------------------------------------- view

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.baseView = null;
    this.viewMoved();
  }

  private viewMoved(): void {
    this.viewChangedAt = performance.now();
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
    this.viewMoved();
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
        { x: e.clientX, y: e.clientY },
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
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      this.pointers.set(e.pointerId, { x, y });
      if (this.pointers.size === 1) {
        this.dragStart = { x: e.clientX, y: e.clientY, moved: false };
        // Hold a finger down: the same as a right-click (march there).
        if (e.pointerType !== "mouse") {
          clearTimeout(this.longPress);
          this.longPress = window.setTimeout(() => {
            if (this.dragStart && !this.dragStart.moved) {
              this.dragStart.moved = true;
              this.cb.rightClick(this.provinceAt(x, y), {
                x: e.clientX,
                y: e.clientY,
              });
            }
          }, 550);
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          scale: this.view.scale,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
        if (this.dragStart) this.dragStart.moved = true;
        clearTimeout(this.longPress);
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
        ) {
          this.dragStart.moved = true;
          clearTimeout(this.longPress);
        }
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
      clearTimeout(this.longPress);
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

  // ---------------------------------------------------------------- the chart (cached)

  private fillFor(s: GameState, p: number, o: Overlay): string {
    const prov = s.provinces[p];
    const def = this.map.provinces[p];
    switch (o.mode) {
      case "terrain":
        return TERRAIN_TINT[def.terrain];
      case "economy": {
        if (o.explored && !o.explored.has(p)) return UNKNOWN_FILL;
        const good = this.world.raw[p];
        let value = 0;
        for (const v of Object.values(prov.made)) value += v ?? 0;
        if (prov.owner < 0 || value <= 0)
          return mix(GOOD_COLORS[good], prov.rich ? 0.55 : 0.78);
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

  /** Is the cached chart good for the current view as it is? */
  private baseFits(): { sameScale: boolean; covered: boolean } {
    const b = this.baseView;
    const v = this.view;
    if (!b) return { sameScale: false, covered: false };
    const sameScale = Math.abs(b.scale - v.scale) < 1e-9;
    const m = this.baseMargin;
    const covered =
      sameScale && Math.abs(v.tx - b.tx) <= m && Math.abs(v.ty - b.ty) <= m;
    return { sameScale, covered };
  }

  /** A repeating texture, made once per canvas. */
  private pattern(
    name: SpriteName,
    c: CanvasRenderingContext2D,
  ): CanvasPattern | null {
    const img = sprite(name);
    if (!img) return null;
    const key = `${name}${c === this.ctx ? "@screen" : "@chart"}`;
    let pat = this.patterns.get(key);
    if (!pat) {
      pat = c.createPattern(img, "repeat") ?? undefined;
      if (!pat) return null;
      this.patterns.set(key, pat);
    }
    return pat;
  }

  /**
   * Lay a texture over some provinces (in map units), keeping it the same
   * size on screen however far in you are.
   */
  private texture(
    c: CanvasRenderingContext2D,
    name: SpriteName,
    scale: number,
    size: number,
    alpha: number,
    visible: (p: number) => boolean,
    which: (p: number) => boolean,
  ): void {
    const pat = this.pattern(name, c);
    if (!pat) return;
    pat.setTransform(new DOMMatrix().scaleSelf(size / scale, size / scale));
    c.save();
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = alpha;
    c.fillStyle = pat;
    for (let p = 0; p < this.provPaths.length; p++)
      if (visible(p) && which(p)) c.fill(this.provPaths[p], "evenodd");
    c.restore();
  }

  private renderBase(o: Overlay, now: number): void {
    const s = o.state;
    const v = { ...this.view };
    this.refreshOwners(s);
    const m = Math.round(Math.max(this.cssWidth, this.cssHeight) * 0.3);
    const bd = Math.min(this.dpr, 1.5);
    const bw = Math.ceil((this.cssWidth + 2 * m) * bd);
    const bh = Math.ceil((this.cssHeight + 2 * m) * bd);
    if (this.base.width !== bw || this.base.height !== bh) {
      this.base.width = bw;
      this.base.height = bh;
    }
    this.baseView = v;
    this.baseMargin = m;
    this.baseDpr = bd;
    this.baseDirty = false;
    this.lastBaseAt = now;
    const c = this.bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bw, bh);
    const mapT = () =>
      c.setTransform(
        bd * v.scale,
        0,
        0,
        bd * v.scale,
        bd * (v.tx + m),
        bd * (v.ty + m),
      );
    const screenT = () => c.setTransform(bd, 0, 0, bd, bd * m, bd * m);
    // What's in the cached area, in map units.
    const x0 = (-m - v.tx) / v.scale;
    const y0 = (-m - v.ty) / v.scale;
    const x1 = (this.cssWidth + m - v.tx) / v.scale;
    const y1 = (this.cssHeight + m - v.ty) / v.scale;
    const visible = (p: number) => {
      const b = this.provBox[p];
      return !(b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1);
    };
    const sx = (x: number) => x * v.scale + v.tx;
    const sy = (y: number) => y * v.scale + v.ty;
    const onScreen = (x: number, y: number, pad = 30) =>
      x > -m - pad &&
      y > -m - pad &&
      x < this.cssWidth + m + pad &&
      y < this.cssHeight + m + pad;

    mapT();
    c.lineJoin = "round";
    c.lineCap = "round";
    // The world beyond the board: South America, hatched, unplayable.
    c.fillStyle = "#cfc3a2";
    c.fill(this.backdrop);
    c.save();
    c.clip(this.backdrop);
    c.strokeStyle = "rgba(90,70,45,0.18)";
    c.lineWidth = 1.2 / v.scale;
    c.beginPath();
    const step = 7 / v.scale;
    for (let x = x0 - (y1 - y0); x < x1; x += step) {
      c.moveTo(x, y1);
      c.lineTo(x + (y1 - y0), y0);
    }
    c.stroke();
    c.restore();
    // Shallow water along the coast, as on old charts.
    c.strokeStyle = "rgba(160, 205, 215, 0.3)";
    c.lineWidth = 9 / v.scale;
    c.stroke(this.coast);
    c.stroke(this.backdrop);
    c.strokeStyle = "rgba(190, 225, 230, 0.3)";
    c.lineWidth = 4 / v.scale;
    c.stroke(this.coast);

    for (let p = 0; p < this.provPaths.length; p++) {
      if (!visible(p)) continue;
      c.fillStyle = this.fillFor(s, p, o);
      c.fill(this.provPaths[p], "evenodd");
      if (this.map.provinces[p].areaKm2 < 4000 && v.scale < 3) {
        c.strokeStyle = c.fillStyle;
        c.lineWidth = 2.5 / v.scale;
        c.stroke(this.provPaths[p]);
      }
    }
    // Enemy-held land: hatched in the occupier's colour.
    if (o.mode === "nation") {
      for (let p = 0; p < this.provPaths.length; p++) {
        const prov = s.provinces[p];
        if (prov.occupier < 0 || !visible(p)) continue;
        c.save();
        c.clip(this.provPaths[p], "evenodd");
        c.strokeStyle = s.nations[prov.occupier].color;
        c.globalAlpha = 0.75;
        c.lineWidth = 2.2 / v.scale;
        const b = this.provBox[p];
        const hs = 9 / v.scale;
        c.beginPath();
        for (let x = b[0] - (b[3] - b[1]); x < b[2]; x += hs) {
          c.moveTo(x, b[3]);
          c.lineTo(x + (b[3] - b[1]), b[1]);
        }
        c.stroke();
        c.restore();
      }
    }
    // Paper grain over the land, and the lie of the country drawn on it.
    this.texture(c, "paper", v.scale, 0.5, 0.55, visible, () => true);
    const terrainAlpha =
      o.mode === "terrain" ? 0.6 : o.mode === "nation" ? 0.24 : 0;
    if (terrainAlpha > 0) {
      for (const kind of ["forest", "hills", "mountains", "marsh"] as const) {
        this.texture(c, kind, v.scale, 0.42, terrainAlpha, visible, (p) => {
          const t = this.map.provinces[p].terrain;
          return t === kind || (kind === "forest" && t === "jungle");
        });
      }
    }
    c.strokeStyle = "rgba(70, 55, 35, 0.22)";
    c.lineWidth = Math.max(0.5, 0.8 / v.scale);
    c.stroke(this.borders);
    c.strokeStyle = "rgba(82, 130, 160, 0.75)";
    c.lineWidth = Math.min(1.2, 1.1 / v.scale);
    c.stroke(this.rivers);
    if (o.mode === "nation") {
      c.strokeStyle = "rgba(45, 32, 20, 0.8)";
      c.lineWidth = 1.9 / v.scale;
      c.stroke(this.nationBorders);
    }
    c.strokeStyle = "rgba(25, 45, 55, 0.9)";
    c.lineWidth = 1.2 / v.scale;
    c.stroke(this.coast);
    c.stroke(this.backdrop);

    // ---- the chart-maker's marks, in map units
    const W = this.geo.width;
    const H = this.geo.height;
    compassRose(c, W * 0.88, H * 0.68, 40);
    coffeeRing(c, W * 0.13, H * 0.8, 70);
    for (const l of this.geo.labels ?? []) {
      c.save();
      c.translate(l.x, l.y);
      c.rotate((l.angle * Math.PI) / 180);
      const size = l.kind === "land" ? 20 : 16;
      c.font = `italic ${size}px "IM Fell English", Georgia, serif`;
      c.fillStyle =
        l.kind === "land" ? "rgba(90,70,45,0.55)" : "rgba(225,238,240,0.42)";
      c.textAlign = "center";
      c.textBaseline = "middle";
      const letters = [...l.text];
      const spread = size * 0.35;
      const widths = letters.map((ch) => c.measureText(ch).width);
      let at =
        -(widths.reduce((a, b) => a + b, 0) + spread * (letters.length - 1)) /
        2;
      letters.forEach((ch, i) => {
        c.fillText(ch, at + widths[i] / 2, 0);
        at += widths[i] + spread;
      });
      c.restore();
    }

    // ---- names and marks, in screen pixels
    screenT();
    if (o.mode === "nation") this.drawNationLabels(c, v, m);
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (v.scale >= 1.1 || o.mode !== "nation") {
      c.font = `${v.scale > 3 ? 13 : 11}px "IM Fell English", Georgia, serif`;
      for (let p = 0; p < this.provPaths.length; p++) {
        const def = this.map.provinces[p];
        const b = this.provBox[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y, 80)) continue;
        if ((b[2] - b[0]) * v.scale < def.name.length * 6) continue;
        c.fillStyle = "rgba(45,32,20,0.82)";
        c.fillText(def.name, x, y + 14);
      }
    }
    if (o.mode === "economy" && v.scale >= 0.7) {
      for (let p = 0; p < this.provPaths.length; p++) {
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y)) continue;
        if (o.explored && !o.explored.has(p)) unknownMark(c, x, y - 4);
        else goodDot(c, x, y - 4, GOOD_COLORS[this.world.raw[p]]);
      }
    }
    if (o.colonizable.size) {
      c.lineWidth = 1.6;
      for (const p of o.colonizable) {
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y, 20)) continue;
        c.strokeStyle = "rgba(35,95,50,0.95)";
        c.fillStyle = "rgba(235,250,225,0.8)";
        c.beginPath();
        c.arc(x, y - 2, 7, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(x - 3.5, y - 2);
        c.lineTo(x + 3.5, y - 2);
        c.moveTo(x, y - 5.5);
        c.lineTo(x, y + 1.5);
        c.stroke();
      }
    }
    // Towns, villages and forts, drawn as the old chart-makers did.
    const townH = Math.max(15, Math.min(46, 8 + v.scale * 10));
    const showTowns = o.mode === "nation" || o.mode === "terrain";
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      const def = this.map.provinces[p];
      const x = sx(def.x);
      const y = sy(def.y);
      if (!onScreen(x, y)) continue;
      if (showTowns && prov.owner >= 0) {
        const nation = s.nations[prov.owner];
        const capital = nation.capital === p;
        if (v.scale >= 1.05 || (capital && v.scale >= 0.5)) {
          const native = nation.kind === "native";
          const big = capital || settlers(prov) >= 2500;
          const name: SpriteName = native
            ? "nativeVillage"
            : big
              ? "townBig"
              : "townSmall";
          const h = native ? townH * 0.75 : big ? townH : townH * 0.85;
          const tx = x - townH * 0.4;
          // A patch of cleared ground under it, so it stands off the colour.
          if (sprite(name)) {
            const w = spriteWidth(name, h);
            c.fillStyle = "rgba(246,236,206,0.6)";
            c.beginPath();
            c.ellipse(tx, y + 1, w * 0.58, h * 0.2, 0, 0, Math.PI * 2);
            c.fill();
          }
          if (!drawSprite(c, name, tx, y + 2, h) && v.scale >= 2.2) {
            if (prov.b.fort) tower(c, x - 8, y + 27, prov.b.fort);
          }
          if (prov.b.fort && sprite("fort") && v.scale >= 1.4)
            drawSprite(c, "fort", tx - townH * 0.55, y + 6, townH * 0.55);
          if (prov.b.tradingpost && v.scale >= 2)
            drawSprite(c, "tradingPost", x + townH * 0.5, y + 8, townH * 0.5);
          if (prov.b.port && v.scale >= 2.2) anchor(c, x + 4, y + 27);
          // A ribbon in the owner's colours under a capital.
          if (capital && !native) {
            c.fillStyle = nation.color;
            c.strokeStyle = "rgba(30,20,10,0.6)";
            c.lineWidth = 1;
            c.beginPath();
            c.roundRect(tx - 6, y + 3, 12, 3, 1.5);
            c.fill();
            c.stroke();
          }
        }
      }
      if (prov.outpost)
        palisade(
          c,
          x + 12,
          y + 6,
          Math.max(10, Math.min(18, 6 * v.scale)),
          s.nations[prov.outpost.by].color,
        );
      if (prov.mods.some((md) => md.key === "revolt")) {
        flame(c, x + 14, y - 10);
        if (v.scale >= 0.8)
          marginNote(c, x + 34, y - 30, "in open revolt!", x + 14, y - 12);
      }
    }
  }

  /** Nation names along their curves, letter-spaced to span the land. */
  private drawNationLabels(
    c: CanvasRenderingContext2D,
    v: View,
    m: number,
  ): void {
    const placed: [number, number, number, number][] = [];
    for (const l of this.nationLabels) {
      const raw = l.size * v.scale;
      const sizePx = Math.min(64, raw);
      if (sizePx < 10) continue;
      // Zoomed right in, a name is a few scattered letters: let it fade so the
      // towns and provinces read instead.
      const alpha = Math.min(1, Math.max(0, 1 - (raw - 70) / 50));
      if (alpha < 0.05) continue;
      const pts = l.samples.map(
        ([x, y]) =>
          [x * v.scale + v.tx, y * v.scale + v.ty] as [number, number],
      );
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
      if (
        x1 < -m ||
        y1 < -m ||
        x0 > this.cssWidth + m ||
        y0 > this.cssHeight + m
      )
        continue;
      if (placed.some((r) => r[0] < x1 && x0 < r[2] && r[1] < y1 && y0 < r[3]))
        continue;
      placed.push([x0, y0, x1, y1]);
      const seg: number[] = [0];
      for (let i = 1; i < pts.length; i++)
        seg.push(
          seg[i - 1] +
            Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
        );
      const total = seg[seg.length - 1];
      c.font = `${sizePx}px "IM Fell English SC", "IM Fell English", Georgia, serif`;
      const widths = [...l.name].map((ch) => c.measureText(ch).width);
      const textW = widths.reduce((acc, x) => acc + x, 0);
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
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      c.lineWidth = Math.max(2, sizePx / 7);
      c.strokeStyle = "rgba(250,242,220,0.55)";
      c.fillStyle = darken(l.color, 0.55, 0.78);
      c.globalAlpha = alpha;
      [...l.name].forEach((ch, i) => {
        const [x, y, ang] = pointAt(at + widths[i] / 2);
        c.save();
        c.translate(x, y);
        c.rotate(ang);
        c.strokeText(ch, 0, 0);
        c.fillText(ch, 0, 0);
        c.restore();
        at += widths[i] + spacing;
      });
      c.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- every frame

  /** Where an army is drawn right now, in map units, and which way it faces. */
  private armySpot(a: Army, dayNow: number): [number, number, number] {
    const from = this.map.provinces[a.prov];
    if (a.depart < 0 || a.path.length === 0) return [from.x, from.y, 0];
    const t = Math.max(
      0,
      Math.min(1, (dayNow - a.depart) / Math.max(1, a.arrive - a.depart)),
    );
    return this.along(this.hopPath(a.prov, a.path[0], a.sea), t);
  }

  /** A point along a route at fraction t, and the heading there. */
  private along(
    route: [number, number][],
    t: number,
  ): [number, number, number] {
    const lens: number[] = [0];
    for (let i = 1; i < route.length; i++)
      lens.push(
        lens[i - 1] +
          Math.hypot(
            route[i][0] - route[i - 1][0],
            route[i][1] - route[i - 1][1],
          ),
      );
    const total = lens[lens.length - 1] || 1;
    const d = Math.max(0, Math.min(1, t)) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const k = (d - lens[i - 1]) / Math.max(0.001, lens[i] - lens[i - 1]);
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    return [
      ax + (bx - ax) * k,
      ay + (by - ay) * k,
      Math.atan2(by - ay, bx - ax),
    ];
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
    // Engraved swell on the sea, drifting slowly while time runs.
    const sea = this.pattern("sea", ctx);
    if (sea) {
      const k = 0.45;
      const drift = Math.sin(now / 4200) * 6;
      sea.setTransform(
        new DOMMatrix()
          .translateSelf(v.tx + drift, v.ty + Math.cos(now / 5300) * 3)
          .scaleSelf(k, k),
      );
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      ctx.globalAlpha = 1;
    }
    if (!o) return;
    const s = o.state;

    // The chart: redraw it if it's out of date and the moment is right,
    // otherwise move the picture we have.
    const fit = this.baseFits();
    const settled = now - this.viewChangedAt > 140;
    const stale = this.baseDirty || !fit.covered;
    if (stale) {
      const urgent =
        !this.baseView ||
        (!fit.covered && fit.sameScale && now - this.lastBaseAt > 200);
      const due = settled
        ? now - this.lastBaseAt > (this.baseDirty && fit.covered ? 300 : 0)
        : false;
      if (urgent || due) {
        this.renderBase(o, now);
      }
    }
    const b = this.baseView!;
    const k = v.scale / b.scale;
    const m = this.baseMargin;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.base,
      k * (-m - b.tx) + v.tx,
      k * (-m - b.ty) + v.ty,
      (k * this.base.width) / this.baseDpr,
      (k * this.base.height) / this.baseDpr,
    );

    // Hover and selection, in map units.
    ctx.setTransform(
      dpr * v.scale,
      0,
      0,
      dpr * v.scale,
      dpr * v.tx,
      dpr * v.ty,
    );
    if (this.hovered !== null) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill(this.provPaths[this.hovered], "evenodd");
    }
    if (o.selectedProv !== null) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff8e1";
      ctx.lineWidth = 3.2 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
      ctx.strokeStyle = "rgba(20,20,20,0.85)";
      ctx.lineWidth = 1 / v.scale;
      ctx.stroke(this.provPaths[o.selectedProv]);
    }

    // Screen-space overlays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x: number) => x * v.scale + v.tx;
    const sy = (y: number) => y * v.scale + v.ty;
    const onScreen = (x: number, y: number, pad = 30) =>
      x > -pad &&
      y > -pad &&
      x < this.cssWidth + pad &&
      y < this.cssHeight + pad;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const day = o.dayNow;
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      if (!prov.colony && !prov.siege) continue;
      const def = this.map.provinces[p];
      const x = sx(def.x);
      const y = sy(def.y);
      if (!onScreen(x, y)) continue;
      if (prov.colony) {
        const cl = prov.colony;
        ring(
          ctx,
          x,
          y - 2,
          9,
          s.nations[cl.by].color,
          (day - cl.start) / Math.max(1, cl.done - cl.start),
        );
        tent(ctx, x, y - 2);
      }
      if (prov.siege) {
        ring(
          ctx,
          x,
          y - 30,
          9,
          s.nations[prov.siege.by].color,
          prov.siege.progress / 100,
        );
        swords(ctx, x, y - 30, 5, "#3b2b1a");
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
      swords(
        ctx,
        sx(def.x) + 16,
        sy(def.y) - 16,
        8 + 2 * Math.sin(age / 120),
        "#7a1d14",
      );
      ctx.globalAlpha = 1;
    }

    // Ships on their way to Europe and back.
    const figure = Math.max(13, Math.min(30, 9 + v.scale * 5));
    for (const n of s.nations) {
      if (n.kind !== "power" || !n.alive) continue;
      for (const cv of n.convoys) {
        const span = Math.max(1, cv.arrive - cv.departed);
        const t = (day - cv.departed) / span;
        // A quarter of the voyage is on the map: sailing out, or coming in.
        const onMap = cv.out ? t / 0.25 : (t - 0.75) / 0.25;
        if (onMap < 0 || onMap > 1) continue;
        const route = this.routeFrom(cv.port);
        if (route.length < 2) continue;
        const [mx, my, ang] = this.along(route, cv.out ? onMap : 1 - onMap);
        const x = sx(mx);
        const y = sy(my);
        if (!onScreen(x, y, 40)) continue;
        const heading = cv.out ? ang : ang + Math.PI;
        if (!this.drawShip(ctx, x, y, figure * 1.25, heading, n.color, now))
          ship(ctx, x, y, figure * 0.8, heading, n.color, now);
      }
    }

    // Parties out in the wilds (yours).
    if (o.me >= 0) {
      for (const ms of s.nations[o.me]?.missions ?? [])
        this.drawMission(ms, day, figure, now, s.nations[o.me].color, sx, sy);
    }

    // Path of the selected army, and the preview of a move.
    const sel =
      o.selectedArmy !== null
        ? s.armies.find((a) => a.id === o.selectedArmy)
        : undefined;
    const drawPath = (
      from: [number, number, number],
      start: number,
      path: number[],
      color: string,
    ) => {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx(from[0]), sy(from[1]));
      let at = start;
      for (const q of path) {
        // By sea where the step can't be walked.
        const walk = this.map.provinces[at].nb.some(([x]) => x === q);
        const way = this.hopPath(at, q, !walk);
        for (const [px, py] of way.slice(1)) ctx.lineTo(sx(px), sy(py));
        at = q;
      }
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
      drawPath(
        this.smoothSpot(sel, day),
        sel.depart >= 0 ? sel.path[0] : sel.prov,
        sel.depart >= 0 ? sel.path.slice(1) : sel.path,
        "rgba(255,250,235,0.95)",
      );
    if (sel && o.preview?.length) {
      const [first, ...rest] = o.preview;
      const moving = sel.depart >= 0 && sel.path.length > 0;
      drawPath(
        this.smoothSpot(sel, day),
        moving ? first : sel.prov,
        moving ? rest : o.preview,
        "rgba(255,215,110,0.95)",
      );
    }

    // Where your armies (and enemies you can see) are marching: a line of
    // dashes that flows toward the destination while the clock runs.
    for (const a of s.armies) {
      if (a.depart < 0 || a.path.length === 0) continue;
      if (a.id === o.selectedArmy) continue;
      const mine = a.owner === o.me;
      const hostile =
        o.me >= 0 &&
        s.wars.some(
          (w) =>
            (w.a === o.me && w.b === a.owner) ||
            (w.b === o.me && w.a === a.owner),
        );
      if (!mine && !hostile) continue;
      this.drawMarchLine(
        a,
        day,
        mine ? "rgba(255,248,226,0.85)" : "rgba(214,64,44,0.85)",
        o.running ? now : 0,
        sx,
        sy,
      );
    }

    // Armies: a soldier of their main kind, with a tag for how many men.
    this.armyHits = [];
    const stacks = new Map<string, number>();
    const sorted = [...s.armies].sort(
      (a, c) =>
        Number(a.owner === o.me) - Number(c.owner === o.me) || a.id - c.id,
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
      const [mx, my, heading] = this.smoothSpot(a, day);
      let x = sx(mx);
      const y = sy(my);
      if (!onScreen(x, y, 40)) continue;
      const key = `${Math.round(x / 10)},${Math.round(y / 10)}`;
      const slot = stacks.get(key) ?? 0;
      stacks.set(key, slot + 1);
      x += slot * (figure * 0.9);
      const nation = s.nations[a.owner];
      const moving = a.depart >= 0 && a.path.length > 0;
      const marching = moving && o.running;
      const dir = moving && Math.cos(heading) < 0 ? -1 : 1;
      const stepPhase = marching ? Math.sin(now / 110 + a.id) : 0;
      const h = important ? figure : figure * 0.75;
      const selected = a.id === o.selectedArmy;
      if (selected) {
        ctx.strokeStyle = "#fff6c8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(x, y + 1, h * 0.55, h * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (a.sea) {
        if (!this.drawShip(ctx, x, y, h * 1.3, heading, nation.color, now))
          ship(ctx, x, y, h * 0.8, dir > 0 ? 0 : Math.PI, nation.color, now);
      } else if (
        !(moving
          ? this.drawColumn(
              ctx,
              x,
              y,
              h,
              figureOf(a),
              nation.color,
              heading,
              marching ? now : null,
              a.id,
            )
          : this.drawTroop(ctx, x, y, h, figureOf(a), nation.color, dir < 0))
      )
        soldier(
          ctx,
          x,
          y + (moving ? Math.abs(stepPhase) * -1 : 0),
          h,
          figureOf(a),
          nation.color,
          dir,
          stepPhase,
        );
      // How many men, on a tag beside them.
      const men = armyMen(a);
      const label = important
        ? men >= 1000
          ? `${(men / 1000).toFixed(1)}k`
          : `${Math.round(men)}`
        : "";
      let tagW = 0;
      if (label) {
        ctx.font = "700 10px 'Alegreya Sans', system-ui, sans-serif";
        tagW = ctx.measureText(label).width + 8;
        // Ahead of a marching column, so it doesn't sit on the men behind.
        const tx = moving && dir < 0 ? x - h * 0.42 - tagW : x + h * 0.42;
        const ty = y - h * 0.95;
        ctx.fillStyle = nation.color;
        ctx.strokeStyle = mine
          ? "#fbf3dc"
          : hostile
            ? "#e04a35"
            : "rgba(20,20,20,0.6)";
        ctx.lineWidth = mine || hostile ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tagW, 13, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 2.2;
        ctx.textAlign = "center";
        ctx.strokeText(label, tx + tagW / 2, ty + 7);
        ctx.fillText(label, tx + tagW / 2, ty + 7);
        // Morale under your own.
        if (mine && v.scale >= 1.2) {
          const morale =
            a.regs.reduce((acc, r) => acc + r.morale * r.men, 0) /
            Math.max(1, men);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(tx, ty + 14, tagW, 3);
          ctx.fillStyle = morale > 0.5 ? "#7fc36b" : "#e0a03a";
          ctx.fillRect(tx, ty + 14, tagW * morale, 3);
        }
      }
      if (a.retreating) whiteFlag(ctx, x - h * 0.5, y - h * 1.1);
      this.armyHits.push({
        army: a,
        x: x - h * 0.45,
        y: y - h * 1.15,
        w: h * 0.9 + tagW,
        h: h * 1.2,
      });
    }

    // Keep drawing until the chart has caught up with the view.
    const after = this.baseFits();
    this.needsDraw = this.baseDirty || !after.covered;
  }

  /**
   * Where an army is drawn this frame: its place on the route, eased from
   * where it was drawn last so it glides rather than hops when a new day's
   * news arrives. A big jump (a new route, a retreat) snaps straight there.
   */
  private smoothSpot(a: Army, day: number): [number, number, number] {
    const want = this.armySpot(a, day);
    const was = this.armyDrawn.get(a.id);
    const t = performance.now();
    if (!was) {
      this.armyDrawn.set(a.id, { x: want[0], y: want[1], t });
      return want;
    }
    const gap = Math.hypot(want[0] - was.x, want[1] - was.y);
    const dt = Math.min(0.25, (t - was.t) / 1000);
    const k = gap > 40 ? 1 : 1 - Math.exp(-dt * 10);
    const x = was.x + (want[0] - was.x) * k;
    const y = was.y + (want[1] - was.y) * k;
    this.armyDrawn.set(a.id, { x, y, t });
    return [x, y, want[2]];
  }

  /** The rest of a moving army's route, its dashes flowing toward the end. */
  private drawMarchLine(
    a: Army,
    day: number,
    color: string,
    now: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
  ): void {
    const ctx = this.ctx;
    const [x0, y0] = this.smoothSpot(a, day);
    const pts: [number, number][] = [[x0, y0]];
    let at = a.prov;
    a.path.forEach((q, i) => {
      const walk = this.map.provinces[at].nb.some(([x]) => x === q);
      const way = this.hopPath(at, q, i === 0 ? a.sea : !walk);
      // The first hop: only the part still ahead.
      const from =
        i === 0
          ? Math.max(
              1,
              Math.ceil(
                way.length *
                  Math.max(
                    0,
                    Math.min(
                      1,
                      (day - a.depart) / Math.max(1, a.arrive - a.depart),
                    ),
                  ),
              ),
            )
          : 1;
      for (const p of way.slice(from)) pts.push(p);
      at = q;
    });
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A dark under-stroke so the dashes read on any colour.
    ctx.strokeStyle = "rgba(30,20,10,0.35)";
    ctx.lineWidth = 3.4;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -(now / 45) % 14;
    ctx.beginPath();
    ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
    for (const [px, py] of pts.slice(1)) ctx.lineTo(sx(px), sy(py));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.setLineDash([]);
    // An arrowhead at the destination.
    const [ex, ey] = pts[pts.length - 1];
    const [px, py] = pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(sy(ey) - sy(py), sx(ex) - sx(px));
    const hx = sx(ex);
    const hy = sy(ey);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(30,20,10,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(ang) * 6, hy + Math.sin(ang) * 6);
    ctx.lineTo(hx + Math.cos(ang + 2.5) * 6, hy + Math.sin(ang + 2.5) * 6);
    ctx.lineTo(hx + Math.cos(ang - 2.5) * 6, hy + Math.sin(ang - 2.5) * 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * An army on the march: a short column of its soldiers in step, swaying as
   * they walk, kicking up dust behind them. `now` is null while the clock is
   * stopped, and the column halts mid-stride.
   */
  private drawColumn(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    kind: RegType,
    color: string,
    heading: number,
    now: number | null,
    seed: number,
  ): boolean {
    const name: SpriteName =
      kind === "riders" ? "dragoons" : (kind as SpriteName);
    if (!sprite(name)) return false;
    const tall: Record<string, number> = {
      militia: 1.45,
      regulars: 1.35,
      dragoons: 1.45,
      artillery: 0.95,
      warriors: 1.6,
    };
    const size = h * (tall[name] ?? 1.4) * 0.86;
    const flip = Math.cos(heading) < 0;
    // Screen direction of travel (the map's y runs down, like the screen's).
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    const count = name === "artillery" ? 2 : 3;
    const gap = h * (name === "dragoons" ? 0.8 : 0.62);
    const t = now ?? 0;
    const pace = name === "dragoons" ? 85 : 120;
    // Dust behind the last man.
    if (now !== null) {
      const bx = x - ux * gap * (count - 0.4);
      const by = y - uy * gap * (count - 0.4);
      for (let k = 0; k < 3; k++) {
        const age = (t / 700 + k / 3 + seed * 0.37) % 1;
        const r = h * (0.1 + age * 0.22);
        ctx.fillStyle = `rgba(196,170,120,${(0.38 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          bx - ux * age * h * 0.5 + (k - 1) * h * 0.08,
          by - uy * age * h * 0.5 - age * h * 0.18,
          r * 1.3,
          r * 0.7,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    // Their colours on the ground, stretched under the whole file.
    const cx = x - ux * gap * ((count - 1) / 2);
    const cy = y - uy * gap * ((count - 1) / 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(25,15,8,0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      h * 0.5 + Math.abs(ux) * gap * (count - 1) * 0.5,
      h * 0.17 + Math.abs(uy) * gap * (count - 1) * 0.35,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    // Back to front, so nearer men overlap those behind.
    const men = Array.from({ length: count }, (_, i) => {
      const step = Math.sin(t / pace + i * 2.1 + seed);
      return {
        x: x - ux * gap * i,
        y: y - uy * gap * i,
        bob: now === null ? 0 : -Math.abs(step) * h * 0.11,
        tilt: now === null ? 0 : step * 0.09,
      };
    }).sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.shadowColor = "rgba(252,244,222,0.95)";
    ctx.shadowBlur = 2.5;
    for (const m of men)
      drawSpriteTilted(
        ctx,
        name,
        m.x,
        m.y + h * 0.05 + m.bob,
        size,
        flip,
        m.tilt,
      );
    ctx.restore();
    return true;
  }

  /** A soldier of an army's main kind standing on its colours. */
  private drawTroop(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    kind: RegType,
    color: string,
    flip: boolean,
  ): boolean {
    const name: SpriteName =
      kind === "riders" ? "dragoons" : (kind as SpriteName);
    if (!sprite(name)) return false;
    const tall: Record<string, number> = {
      militia: 1.45,
      regulars: 1.35,
      dragoons: 1.45,
      artillery: 0.95,
      warriors: 1.6,
    };
    const size = h * (tall[name] ?? 1.4);
    // Their colours on the ground.
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(25,15,8,0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, h * 0.5, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = "rgba(252,244,222,0.95)";
    ctx.shadowBlur = 2.5;
    drawSprite(ctx, name, x, y + h * 0.05, size, flip);
    ctx.restore();
    return true;
  }

  /** A ship under sail, its pennant in the owner's colour. */
  private drawShip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    heading: number,
    color: string,
    now: number,
  ): boolean {
    const small = h < 26;
    const name: SpriteName = small ? "shipSmall" : "ship";
    if (!sprite(name)) return false;
    const flip = Math.cos(heading) < 0;
    const roll = Math.sin(now / 700 + x * 0.05) * 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    // Wake.
    ctx.strokeStyle = "rgba(235,245,245,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const back = flip ? 1 : -1;
    ctx.moveTo(back * h * 0.15, h * 0.02);
    ctx.quadraticCurveTo(back * h * 0.5, h * 0.06, back * h * 0.8, h * 0.02);
    ctx.stroke();
    ctx.shadowColor = "rgba(252,244,222,0.9)";
    ctx.shadowBlur = 3;
    drawSprite(ctx, name, 0, h * 0.12, h, flip);
    ctx.shadowBlur = 0;
    // A pennant at the masthead.
    const mx = flip ? h * 0.05 : -h * 0.05;
    const my = -h * 0.82;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(25,15,8,0.7)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + (flip ? -1 : 1) * h * 0.32, my + h * 0.06);
    ctx.lineTo(mx, my + h * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  private drawMission(
    ms: Mission,
    day: number,
    size: number,
    now: number,
    color: string,
    sx: (x: number) => number,
    sy: (y: number) => number,
  ): void {
    const ctx = this.ctx;
    let t: number;
    if (ms.stage === "out")
      t = (day - ms.start) / Math.max(1, ms.arrive - ms.start);
    else t = 1 - (day - ms.arrive) / Math.max(1, ms.home - ms.arrive);
    t = Math.max(0, Math.min(1, t));
    const route = ms.route?.length ? ms.route : [ms.from, ms.target];
    const sea = ms.sea ?? [];
    const legs = ms.legs?.length ? ms.legs : [1];
    const total = legs.reduce((a, b) => a + b, 0) || 1;
    // The way, dotted, hop by hop.
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = "rgba(43,29,18,0.65)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < route.length - 1; i++) {
      const way = this.hopPath(route[i], route[i + 1], sea[i] ?? false);
      way.forEach(([px, py], k) =>
        k === 0 && i === 0
          ? ctx.moveTo(sx(px), sy(py))
          : ctx.lineTo(sx(px), sy(py)),
      );
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Which hop they're on, and how far along it.
    let at = t * total;
    let hop = 0;
    while (hop < legs.length - 1 && at > legs[hop]) {
      at -= legs[hop];
      hop++;
    }
    const frac = Math.max(0, Math.min(1, at / Math.max(0.001, legs[hop])));
    const bySea = sea[hop] ?? false;
    const way =
      route.length > 1
        ? this.hopPath(route[hop], route[hop + 1], bySea)
        : [
            [this.map.provinces[ms.from].x, this.map.provinces[ms.from].y] as [
              number,
              number,
            ],
          ];
    const [mx, my, ang] =
      way.length > 1 ? this.along(way, frac) : [way[0][0], way[0][1], 0];
    const x = sx(mx);
    const y = sy(my);
    const back = ms.stage === "back";
    const flip = Math.cos(ang) < 0 !== back;
    ctx.save();
    ctx.shadowColor = "rgba(252,244,222,0.95)";
    ctx.shadowBlur = 2.5;
    const drawn = bySea
      ? drawSprite(ctx, "canoe", x, y + size * 0.15, size * 0.75, flip)
      : drawSprite(ctx, "explorer", x, y, size * 1.4, flip);
    ctx.restore();
    if (!drawn)
      explorer(
        ctx,
        x,
        y,
        size * 0.85,
        color,
        flip ? -1 : 1,
        Math.sin(now / 140 + ms.id),
      );
    // Their colours on a little flag.
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(25,15,8,0.7)";
    ctx.lineWidth = 1;
    const fx = x + (flip ? -1 : 1) * size * 0.35;
    const fy = y - size * (bySea ? 0.7 : 1.45);
    ctx.beginPath();
    ctx.moveTo(fx, fy + size * 0.5);
    ctx.lineTo(fx, fy);
    ctx.lineTo(fx + size * 0.32, fy + size * 0.08);
    ctx.lineTo(fx, fy + size * 0.18);
    ctx.stroke();
    ctx.fill();
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

function pairOf(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function darken(hex: string, amount: number, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))},${alpha})`;
}
