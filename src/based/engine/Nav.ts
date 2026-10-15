// Walking about a place (r21): a grid over the floor plan, blocked where
// the furniture and walls are, A* across it (eight ways, never cutting a
// blocked corner), then the path pulled straight wherever he can see along
// it, so he walks in lines and not in stairs. Pure and deterministic.
//
// BFIX (r23): the furniture's blocks come from the pieces themselves
// (Solid.ts): every cell closer to a solid piece than its margin is
// blocked, so nobody walks through a stool, a table, the bar or a car; the
// place's own blocks are its walls. A click on something solid walks him to
// the nearest point he can reach.

import { PlaceDef, Rect } from "./Place";
import { polysDist, Pt, solids } from "./Solid";

export type P = [number, number];

const SQRT2 = Math.SQRT2;

export class NavGrid {
  readonly w: number;
  readonly h: number;
  private readonly blocked: Uint8Array;

  constructor(
    readonly bounds: Rect,
    readonly cell: number,
    blocks: Rect[],
  ) {
    this.w = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / cell));
    this.h = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / cell));
    this.blocked = new Uint8Array(this.w * this.h);
    for (const r of blocks) this.block(r);
  }

  /** Blocks every cell the rectangle overlaps (a thin wall still blocks). */
  block(r: Rect): void {
    const x0 = Math.min(r[0], r[2]);
    const x1 = Math.max(r[0], r[2]);
    const z0 = Math.min(r[1], r[3]);
    const z1 = Math.max(r[1], r[3]);
    const eps = 1e-9;
    for (let j = 0; j < this.h; j++) {
      const cz0 = this.bounds[1] + j * this.cell;
      if (cz0 + this.cell <= z0 + eps || cz0 >= z1 - eps) continue;
      for (let i = 0; i < this.w; i++) {
        const cx0 = this.bounds[0] + i * this.cell;
        if (cx0 + this.cell <= x0 + eps || cx0 >= x1 - eps) continue;
        this.blocked[j * this.w + i] = 1;
      }
    }
  }

  /**
   * BFIX (r23): blocks every cell that comes closer than `margin` to a
   * convex outline on the floor.
   */
  blockPoly(poly: Pt[], margin: number): void {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [x, z] of poly) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    const [i0, j0] = this.cellOf(x0 - margin, z0 - margin);
    const [i1, j1] = this.cellOf(x1 + margin, z1 + margin);
    const c = this.cell;
    for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        if (this.blocked[j * this.w + i]) continue;
        const cx = this.bounds[0] + i * c;
        const cz = this.bounds[1] + j * c;
        const sq: Pt[] = [
          [cx, cz],
          [cx + c, cz],
          [cx + c, cz + c],
          [cx, cz + c],
        ];
        if (polysDist(sq, poly) < margin - 1e-9) {
          this.blocked[j * this.w + i] = 1;
        }
      }
    }
  }

  /**
   * BFIX (r23): every cell he can get to from a point (a flood over the
   * free cells, as A* moves), as a mask.
   */
  reach(x: number, z: number): Uint8Array {
    const seen = new Uint8Array(this.w * this.h);
    const start = this.walkable(x, z) ? [x, z] : this.nearestFree(x, z);
    if (!start) return seen;
    const [si, sj] = this.cellOf(start[0], start[1]);
    const stack = [sj * this.w + si];
    seen[stack[0]] = 1;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const ci = cur % this.w;
      const cj = (cur - ci) / this.w;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.free(ni, nj)) continue;
          if (di !== 0 && dj !== 0) {
            if (!this.free(ci + di, cj) || !this.free(ci, cj + dj)) continue;
          }
          const k = nj * this.w + ni;
          if (seen[k]) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    return seen;
  }

  /**
   * BFIX (r23): the point nearest `to` that he can reach from `from`: `to`
   * itself if it's free and joined to him, else the centre of the nearest
   * cell that is. Null if he can go nowhere.
   */
  nearestReachable(from: P, to: P): P | null {
    const seen = this.reach(from[0], from[1]);
    const [ti, tj] = this.cellOf(to[0], to[1]);
    if (this.inside(ti, tj) && seen[tj * this.w + ti]) return to;
    let best: P | null = null;
    let bestD = Infinity;
    for (let k = 0; k < seen.length; k++) {
      if (!seen[k]) continue;
      const i = k % this.w;
      const c = this.center(i, (k - i) / this.w);
      const d = (c[0] - to[0]) ** 2 + (c[1] - to[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  center(i: number, j: number): P {
    return [
      this.bounds[0] + (i + 0.5) * this.cell,
      this.bounds[1] + (j + 0.5) * this.cell,
    ];
  }

  cellOf(x: number, z: number): [number, number] {
    return [
      Math.floor((x - this.bounds[0]) / this.cell),
      Math.floor((z - this.bounds[1]) / this.cell),
    ];
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h;
  }

  free(i: number, j: number): boolean {
    return this.inside(i, j) && this.blocked[j * this.w + i] === 0;
  }

  walkable(x: number, z: number): boolean {
    const [i, j] = this.cellOf(x, z);
    return this.free(i, j);
  }

  /** The nearest free cell's centre to a point, or null if there's none. */
  nearestFree(x: number, z: number, maxRings = 40): P | null {
    const [ci, cj] = this.cellOf(x, z);
    if (this.free(ci, cj)) return this.center(ci, cj);
    let best: P | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= maxRings; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          if (!this.free(ci + di, cj + dj)) continue;
          const c = this.center(ci + di, cj + dj);
          const d = (c[0] - x) ** 2 + (c[1] - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Can he walk straight from a to b? (Every cell under the line is free.) */
  clear(a: P, b: P): boolean {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.25)));
    // A body is wider than a line: test a little to each side as well.
    const nx = len > 0 ? (-dz / len) * this.cell * 0.35 : 0;
    const nz = len > 0 ? (dx / len) * this.cell * 0.35 : 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t;
      const z = a[1] + dz * t;
      if (
        !this.walkable(x, z) ||
        !this.walkable(x + nx, z + nz) ||
        !this.walkable(x - nx, z - nz)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * A path from a to b, as points to walk through, the first being `a` (or,
   * if he's in something, the nearest free spot). BFIX (r23): if b is in
   * something, or can't be reached, the path ends at the nearest point he
   * can reach. Null only if he can go nowhere.
   */
  path(a: P, b: P): P[] | null {
    const start = this.walkable(a[0], a[1]) ? a : this.nearestFree(a[0], a[1]);
    if (start === null) return null;
    const goal = this.walkable(b[0], b[1])
      ? b
      : this.nearestReachable(start, b);
    if (goal === null) return null;
    const p = this.route(start, goal);
    if (p) return p;
    // Free but walled off (a pocket): the nearest point he can reach.
    const alt = this.nearestReachable(start, b);
    return alt && (alt[0] !== goal[0] || alt[1] !== goal[1])
      ? this.route(start, alt)
      : null;
  }

  private route(start: P, goal: P): P[] | null {
    const [si, sj] = this.cellOf(start[0], start[1]);
    const [gi, gj] = this.cellOf(goal[0], goal[1]);
    if (si === gi && sj === gj) return [start, goal];
    if (this.clear(start, goal)) return [start, goal];

    const n = this.w * this.h;
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - gi);
      const dy = Math.abs(j - gj);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    const s = sj * this.w + si;
    const goalIdx = gj * this.w + gi;
    g[s] = 0;
    heap.push(s, h(si, sj));
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goalIdx) {
        found = true;
        break;
      }
      const ci = cur % this.w;
      const cj = (cur - ci) / this.w;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.free(ni, nj)) continue;
          // No cutting across a blocked corner.
          if (di !== 0 && dj !== 0) {
            if (!this.free(ci + di, cj) || !this.free(ci, cj + dj)) continue;
          }
          const ni2 = nj * this.w + ni;
          if (closed[ni2]) continue;
          const cost = g[cur] + (di !== 0 && dj !== 0 ? SQRT2 : 1);
          if (cost < g[ni2]) {
            g[ni2] = cost;
            from[ni2] = cur;
            heap.push(ni2, cost + h(ni, nj));
          }
        }
      }
    }
    if (!found) return null;
    const cells: P[] = [];
    for (let c = goalIdx; c !== -1; c = from[c]) {
      const i = c % this.w;
      cells.push(this.center(i, (c - i) / this.w));
    }
    cells.reverse();
    cells[0] = start;
    cells[cells.length - 1] = goal;
    return this.smooth(cells);
  }

  /** Pulls a path straight: keeps a point only where the line must bend. */
  smooth(pts: P[]): P[] {
    if (pts.length <= 2) return pts;
    const out: P[] = [pts[0]];
    let anchor = 0;
    for (let k = 2; k < pts.length; k++) {
      if (!this.clear(pts[anchor], pts[k])) {
        out.push(pts[k - 1]);
        anchor = k - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

/**
 * BFIX (r23): a place's walking grid: its walls (the hand-written blocks),
 * then every solid piece, each kept off by its margin.
 */
export function navFor(def: PlaceDef): NavGrid {
  const g = new NavGrid(def.nav.bounds, def.nav.cell, def.nav.blocks);
  for (const s of solids(def)) g.blockPoly(s.poly, s.margin);
  return g;
}

/** Length of a path, in metres. */
export function pathLength(pts: P[]): number {
  let d = 0;
  for (let k = 1; k < pts.length; k++) {
    d += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  }
  return d;
}

/** A binary heap of cell indices by priority. */
class MinHeap {
  private ids: number[] = [];
  private ps: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, p: number): void {
    this.ids.push(id);
    this.ps.push(p);
    let k = this.ids.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (this.ps[up] <= this.ps[k]) break;
      this.swap(k, up);
      k = up;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.ps.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.ps[0] = lastP;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < this.ids.length && this.ps[l] < this.ps[m]) m = l;
        if (r < this.ids.length && this.ps[r] < this.ps[m]) m = r;
        if (m === k) break;
        this.swap(k, m);
        k = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.ps[a], this.ps[b]] = [this.ps[b], this.ps[a]];
  }
}
