// How armies get from one province to another: marching over land they may
// enter, or sailing from their own coasts.

import { canEnter } from "./Queries";
import { TERRAIN } from "./Rules";
import { GameState, MapDef } from "./Types";

const MARCH_KM_PER_DAY = 22;
const RIVER_DAYS = 2;
const STRAIT_DAYS = 3;
const EMBARK_DAYS = 4;
const SEA_KM_PER_DAY = 110;

/** Days to march into the neighbour described by [km, river, strait]. */
export function landHopDays(
  map: MapDef,
  to: number,
  km: number,
  river: number,
  strait: number,
  speed: number,
): number {
  const terrain = TERRAIN[map.provinces[to].terrain];
  return Math.max(
    2,
    Math.ceil(km / (MARCH_KM_PER_DAY * terrain.speed * speed)) +
      (river ? RIVER_DAYS : 0) +
      (strait ? STRAIT_DAYS : 0),
  );
}

export function seaHopDays(km: number): number {
  return EMBARK_DAYS + Math.ceil(km / SEA_KM_PER_DAY);
}

/** Whether `n`'s army may set sail from `p`: its own (or held) coast. */
export function canSailFrom(
  s: GameState,
  map: MapDef,
  n: number,
  p: number,
): boolean {
  if (!map.provinces[p].coastal) return false;
  const pr = s.provinces[p];
  if (pr.occupier >= 0) return pr.occupier === n;
  return pr.owner === n;
}

export interface PathResult {
  path: number[];
  days: number;
  /** For each step, whether it's by sea. */
  sea: boolean[];
}

export interface RouteTree {
  days: Float64Array;
  prev: Int32Array;
  bySea: Uint8Array;
}

/** Quickest routes from `from` to everywhere `n`'s army can go. */
export function routeTree(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  speed: number,
  to = -1,
): RouteTree {
  const count = map.provinces.length;
  const days = new Float64Array(count).fill(Infinity);
  const prev = new Int32Array(count).fill(-1);
  const bySea = new Uint8Array(count);
  const done = new Uint8Array(count);
  const heapD: number[] = [];
  const heapP: number[] = [];
  const push = (d: number, p: number) => {
    let i = heapD.length;
    heapD.push(d);
    heapP.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapD[parent] <= d) break;
      heapD[i] = heapD[parent];
      heapP[i] = heapP[parent];
      i = parent;
    }
    heapD[i] = d;
    heapP[i] = p;
  };
  const pop = (): number => {
    const top = heapP[0];
    const lastD = heapD.pop()!;
    const lastP = heapP.pop()!;
    if (heapD.length > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heapD.length) break;
        if (c + 1 < heapD.length && heapD[c + 1] < heapD[c]) c++;
        if (heapD[c] >= lastD) break;
        heapD[i] = heapD[c];
        heapP[i] = heapP[c];
        i = c;
      }
      heapD[i] = lastD;
      heapP[i] = lastP;
    }
    return top;
  };
  days[from] = 0;
  push(0, from);
  while (heapD.length > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    const base = days[u];
    for (const [q, km, river, strait] of map.provinces[u].nb) {
      if (done[q] || !canEnter(s, n, q)) continue;
      const d = base + landHopDays(map, q, km, river, strait, speed);
      if (d < days[q]) {
        days[q] = d;
        prev[q] = u;
        bySea[q] = 0;
        push(d, q);
      }
    }
    if (canSailFrom(s, map, n, u)) {
      for (const [q, km] of map.provinces[u].sea) {
        if (km > map.seaLaneKm) break;
        if (done[q] || !canEnter(s, n, q)) continue;
        const d = base + seaHopDays(km);
        if (d < days[q]) {
          days[q] = d;
          prev[q] = u;
          bySea[q] = 1;
          push(d, q);
        }
      }
    }
  }
  return { days, prev, bySea };
}

export function pathTo(
  tree: RouteTree,
  from: number,
  to: number,
): PathResult | null {
  if (from === to) return { path: [], days: 0, sea: [] };
  if (tree.days[to] === Infinity) return null;
  const path: number[] = [];
  const sea: boolean[] = [];
  for (let c = to; c !== from; c = tree.prev[c]) {
    path.push(c);
    sea.push(tree.bySea[c] === 1);
  }
  path.reverse();
  sea.reverse();
  return { path, days: tree.days[to], sea };
}

export function findPath(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  to: number,
  speed: number,
): PathResult | null {
  if (from === to) return { path: [], days: 0, sea: [] };
  if (!canEnter(s, n, to)) return null;
  return pathTo(routeTree(s, map, n, from, speed, to), from, to);
}

/** Days for one hop, land or sea, or -1 if the two don't connect. */
export function hopDays(
  s: GameState,
  map: MapDef,
  n: number,
  from: number,
  to: number,
  speed: number,
  bySea: boolean,
): number {
  if (!bySea) {
    const nb = map.provinces[from].nb.find(([q]) => q === to);
    return nb ? landHopDays(map, to, nb[1], nb[2], nb[3], speed) : -1;
  }
  const lane = map.provinces[from].sea.find(([q]) => q === to);
  if (!lane || lane[1] > map.seaLaneKm || !canSailFrom(s, map, n, from))
    return -1;
  return seaHopDays(lane[1]);
}
