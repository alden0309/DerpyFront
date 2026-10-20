import { ScenarioData } from "./ScenarioData";

/** The bits of a map the territory needs (a GameMap has them all). */
export interface TerritoryMap {
  width(): number;
  height(): number;
  isLand(ref: number): boolean;
  isImpassable(ref: number): boolean;
}

/**
 * SCEN (r25): who owns each tile when a Scenario starts. Returns one label
 * per tile: 0 for water and impassable ground, else 1 + the index of the
 * owning nation in `data.nations`. Every passable land tile gets a nation.
 *
 * `scale` is how many full-size pixels one of this map's pixels spans: 1 for
 * a Normal game's map, 2 for a Compact game's (map4x), 4 for map16x (the
 * Scenarios screen's pictures). The polygons are in full-size pixel corners,
 * and a tile belongs to a polygon when its centre is inside it.
 *
 * Deterministic on every machine: integer scanlines (the crossings are kept
 * as exact fractions), each nation filled even-odd, the first nation in the
 * list keeping a tile two of them cover; then land no polygon reached takes
 * the nearest nation's label, by breadth-first steps over land, and land cut
 * off from every nation (an island) by steps across the water.
 */
export function scenarioTerritory(
  data: ScenarioData,
  map: TerritoryMap,
  scale: number,
): Uint16Array {
  const W = map.width();
  const H = map.height();
  const d = scale;
  const labels = new Uint16Array(W * H);
  const passable = new Uint8Array(W * H);
  for (let t = 0; t < W * H; t++) {
    passable[t] = map.isLand(t) && !map.isImpassable(t) ? 1 : 0;
  }

  for (let ni = 0; ni < data.nations.length; ni++) {
    fillNation(data.nations[ni].regions, ni + 1, labels, passable, W, H, d);
  }
  fillGaps(labels, passable, W, H);
  return labels;
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  row0: number; // first pixel row it crosses
  row1: number; // last pixel row it crosses
}

function fillNation(
  regions: string[],
  label: number,
  labels: Uint16Array,
  passable: Uint8Array,
  W: number,
  H: number,
  d: number,
): void {
  const edges: Edge[] = [];
  for (const flat of regions) {
    const pts = decodeRing(flat);
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = pts[2 * i];
      const y1 = pts[2 * i + 1];
      const j = (i + 1) % n;
      const x2 = pts[2 * j];
      const y2 = pts[2 * j + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2);
      const hi = Math.max(y1, y2);
      // Pixel row py's centre is at full-size y (2py + 1) * d / 2; the edge
      // crosses it when 2*lo <= (2py + 1) * d < 2*hi.
      const row0 = Math.max(0, ceilDiv(2 * lo - d, 2 * d));
      const row1 = Math.min(H - 1, ceilDiv(2 * hi - d, 2 * d) - 1);
      if (row1 < row0) continue;
      edges.push({ x1, y1, x2, y2, row0, row1 });
    }
  }
  if (edges.length === 0) return;
  edges.sort((a, b) => a.row0 - b.row0);
  const minRow = edges[0].row0;
  let maxRow = 0;
  for (const e of edges) if (e.row1 > maxRow) maxRow = e.row1;

  let next = 0;
  let active: Edge[] = [];
  const nums: number[] = [];
  const dens: number[] = [];
  const order: number[] = [];
  for (let py = minRow; py <= maxRow; py++) {
    while (next < edges.length && edges[next].row0 <= py) {
      active.push(edges[next++]);
    }
    active = active.filter((e) => e.row1 >= py);
    if (active.length < 2) continue;
    const Y2 = (2 * py + 1) * d;
    nums.length = 0;
    dens.length = 0;
    for (const e of active) {
      // The crossing's doubled x as a fraction num/den, den > 0:
      // 2*x1 + (Y2 - 2*y1) * (x2 - x1) / (y2 - y1)
      let num = 2 * e.x1 * (e.y2 - e.y1) + (Y2 - 2 * e.y1) * (e.x2 - e.x1);
      let den = e.y2 - e.y1;
      if (den < 0) {
        num = -num;
        den = -den;
      }
      nums.push(num);
      dens.push(den);
    }
    order.length = 0;
    for (let k = 0; k < nums.length; k++) order.push(k);
    order.sort((a, b) => nums[a] * dens[b] - nums[b] * dens[a] || a - b);
    const rowStart = py * W;
    for (let k = 0; k + 1 < order.length; k += 2) {
      const na = nums[order[k]];
      const da = dens[order[k]];
      const nb = nums[order[k + 1]];
      const db = dens[order[k + 1]];
      // Pixels whose doubled centre (2px + 1) * d is in [na/da, nb/db).
      const pa = Math.max(0, ceilDiv(na - d * da, 2 * d * da));
      const pb = Math.min(W - 1, ceilDiv(nb - d * db, 2 * d * db) - 1);
      for (let px = pa; px <= pb; px++) {
        const t = rowStart + px;
        if (labels[t] === 0 && passable[t] === 1) labels[t] = label;
      }
    }
  }
}

/** "x0,y0,dx1,dy1,..." -> [x0, y0, x1, y1, ...]. */
export function decodeRing(text: string): number[] {
  const flat = text.split(",").map((v) => parseInt(v, 10));
  const out = new Array<number>(flat.length);
  let x = flat[0];
  let y = flat[1];
  out[0] = x;
  out[1] = y;
  for (let i = 2; i + 1 < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

/** ceil(a / b) for integers, b > 0. */
function ceilDiv(a: number, b: number): number {
  let q = Math.trunc(a / b);
  if (q * b < a) q++;
  else if ((q - 1) * b >= a) q--;
  return q;
}

/**
 * Unlabelled passable land takes the label of the nearest labelled land, in
 * breadth-first steps (up, left, right, down) over land; what that can't
 * reach takes it across the water.
 */
function fillGaps(
  labels: Uint16Array,
  passable: Uint8Array,
  W: number,
  H: number,
): void {
  const N = W * H;
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  let unlabelled = 0;
  for (let t = 0; t < N; t++) {
    if (passable[t] === 0) continue;
    if (labels[t] !== 0) queue[tail++] = t;
    else unlabelled++;
  }
  if (unlabelled === 0 || tail === 0) return;
  const visit = (t: number, nt: number) => {
    if (labels[nt] === 0 && passable[nt] === 1) {
      labels[nt] = labels[t];
      queue[tail++] = nt;
      unlabelled--;
    }
  };
  while (head < tail) {
    const t = queue[head++];
    const x = t % W;
    if (t >= W) visit(t, t - W);
    if (x > 0) visit(t, t - 1);
    if (x < W - 1) visit(t, t + 1);
    if (t < N - W) visit(t, t + W);
  }
  if (unlabelled === 0) return;

  // Land no nation reaches over land: carry labels across every tile.
  const carry = new Uint16Array(labels);
  head = 0;
  tail = 0;
  for (let t = 0; t < N; t++) {
    if (passable[t] === 1 && labels[t] !== 0) queue[tail++] = t;
  }
  const seen = new Uint8Array(N);
  for (let t = 0; t < N; t++) if (carry[t] !== 0) seen[t] = 1;
  const spread = (t: number, nt: number) => {
    if (seen[nt] === 1) return;
    seen[nt] = 1;
    carry[nt] = carry[t];
    queue[tail++] = nt;
  };
  while (head < tail) {
    const t = queue[head++];
    const x = t % W;
    if (t >= W) spread(t, t - W);
    if (x > 0) spread(t, t - 1);
    if (x < W - 1) spread(t, t + 1);
    if (t < N - W) spread(t, t + W);
  }
  for (let t = 0; t < N; t++) {
    if (passable[t] === 1 && labels[t] === 0) labels[t] = carry[t];
  }
}
