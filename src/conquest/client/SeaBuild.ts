// MAP (r12): works out the harbours and sea lanes the map's boats use, from
// the chart's own shapes. Run by scripts/conquest/build-sea.mjs, which
// writes src/conquest/data/americas-sea.json; the tests use it to check
// that every lane in that file keeps to the water. The browser never runs
// it (it only reads the file), so it can afford a fine grid.
//
// The water is a grid of one cell per map unit: a cell is water if its
// centre is off the land the chart draws. Some rivers on the chart (the St.
// Lawrence above Quebec, the James, the Hudson's mouth) are only a chain of
// pools a cell or less across, touching at their corners; so gaps of a
// cell or two between waters count as passable too ("narrows"), at a high
// price, which a route only pays where there's no other way.

import type { ChartArc, SeaData, SeaGeo, SeaProvince } from "./Harbours";
import {
  decodeArc,
  decodeHalf,
  encodeHalf,
  projectLatLon,
  smoothPts,
} from "./Harbours";

/** Bodies of water smaller than this many cells get no harbours (ponds). */
const MIN_BODY = 40;
/** Distance from land that counts as open water. */
const OPEN = 3;
/** How far moorings may lie from their landing. */
const HARBOUR_REACH = 7;
/** What a step through the narrows costs, over a step at sea. */
const NARROWS_COST = 30;
/** Strips of land up to this many cells across between two waters are narrows. */
const NARROWS_GAP = 6;

/**
 * Where the great ports really were, for provinces whose town (drawn at the
 * middle of their land) lies away from them: the landing is put on the
 * shore nearest the port, not the town. [latitude, longitude].
 */
export const PORT_SITES: Record<string, [number, number]> = {
  avalon: [47.56, -52.71], // St. John's
  quebec: [46.81, -71.21],
  "trois-rivieres": [46.34, -72.54],
  hochelaga: [45.5, -73.55], // Montreal
  tadoussac: [48.14, -69.72],
  "port-royal": [44.74, -65.52], // Annapolis Royal
  chebucto: [44.65, -63.57], // Halifax
  "ile-royale": [45.89, -59.99], // Louisbourg
  piscataqua: [43.07, -70.76], // Portsmouth
  "massachusetts-bay": [42.36, -71.05], // Boston
  plymouth: [41.96, -70.67],
  narragansett: [41.49, -71.31], // Newport
  connecticut: [41.31, -72.92], // New Haven
  "new-amsterdam": [40.7, -74.01], // New York
  "fort-christina": [39.74, -75.55],
  jamestown: [37.21, -76.78],
  severn: [38.98, -76.49], // Annapolis
  "st-mary-s": [38.19, -76.43],
  "charles-town": [32.78, -79.93],
  "st-augustine": [29.89, -81.31],
  pensacola: [30.42, -87.22],
  mobile: [30.69, -88.04],
  bayogoula: [29.95, -90.07], // New Orleans
  veracruz: [19.2, -96.13],
  acapulco: [16.85, -99.88],
  campeche: [19.85, -90.53],
  portobelo: [9.55, -79.65],
  panama: [8.95, -79.53],
  havana: [23.14, -82.36],
  "santiago-de-cuba": [20.02, -75.82],
  "santo-domingo": [18.47, -69.89],
  "le-cap": [19.76, -72.2], // Cap-Français
  "san-juan": [18.47, -66.11],
  jamaica: [17.94, -76.84], // Port Royal
  "new-providence": [25.08, -77.35], // Nassau
  bermuda: [32.38, -64.68], // St. George's
  barbados: [13.1, -59.62], // Bridgetown
  martinique: [14.74, -61.18], // Saint-Pierre
  guadeloupe: [15.99, -61.73], // Basse-Terre
  curacao: [12.11, -68.93], // Willemstad
  "st-kitts": [17.3, -62.72], // Basseterre
  antigua: [17.12, -61.85],
  "st-thomas": [18.34, -64.93],
  trujillo: [15.92, -85.95],
  "santo-tomas": [15.7, -88.62],
  "york-factory": [57.0, -92.3],
  churchill: [58.77, -94.17],
  "fort-albany": [52.2, -81.67],
  "moose-river": [51.26, -80.61], // Moose Factory
  ohlone: [37.8, -122.4], // San Francisco Bay
  monterey: [36.6, -121.89],
  kumeyaay: [32.71, -117.17], // San Diego
  panuco: [22.25, -97.86], // Tampico
};

export interface BuiltHarbour {
  p: number;
  body: number;
  x: number;
  y: number;
  lx: number;
  ly: number;
  room: number;
}

export interface BuiltLane {
  a: number;
  b: number;
  /** Harbour indices (into the harbour list) at each end. */
  ha: number;
  hb: number;
  pts: [number, number][];
}

export class SeaBuild {
  readonly w: number;
  readonly h: number;
  /** 2: open water, 1: narrows (a gap between waters a cell or two wide), 0: land. */
  readonly nav: Uint8Array;
  /** Distance from land in cells (0 on land and in the narrows), at most 60. */
  readonly clear: Uint8Array;
  readonly body: Uint16Array;
  readonly bodySize: number[];
  readonly arcs: ChartArc[];
  readonly harbours: BuiltHarbour[] = [];
  readonly byProv: number[][];
  private gCost: Float32Array | null = null;
  private prev: Int32Array | null = null;
  private seen: Uint32Array | null = null;
  private done: Uint32Array | null = null;
  private stamp = 0;

  constructor(
    geo: SeaGeo,
    readonly provinces: readonly SeaProvince[],
  ) {
    this.w = Math.ceil(geo.width);
    this.h = Math.ceil(geo.height);
    this.arcs = geo.arcs.map(decodeArc);
    const land = rasterLand(this.arcs, geo, this.w, this.h);
    this.clear = distanceFromLand(land, this.w, this.h);
    this.nav = narrows(land, this.w, this.h);
    const { body, sizes } = labelBodies(this.nav, this.w, this.h);
    this.body = body;
    this.bodySize = sizes;
    this.byProv = provinces.map(() => []);
    this.placeHarbours();
  }

  // ---------------------------------------------------------------- reading the grid

  private cell(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return -1;
    return cy * this.w + cx;
  }

  /** How a point lies: 2 open water, 1 narrows, 0 land; off the chart is open sea. */
  navAt(x: number, y: number): number {
    const i = this.cell(x, y);
    return i < 0 ? 2 : this.nav[i];
  }

  clearAt(x: number, y: number): number {
    const i = this.cell(x, y);
    return i < 0 ? 60 : this.clear[i];
  }

  /**
   * Every cell a straight line passes through (Amanatides and Woo), with
   * the line's room: the least distance from land met (-1: it touches
   * land) and how many narrows cells it crosses.
   */
  lineRoom(
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): { room: number; narrows: number } {
    let x = Math.floor(ax);
    let y = Math.floor(ay);
    const ex = Math.floor(bx);
    const ey = Math.floor(by);
    const dx = bx - ax;
    const dy = by - ay;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
    let ty = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : Infinity;
    let room = 60;
    let nar = 0;
    const look = (cx: number, cy: number): boolean => {
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
      const i = cy * this.w + cx;
      if (this.nav[i] === 0) return false;
      if (this.nav[i] === 1) nar++;
      room = Math.min(room, this.clear[i]);
      return true;
    };
    const steps = Math.abs(ex - x) + Math.abs(ey - y) + 2;
    for (let k = 0; k <= steps; k++) {
      if (!look(x, y)) return { room: -1, narrows: nar };
      if ((x === ex && y === ey) || Math.min(tx, ty) > 1) break;
      if (Math.abs(tx - ty) < 1e-9) {
        // Through a corner exactly: both cells beside it count.
        if (!look(x + sx, y) || !look(x, y + sy))
          return { room: -1, narrows: nar };
        x += sx;
        y += sy;
        tx += tdx;
        ty += tdy;
      } else if (tx < ty) {
        x += sx;
        tx += tdx;
      } else {
        y += sy;
        ty += tdy;
      }
    }
    return { room, narrows: nar };
  }

  // ---------------------------------------------------------------- harbours

  /**
   * A harbour for each province on each body of water it touches: the
   * landing is the bit of its shore nearest its town where there's open
   * water off it, and the moorings lie just out from there.
   */
  private placeHarbours(): void {
    const w = this.w;
    const best = new Map<
      string,
      { p: number; b: number; x: number; y: number; score: number }
    >();
    const openNear = (cx: number, cy: number, r: number) => {
      let m = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= this.h) continue;
          m = Math.max(m, this.clear[y * w + x]);
        }
      return m;
    };
    for (const a of this.arcs) {
      if (a.left >= 0 && a.right >= 0) continue;
      const p = a.left >= 0 ? a.left : a.right;
      if (p < 0) continue;
      const def = this.provinces[p];
      if (!def || def.closed) continue;
      // The real port's site where we know it, else the town.
      const site = def.id ? PORT_SITES[def.id] : undefined;
      const [tx, ty] = site
        ? projectLatLon(site[0], site[1], this.w)
        : [def.x, def.y];
      const n = a.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const sx = a.pts[i * 2];
        const sy = a.pts[i * 2 + 1];
        // The water beside this bit of shore (its body).
        let b = 0;
        for (let r = 0; r <= 2 && !b; r++)
          for (let dy = -r; dy <= r && !b; dy++)
            for (let dx = -r; dx <= r && !b; dx++) {
              const j = this.cell(sx + dx, sy + dy);
              if (j >= 0) b = this.body[j];
            }
        if (!b || this.bodySize[b] < MIN_BODY) continue;
        const open = openNear(Math.floor(sx), Math.floor(sy), HARBOUR_REACH);
        const score =
          Math.hypot(sx - tx, sy - ty) +
          (site ? 2 : 10) * Math.max(0, OPEN - open);
        const key = `${p}:${b}`;
        const had = best.get(key);
        if (!had || score < had.score)
          best.set(key, { p, b, x: sx, y: sy, score });
      }
    }
    const found = [...best.values()].sort((u, v) => u.p - v.p || u.b - v.b);
    for (const f of found) {
      // The moorings: open water off the landing, on that body, as near as
      // gives a boat room (the nearest water at all in a narrow river).
      let bx = -1;
      let by = -1;
      let bestScore = -Infinity;
      // Failing that (a crooked shore), the best spot all the same.
      let fx = -1;
      let fy = -1;
      let fallback = -Infinity;
      const cx = Math.floor(f.x);
      const cy = Math.floor(f.y);
      for (let dy = -HARBOUR_REACH; dy <= HARBOUR_REACH; dy++)
        for (let dx = -HARBOUR_REACH; dx <= HARBOUR_REACH; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= this.h) continue;
          const i = y * w + x;
          if (this.body[i] !== f.b) continue;
          const d = Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y);
          if (d > HARBOUR_REACH) continue;
          const score =
            Math.min(this.clear[i], OPEN) * 3 + (this.nav[i] === 2 ? 2 : 0) - d;
          if (score > fallback) {
            fallback = score;
            fx = x;
            fy = y;
          }
          if (score <= bestScore) continue;
          // The quay runs out to it from the landing over the water.
          if (!this.quayClear(f.x, f.y, x + 0.5, y + 0.5)) continue;
          bestScore = score;
          bx = x;
          by = y;
        }
      if (bx < 0) {
        bx = fx;
        by = fy;
      }
      if (bx < 0) continue;
      const k = this.harbours.length;
      this.harbours.push({
        p: f.p,
        body: f.b,
        x: bx + 0.5,
        y: by + 0.5,
        lx: Math.round(f.x * 2) / 2,
        ly: Math.round(f.y * 2) / 2,
        room: Math.max(0, this.clear[by * w + bx] - 1),
      });
      this.byProv[f.p].push(k);
    }
    // A province's own harbour first: on the biggest water it touches.
    for (const list of this.byProv)
      list.sort(
        (u, v) =>
          this.bodySize[this.harbours[v].body] -
            this.bodySize[this.harbours[u].body] || u - v,
      );
  }

  /**
   * Whether a quay can run straight out from a landing to the moorings:
   * from where the water begins along the way, all over water.
   */
  quayClear(lx: number, ly: number, hx: number, hy: number): boolean {
    const d = Math.hypot(hx - lx, hy - ly);
    if (d < 1e-6) return true;
    for (let t = 0; t <= d; t += 0.25) {
      const x = lx + ((hx - lx) * t) / d;
      const y = ly + ((hy - ly) * t) / d;
      if (this.navAt(x, y) === 0) continue;
      return this.lineRoom(x, y, hx, hy).room >= 0;
    }
    return false;
  }

  /** The two harbours a boat between two provinces uses: on the same water (the biggest they share). */
  pair(a: number, b: number): [number, number] | null {
    let out: [number, number] | null = null;
    let best = Infinity;
    for (const ia of this.byProv[a] ?? [])
      for (const ib of this.byProv[b] ?? []) {
        const ha = this.harbours[ia];
        const hb = this.harbours[ib];
        if (ha.body !== hb.body) continue;
        const d =
          Math.hypot(ha.x - hb.x, ha.y - hb.y) -
          Math.log2(this.bodySize[ha.body]) * 40;
        if (d < best) {
          best = d;
          out = [ia, ib];
        }
      }
    return out;
  }

  // ---------------------------------------------------------------- routes

  private static readonly DIRS: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  /**
   * The cheapest way over the water from cell `start` to a cell `isGoal`
   * accepts: weighted A*, keeping off the shore where there's room, through
   * the narrows only where it must, never cutting a corner of land.
   */
  private search(
    start: number,
    isGoal: (c: number) => boolean,
    guess: (c: number) => number,
  ): number[] | null {
    const n = this.w * this.h;
    this.gCost ??= new Float32Array(n);
    this.prev ??= new Int32Array(n);
    this.seen ??= new Uint32Array(n);
    this.done ??= new Uint32Array(n);
    const g = this.gCost;
    const prev = this.prev;
    const seen = this.seen;
    const done = this.done;
    const stamp = ++this.stamp;
    const heapF: number[] = [];
    const heapC: number[] = [];
    const push = (f: number, c: number) => {
      let i = heapF.length;
      heapF.push(f);
      heapC.push(c);
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (heapF[up] <= f) break;
        heapF[i] = heapF[up];
        heapC[i] = heapC[up];
        i = up;
      }
      heapF[i] = f;
      heapC[i] = c;
    };
    const pop = (): number => {
      const top = heapC[0];
      const lf = heapF.pop()!;
      const lc = heapC.pop()!;
      if (heapF.length) {
        let i = 0;
        for (;;) {
          let ch = 2 * i + 1;
          if (ch >= heapF.length) break;
          if (ch + 1 < heapF.length && heapF[ch + 1] < heapF[ch]) ch++;
          if (heapF[ch] >= lf) break;
          heapF[i] = heapF[ch];
          heapC[i] = heapC[ch];
          i = ch;
        }
        heapF[i] = lf;
        heapC[i] = lc;
      }
      return top;
    };
    if (this.nav[start] === 0) return null;
    seen[start] = stamp;
    g[start] = 0;
    prev[start] = -1;
    push(guess(start) * 1.25, start);
    const w = this.w;
    let goal = -1;
    while (heapF.length) {
      const c = pop();
      if (done[c] === stamp) continue;
      done[c] = stamp;
      if (isGoal(c)) {
        goal = c;
        break;
      }
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = SeaBuild.DIRS[k];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
        const m = ny * w + nx;
        if (this.nav[m] === 0 || done[m] === stamp) continue;
        // No cutting across a corner of land.
        if (dx && dy && (!this.nav[cy * w + nx] || !this.nav[ny * w + cx]))
          continue;
        const room = this.clear[m];
        const step =
          (dx && dy ? Math.SQRT2 : 1) *
          (this.nav[m] === 1 ? NARROWS_COST : 1 + 2.4 / Math.min(room, 8));
        const ng = g[c] + step;
        if (seen[m] === stamp && g[m] <= ng) continue;
        seen[m] = stamp;
        g[m] = ng;
        prev[m] = c;
        push(ng + guess(m) * 1.25, m);
      }
    }
    if (goal < 0) return null;
    const cells: number[] = [];
    for (let c = goal; c >= 0; c = prev[c]) cells.push(c);
    return cells.reverse();
  }

  private centre(c: number): [number, number] {
    const x = c % this.w;
    return [x + 0.5, (c - x) / this.w + 0.5];
  }

  /**
   * Pull a chain of cells tight: skip ahead while the straight way keeps
   * as much room from land as the chain itself had, and goes through no
   * more of the narrows than it did.
   */
  private tighten(pts: [number, number][]): [number, number][] {
    const room = pts.map(([x, y]) =>
      this.navAt(x, y) === 1 ? 0 : Math.min(OPEN, this.clearAt(x, y)),
    );
    const nar = pts.map(([x, y]) => (this.navAt(x, y) === 1 ? 1 : 0));
    const out: [number, number][] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 400);
      for (; j > i + 1; j--) {
        let need = OPEN;
        let allowed = 0;
        for (let k = i; k <= j; k++) {
          need = Math.min(need, room[k]);
          allowed += nar[k];
        }
        const [ax, ay] = pts[i];
        const [bx, by] = pts[j];
        const r = this.lineRoom(ax, ay, bx, by);
        if (r.room >= need && r.narrows <= allowed) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** Whether rounding the corners (as the map does when it draws a lane) keeps it on open water. */
  softens(pts: [number, number][]): boolean {
    if (pts.length < 3) return false;
    const flat = smoothPts(pts.flat());
    for (let i = 2; i < flat.length; i += 2) {
      const r = this.lineRoom(flat[i - 2], flat[i - 1], flat[i], flat[i + 1]);
      if (r.room < 0 || r.narrows > 0) return false;
    }
    return true;
  }

  /** A route over the water between two points on the same water, or null. */
  route(
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): [number, number][] | null {
    const s = this.cell(ax, ay);
    const t = this.cell(bx, by);
    if (s < 0 || t < 0) return null;
    const tx = t % this.w;
    const ty = (t - tx) / this.w;
    const cells = this.search(
      s,
      (c) => c === t,
      (c) => {
        const dx = Math.abs((c % this.w) - tx);
        const dy = Math.abs(Math.floor(c / this.w) - ty);
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      },
    );
    if (!cells) return null;
    const pts: [number, number][] = cells.map((c) => this.centre(c));
    pts[0] = [ax, ay];
    pts[pts.length - 1] = [bx, by];
    return roundPts(this.tighten(pts));
  }

  /** A lane between two provinces' harbours, or null if they share no water. */
  lane(a: number, b: number): BuiltLane | null {
    const pair = this.pair(a, b);
    if (!pair) return null;
    const ha = this.harbours[pair[0]];
    const hb = this.harbours[pair[1]];
    const pts = this.route(ha.x, ha.y, hb.x, hb.y);
    return pts ? { a, b, ha: pair[0], hb: pair[1], pts } : null;
  }

  /**
   * Other places boats lie at anchor near a harbour: up to three spots on
   * the water a little way along from the moorings, each reached over water.
   */
  berths(k: number): [number, number][] {
    const hb = this.harbours[k];
    const out: [number, number][] = [];
    const reach = hb.room >= 2 ? 3 : 2;
    const cands: [number, number, number][] = [];
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < 1.2 || d > reach + 0.01) continue;
        const x = hb.x + dx;
        const y = hb.y + dy;
        const nav = this.navAt(x, y);
        if (nav === 0) continue;
        if (this.body[this.cell(x, y)] !== hb.body) continue;
        const r = this.lineRoom(hb.x, hb.y, x, y);
        if (r.room < 0 || (nav === 2 && r.narrows > 0)) continue;
        // Open water first, then near the moorings.
        cands.push([x, y, this.clearAt(x, y) * 2 - d + (nav === 2 ? 3 : 0)]);
      }
    cands.sort((u, v) => v[2] - u[2] || u[1] - v[1] || u[0] - v[0]);
    for (const [x, y] of cands) {
      if (out.length >= 3) break;
      if (out.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 1.4)) continue;
      out.push([x, y]);
    }
    return out;
  }

  /** From a province's harbour out past the edge of the chart: east to Europe, or south round the Horn. */
  toEurope(p: number): [number, number][] | null {
    const k = this.byProv[p]?.[0];
    if (k === undefined) return null;
    const hb = this.harbours[k];
    const s = this.cell(hb.x, hb.y);
    const w = this.w;
    const h = this.h;
    const cells = this.search(
      s,
      (c) => c % w === w - 1 || Math.floor(c / w) === h - 1,
      (c) => Math.min(w - 1 - (c % w), h - 1 - Math.floor(c / w)),
    );
    if (!cells) return null;
    const pts: [number, number][] = cells.map((c) => this.centre(c));
    pts[0] = [hb.x, hb.y];
    const out = roundPts(this.tighten(pts));
    const [lx, ly] = out[out.length - 1];
    out.push(lx >= w - 2 ? [lx + 200, ly] : [lx, ly + 200]);
    return out;
  }
}

function roundPts(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [x, y] of pts) {
    const p: [number, number] = [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- the raster

/** Land, a byte a map unit: the coasts (and the land beyond the board) filled. */
export function rasterLand(
  arcs: ChartArc[],
  geo: SeaGeo,
  w: number,
  h: number,
): Uint8Array {
  const land = new Uint8Array(w * h);
  // The coasts alone bound the land: a border between two provinces would
  // be crossed twice and cancel out.
  const segs: number[] = [];
  for (const a of arcs) {
    if (a.left >= 0 && a.right >= 0) continue;
    for (let i = 2; i < a.pts.length; i += 2)
      segs.push(a.pts[i - 2], a.pts[i - 1], a.pts[i], a.pts[i + 1]);
  }
  fillPolygon(land, w, h, segs);
  for (const raw of geo.backdrop ?? []) {
    const pts = decodeHalf(raw);
    const s: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      s.push(ax, ay, bx, by);
    }
    fillPolygon(land, w, h, s);
  }
  return land;
}

/** Even-odd scanline fill of closed outlines (as segments: x0, y0, x1, y1, ...), at cell centres. */
function fillPolygon(
  grid: Uint8Array,
  w: number,
  h: number,
  segs: number[],
): void {
  const n = segs.length / 4;
  const rowsOf = (i: number): [number, number] => {
    const ya = segs[i * 4 + 1];
    const yb = segs[i * 4 + 3];
    // Rows whose centre (row + 0.5) lies in [low, high).
    const r0 = Math.max(0, Math.ceil(Math.min(ya, yb) - 0.5));
    const r1 = Math.min(h - 1, Math.ceil(Math.max(ya, yb) - 0.5) - 1);
    return [r0, r1];
  };
  const count = new Int32Array(h + 1);
  for (let i = 0; i < n; i++) {
    if (segs[i * 4 + 1] === segs[i * 4 + 3]) continue;
    const [r0, r1] = rowsOf(i);
    for (let r = r0; r <= r1; r++) count[r + 1]++;
  }
  for (let r = 0; r < h; r++) count[r + 1] += count[r];
  const xs = new Float64Array(count[h]);
  const fill = count.slice(0, h);
  for (let i = 0; i < n; i++) {
    const xa = segs[i * 4];
    const ya = segs[i * 4 + 1];
    const xb = segs[i * 4 + 2];
    const yb = segs[i * 4 + 3];
    if (ya === yb) continue;
    const [r0, r1] = rowsOf(i);
    for (let r = r0; r <= r1; r++)
      xs[fill[r]++] = xa + ((r + 0.5 - ya) / (yb - ya)) * (xb - xa);
  }
  for (let r = 0; r < h; r++) {
    const row = xs.subarray(count[r], count[r + 1]).sort();
    for (let k = 0; k + 1 < row.length; k += 2) {
      const from = Math.max(0, Math.ceil(row[k] - 0.5));
      const to = Math.min(w - 1, Math.floor(row[k + 1] - 0.5));
      // Spans of one row never overlap; land already there stays land.
      for (let x = from; x <= to; x++) grid[r * w + x] = 1;
    }
  }
}

/** Each cell's distance from land in cells (8-neighbour steps): 0 on land, at most 60. */
export function distanceFromLand(
  land: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = land[i] ? 0 : 60;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 1);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 1);
      }
      d[i] = v;
    }
  return d;
}

/**
 * Open water (2), and the narrows (1): the shortest strip of land, up to
 * NARROWS_GAP cells across, between two bodies of water that would
 * otherwise be apart. That joins rivers the chart draws as chains of
 * pools (the St. Lawrence above Quebec, the Hudson, the James) and pools
 * that only touch at a corner, without making any other land passable.
 */
function narrows(land: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const nav = new Uint8Array(n);
  for (let i = 0; i < n; i++) nav[i] = land[i] ? 0 : 2;
  const { body } = labelBodies(nav, w, h);
  // Out over the land from every body of water at once, a ring at a time.
  const half = Math.ceil(NARROWS_GAP / 2);
  const dist = new Uint8Array(n).fill(255);
  const from = new Uint16Array(n);
  const parent = new Int32Array(n).fill(-1);
  let ring: number[] = [];
  for (let i = 0; i < n; i++)
    if (!land[i]) {
      dist[i] = 0;
      from[i] = body[i];
      ring.push(i);
    }
  /** For each pair of bodies: the shortest bridge (its two ends, and its length). */
  const bridges = new Map<string, { a: number; b: number; len: number }>();
  const meet = (c: number, m: number) => {
    if (from[c] === from[m] || !from[c] || !from[m]) return;
    const len = dist[c] + dist[m] + 1;
    if (len - 2 > NARROWS_GAP) return;
    const key =
      from[c] < from[m] ? `${from[c]}:${from[m]}` : `${from[m]}:${from[c]}`;
    const had = bridges.get(key);
    if (!had || len < had.len) bridges.set(key, { a: c, b: m, len });
  };
  for (let d = 0; d <= half && ring.length; d++) {
    const next: number[] = [];
    for (const c of ring) {
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const m = y * w + x;
          if (dist[m] !== 255) {
            meet(c, m);
            continue;
          }
          if (d === half) continue;
          dist[m] = d + 1;
          from[m] = from[c];
          parent[m] = c;
          next.push(m);
        }
    }
    ring = next;
  }
  // Each bridge: back from both ends to the water, a strip of narrows.
  for (const { a, b } of [...bridges.values()]) {
    for (let c = a; c >= 0 && land[c]; c = parent[c]) nav[c] = 1;
    for (let c = b; c >= 0 && land[c]; c = parent[c]) nav[c] = 1;
    // Make the strip passable without cutting a corner of land.
    for (const end of [a, b]) {
      let c = end;
      while (c >= 0) {
        const p = parent[c];
        if (p < 0) break;
        widenCorner(nav, w, c, p);
        c = p;
      }
    }
    widenCorner(nav, w, a, b);
  }
  return nav;
}

/** A diagonal step between two cells: open one of the two cells beside it, if both are land. */
function widenCorner(nav: Uint8Array, w: number, c: number, m: number): void {
  const cx = c % w;
  const cy = (c - cx) / w;
  const mx = m % w;
  const my = (m - mx) / w;
  if (cx === mx || cy === my) return;
  const s1 = cy * w + mx;
  const s2 = my * w + cx;
  if (!nav[s1] && !nav[s2]) nav[s1] = 1;
}

/** Joined-up bodies of water (open water and narrows; 8-neighbour, no corner-cutting), numbered from 1. */
function labelBodies(
  nav: Uint8Array,
  w: number,
  h: number,
): { body: Uint16Array; sizes: number[] } {
  const body = new Uint16Array(w * h);
  const sizes = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let s = 0; s < body.length; s++) {
    if (nav[s] === 0 || body[s] !== 0) continue;
    const id = Math.min(next, 65535);
    if (next <= 65535) {
      sizes.push(0);
      next++;
    }
    let top = 0;
    stack[top++] = s;
    body[s] = id;
    while (top > 0) {
      const c = stack[--top];
      sizes[id]++;
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= w || (!dx && !dy)) continue;
          const n = y * w + x;
          if (nav[n] === 0 || body[n] !== 0) continue;
          if (dx && dy && (!nav[cy * w + x] || !nav[y * w + cx])) continue;
          body[n] = id;
          stack[top++] = n;
        }
      }
    }
  }
  return { body, sizes };
}

/**
 * The stretch of a river from the bank nearest a's town to the bank
 * nearest b's, where the river runs straight from one province into the
 * other: [river, from point, to point], or null.
 */
export function riverRun(
  rivers: [number, number][][],
  riverProv: Int16Array[],
  a: number,
  b: number,
  ta: { x: number; y: number },
  tb: { x: number; y: number },
): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestScore = Infinity;
  const direct = Math.hypot(tb.x - ta.x, tb.y - ta.y);
  rivers.forEach((line, r) => {
    const prov = riverProv[r];
    for (let i = 0; i < line.length; i++) {
      if (prov[i] !== a || (i > 0 && prov[i - 1] === a)) continue;
      // A run of points in a, then straight into b, either way along.
      for (const dir of [1, -1]) {
        // Back to the start of a's run, going against `dir`.
        let s = i;
        if (dir === -1) while (s + 1 < line.length && prov[s + 1] === a) s++;
        let j = s;
        while (j + dir >= 0 && j + dir < line.length && prov[j + dir] === a)
          j += dir;
        const k0 = j + dir;
        if (k0 < 0 || k0 >= line.length || prov[k0] !== b) continue;
        let k1 = k0;
        while (k1 + dir >= 0 && k1 + dir < line.length && prov[k1 + dir] === b)
          k1 += dir;
        let si = s;
        let sd = Infinity;
        for (let m = s; m !== k0; m += dir) {
          const d = Math.hypot(line[m][0] - ta.x, line[m][1] - ta.y);
          if (d < sd) {
            sd = d;
            si = m;
          }
        }
        let ei = k0;
        let ed = Infinity;
        for (let m = k0; m !== k1 + dir; m += dir) {
          const d = Math.hypot(line[m][0] - tb.x, line[m][1] - tb.y);
          if (d < ed) {
            ed = d;
            ei = m;
          }
        }
        let len = 0;
        for (let m = si; m !== ei; m += dir)
          len += Math.hypot(
            line[m + dir][0] - line[m][0],
            line[m + dir][1] - line[m][1],
          );
        // Worth it only if the river carries them a good part of the way.
        if (len < direct * 0.45 || sd + ed > direct * 0.9) continue;
        const score = sd + ed - len * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = [r, si, ei];
        }
      }
    }
  });
  return best;
}

/** The province each river point lies in (-1: none), by point-in-polygon on the chart's shapes. */
export function riverProvinces(
  geo: SeaGeo,
  arcs: ChartArc[],
  rivers: [number, number][][],
): Int16Array[] {
  const rings = geo.rings.map((rs) =>
    rs.map((ring) => {
      const out: number[] = [];
      for (const ref of ring) {
        const a = arcs[ref >= 0 ? ref : ~ref];
        const n = a.pts.length / 2;
        for (let k = 0; k < n; k++) {
          const i = ref < 0 ? n - 1 - k : k;
          out.push(a.pts[i * 2], a.pts[i * 2 + 1]);
        }
      }
      return out;
    }),
  );
  const boxes = rings.map((rs) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of rs)
      for (let i = 0; i < r.length; i += 2) {
        x0 = Math.min(x0, r[i]);
        x1 = Math.max(x1, r[i]);
        y0 = Math.min(y0, r[i + 1]);
        y1 = Math.max(y1, r[i + 1]);
      }
    return [x0, y0, x1, y1];
  });
  const at = (x: number, y: number) => {
    for (let p = 0; p < rings.length; p++) {
      const b = boxes[p];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      let inside = false;
      for (const r of rings[p]) {
        const n = r.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = r[i * 2 + 1];
          const yj = r[j * 2 + 1];
          if (yi > y !== yj > y) {
            const xi = r[i * 2];
            const xj = r[j * 2];
            if (x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
          }
        }
      }
      if (inside) return p;
    }
    return -1;
  };
  return rivers.map((line) => Int16Array.from(line.map(([x, y]) => at(x, y))));
}

/**
 * Everything the map's boats need, worked out from the chart: the harbours,
 * a lane for every sea lane the rules know of (and every crossing between
 * neighbours with water between them), each port's way out to Europe, and
 * the river runs between neighbours. Deterministic: the same shapes give
 * the same file.
 */
export function buildSeaData(
  geo: SeaGeo,
  provinces: readonly SeaProvince[],
  log: (s: string) => void = () => {},
): SeaData {
  const sb = new SeaBuild(geo, provinces);
  log(`water ${sb.w}x${sb.h}, ${sb.harbours.length} harbours`);
  const harbours = sb.harbours.map((hb, k) => [
    hb.p,
    hb.body,
    Math.round(hb.x * 2),
    Math.round(hb.y * 2),
    Math.round(hb.lx * 2),
    Math.round(hb.ly * 2),
    Math.round(hb.room * 2),
    ...sb.berths(k).flatMap(([x, y]) => [Math.round(x * 2), Math.round(y * 2)]),
  ]);
  // Every pair that a boat may cross between.
  const pairs = new Set<string>();
  provinces.forEach((def, a) => {
    for (const [b] of def.sea) pairs.add(a < b ? `${a}>${b}` : `${b}>${a}`);
    // Neighbours across the water, and neighbours along the same shore
    // (canoes paddle along the coasts and the lakes).
    for (const [b] of def.nb)
      if (sb.pair(a, b)) pairs.add(a < b ? `${a}>${b}` : `${b}>${a}`);
  });
  const lanes: number[][] = [];
  let missing = 0;
  const keys = [...pairs].sort((u, v) => {
    const [ua, ub] = u.split(">").map(Number);
    const [va, vb] = v.split(">").map(Number);
    return ua - va || ub - vb;
  });
  keys.forEach((key, i) => {
    const [a, b] = key.split(">").map(Number);
    const lane = sb.lane(a, b);
    if (!lane) {
      missing++;
      return;
    }
    lanes.push([
      a,
      b,
      lane.ha,
      lane.hb,
      sb.softens(lane.pts) ? 1 : 0,
      ...encodeHalf(lane.pts),
    ]);
    if (i % 250 === 0) log(`lanes ${i}/${keys.length}`);
  });
  log(`${lanes.length} lanes, ${missing} pairs with no shared water`);
  // The ports' ways out, from harbours on the open sea.
  const europe: number[][] = [];
  const oceanSize = Math.max(...sb.bodySize.slice(1)) * 0.25;
  provinces.forEach((def, p) => {
    const k = sb.byProv[p][0];
    if (!def.coastal || k === undefined) return;
    if (sb.bodySize[sb.harbours[k].body] < oceanSize) return;
    const pts = sb.toEurope(p);
    if (pts)
      europe.push([
        p,
        sb.softens(pts.slice(0, -1)) ? 1 : 0,
        ...encodeHalf(pts),
      ]);
  });
  log(`${europe.length} ways out`);
  // Canoes on the rivers, between neighbours a river runs through.
  const rivers = (geo.rivers ?? []).map((r) => decodeHalf(r));
  const where = riverProvinces(geo, sb.arcs, rivers);
  const runs: number[][] = [];
  provinces.forEach((def, a) => {
    for (const [b] of def.nb) {
      if (b <= a) continue;
      const run = riverRun(rivers, where, a, b, def, provinces[b]);
      if (run) runs.push([a, b, ...run]);
    }
  });
  log(`${runs.length} river runs`);
  return { version: 1, harbours, lanes, europe, rivers: runs };
}
