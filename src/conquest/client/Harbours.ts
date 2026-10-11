// MAP (r12): harbours and sea lanes. Boats used to sail from one town's
// centre to the other's, so a ship bound for an inland town sailed up over
// the land to it. Now every coastal province has a harbour: moorings on the
// water just off its shore, with a landing on the shore where the quay is
// drawn. Every boat on the map sails only over water, from harbour to
// harbour, along lanes worked out once from the chart's own shapes
// (SeaBuild.ts, by scripts/conquest/build-sea.mjs, into americas-sea.json).
// Whoever lands walks up from the quay to the town.
//
// Canoes also go up and down the rivers (the Mississippi, the Ohio...)
// between two provinces a river runs through.

/** A border or coast between two provinces (-1: water), as drawn. */
export interface ChartArc {
  left: number;
  right: number;
  pts: Float32Array;
}

/** The shapes the chart is drawn from (americas-geo.json). */
export interface SeaGeo {
  width: number;
  height: number;
  arcs: number[][];
  rings: number[][][];
  rivers?: number[][];
  backdrop?: number[][];
}

/** What the harbours need to know of a province. */
export interface SeaProvince {
  id?: string;
  x: number;
  y: number;
  coastal: boolean;
  closed?: boolean;
  /** Neighbours: [province, km, river, strait]. */
  nb: [number, number, number, number][];
  /** Coastal provinces reachable by sea: [province, km]. */
  sea: [number, number][];
}

/** The harbours and lanes, as stored (americas-sea.json); points in half map units. */
export interface SeaData {
  version: number;
  /** [province, body, x, y, landing x, landing y, room, berths (x, y)...] */
  harbours: number[][];
  /** [province a, province b, harbour a, harbour b, rounded (1/0), points (delta-encoded)...] */
  lanes: number[][];
  /** [province, rounded (1/0), points out past the chart's edge (delta-encoded)...] */
  europe: number[][];
  /** [province a, province b, river, from point, to point] */
  rivers: number[][];
}

export interface Harbour {
  p: number;
  /** The body of water it lies on. */
  body: number;
  /** Where boats tie up: on the water, just off the shore (map units). */
  x: number;
  y: number;
  /** The landing on the shore, where the quay is. */
  lx: number;
  ly: number;
  /** Open water around the moorings, in map units. */
  room: number;
  /** Other places boats lie at anchor nearby, each on the water. */
  berths: [number, number][];
}

export type Leg = "walk" | "sail";

/**
 * A way for one hop: points, and for each stretch between two points
 * whether it's walked or sailed, and the share of the hop's time reached
 * at each point.
 */
export interface Way {
  pts: [number, number][];
  legs: Leg[];
  /** Cumulative share of the time at each point (0 at the first, 1 at the last). */
  at: number[];
}

/** One pass of Chaikin smoothing, keeping the ends where they are. */
export function smoothPts(pts: number[]): number[] {
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

/** An arc as the chart draws it: delta-decoded and smoothed. */
export function decodeArc(raw: number[]): ChartArc {
  const pts: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 2; i < raw.length; i += 2) {
    x += raw[i];
    y += raw[i + 1];
    pts.push(x, y);
  }
  return {
    left: raw[0],
    right: raw[1],
    pts: new Float32Array(smoothPts(pts)),
  };
}

/** Delta-encoded half-unit points to map units. */
export function decodeHalf(raw: number[], from = 0): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = from; i + 1 < raw.length; i += 2) {
    x += raw[i];
    y += raw[i + 1];
    out.push([x / 2, y / 2]);
  }
  return out;
}

/** A flat list of numbers as points. */
export function pairsOf(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Map-unit points to delta-encoded half units. */
export function encodeHalf(pts: [number, number][]): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const [px, py] of pts) {
    const hx = Math.round(px * 2);
    const hy = Math.round(py * 2);
    out.push(hx - x, hy - y);
    x = hx;
    y = hy;
  }
  return out;
}

/** Walking counts this many times a stretch at sea, for the time it takes on a hop. */
const WALK_WEIGHT = 2.5;

/** The harbours, their lanes, the ways to Europe and the river runs, ready to draw from. */
export class SeaChart {
  readonly harbours: Harbour[];
  /** Each province's harbours, its own (on the biggest water) first. */
  private byProv: number[][];
  private lanes = new Map<string, { ha: number; hb: number; raw: number[] }>();
  private laneCache = new Map<string, [number, number][]>();
  private europe = new Map<number, number[]>();
  private europeCache = new Map<number, [number, number][]>();
  private riverRuns = new Map<string, [number, number, number]>();
  private ways = new Map<string, Way | null>();

  constructor(
    data: SeaData,
    private readonly provinces: readonly SeaProvince[],
    private readonly rivers: [number, number][][],
  ) {
    this.harbours = data.harbours.map((r) => {
      const berths: [number, number][] = [];
      for (let i = 7; i + 1 < r.length; i += 2)
        berths.push([r[i] / 2, r[i + 1] / 2]);
      return {
        p: r[0],
        body: r[1],
        x: r[2] / 2,
        y: r[3] / 2,
        lx: r[4] / 2,
        ly: r[5] / 2,
        room: r[6] / 2,
        berths,
      };
    });
    this.byProv = provinces.map(() => []);
    this.harbours.forEach((hb, i) => this.byProv[hb.p]?.push(i));
    for (const r of data.lanes)
      this.lanes.set(`${r[0]}>${r[1]}`, { ha: r[2], hb: r[3], raw: r });
    for (const r of data.europe) this.europe.set(r[0], r);
    for (const r of data.rivers)
      this.riverRuns.set(`${r[0]}>${r[1]}`, [r[2], r[3], r[4]]);
  }

  /** A province's own harbour, or null (an inland province). */
  harbour(p: number): Harbour | null {
    const k = this.byProv[p]?.[0];
    return k === undefined ? null : this.harbours[k];
  }

  /** The lane between two provinces' harbours, from a's end to b's, with the harbours at each end. */
  lane(
    a: number,
    b: number,
  ): { pts: [number, number][]; from: Harbour; to: Harbour } | null {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}>${hi}`;
    const l = this.lanes.get(key);
    if (!l) return null;
    let pts = this.laneCache.get(key);
    if (!pts) {
      pts = decodeHalf(l.raw, 5);
      // Its corners rounded off, where the lane was found to have room for it.
      if (l.raw[4]) pts = pairsOf(smoothPts(pts.flat()));
      this.laneCache.set(key, pts);
    }
    const hl = this.harbours[l.ha];
    const hh = this.harbours[l.hb];
    return a === lo
      ? { pts, from: hl, to: hh }
      : { pts: [...pts].reverse(), from: hh, to: hl };
  }

  /** From a port's harbour out past the edge of the chart (toward Europe, or round the Horn). */
  toEurope(p: number): [number, number][] {
    let pts = this.europeCache.get(p);
    if (!pts) {
      const raw = this.europe.get(p);
      pts = raw ? decodeHalf(raw, 2) : [];
      if (raw?.[1] && pts.length > 2) {
        const past = pts[pts.length - 1];
        pts = [...pairsOf(smoothPts(pts.slice(0, -1).flat())), past];
      }
      if (!pts.length) {
        const hb = this.harbour(p);
        const def = this.provinces[p];
        pts = hb ? [[hb.x, hb.y]] : def ? [[def.x, def.y]] : [];
      }
      this.europeCache.set(p, pts);
    }
    return pts;
  }

  /**
   * A hop by sea (or a crossing to the far shore): walk from the town down
   * to the quay, sail from harbour to harbour, and walk up from the quay
   * to the town. Null when the two have no lane between them.
   */
  seaWay(a: number, b: number): Way | null {
    const key = `s${a}>${b}`;
    if (this.ways.has(key)) return this.ways.get(key)!;
    const lane = this.lane(a, b);
    let way: Way | null = null;
    if (lane) {
      const ta = this.provinces[a];
      const tb = this.provinces[b];
      const { pts, from, to } = lane;
      way = makeWay([
        {
          pts: [[ta.x, ta.y], [from.lx, from.ly], pts[0]],
          leg: "walk",
        },
        { pts, leg: "sail" },
        {
          pts: [pts[pts.length - 1], [to.lx, to.ly], [tb.x, tb.y]],
          leg: "walk",
        },
      ]);
    }
    this.ways.set(key, way);
    return way;
  }

  /**
   * By canoe (or bateau) along a river from one province into the next:
   * walk to the bank, go with the river, walk up to the town. Null where
   * no river runs straight from one into the other.
   */
  riverWay(a: number, b: number): Way | null {
    const key = `r${a}>${b}`;
    if (this.ways.has(key)) return this.ways.get(key)!;
    let way: Way | null = null;
    const run =
      this.riverRuns.get(`${a}>${b}`) ??
      (() => {
        const back = this.riverRuns.get(`${b}>${a}`);
        return back ? ([back[0], back[2], back[1]] as const) : undefined;
      })();
    const line = run ? this.rivers[run[0]] : undefined;
    if (run && line) {
      const [, from, to] = run;
      const dir = to >= from ? 1 : -1;
      const pts: [number, number][] = [];
      for (let m = from; m !== to + dir; m += dir) pts.push(line[m]);
      const ta = this.provinces[a];
      const tb = this.provinces[b];
      if (pts.length >= 2)
        way = makeWay([
          { pts: [[ta.x, ta.y], pts[0]], leg: "walk" },
          { pts, leg: "sail" },
          { pts: [pts[pts.length - 1], [tb.x, tb.y]], leg: "walk" },
        ]);
    }
    this.ways.set(key, way);
    return way;
  }

  /**
   * Where the k-th of a player's boats lies at a province's moorings: the
   * anchorages furthest along first (the town's own boats work nearer
   * in), then the moorings themselves. Null for a province with no harbour.
   */
  mooring(p: number, k: number): [number, number] | null {
    const hb = this.harbour(p);
    if (!hb) return null;
    const spots: [number, number][] = [
      ...[...hb.berths].reverse(),
      [hb.x, hb.y],
    ];
    return spots[k % spots.length];
  }
}

/** Joins stretches into one way, sharing out the time: walking is slower per mile than sailing. */
export function makeWay(parts: { pts: [number, number][]; leg: Leg }[]): Way {
  const pts: [number, number][] = [];
  const legs: Leg[] = [];
  const cost: number[] = [];
  for (const part of parts) {
    for (let i = 0; i < part.pts.length; i++) {
      const p = part.pts[i];
      const q = pts[pts.length - 1];
      if (!q) {
        pts.push(p);
        continue;
      }
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < 1e-6) continue;
      pts.push(p);
      legs.push(part.leg);
      cost.push(d * (part.leg === "walk" ? WALK_WEIGHT : 1));
    }
  }
  // Each spell ashore takes at most a quarter of the hop, so the voyage shows.
  const sail = cost.reduce((n, c, i) => n + (legs[i] === "sail" ? c : 0), 0);
  if (sail > 0) {
    const cap = sail * 0.5;
    let i = 0;
    while (i < legs.length) {
      if (legs[i] !== "walk") {
        i++;
        continue;
      }
      let j = i;
      let sum = 0;
      while (j < legs.length && legs[j] === "walk") sum += cost[j++];
      if (sum > cap) for (let k = i; k < j; k++) cost[k] *= cap / sum;
      i = j;
    }
  }
  const total = cost.reduce((a, b) => a + b, 0) || 1;
  const at = [0];
  for (const c of cost) at.push(at[at.length - 1] + c / total);
  at[at.length - 1] = 1;
  return { pts, legs, at };
}

/** A plain way: walked (or marched) all along these points, the time shared by distance. */
export function walkWay(pts: [number, number][]): Way {
  return makeWay([{ pts, leg: "walk" }]);
}

/** Where along a way someone is at a share `t` of the hop: [x, y, heading, leg]. */
export function alongWay(way: Way, t: number): [number, number, number, Leg] {
  const k = Math.max(0, Math.min(1, t));
  const { pts, at, legs } = way;
  if (pts.length < 2) return [pts[0][0], pts[0][1], 0, legs[0] ?? "walk"];
  let i = 1;
  while (i < at.length - 1 && at[i] < k) i++;
  const span = Math.max(1e-9, at[i] - at[i - 1]);
  const f = Math.max(0, Math.min(1, (k - at[i - 1]) / span));
  const [ax, ay] = pts[i - 1];
  const [bx, by] = pts[i];
  return [
    ax + (bx - ax) * f,
    ay + (by - ay) * f,
    Math.atan2(by - ay, bx - ax),
    legs[i - 1],
  ];
}

/** The rest of a way from share `t` on: the point there, then the points after it. */
export function restOfWay(way: Way, t: number): [number, number][] {
  const [x, y] = alongWay(way, t);
  const out: [number, number][] = [[x, y]];
  for (let i = 1; i < way.pts.length; i++)
    if (way.at[i] > t) out.push(way.pts[i]);
  return out;
}
