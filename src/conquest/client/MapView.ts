// Derpy Conquest's map: provinces, borders, rivers, armies, ships and what's
// going on, drawn on a canvas you can drag and zoom (mouse, trackpad or
// fingers). Four ways to look at it: by nation (names stretched across
// their land, as on old maps), by terrain, by what the land makes, and by
// people.
//
// It's drawn in two layers, on two canvases stacked one over the other.
// The chart itself (sea, land, borders, names, ports, and the fog over
// country you don't know) is drawn once into an offscreen canvas and only
// redrawn when something on it changes or the view settles somewhere new;
// the bottom canvas just shows that picture, moved while you drag or zoom.
// Things that move (armies, ships, parties, smoke) are drawn on the top
// canvas, as often as the device can comfortably manage, and only where
// you can see them.

import { dateOf } from "../engine/Calendar";
import { isWinter, type World } from "../engine/Map";
import { armyMen, countRegs, people, settlers } from "../engine/Queries";
import type {
  Army,
  Character,
  GameState,
  MapDef,
  Mission,
  RegType,
  Terrain,
  Travel,
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
  loadSprites,
  sprite,
  SpriteName,
  spriteWidth,
} from "./Sprites";
import { GOOD_COLORS } from "./Text";
import {
  drawCanoe,
  drawCattle,
  drawPackTrain,
  drawRider,
  drawSloop,
  drawWagon,
  drawWalker,
  FigureColors,
  figureColorsOf,
} from "./Walkers";

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
/** WORLD r11: country you've never seen, and land off the board. */
const FOG_FILL = "#604e39";
const CLOSED_FILL = "#3e352b";

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
  /** `person`: a played character's token, if one was clicked. */
  click(
    p: number | null,
    army: Army | null,
    e: PointerEvent,
    person: number | null,
  ): void;
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
  /** Played characters: you and the other players. */
  lives?: LifeMark[];
  /** The road you'd take to the province you're looking at. */
  road?: { from: number; path: number[]; sea: boolean[] } | null;
  /** The clock's speed (1 to 4), for how quickly feet move. */
  speed?: number;
  /**
   * WORLD r11: what you know and see (null: everything, as when watching).
   * Unknown country lies under fog; known country shows as last seen; only
   * what's in sight shows what moves there.
   */
  fog?: MapFog | null;
  /** WORLD r11: the places your leads point to. */
  leads?: { p: number; found: boolean; working: boolean }[];
}

/** WORLD r11: a life's knowledge of the map, for drawing. */
export interface MapFog {
  known: Set<number>;
  seen: Set<number>;
  /** Who held a province as far as you know (-1 open), or null if unknown. */
  owner: (p: number) => number | null;
  /** Changes when what's known or seen does (to redraw the chart). */
  key: string;
}

/** A played character on the map: a portrait medallion, walking or sailing. */
export interface LifeMark {
  c: number;
  p: number;
  travel: Travel | null;
  /** Marching with (or leading) this army: drawn with it. */
  army: number;
  /** The frame colour they chose. */
  frame: string;
  /** Their likeness. */
  face: string | null;
  label: string;
  you: boolean;
  /** What they wear, for their walking figure. */
  colors: FigureColors;
  female: boolean;
  native: boolean;
  /** Riding (a horse of their own, or their coach). */
  mounted?: boolean;
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
  private personHits: { c: number; x: number; y: number; r: number }[] = [];
  /** Where each walker is in their stride, and when it was last moved on. */
  private strides = new Map<string, { phase: number; t: number }>();
  /** The month the chart's season was drawn for. */
  private seasonMonth = -1;
  /** Points along the coasts where the sea breaks, in map units. */
  private wavePts: [number, number, number][] | null = null;
  /** Open water off each coastal town, for its boats: [province, x, y]. */
  private harbourPts: [number, number, number][] | null = null;
  private faces = new Map<string, HTMLImageElement>();
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
  /** WORLD r11: the bottom canvas showing the chart, and what it last showed. */
  private chartCanvas: HTMLCanvasElement;
  private cctx: CanvasRenderingContext2D;
  private chartShown: { view: View; stamp: number } | null = null;
  private baseStamp = 0;
  /** How long the moving things took to draw lately, in ms (a running average). */
  frameCost = 0;
  /** Draw more simply: the device is struggling (no soft halos). */
  lowPower = false;
  /** Things on the move drawn last frame (they want a quicker frame rate). */
  movers = 0;
  /** At most this often (ms) is the chart redrawn for a change on it (not for a new view). */
  chartEvery = 300;
  /** Pictures drawn at the size they're shown, with their halo, to stamp quickly. */
  private stamps = new Map<string, HTMLCanvasElement | null>();
  /** Clothes of the people on the roads, worked out once each. */
  private dress = new Map<number, FigureColors>();
  /** The last chart key: owners, towns, fog. */
  private chartKey = "";

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
    this.chartCanvas = document.createElement("canvas");
    this.chartCanvas.className = "cq-map-chart";
    this.chartCanvas.setAttribute("aria-hidden", "true");
    this.cctx = this.chartCanvas.getContext("2d", { alpha: false })!;
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

  /** WORLD r11: put both canvases (the chart under, the moving things over) into `host`. */
  mount(host: HTMLElement): void {
    if (this.chartCanvas.parentElement !== host)
      host.appendChild(this.chartCanvas);
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
  }

  /**
   * WORLD r11: whether the chart needs redrawing for this state: owners,
   * towns, forts and posts, revolts, colonies-to-be, and what you know.
   * Cheap enough to ask on every update; the chart is redrawn only when it
   * changed, not whenever any number in a nation does.
   */
  chartChanged(
    s: GameState,
    mode: MapMode,
    fog: MapFog | null | undefined,
  ): boolean {
    const parts: (string | number)[] = [mode, fog?.key ?? "-"];
    for (let p = 0; p < s.provinces.length; p++) {
      const pr = s.provinces[p];
      const folk = pr.owner >= 0 ? settlers(pr) : 0;
      parts.push(
        pr.owner,
        pr.occupier,
        pr.colony ? 1 : 0,
        pr.outpost ? pr.outpost.by + 1 : 0,
        pr.b.fort ?? 0,
        pr.b.tradingpost ?? 0,
        pr.b.port ?? 0,
        folk >= 2500 ? 2 : folk >= 300 ? 1 : 0,
        pr.mods.some((m) => m.key === "revolt") ? 1 : 0,
      );
      if (mode === "economy")
        parts.push(
          pr.rich ? 1 : 0,
          Math.round(
            Object.values(pr.made).reduce((a, b) => a + (b ?? 0), 0) / 4,
          ),
        );
      if (mode === "people") parts.push(Math.round(Math.sqrt(people(pr))));
    }
    for (const n of s.nations) parts.push(n.color, n.name, n.capital);
    const key = parts.join(",");
    if (key === this.chartKey) return false;
    this.chartKey = key;
    return true;
  }

  /** WORLD r11: a person's clothes for their walking figure, worked out once. */
  colorsOf(c: Character | undefined, native: boolean): FigureColors {
    if (!c) return figureColorsOf(c, native);
    let col = this.dress.get(c.id);
    if (!col) {
      if (this.dress.size > 800) this.dress.clear();
      col = figureColorsOf(c, native);
      this.dress.set(c.id, col);
    }
    return col;
  }

  /**
   * WORLD r11: a sprite drawn standing on (x, y), `h` tall, from a small
   * picture made once at that size (with its pale halo). Scaling the big
   * painted sprite down and blurring a halo on every frame was the map's
   * single dearest job.
   */
  private stamp(
    ctx: CanvasRenderingContext2D,
    name: SpriteName,
    x: number,
    y: number,
    h: number,
    flip: boolean,
    halo: number,
    k = this.dpr,
  ): boolean {
    const img = sprite(name);
    if (!img) return false;
    const hh = Math.max(4, Math.round(h * 2) / 2);
    const key = `${name}|${hh}|${flip ? 1 : 0}|${halo}|${k}`;
    let c = this.stamps.get(key);
    if (c === undefined) {
      if (this.stamps.size > 300) this.stamps.clear();
      const w = (img.naturalWidth / img.naturalHeight) * hh;
      const pad = Math.ceil(halo * 2 + 2);
      c = document.createElement("canvas");
      c.width = Math.ceil((w + pad * 2) * k);
      c.height = Math.ceil((hh + pad * 2) * k);
      const x2 = c.getContext("2d");
      if (!x2) c = null;
      else {
        x2.setTransform(k, 0, 0, k, 0, 0);
        if (halo > 0) {
          x2.shadowColor = "rgba(252,244,222,0.95)";
          x2.shadowBlur = halo * k;
        }
        if (flip) {
          x2.translate(pad + w, pad);
          x2.scale(-1, 1);
          x2.drawImage(img, 0, 0, w, hh);
        } else x2.drawImage(img, pad, pad, w, hh);
      }
      this.stamps.set(key, c);
    }
    if (!c) return drawSprite(ctx, name, x, y, h, flip);
    const cw = c.width / k;
    const ch = c.height / k;
    const pad = (ch - hh) / 2;
    const scale = h / hh;
    ctx.drawImage(
      c,
      x - (cw * scale) / 2,
      y - (hh + pad) * scale,
      cw * scale,
      ch * scale,
    );
    return true;
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
  private refreshOwners(s: GameState, fog?: MapFog | null): void {
    // Owners as far as you know: unknown country has none to draw.
    const ownerOf = (p: number) =>
      this.map.provinces[p]?.closed
        ? -2
        : fog
          ? (fog.owner(p) ?? -2)
          : s.provinces[p].owner;
    const owners = s.provinces.map((_, p) => ownerOf(p));
    const key = owners.join(",");
    if (key === this.ownersKey) return;
    this.ownersKey = key;
    this.nationBorders = new Path2D();
    for (const a of this.arcs) {
      if (a.left < 0 || a.right < 0) continue;
      if (owners[a.left] === -2 || owners[a.right] === -2) continue;
      if (owners[a.left] !== owners[a.right])
        this.addArc(this.nationBorders, a);
    }
    // Nation names stretched along the lie of their land.
    const by = new Map<number, number[]>();
    owners.forEach((owner, i) => {
      if (owner < 0 || s.nations[owner].kind === "crown") return;
      let list = by.get(owner);
      if (!list) by.set(owner, (list = []));
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
    // Phones draw the moving things a little softer: their screens are dense
    // and their processors small.
    const small = Math.min(width, height) <= 520;
    this.dpr = Math.min(small ? 1.5 : 2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    // The chart below at the cached picture's own resolution, so showing it
    // is a straight copy.
    const bd = this.chartDpr();
    this.chartCanvas.width = Math.round(width * bd);
    this.chartCanvas.height = Math.round(height * bd);
    this.chartCanvas.style.width = `${width}px`;
    this.chartCanvas.style.height = `${height}px`;
    this.baseView = null;
    this.chartShown = null;
    this.stamps.clear();
    this.viewMoved();
  }

  /** The chart's resolution: up to 1.5 pixels a point. */
  private chartDpr(): number {
    return Math.min(this.dpr, 1.5);
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
        return this.map.provinces[p].closed ? null : p;
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

  private personAt(cx: number, cy: number): number | null {
    for (let i = this.personHits.length - 1; i >= 0; i--) {
      const h = this.personHits[i];
      if (Math.hypot(cx - h.x, cy - h.y) <= h.r + 3) return h.c;
    }
    return null;
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
        this.cb.click(
          this.provinceAt(x, y),
          this.armyAt(x, y),
          e,
          this.personAt(x, y),
        );
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
    if (def.closed) return CLOSED_FILL;
    if (o.fog && !o.fog.known.has(p)) return FOG_FILL;
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
        const owner = o.fog ? (o.fog.owner(p) ?? -1) : prov.owner;
        const seen = !o.fog || o.fog.seen.has(p);
        if (owner < 0) {
          if (prov.colony && seen)
            return mix(s.nations[prov.colony.by].color, 0.72);
          return TERRAIN_TINT[def.terrain];
        }
        const n = s.nations[owner];
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
    this.refreshOwners(s, o.fog);
    this.baseStamp++;
    const m = Math.round(Math.max(this.cssWidth, this.cssHeight) * 0.3);
    const bd = this.chartDpr();
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

    // WORLD r11: the sea is painted into the chart (it used to be painted
    // over the whole screen every frame).
    screenT();
    const grad = c.createLinearGradient(0, -m, 0, this.cssHeight + m);
    grad.addColorStop(0, OCEAN_TOP);
    grad.addColorStop(1, OCEAN_BOTTOM);
    c.fillStyle = grad;
    c.fillRect(-m, -m, this.cssWidth + 2 * m, this.cssHeight + 2 * m);
    const swell = this.pattern("sea", c);
    if (swell) {
      swell.setTransform(
        new DOMMatrix().translateSelf(v.tx, v.ty).scaleSelf(0.45, 0.45),
      );
      c.globalAlpha = 0.16;
      c.fillStyle = swell;
      c.fillRect(-m, -m, this.cssWidth + 2 * m, this.cssHeight + 2 * m);
      c.globalAlpha = 1;
    }
    const fog = o.fog ?? null;
    const closed = (p: number) => !!this.map.provinces[p].closed;
    /** Land you know (and that's on the board). */
    const knownLand = (p: number) =>
      visible(p) && !closed(p) && (!fog || fog.known.has(p));
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
        if (fog && !fog.seen.has(p)) continue;
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
    this.texture(c, "paper", v.scale, 0.5, 0.55, knownLand, () => true);
    const terrainAlpha =
      o.mode === "terrain" ? 0.6 : o.mode === "nation" ? 0.24 : 0;
    if (terrainAlpha > 0) {
      for (const kind of ["forest", "hills", "mountains", "marsh"] as const) {
        this.texture(c, kind, v.scale, 0.42, terrainAlpha, knownLand, (p) => {
          const t = this.map.provinces[p].terrain;
          return t === kind || (kind === "forest" && t === "jungle");
        });
      }
    }
    // The season: snow lies over winter country; the woods turn in autumn.
    const month = dateOf(Math.floor(o.dayNow)).month;
    this.seasonMonth = month;
    if (o.mode === "nation" || o.mode === "terrain") {
      for (let p = 0; p < this.provPaths.length; p++) {
        if (!knownLand(p)) continue;
        const def = this.map.provinces[p];
        if (isWinter(def.lat, month)) {
          c.fillStyle = "rgba(246,249,252,0.42)";
          c.fill(this.provPaths[p], "evenodd");
        } else if (
          (month === 8 || month === 9) &&
          def.lat > 34 &&
          (def.terrain === "forest" || def.terrain === "hills")
        ) {
          c.fillStyle = "rgba(196,104,40,0.13)";
          c.fill(this.provPaths[p], "evenodd");
        }
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
    // WORLD r11: land off the board, darkened; country nobody's told you of, fogged.
    this.paintClosed(c, v, visible);
    if (fog) this.paintFog(c, v, fog, visible, now);
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
        if (def.closed || (fog && !fog.known.has(p))) continue;
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
        if (def.closed || (fog && !fog.known.has(p))) continue;
        if (o.explored && !o.explored.has(p)) unknownMark(c, x, y - 4);
        else goodDot(c, x, y - 4, GOOD_COLORS[this.world.raw[p]]);
      }
    }
    if (o.colonizable.size) {
      c.lineWidth = 1.6;
      for (const p of o.colonizable) {
        if (fog && !fog.known.has(p)) continue;
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
      if (def.closed || (fog && !fog.known.has(p))) continue;
      // Towns as you last saw them.
      const townOwner = fog ? (fog.owner(p) ?? -1) : prov.owner;
      if (showTowns && townOwner >= 0) {
        const nation = s.nations[townOwner];
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
          if (
            !this.stamp(c, name, tx, y + 2, h, false, 0, bd) &&
            v.scale >= 2.2
          ) {
            if (prov.b.fort) tower(c, x - 8, y + 27, prov.b.fort);
          }
          if (prov.b.fort && sprite("fort") && v.scale >= 1.4)
            this.stamp(
              c,
              "fort",
              tx - townH * 0.55,
              y + 6,
              townH * 0.55,
              false,
              0,
              bd,
            );
          if (prov.b.tradingpost && v.scale >= 2)
            this.stamp(
              c,
              "tradingPost",
              x + townH * 0.5,
              y + 8,
              townH * 0.5,
              false,
              0,
              bd,
            );
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
      if (
        prov.mods.some((md) => md.key === "revolt") &&
        (!fog || fog.seen.has(p))
      ) {
        flame(c, x + 14, y - 10);
        if (v.scale >= 0.8)
          marginNote(c, x + 34, y - 30, "in open revolt!", x + 14, y - 12);
      }
    }
  }

  /** WORLD r11: land off the board (Alaska): dark, hatched, named as unknown. */
  private closedPath: Path2D | null = null;
  private closedAt: [number, number] | null = null;

  private paintClosed(
    c: CanvasRenderingContext2D,
    v: View,
    visible: (p: number) => boolean,
  ): void {
    if (!this.closedPath) {
      this.closedPath = new Path2D();
      let sx = 0;
      let sy = 0;
      let n = 0;
      this.map.provinces.forEach((def, p) => {
        if (!def.closed) return;
        this.closedPath!.addPath(this.provPaths[p]);
        sx += def.x;
        sy += def.y;
        n++;
      });
      this.closedAt = n ? [sx / n, sy / n] : null;
    }
    if (!this.closedAt) return;
    if (!this.map.provinces.some((d, p) => d.closed && visible(p))) return;
    // Over its rivers and borders too: there's nothing there for you.
    c.fillStyle = CLOSED_FILL;
    c.fill(this.closedPath, "evenodd");
    c.save();
    c.clip(this.closedPath, "evenodd");
    const b = this.closedBox();
    c.strokeStyle = "rgba(15,10,6,0.35)";
    c.lineWidth = 1.2 / v.scale;
    c.beginPath();
    const step = 6 / v.scale;
    for (let x = b[0] - (b[3] - b[1]); x < b[2]; x += step) {
      c.moveTo(x, b[3]);
      c.lineTo(x + (b[3] - b[1]), b[1]);
    }
    c.stroke();
    c.restore();
    const [lx, ly] = this.closedAt;
    this.inkLabel(
      c,
      "Terra Incognita",
      lx,
      ly,
      22,
      -8,
      "rgba(222,206,170,0.62)",
    );
  }

  private closedBox(): [number, number, number, number] {
    let b: [number, number, number, number] = [
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
    ];
    this.map.provinces.forEach((def, p) => {
      if (!def.closed) return;
      const q = this.provBox[p];
      b = [
        Math.min(b[0], q[0]),
        Math.min(b[1], q[1]),
        Math.max(b[2], q[2]),
        Math.max(b[3], q[3]),
      ];
    });
    return b;
  }

  /** Spaced italic letters, in map units, as the chart-makers wrote across the land. */
  private inkLabel(
    c: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    angle: number,
    color: string,
  ): void {
    c.save();
    c.translate(x, y);
    c.rotate((angle * Math.PI) / 180);
    c.font = `italic ${size}px "IM Fell English", Georgia, serif`;
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const letters = [...text];
    const spread = size * 0.32;
    const widths = letters.map((ch) => c.measureText(ch).width);
    let at =
      -(widths.reduce((a, w) => a + w, 0) + spread * (letters.length - 1)) / 2;
    letters.forEach((ch, i) => {
      c.fillText(ch, at + widths[i] / 2, 0);
      at += widths[i] + spread;
    });
    c.restore();
  }

  /**
   * WORLD r11: the fog over country you've never seen or heard of: dark
   * parchment, washed and mottled like an old chart's blank spaces, its
   * edge against the known land softened as if the ink had run, with "Terra
   * Incognita" written across the big stretches. The coasts stay crisp.
   * Known country you can't see right now takes a faint sepia veil, so
   * what's near you stands out.
   */
  private paintFog(
    c: CanvasRenderingContext2D,
    v: View,
    fog: MapFog,
    visible: (p: number) => boolean,
    now: number,
  ): void {
    void now;
    const closed = (p: number) => !!this.map.provinces[p].closed;
    const unknownAt = (p: number) => !closed(p) && !fog.known.has(p);
    const unknown: number[] = [];
    const veiled: number[] = [];
    for (let p = 0; p < this.provPaths.length; p++) {
      if (!visible(p) || closed(p)) continue;
      if (!fog.known.has(p)) unknown.push(p);
      else if (!fog.seen.has(p)) veiled.push(p);
    }
    if (veiled.length) {
      const veil = new Path2D();
      for (const p of veiled) veil.addPath(this.provPaths[p]);
      c.fillStyle = "rgba(70,52,30,0.1)";
      c.fill(veil, "evenodd");
    }
    if (!unknown.length) return;
    const path = new Path2D();
    for (const p of unknown) path.addPath(this.provPaths[p]);
    c.fillStyle = FOG_FILL;
    c.fill(path, "evenodd");
    c.save();
    c.clip(path, "evenodd");
    // A wash of cloud and stain, painted once into a tile and laid over
    // the whole fog in one go.
    const cloth = this.fogCloth(c);
    if (cloth) {
      cloth.setTransform(new DOMMatrix().scaleSelf(1.3, 1.3));
      c.fillStyle = cloth;
      c.fill(path, "evenodd");
    }
    const ub = this.boxOf(unknown);
    c.strokeStyle = "rgba(30,22,14,0.09)";
    c.lineWidth = 0.8 / v.scale;
    c.beginPath();
    const step = 4 / v.scale;
    const rise = (ub[3] - ub[1]) * 0.5;
    for (let x = ub[0] - rise; x < ub[2]; x += step) {
      c.moveTo(x, ub[3]);
      c.lineTo(x + rise, ub[1]);
    }
    c.stroke();
    c.restore();
    // The edge where your knowledge runs out: the fog bleeds softly into
    // the known land (land only, so the sea stays clear).
    const edge = new Path2D();
    let edges = 0;
    for (const a of this.arcs) {
      if (a.left < 0 || a.right < 0) continue;
      if (closed(a.left) || closed(a.right)) continue;
      if (unknownAt(a.left) === unknownAt(a.right)) continue;
      if (!visible(a.left) && !visible(a.right)) continue;
      this.addArc(edge, a);
      edges++;
    }
    if (edges) {
      c.save();
      c.clip(this.land);
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const [w, alpha] of [
        [44, 0.1],
        [30, 0.14],
        [18, 0.2],
        [8, 0.3],
      ] as const) {
        c.strokeStyle = `rgba(91,74,54,${alpha})`;
        c.lineWidth = w / v.scale;
        c.stroke(edge);
      }
      c.restore();
    }
    // "Terra Incognita" across the biggest stretches, at a readable size.
    const groups = this.clusters(unknown)
      .map((g) => ({ g, area: this.areaOf(g) }))
      .filter((x) => x.area * v.scale * v.scale > 90000)
      .sort((a, b) => b.area - a.area)
      .slice(0, 2);
    for (const { g, area } of groups) {
      let x = 0;
      let y = 0;
      let wsum = 0;
      for (const p of g) {
        const def = this.map.provinces[p];
        const w = Math.sqrt(def.areaKm2);
        x += def.x * w;
        y += def.y * w;
        wsum += w;
      }
      const px = Math.max(15, Math.min(34, Math.sqrt(area) * 0.06 * v.scale));
      this.inkLabel(
        c,
        "Terra Incognita",
        x / wsum,
        y / wsum,
        px / v.scale,
        -6,
        "rgba(232,216,180,0.42)",
      );
    }
  }

  /** WORLD r11: the fog's mottled wash, a tile made once for the chart's canvas. */
  private cloth: { for: CanvasRenderingContext2D; pat: CanvasPattern } | null =
    null;
  private fogCloth(c: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.cloth?.for === c) return this.cloth.pat;
    const size = 512;
    const t = document.createElement("canvas");
    t.width = size;
    t.height = size;
    const x = t.getContext("2d");
    if (!x) return null;
    for (let i = 0; i < 46; i++) {
      const h = Math.imul(i + 31, 2654435761) >>> 0;
      const cx = h & (size - 1);
      const cy = (h >>> 9) & (size - 1);
      const r = 60 + ((h >>> 18) & 127);
      const tone = i % 3;
      // Drawn wrapped round the edges, so the tile repeats without a seam.
      for (const dx of [-size, 0, size])
        for (const dy of [-size, 0, size]) {
          const bx = cx + dx;
          const by = cy + dy;
          if (bx + r < 0 || bx - r > size || by + r < 0 || by - r > size)
            continue;
          const g = x.createRadialGradient(bx, by, 0, bx, by, r);
          g.addColorStop(
            0,
            tone === 0
              ? "rgba(40,30,19,0.3)"
              : tone === 1
                ? "rgba(160,134,96,0.24)"
                : "rgba(120,98,68,0.16)",
          );
          g.addColorStop(1, "rgba(91,74,54,0)");
          x.fillStyle = g;
          x.fillRect(bx - r, by - r, r * 2, r * 2);
        }
    }
    const pat = c.createPattern(t, "repeat");
    if (!pat) return null;
    this.cloth = { for: c, pat };
    return pat;
  }

  private boxOf(provs: number[]): [number, number, number, number] {
    let b: [number, number, number, number] = [
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
    ];
    for (const p of provs) {
      const q = this.provBox[p];
      b = [
        Math.min(b[0], q[0]),
        Math.min(b[1], q[1]),
        Math.max(b[2], q[2]),
        Math.max(b[3], q[3]),
      ];
    }
    return b;
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
    const t0 = performance.now();
    const o = this.overlay;
    const ctx = this.ctx;
    const v = this.view;
    const dpr = this.dpr;
    // The moving things' canvas starts clear; the chart shows through.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.movers = 0;
    if (!o) return;
    const s = o.state;
    const fog = o.fog ?? null;
    /** In sight (or no fog at all). */
    const inSight = (p: number) => !fog || fog.seen.has(p);
    if (dateOf(Math.floor(o.dayNow)).month !== this.seasonMonth)
      this.baseDirty = true;

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
        ? now - this.lastBaseAt >
          (this.baseDirty && fit.covered ? this.chartEvery : 0)
        : false;
      if (urgent || due) {
        this.renderBase(o, now);
      }
    }
    this.showChart();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      if (!inSight(p)) continue;
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
      if (!inSight(p)) continue;
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
    this.drawAmbience(o, now, sx, sy, onScreen);
    for (const n of s.nations) {
      if (n.kind !== "power" || !n.alive) continue;
      for (const cv of n.convoys) {
        // Your own nation's sailings, and any from a port you can see.
        if (fog && n.id !== o.me && !fog.seen.has(cv.port)) continue;
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
        this.movers++;
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
    const armySeen = (a: Army) =>
      inSight(a.prov) || (a.path.length > 0 && inSight(a.path[0]));
    for (const a of s.armies) {
      if (a.depart < 0 || a.path.length === 0) continue;
      if (a.id === o.selectedArmy) continue;
      if (!armySeen(a)) continue;
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
      if (!armySeen(a)) continue;
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
      if (marching) this.movers++;
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
      } else if (moving) {
        this.drawMarch(
          ctx,
          x,
          y,
          h,
          figureOf(a),
          nation.color,
          heading,
          this.stride(`a${a.id}`, true, o.running, now, o.speed ?? 1),
          nation.kind === "native",
        );
      } else if (
        !this.drawTroop(ctx, x, y, h, figureOf(a), nation.color, dir < 0)
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

    this.drawLeadPins(o, now, sx, sy, onScreen);
    this.drawTravellers(o, day, figure, now, sx, sy, onScreen);
    this.drawLives(o, day, figure, now, sx, sy, onScreen);
    this.drawBirds(o, now);

    // Keep drawing until the chart has caught up with the view.
    const after = this.baseFits();
    this.needsDraw = this.baseDirty || !after.covered;
    // How dear that was, to pace the next frames (and draw more simply).
    const cost = performance.now() - t0;
    this.frameCost = this.frameCost * 0.85 + cost * 0.15;
    if (this.frameCost > 14) this.lowPower = true;
    else if (this.frameCost < 6) this.lowPower = false;
  }

  /**
   * WORLD r11: a pin on each place a lead of yours points to: a wax seal
   * with a cross, gold once something's been found there; it pulses while
   * you're working it.
   */
  private drawLeadPins(
    o: Overlay,
    now: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    onScreen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const ctx = this.ctx;
    for (const l of o.leads ?? []) {
      const def = this.map.provinces[l.p];
      if (!def) continue;
      const x = sx(def.x) + 10;
      const y = sy(def.y) - 18;
      if (!onScreen(x, y, 20)) continue;
      const r = 6.5 + (l.working ? Math.sin(now / 260) * 1.2 : 0);
      ctx.fillStyle = "rgba(30,20,10,0.35)";
      ctx.beginPath();
      ctx.moveTo(x - 3, y + r - 1);
      ctx.lineTo(x, y + r + 7);
      ctx.lineTo(x + 3, y + r - 1);
      ctx.fill();
      ctx.fillStyle = l.found ? "#d9a62e" : "#9e2a1e";
      ctx.strokeStyle = "rgba(40,20,10,0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#fbf1dc";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y - 2.6);
      ctx.lineTo(x + 2.6, y + 2.6);
      ctx.moveTo(x + 2.6, y - 2.6);
      ctx.lineTo(x - 2.6, y + 2.6);
      ctx.stroke();
      if (l.working) this.movers++;
    }
  }

  /** WORLD r11: show the cached chart on the bottom canvas, if the view or the chart changed. */
  private showChart(): void {
    const b = this.baseView;
    if (!b) return;
    const v = this.view;
    const shown = this.chartShown;
    if (
      shown &&
      shown.stamp === this.baseStamp &&
      shown.view.scale === v.scale &&
      shown.view.tx === v.tx &&
      shown.view.ty === v.ty
    )
      return;
    const c = this.cctx;
    const bd = this.chartDpr();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = OCEAN_BOTTOM;
    c.fillRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
    const k = v.scale / b.scale;
    const m = this.baseMargin;
    // Same scale: a straight copy, on whole pixels.
    let x = (k * (-m - b.tx) + v.tx) * bd;
    let y = (k * (-m - b.ty) + v.ty) * bd;
    if (Math.abs(k - 1) < 1e-9) {
      x = Math.round(x);
      y = Math.round(y);
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(
      this.base,
      x,
      y,
      (k * this.base.width * bd) / this.baseDpr,
      (k * this.base.height * bd) / this.baseDpr,
    );
    this.chartShown = { view: { ...v }, stamp: this.baseStamp };
  }

  // ---------------------------------------------------------------- the living

  /**
   * Where a walker is in their stride. It moves on only while they're on
   * the move and the clock runs (faster at higher speeds); standing, the
   * legs come together; paused, they stop mid-step.
   */
  private stride(
    key: string,
    moving: boolean,
    running: boolean,
    now: number,
    speed: number,
  ): number {
    let st = this.strides.get(key);
    if (!st) {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
      st = { phase: ((h >>> 0) % 628) / 100, t: now };
      if (this.strides.size > 600) this.strides.clear();
      this.strides.set(key, st);
    }
    const dt = Math.min(0.1, Math.max(0, (now - st.t) / 1000));
    st.t = now;
    if (moving && running) {
      const cadence = Math.PI * 2 * (0.95 + 0.25 * (speed - 1));
      st.phase += dt * cadence;
    } else if (!moving) {
      const rest = Math.round(st.phase / Math.PI) * Math.PI;
      st.phase += (rest - st.phase) * Math.min(1, dt * 5);
    }
    return st.phase;
  }

  /**
   * An army on the march: a column of its men walking in step, the colours
   * and a drummer at the head (warriors in single file, horsemen at the
   * trot, guns on their carriages), on a patch of their colour.
   */
  private drawMarch(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    kind: RegType,
    color: string,
    heading: number,
    phase: number,
    native: boolean,
  ): void {
    const dir = Math.cos(heading) < 0 ? -1 : 1;
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    const mounted = kind === "dragoons" || kind === "riders";
    const count = kind === "artillery" ? 2 : mounted ? 3 : 5;
    const gap = h * (mounted ? 0.75 : 0.42);
    const cx = x - ux * gap * ((count - 1) / 2);
    const cy = y - uy * gap * ((count - 1) / 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy + 1,
      h * 0.45 + Math.abs(ux) * gap * (count - 1) * 0.55,
      h * 0.14 + Math.abs(uy) * gap * (count - 1) * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    const coat: FigureColors = native
      ? {
          coat: color,
          breeches: "#8a6a48",
          hat: null,
          skin: "#b97c55",
          hair: "#1c140c",
        }
      : kind === "militia"
        ? {
            coat: mixHex(color, "#5a4632", 0.45),
            breeches: "#5a4632",
            hat: "#262019",
            skin: "#e2bb98",
            hair: "#4a3020",
          }
        : {
            coat: color,
            breeches: "#efe6cf",
            hat: "#1c140c",
            skin: "#e2bb98",
            hair: "#efe9dc",
          };
    const men = Array.from({ length: count }, (_, i) => ({
      i,
      x: x - ux * gap * i,
      y: y - uy * gap * i,
    })).sort((a, b) => a.y - b.y);
    ctx.save();
    if (!this.lowPower) {
      ctx.shadowColor = "rgba(252,244,222,0.9)";
      ctx.shadowBlur = 1.5;
    }
    for (const m of men) {
      const p = phase + m.i * 0.18;
      if (mounted)
        drawRider(
          ctx,
          m.x,
          m.y,
          h * 1.25,
          p,
          dir,
          coat,
          m.i % 2 ? "#5a3e28" : "#6b4a2a",
        );
      else if (kind === "artillery") {
        if (m.i === 0)
          drawRider(ctx, m.x, m.y, h * 1.1, p, dir, coat, "#6b4a2a", false);
        else {
          drawWagon(ctx, m.x + dir * h * 0.3, m.y, h * 0.75, p, dir, coat);
        }
      } else
        drawWalker(ctx, m.x, m.y, h * 1.15, p, dir, coat, {
          native,
          soldier: !native && kind !== "militia",
          carry:
            m.i === 0
              ? native
                ? "bow"
                : "flag"
              : m.i === 1 && !native
                ? "drum"
                : "musket",
          flag: color,
        });
    }
    ctx.restore();
  }

  /** Merchants, traders, preachers, messengers: the world on the road. */
  private drawTravellers(
    o: Overlay,
    day: number,
    figure: number,
    now: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    onScreen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const ctx = this.ctx;
    const s = o.state;
    if (this.view.scale < 0.75) return;
    const fog = o.fog;
    for (const t of s.travellers ?? []) {
      if (t.depart < 0 || !t.path.length) continue;
      if (fog && !fog.seen.has(t.prov) && !fog.seen.has(t.path[0])) continue;
      const frac = Math.max(
        0,
        Math.min(1, (day - t.depart) / Math.max(0.5, t.arrive - t.depart)),
      );
      const way = this.hopPath(t.prov, t.path[0], t.sea[0] ?? false);
      const [mx, my, heading] = this.along(way, frac);
      const x = sx(mx);
      const y = sy(my);
      if (!onScreen(x, y, 40)) continue;
      const c = s.chars[t.c];
      const n = c ? s.nations[c.nation] : undefined;
      const native = n?.kind === "native" || c?.religion === "native";
      const dir = Math.cos(heading) < 0 ? -1 : 1;
      const phase = this.stride(`t${t.id}`, true, o.running, now, o.speed ?? 1);
      const col = this.colorsOf(c, native);
      const h = figure * 1.15;
      this.movers++;
      ctx.save();
      if (!this.lowPower) {
        ctx.shadowColor = "rgba(252,244,222,0.85)";
        ctx.shadowBlur = 1.5;
      }
      switch (t.mode) {
        case "ship":
          drawSloop(
            ctx,
            x,
            y,
            h * 1.05,
            now,
            dir,
            n?.color ?? "#efe9dc",
            o.running,
          );
          break;
        case "canoe":
          drawCanoe(ctx, x, y, h, phase, dir, col);
          break;
        case "wagon":
          drawWagon(ctx, x, y, h, phase, dir, col);
          break;
        case "pack":
          drawPackTrain(ctx, x, y, h, phase, dir, col, native);
          break;
        case "horse":
          drawRider(ctx, x, y, h * 1.1, phase, dir, col);
          break;
        default:
          if (t.kind === "drover")
            drawCattle(ctx, x - dir * h * 0.2, y, h, phase, dir);
          drawWalker(ctx, x, y, h, phase, dir, col, {
            female: c?.female,
            native,
            carry:
              t.kind === "pedlar" || t.kind === "family"
                ? "pack"
                : t.kind === "messenger"
                  ? null
                  : "staff",
          });
      }
      ctx.restore();
      if (t.letter && this.view.scale >= 1.2) {
        // A messenger's letter, sealed.
        ctx.fillStyle = "#f2e6c6";
        ctx.strokeStyle = "rgba(40,26,12,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x + dir * 6 - 5, y - h * 1.25, 10, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#9e2a1e";
        ctx.beginPath();
        ctx.arc(x + dir * 6, y - h * 1.25 + 3.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (c) this.personHits.push({ c: c.id, x, y: y - h * 0.5, r: h * 0.5 });
    }
  }

  /** Chimney smoke over the towns, cookfires in the villages, the sea breaking on the coast. */
  private drawAmbience(
    o: Overlay,
    now: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    onScreen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const ctx = this.ctx;
    const v = this.view;
    const s = o.state;
    if (o.mode !== "nation" && o.mode !== "terrain") return;
    const t = now / 1000;
    const fog = o.fog;
    const known = (p: number) =>
      !this.map.provinces[p].closed && (!fog || fog.known.has(p));
    // Waves along the shore (not off land you don't know).
    if (v.scale >= 0.8) {
      const pts = this.waves();
      const near = this.waveShore();
      ctx.strokeStyle = "rgba(240,248,250,0.55)";
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const [wx, wy, seed] = pts[i];
        const x = sx(wx);
        const y = sy(wy);
        if (!onScreen(x, y, 10)) continue;
        if (near[i] >= 0 && !known(near[i])) continue;
        const k = (t / 3.2 + seed) % 1;
        if (k > 0.55) continue;
        const a = Math.sin((k / 0.55) * Math.PI);
        const w = 3 + v.scale * 1.6;
        ctx.globalAlpha = a * 0.7;
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.quadraticCurveTo(x - w / 2, y - 2.2, x, y);
        ctx.quadraticCurveTo(x + w / 2, y + 2.2, x + w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const wind = Math.sin(t / 23) * 0.6 + 0.4;
    // Towns taken by a rising or an enemy, or under siege, burn.
    if (v.scale >= 0.5) {
      const h = Math.max(17, Math.min(44, 8 + v.scale * 10));
      for (let p = 0; p < s.provinces.length; p++) {
        const prov = s.provinces[p];
        const taken = prov.occupier >= 0;
        if (!taken && !prov.siege) continue;
        if (fog && !fog.seen.has(p)) continue;
        const def = this.map.provinces[p];
        const x = sx(def.x);
        const y = sy(def.y);
        if (!onScreen(x, y, 50)) continue;
        const rebels = taken && s.nations[prov.occupier]?.kind === "rebels";
        this.burning(
          x - h * 0.3,
          y - h * 0.15,
          h * (rebels ? 1.15 : 0.9),
          t,
          p,
          wind,
        );
        if (rebels || prov.siege)
          this.burning(x + h * 0.35, y - h * 0.05, h * 0.7, t, p + 3, wind);
      }
    }
    // Boats off the coastal towns: fishing smacks and sloops, canoes off the villages.
    if (v.scale >= 1.2) {
      const h = Math.max(11, Math.min(26, 6 + v.scale * 3.4));
      for (const [p, hx, hy] of this.harbours()) {
        const prov = s.provinces[p];
        if (prov.owner < 0) continue;
        if (fog && !fog.seen.has(p)) continue;
        const nation = s.nations[prov.owner];
        const native = nation.kind === "native";
        if (!native && settlers(prov) < 300) continue;
        const boats = native ? 1 : settlers(prov) >= 2500 ? 2 : 1;
        for (let k = 0; k < boats; k++) {
          const a = t / (native ? 7 : 11) + p * 1.7 + k * Math.PI;
          const r = GRID * (0.5 + k * 0.4);
          const bx = sx(hx + Math.cos(a) * r);
          const by = sy(hy + Math.sin(a) * r * 0.55);
          if (!onScreen(bx, by, 30)) continue;
          const dir = -Math.sin(a) >= 0 ? 1 : -1;
          if (native)
            drawCanoe(ctx, bx, by, h, t * 6 + p, dir, {
              coat: "#8a5a35",
              breeches: "#6b4a2e",
              hat: null,
              skin: "#a8714a",
              hair: "#1d140e",
            });
          else
            drawSloop(
              ctx,
              bx,
              by,
              h * (k ? 0.85 : 1),
              now,
              dir,
              nation.color,
              true,
            );
        }
      }
    }
    if (v.scale < 1.05) return;
    const townH = Math.max(15, Math.min(46, 8 + v.scale * 10));
    for (let p = 0; p < s.provinces.length; p++) {
      const prov = s.provinces[p];
      if (prov.owner < 0) continue;
      if (!known(p)) continue;
      const nation = s.nations[prov.owner];
      const def = this.map.provinces[p];
      const x = sx(def.x);
      const y = sy(def.y);
      if (!onScreen(x, y, 40)) continue;
      const native = nation.kind === "native";
      const tx = x - townH * 0.4;
      if (native) {
        // A cookfire before the lodges.
        const fx = x + townH * 0.12;
        const fy = y + 3;
        const flick =
          0.75 + 0.25 * Math.sin(t * 11 + p) * Math.sin(t * 7.3 + p * 2);
        const g = ctx.createRadialGradient(
          fx,
          fy - 2,
          0,
          fx,
          fy - 2,
          townH * 0.4,
        );
        g.addColorStop(0, `rgba(255,170,70,${(0.45 * flick).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,170,70,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fx, fy - 2, townH * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8742a";
        ctx.beginPath();
        ctx.moveTo(fx - 2.5, fy);
        ctx.quadraticCurveTo(fx - 1, fy - 5 * flick, fx, fy - 7 * flick);
        ctx.quadraticCurveTo(fx + 1, fy - 5 * flick, fx + 2.5, fy);
        ctx.fill();
        ctx.fillStyle = "#ffd36b";
        ctx.beginPath();
        ctx.moveTo(fx - 1.2, fy);
        ctx.quadraticCurveTo(fx, fy - 4 * flick, fx + 1.2, fy);
        ctx.fill();
        for (let k = 0; k < 3; k++) {
          const age = (t / 1.6 + k / 3 + p * 0.37) % 1;
          ctx.fillStyle = `rgba(255,${180 - age * 80},80,${(0.9 * (1 - age)).toFixed(2)})`;
          ctx.fillRect(
            fx + Math.sin(age * 9 + k) * 3,
            fy - 6 - age * townH * 0.6,
            1.2,
            1.2,
          );
        }
        this.smoke(fx, fy - 6, townH * 0.8, t, p, wind, 0.22);
      } else if (settlers(prov) >= 300) {
        const big = nation.capital === p || settlers(prov) >= 2500;
        const h = big ? townH : townH * 0.85;
        this.smoke(tx + h * 0.12, y + 2 - h * 0.82, h, t, p, wind, 0.3);
        if (big)
          this.smoke(
            tx - h * 0.22,
            y + 2 - h * 0.7,
            h * 0.8,
            t,
            p + 7,
            wind,
            0.25,
          );
      }
    }
  }

  /** A house on fire: flickering flames, sparks and a column of black smoke. */
  private burning(
    x: number,
    y: number,
    h: number,
    t: number,
    seed: number,
    wind: number,
  ): void {
    const ctx = this.ctx;
    // Smoke first, behind the flames: thick, dark and leaning with the wind.
    for (let k = 0; k < 6; k++) {
      const age = (t / 3.4 + k / 6 + seed * 0.21) % 1;
      const px =
        x + wind * age * h * 0.9 + Math.sin(age * 4 + seed + k) * h * 0.08;
      const py = y - h * 0.3 - age * h * 1.5;
      const r = h * (0.1 + age * 0.26);
      ctx.fillStyle = `rgba(44,36,32,${(0.55 * (1 - age)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(
      x,
      y - h * 0.15,
      0,
      x,
      y - h * 0.15,
      h * 0.7,
    );
    glow.addColorStop(0, "rgba(255,140,50,0.45)");
    glow.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.15, h * 0.7, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const fx = x + (k - 1) * h * 0.14;
      const flick =
        0.7 +
        0.3 *
          Math.sin(t * (9 + k * 2.3) + seed + k) *
          Math.sin(t * 6.1 + seed * 2 + k);
      const fh = h * (k === 1 ? 0.55 : 0.38) * flick;
      const fw = h * 0.1;
      ctx.fillStyle = "#d9481c";
      ctx.beginPath();
      ctx.moveTo(fx - fw, y);
      ctx.quadraticCurveTo(
        fx - fw * 0.6,
        y - fh * 0.6,
        fx + Math.sin(t * 5 + k) * fw * 0.4,
        y - fh,
      );
      ctx.quadraticCurveTo(fx + fw * 0.6, y - fh * 0.6, fx + fw, y);
      ctx.fill();
      ctx.fillStyle = "#ffc94a";
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.5, y);
      ctx.quadraticCurveTo(fx, y - fh * 0.6, fx + fw * 0.5, y);
      ctx.fill();
    }
    for (let k = 0; k < 4; k++) {
      const age = (t / 1.3 + k / 4 + seed * 0.3) % 1;
      ctx.fillStyle = `rgba(255,${200 - age * 100},90,${(1 - age).toFixed(2)})`;
      ctx.fillRect(
        x + Math.sin(age * 7 + k * 2) * h * 0.2 + wind * age * h * 0.3,
        y - h * 0.4 - age * h * 0.8,
        1.5,
        1.5,
      );
    }
  }

  /** A wisp of smoke rising and drifting with the wind. */
  private smoke(
    x: number,
    y: number,
    h: number,
    t: number,
    seed: number,
    wind: number,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    for (let k = 0; k < 4; k++) {
      const age = (t / 4.2 + k / 4 + seed * 0.13) % 1;
      const px = x + wind * age * h * 0.5 + Math.sin(age * 5 + seed) * h * 0.05;
      const py = y - age * h * 0.9;
      const r = h * (0.05 + age * 0.13);
      ctx.fillStyle = `rgba(232,228,218,${(alpha * (1 - age)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Open water off each coastal province's town, found once. */
  private harbours(): [number, number, number][] {
    if (this.harbourPts) return this.harbourPts;
    if (!this.water) this.buildWater();
    const water = this.water!;
    const gw = this.gw;
    const gh = this.gh;
    const open = (cx: number, cy: number) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= gw || y >= gh || !water[y * gw + x])
            return false;
        }
      return true;
    };
    const out: [number, number, number][] = [];
    this.map.provinces.forEach((def, p) => {
      if (!def.coastal) return;
      const near = this.nearestWater(def.x, def.y);
      if (near < 0) return;
      const nx = near % gw;
      const ny = (near - nx) / gw;
      // The nearest spot of open water within a few cells of the shore.
      for (let r = 0; r <= 6; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (!open(nx + dx, ny + dy)) continue;
            const d = Math.hypot(
              (nx + dx) * GRID - def.x,
              (ny + dy) * GRID - def.y,
            );
            if (d > GRID * 7) continue;
            out.push([
              p,
              (nx + dx) * GRID + GRID / 2,
              (ny + dy) * GRID + GRID / 2,
            ]);
            return;
          }
    });
    this.harbourPts = out;
    return out;
  }

  /** WORLD r11: the coastal province nearest each breaking wave (-1: none near). */
  private waveNear: Int16Array | null = null;
  private waveShore(): Int16Array {
    if (this.waveNear) return this.waveNear;
    const pts = this.waves();
    const coast = this.map.provinces
      .map((d, p) => ({ d, p }))
      .filter(({ d }) => d.coastal || d.closed);
    const out = new Int16Array(pts.length).fill(-1);
    pts.forEach(([x, y], i) => {
      let best = -1;
      let bestD = Infinity;
      for (const { d, p } of coast) {
        const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = p;
        }
      }
      out[i] = best;
    });
    this.waveNear = out;
    return out;
  }

  /** Where the sea breaks: water cells on the coast, a sprinkling of them. */
  private waves(): [number, number, number][] {
    if (this.wavePts) return this.wavePts;
    if (!this.water) this.buildWater();
    const water = this.water!;
    const gw = this.gw;
    const gh = this.gh;
    const out: [number, number, number][] = [];
    for (let y = 1; y < gh - 1; y++)
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        if (!water[i]) continue;
        if (water[i - 1] && water[i + 1] && water[i - gw] && water[i + gw])
          continue;
        const hsh = (Math.imul(i, 2654435761) >>> 0) / 4294967296;
        if (hsh > 0.14) continue;
        out.push([x * GRID + GRID / 2, y * GRID + GRID / 2, hsh * 7.1]);
      }
    this.wavePts = out;
    return out;
  }

  /** Birds: geese going south in autumn and north in spring, gulls the rest of the year. */
  private drawBirds(o: Overlay, now: number): void {
    if (o.mode !== "nation" && o.mode !== "terrain") return;
    const ctx = this.ctx;
    const month = dateOf(Math.floor(o.dayNow)).month;
    const south = month >= 8 && month <= 10;
    const north = month >= 2 && month <= 4;
    const W = this.cssWidth;
    const H = this.cssHeight;
    const flocks = south || north ? 2 : 1;
    ctx.strokeStyle = "rgba(40,30,22,0.55)";
    ctx.lineWidth = 1.2;
    for (let f = 0; f < flocks; f++) {
      const period = 55000 + f * 17000;
      const k = ((now + f * 23000) % period) / period;
      const dx = south ? -1 : 1;
      const x = dx > 0 ? -80 + k * (W + 160) : W + 80 - k * (W + 160);
      const y =
        H * (0.18 + f * 0.27) +
        (south ? k : north ? -k : 0) * H * 0.18 +
        Math.sin(now / 3000 + f) * 12;
      const n = south || north ? 7 : 3;
      for (let b = 0; b < n; b++) {
        const row = Math.ceil(b / 2);
        const side = b % 2 ? 1 : -1;
        const bx = x - dx * row * 11;
        const by = y + side * row * 7;
        const flap = Math.sin(now / 140 + b * 0.9 + f) * 2.6;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by - flap);
        ctx.quadraticCurveTo(bx - 2, by - 1.5, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 1.5, bx + 5, by - flap);
        ctx.stroke();
      }
    }
  }

  /** A likeness, loaded once; null until it's ready. */
  private face(url: string): { pic: CanvasImageSource; ratio: number } | null {
    let img = this.faces.get(url);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.onload = () => (this.needsDraw = true);
      img.src = url;
      this.faces.set(url, img);
    }
    if (!img.complete || img.naturalWidth <= 0) return null;
    // WORLD r11: a painted (SVG) likeness is drawn once into a small picture;
    // drawing the SVG itself on every frame was costly.
    let shot = this.faceShots.get(url);
    if (!shot) {
      const ratio = img.naturalHeight / img.naturalWidth;
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = Math.round(96 * ratio);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      if (this.faceShots.size > 40) this.faceShots.clear();
      shot = { pic: c, ratio };
      this.faceShots.set(url, shot);
    }
    return shot;
  }
  private faceShots = new Map<
    string,
    { pic: CanvasImageSource; ratio: number }
  >();

  /** You and the other players: medallions, walkers and ships, and roads. */
  private drawLives(
    o: Overlay,
    day: number,
    figure: number,
    now: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    onScreen: (x: number, y: number, pad?: number) => boolean,
  ): void {
    const ctx = this.ctx;
    const s = o.state;
    this.personHits = [];
    // The road you'd take, in gold.
    const road = o.road;
    if (road && road.path.length) {
      ctx.setLineDash([3, 6]);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,214,102,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const start = this.map.provinces[road.from];
      ctx.moveTo(sx(start.x), sy(start.y));
      let at = road.from;
      road.path.forEach((q, i) => {
        for (const [px, py] of this.hopPath(at, q, road.sea[i] ?? false).slice(
          1,
        ))
          ctx.lineTo(sx(px), sy(py));
        at = q;
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const m of o.lives ?? []) {
      if (
        !m.you &&
        o.fog &&
        !o.fog.seen.has(m.p) &&
        !(m.travel?.path.length && o.fog.seen.has(m.travel.path[0]))
      )
        continue;
      let mx: number;
      let my: number;
      let walker: "walk" | "sail" | null = null;
      let heading = 0;
      const army =
        m.army >= 0 ? s.armies.find((a) => a.id === m.army) : undefined;
      if (army) {
        [mx, my] = this.smoothSpot(army, day);
        my -= 18 / Math.max(0.5, this.view.scale);
      } else if (m.travel && m.travel.path.length) {
        const t = m.travel;
        const frac = Math.max(
          0,
          Math.min(1, (day - t.depart) / Math.max(0.5, t.arrive - t.depart)),
        );
        const way = this.hopPath(m.p, t.path[0], t.sea[0] ?? false);
        [mx, my, heading] = this.along(way, frac);
        walker = t.sea[0] ? "sail" : "walk";
        this.movers++;
        if (m.you) {
          // The rest of the road, flowing on ahead.
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = o.running ? -((now / 60) % 10) : 0;
          ctx.strokeStyle = "rgba(255,240,200,0.9)";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(sx(mx), sy(my));
          const rest = this.hopPath(m.p, t.path[0], t.sea[0] ?? false);
          const after = rest.filter(
            (_, i) => i / Math.max(1, rest.length - 1) > frac,
          );
          for (const [px, py] of after) ctx.lineTo(sx(px), sy(py));
          let at = t.path[0];
          for (let i = 1; i < t.path.length; i++) {
            for (const [px, py] of this.hopPath(
              at,
              t.path[i],
              t.sea[i] ?? false,
            ).slice(1))
              ctx.lineTo(sx(px), sy(py));
            at = t.path[i];
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      } else {
        const def = this.map.provinces[m.p];
        if (!def) continue;
        mx = def.x;
        my = def.y;
      }
      const x = sx(mx);
      let y = sy(my);
      if (!onScreen(x, y, 50)) continue;
      const flip = Math.cos(heading) < 0;
      const phase = this.stride(
        `p${m.c}`,
        walker === "walk",
        o.running,
        now,
        o.speed ?? 1,
      );
      if (walker === "walk" && m.mounted) {
        ctx.save();
        ctx.shadowColor = "rgba(252,244,222,0.9)";
        ctx.shadowBlur = 2;
        drawRider(
          ctx,
          x,
          y,
          figure * 1.7,
          phase * 1.4,
          flip ? -1 : 1,
          m.colors,
        );
        ctx.restore();
        y -= figure * 1.7 + 8;
      } else if (walker === "walk") {
        ctx.save();
        ctx.shadowColor = "rgba(252,244,222,0.9)";
        ctx.shadowBlur = 2;
        drawWalker(ctx, x, y, figure * 1.5, phase, flip ? -1 : 1, m.colors, {
          female: m.female,
          native: m.native,
          carry: m.native ? "bow" : "staff",
        });
        ctx.restore();
        // The likeness floats clear above the hat.
        y -= figure * 1.5 + 8;
      } else if (walker === "sail") {
        if (m.native)
          drawCanoe(ctx, x, y, figure * 1.2, phase, flip ? -1 : 1, m.colors);
        else
          drawSloop(
            ctx,
            x,
            y,
            figure * 1.25,
            now,
            flip ? -1 : 1,
            m.frame,
            o.running,
          );
        y -= figure * 1.3 + 6;
      } else if (!army) {
        y -= 6;
      }
      // The medallion: their likeness in their frame colour.
      const r = m.you ? 14 : 11;
      const cy = y - r;
      ctx.save();
      ctx.shadowColor = "rgba(20,12,4,0.55)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = m.frame;
      ctx.beginPath();
      ctx.arc(x, cy, r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // A point beneath, pinning it to the spot.
      if (!walker && !army) {
        ctx.fillStyle = m.frame;
        ctx.beginPath();
        ctx.moveTo(x - 5, cy + r);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x + 5, cy + r);
        ctx.fill();
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const img = m.face ? this.face(m.face) : null;
      if (img) {
        // The face sits in the upper middle of a portrait.
        const w = r * 2.3;
        const h = w * img.ratio;
        ctx.drawImage(img.pic, x - w / 2, cy - r * 1.05, w, h);
      } else {
        ctx.fillStyle = "#e9dcb8";
        ctx.fillRect(x - r, cy - r, r * 2, r * 2);
      }
      ctx.restore();
      ctx.strokeStyle = m.you ? "#fff4cf" : "rgba(40,26,12,0.85)";
      ctx.lineWidth = m.you ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(x, cy, r + (m.you ? 1 : 0.5), 0, Math.PI * 2);
      ctx.stroke();
      if (m.label) {
        ctx.font = "700 10px 'Alegreya Sans', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(251,243,220,0.95)";
        ctx.fillStyle = "#2b1d12";
        ctx.strokeText(m.label, x, cy - r - 9);
        ctx.fillText(m.label, x, cy - r - 9);
      }
      this.personHits.push({ c: m.c, x, y: cy, r: r + 3 });
    }
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
    this.stamp(ctx, name, x, y + h * 0.05, size, flip, 2.5);
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
    this.stamp(ctx, name, 0, h * 0.12, h, flip, 3);
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
    const drawn = bySea
      ? this.stamp(ctx, "canoe", x, y + size * 0.15, size * 0.75, flip, 2.5)
      : this.stamp(ctx, "explorer", x, y, size * 1.4, flip, 2.5);
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

/** Two colours mixed: `k` of the second. */
function mixHex(a: string, b: string, k: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a);
  const pb = /^#?([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (sh: number) =>
    Math.round(((na >> sh) & 255) * (1 - k) + ((nb >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
