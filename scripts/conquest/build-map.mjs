// Derpy Conquest: builds the Americas province map from Natural Earth data.
//
//   node scripts/conquest/build-map.mjs <natural-earth-geojson-dir> [--png <dir>]
//
// The directory needs these Natural Earth 1:50m files (public domain, from
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson):
//   ne_50m_land.geojson, ne_50m_lakes.geojson,
//   ne_50m_rivers_lake_centerlines.geojson,
//   ne_50m_geography_regions_polys.geojson
//
// It grows one province around each named anchor in anchors.mjs, over land
// only, on a fine grid in the Miller projection. Then it traces the
// province borders into shared arcs (each border is stored once), works out
// terrain, coasts, neighbours, river crossings and sea lanes, and writes:
//   src/conquest/data/americas.json      provinces, for the game rules
//   src/conquest/data/americas-geo.json  shapes and rivers, for drawing
//
// The output is deterministic: the same inputs give the same files.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  ANCHORS as ALL_ANCHORS,
  NATIVES as ALL_NATIVES,
  POWERS,
} from "./anchors.mjs";

// The game covers North and Central America, the Caribbean and the
// Bahamas. South America is drawn as unplayable land along the bottom edge
// (the "Tierra Firme" coast), with no provinces.
const SOUTH_AMERICAN_ISLANDS = new Set(["Tobago", "Trinidad", "Margarita"]);
const inSouthAmerica = ([name, lat, lon]) =>
  lat < 7 || (lat < 12 && lon > -77.85 && !SOUTH_AMERICAN_ISLANDS.has(name));
const ANCHORS = ALL_ANCHORS.filter((a) => !inSouthAmerica(a));
const kept = new Set(ANCHORS.map(([name]) => name));
const NATIVES = ALL_NATIVES.map((n) => ({
  ...n,
  provinces: n.provinces.filter((p) => kept.has(p)),
})).filter((n) => n.provinces.length > 0);

const args = process.argv.slice(2);
const NE_DIR = args[0];
if (!NE_DIR) {
  console.error("usage: build-map.mjs <natural-earth-dir> [--png <dir>]");
  process.exit(1);
}
const pngIdx = args.indexOf("--png");
const PNG_DIR = pngIdx >= 0 ? args[pngIdx + 1] : null;
const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const OUT_DIR = path.join(ROOT, "src/conquest/data");

// ---------------------------------------------------------------- projection

const LON0 = -168;
const LON1 = -46;
const LAT0 = 4.5;
const LAT1 = 66;
// Same cell size as the old whole-Americas map (136° across 2600 cells).
const W = Number(process.env.MAP_W ?? Math.round(((LON1 - LON0) / 136) * 2600));
const DEG = Math.PI / 180;
const EARTH_KM = 6371;
const millerY = (lat) =>
  1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * DEG));
const X0 = LON0 * DEG;
const YTOP = millerY(LAT1);
const YBOT = millerY(LAT0);
const CELL = (LON1 * DEG - X0) / W;
const H = Math.ceil((YTOP - YBOT) / CELL);
const N = W * H;

/** Grid coordinates (cell units, y down) of a lon/lat. */
function proj(lon, lat) {
  return [(lon * DEG - X0) / CELL, (YTOP - millerY(lat)) / CELL];
}
function cellLat(y) {
  const yy = YTOP - (y + 0.5) * CELL;
  return (Math.atan(Math.exp(yy / 1.25)) - Math.PI / 4) / 0.4 / DEG;
}
function cellLon(x) {
  return (X0 + (x + 0.5) * CELL) / DEG;
}
/** Kilometres east-west across one cell at a latitude. */
function kmPerCell(lat) {
  return CELL * EARTH_KM * Math.cos(lat * DEG);
}
/** True area of a cell in km² at a latitude (Miller stretches y). */
function cellAreaKm2(lat) {
  const dyDphi = 0.5 / Math.cos(0.4 * lat * DEG);
  return CELL * EARTH_KM * Math.cos(lat * DEG) * ((CELL / dyDphi) * EARTH_KM);
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const a =
    Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 +
    Math.cos(lat1 * DEG) *
      Math.cos(lat2 * DEG) *
      Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

const ROW_LAT = Float64Array.from({ length: H }, (_, y) => cellLat(y));

// ---------------------------------------------------------------- inputs

function readGeo(name) {
  return JSON.parse(fs.readFileSync(path.join(NE_DIR, name), "utf8"));
}
/** Every polygon (as projected rings) of a feature collection. */
function polygonsOf(fc, filter = () => true) {
  const out = [];
  for (const f of fc.features) {
    if (!f.geometry || !filter(f.properties ?? {})) continue;
    const g = f.geometry;
    const polys =
      g.type === "Polygon"
        ? [g.coordinates]
        : g.type === "MultiPolygon"
          ? g.coordinates
          : [];
    for (const poly of polys) {
      out.push({
        props: f.properties ?? {},
        rings: poly.map((ring) => ring.map(([lon, lat]) => proj(lon, lat))),
      });
    }
  }
  return out;
}

/** Scanline-fills polygons (even-odd across each polygon's rings). */
function rasterize(polys, set) {
  for (const { rings } of polys) {
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const r of rings)
      for (const [x, y] of r) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    if (maxX < 0 || minX > W || maxY < 0 || minY > H) continue;
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    const xs = [];
    for (let row = y0; row <= y1; row++) {
      const cy = row + 0.5;
      xs.length = 0;
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xa, ya] = r[j];
          const [xb, yb] = r[i];
          if (ya <= cy !== yb <= cy) {
            xs.push(xa + ((cy - ya) / (yb - ya)) * (xb - xa));
          }
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5));
        const to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = from; x <= to; x++) set(row * W + x);
      }
    }
  }
}

console.log(`grid ${W}x${H} (${(N / 1e6).toFixed(1)}M cells)`);

// ---- land and lakes
const LAND = new Uint8Array(N);
const LAKE = new Uint8Array(N);
rasterize(polygonsOf(readGeo("ne_50m_land.geojson")), (i) => (LAND[i] = 1));
rasterize(polygonsOf(readGeo("ne_50m_lakes.geojson")), (i) => {
  LAKE[i] = 1;
  LAND[i] = 0;
});

// ---- South America off the board: cut at the Darién (the Panama-Colombia
// border, Cabo Tiburón to the Pacific) and clear everything joined to the
// mainland south and east of it.
/** Longitude of the cut line at a latitude. */
const darienLon = (lat) => -77.36 + (lat - 8.68) * (0.53 / 1.47);
{
  for (let y = 0; y < H; y++) {
    const lat = ROW_LAT[y];
    if (lat >= 9.2) continue;
    for (let x = 0; x < W; x++) {
      if (cellLon(x) > darienLon(lat)) LAND[y * W + x] = 0;
    }
  }
  const cellOf = (lat, lon) => {
    const [fx, fy] = proj(lon, lat);
    return Math.floor(fy) * W + Math.floor(fx);
  };
  const seed = cellOf(10.1, -68.0);
  if (!LAND[seed]) throw new Error("no land under the South American seed");
  const stack = [seed];
  const seen = new Uint8Array(N);
  seen[seed] = 1;
  let cleared = 0;
  while (stack.length) {
    const c = stack.pop();
    LAND[c] = 0;
    cleared++;
    const x = c % W;
    for (const n of [
      x > 0 ? c - 1 : -1,
      x < W - 1 ? c + 1 : -1,
      c - W,
      c + W,
    ]) {
      if (n >= 0 && n < N && LAND[n] && !seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  const panama = cellOf(8.98, -79.52);
  if (seen[panama])
    throw new Error("the Darién cut left Panama joined to South America");
  // Scraps of coast the fill couldn't reach (narrower than a cell): any
  // land east of the cut and south of the islands that holds no province.
  const anchorCells = new Set(ANCHORS.map(([, lat, lon]) => cellOf(lat, lon)));
  const inRegion = (c) => {
    const x = c % W;
    const lat = ROW_LAT[(c - x) / W];
    return lat < 12.8 && cellLon(x) > darienLon(lat);
  };
  for (let i = 0; i < N; i++) {
    if (!LAND[i] || seen[i] || !inRegion(i)) continue;
    const comp = [i];
    seen[i] = 1;
    let anchored = false;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k];
      if (anchorCells.has(c)) anchored = true;
      const x = c % W;
      for (const n of [
        x > 0 ? c - 1 : -1,
        x < W - 1 ? c + 1 : -1,
        c - W,
        c + W,
      ]) {
        if (n >= 0 && n < N && LAND[n] && !seen[n] && inRegion(n)) {
          seen[n] = 1;
          comp.push(n);
        }
      }
    }
    if (!anchored) {
      for (const c of comp) LAND[c] = 0;
      cleared += comp.length;
    }
  }
  console.log(`cleared ${cleared} South American cells`);
}

// ---- terrain from Natural Earth geography regions
const T = {
  plains: 1,
  forest: 2,
  hills: 3,
  mountains: 4,
  jungle: 5,
  desert: 6,
  marsh: 7,
  tundra: 8,
};
const TERRAIN_NAMES = Object.keys(T);
const REGION_TERRAIN = new Uint8Array(N);
const regionRules = [
  // [priority, terrain, test]
  [
    1,
    "plains",
    (p) =>
      /GREAT PLAINS|PAMPAS|LLANOS|CHACO|PLANALTO CENTRAL|MATO GROSSO|COLUMBIA PLAT|Central Valley|Valle Longitudinal/.test(
        p.NAME,
      ),
  ],
  [1, "prairie", (p) => /CENTRAL LOWLAND/.test(p.NAME)],
  [
    1,
    "hills",
    (p) =>
      /BRAZILIAN HIGHLANDS|ALTI-PLANICIE|ALLEGHENY|CUMBERLAND PLAT|Ozark|Edwards|PIEDMONT|Campos/.test(
        p.NAME,
      ),
  ],
  [1, "jungle", (p) => /AMAZON BASIN|SELVAS|YUNGAS|GUIANA SHIELD/.test(p.NAME)],
  [
    2,
    "desert",
    (p) =>
      p.FEATURECLA === "Desert" || /GREAT BASIN|COLORADO PLATEAU/.test(p.NAME),
  ],
  [2, "marsh", (p) => p.FEATURECLA === "Wetlands" || p.FEATURECLA === "Delta"],
  [
    2,
    "tundra",
    (p) => p.FEATURECLA === "Tundra" && p.NAME === "BARREN GROUNDS",
  ],
  [
    3,
    "mountains",
    (p) =>
      p.FEATURECLA === "Range/mtn" &&
      !/APPALACHIAN|Serra Geral|Serra do Mar|Mantiqueira|GUIANA HIGHLANDS/.test(
        p.NAME,
      ),
  ],
  [3, "mountains", (p) => /ALTIPLANO/.test(p.NAME)],
  [
    2,
    "hills",
    (p) =>
      /APPALACHIAN|Serra Geral|Serra do Mar|Mantiqueira|GUIANA HIGHLANDS/.test(
        p.NAME,
      ),
  ],
];
// The central lowland was tall-grass prairie west of Lake Michigan and
// forest east of it; the far north is forest whatever the region says.
const PRAIRIE = 9;
{
  const regions = readGeo("ne_50m_geography_regions_polys.geojson");
  const prio = new Uint8Array(N);
  for (const [priority, terrain, test] of regionRules) {
    rasterize(polygonsOf(regions, test), (i) => {
      if (priority >= prio[i]) {
        prio[i] = priority;
        REGION_TERRAIN[i] = terrain === "prairie" ? PRAIRIE : T[terrain];
      }
    });
  }
}

/** Terrain of a land cell when no region polygon covers it. */
function climateTerrain(lat, lon) {
  if (lat >= 58) return T.tundra;
  if (lat >= 25) {
    if (lon < -100) return lat > 49 ? T.forest : T.hills;
    if (lon < -96) return T.plains;
    return T.forest;
  }
  if (lat >= 15) {
    if (lon > -86) return T.plains; // the Caribbean islands
    return T.hills;
  }
  if (lat >= -15) return T.jungle;
  if (lat >= -35) {
    if (lon < -70) return T.desert;
    if (lon > -50) return T.forest;
    return T.plains;
  }
  if (lon < -71.5) return T.forest;
  return T.plains;
}

// ---------------------------------------------------------------- anchors

const nAnchors = ANCHORS.length;
{
  const seen = new Set();
  for (const [name] of ANCHORS) {
    if (seen.has(name)) throw new Error(`duplicate anchor ${name}`);
    seen.add(name);
  }
}
const anchorCell = new Int32Array(nAnchors);
for (let a = 0; a < nAnchors; a++) {
  const [name, lat, lon] = ANCHORS[a];
  const [fx, fy] = proj(lon, lat);
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r <= 12 && best < 0; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (!LAND[y * W + x]) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = y * W + x;
        }
      }
  }
  if (best < 0) {
    // A speck of an island the grid missed: make its cell land.
    if (cx < 0 || cy < 0 || cx >= W || cy >= H)
      throw new Error(`anchor ${name} is off the map`);
    best = cy * W + cx;
    LAND[best] = 1;
    LAKE[best] = 0;
    console.log(`forced land under ${name}`);
  }
  anchorCell[a] = best;
}

// ---------------------------------------------------------------- land clean-up

// Connected land masses. Keep any with an anchor; drop far-north islands
// (Greenland, the Arctic archipelago); everything else is attached to the
// nearest province across the water later, or dropped if it's far out.
const COMP = new Int32Array(N).fill(-1);
const compCells = [];
{
  const stack = new Int32Array(N);
  let nComp = 0;
  for (let i = 0; i < N; i++) {
    if (!LAND[i] || COMP[i] >= 0) continue;
    let sp = 0;
    stack[sp++] = i;
    COMP[i] = nComp;
    const cells = [];
    while (sp > 0) {
      const c = stack[--sp];
      cells.push(c);
      const x = c % W;
      const y = (c - x) / W;
      const visit = (n) => {
        if (LAND[n] && COMP[n] < 0) {
          COMP[n] = nComp;
          stack[sp++] = n;
        }
      };
      if (x > 0) visit(c - 1);
      if (x < W - 1) visit(c + 1);
      if (y > 0) visit(c - W);
      if (y < H - 1) visit(c + W);
    }
    compCells.push(cells);
    nComp++;
  }
  const anchored = new Set([...anchorCell].map((c) => COMP[c]));
  let dropped = 0;
  for (let k = 0; k < compCells.length; k++) {
    if (anchored.has(k)) continue;
    const cells = compCells[k];
    const farNorth = cells.some((c) => ROW_LAT[Math.floor(c / W)] > 60);
    const tiny = cells.length < 3;
    if (farNorth || tiny) {
      for (const c of cells) LAND[c] = 0;
      dropped++;
    }
  }
  console.log(`land masses: ${compCells.length}, dropped ${dropped}`);
}

// ---------------------------------------------------------------- provinces

console.log(`land cells: ${LAND.reduce((a, b) => a + b, 0)}`);
// Multi-source Dijkstra over land (8-connected) from the anchors.
const LABEL = new Int16Array(N).fill(-1);
{
  const dist = new Float64Array(N).fill(Infinity);
  // Binary heap of (dist, cell).
  let heapD = new Float64Array(1 << 20);
  let heapC = new Int32Array(1 << 20);
  let size = 0;
  const push = (d, c) => {
    if (size === heapD.length) {
      const nd = new Float64Array(size * 2);
      nd.set(heapD);
      heapD = nd;
      const nc = new Int32Array(size * 2);
      nc.set(heapC);
      heapC = nc;
    }
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapD[p] < d || (heapD[p] === d && heapC[p] <= c)) break;
      heapD[i] = heapD[p];
      heapC[i] = heapC[p];
      i = p;
    }
    heapD[i] = d;
    heapC[i] = c;
  };
  const pop = () => {
    const d = heapD[0];
    const c = heapC[0];
    size--;
    const ld = heapD[size];
    const lc = heapC[size];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= size) break;
      if (
        m + 1 < size &&
        (heapD[m + 1] < heapD[m] ||
          (heapD[m + 1] === heapD[m] && heapC[m + 1] < heapC[m]))
      )
        m++;
      if (ld < heapD[m] || (ld === heapD[m] && lc <= heapC[m])) break;
      heapD[i] = heapD[m];
      heapC[i] = heapC[m];
      i = m;
    }
    heapD[i] = ld;
    heapC[i] = lc;
    return [d, c];
  };
  for (let a = 0; a < nAnchors; a++) {
    const c = anchorCell[a];
    if (LABEL[c] >= 0) {
      throw new Error(
        `anchors ${ANCHORS[LABEL[c]][0]} and ${ANCHORS[a][0]} share a cell`,
      );
    }
    LABEL[c] = a;
    dist[c] = 0;
    push(0, c);
  }
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (size > 0) {
    const [d, c] = pop();
    if (d > dist[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!LAND[n]) continue;
      // Diagonal steps may not squeeze between two water cells.
      if (dx !== 0 && dy !== 0 && !LAND[y * W + nx] && !LAND[ny * W + x])
        continue;
      const nd = d + w;
      if (nd < dist[n]) {
        dist[n] = nd;
        LABEL[n] = LABEL[c];
        push(nd, n);
      }
    }
  }
}

const IS_ANCHOR = new Uint8Array(N);
for (const c of anchorCell) IS_ANCHOR[c] = 1;
const t0 = Date.now();
const lap = (what) =>
  console.log(`${what}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
lap("provinces grown");

// Islands without an anchor join the nearest province within reach across
// the water; ones further out are dropped.
{
  const ISLAND_REACH = 70;
  const carry = new Int16Array(N).fill(-1);
  const steps = new Int16Array(N).fill(-1);
  let frontier = [];
  for (let i = 0; i < N; i++) {
    if (LABEL[i] >= 0) {
      carry[i] = LABEL[i];
      steps[i] = 0;
      frontier.push(i);
    }
  }
  for (let s = 1; s <= ISLAND_REACH && frontier.length > 0; s++) {
    const next = [];
    for (const c of frontier) {
      const x = c % W;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= N) continue;
        const nx = n % W;
        if (Math.abs(nx - x) > 1) continue;
        if (steps[n] >= 0) continue;
        steps[n] = s;
        carry[n] = carry[c];
        next.push(n);
      }
    }
    frontier = next;
  }
  let attached = 0;
  let dropped = 0;
  for (let i = 0; i < N; i++) {
    if (!LAND[i] || LABEL[i] >= 0) continue;
    if (carry[i] >= 0) {
      LABEL[i] = carry[i];
      attached++;
    } else {
      LAND[i] = 0;
      dropped++;
    }
  }
  // An attached island may have been reached by two provinces; give each
  // whole island to one of them (the one holding most of it).
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!LAND[i] || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % W;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= N || seen[n] || !LAND[n]) continue;
        if (Math.abs((n % W) - x) > 1) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (cells.some((c) => IS_ANCHOR[c])) continue;
    const counts = new Map();
    for (const c of cells)
      counts.set(LABEL[c], (counts.get(LABEL[c]) ?? 0) + 1);
    let best = -1;
    let bestN = -1;
    for (const [l, n] of [...counts].sort((a, b) => a[0] - b[0])) {
      if (n > bestN) {
        best = l;
        bestN = n;
      }
    }
    for (const c of cells) LABEL[c] = best;
  }
  console.log(
    `unanchored island cells: attached ${attached}, dropped ${dropped}`,
  );
}

lap("islands attached");
// ---------------------------------------------------------------- per-province facts

const OCEAN = (i) => !LAND[i] && !LAKE[i];
const nProv = nAnchors;
const cellCount = new Int32Array(nProv);
const areaKm2 = new Float64Array(nProv);
const sumX = new Float64Array(nProv);
const sumY = new Float64Array(nProv);
const terrainVotes = Array.from({ length: nProv }, () => new Float64Array(9));
const coastal = new Uint8Array(nProv);
for (let i = 0; i < N; i++) {
  const p = LABEL[i];
  if (p < 0) continue;
  const x = i % W;
  const y = (i - x) / W;
  const lat = ROW_LAT[y];
  cellCount[p]++;
  areaKm2[p] += cellAreaKm2(lat);
  sumX[p] += x + 0.5;
  sumY[p] += y + 0.5;
  const lon = cellLon(x);
  let t = REGION_TERRAIN[i];
  if (t === PRAIRIE) t = lon < -88 ? T.plains : T.forest;
  if ((t === T.plains || t === T.hills) && lat > 52) t = 0;
  if (
    !t ||
    (t !== T.mountains && t !== T.desert && t !== T.marsh && lat >= 58)
  ) {
    t = t && lat < 58 ? t : climateTerrain(lat, lon);
  }
  terrainVotes[p][t]++;
  if (
    (x > 0 && OCEAN(i - 1)) ||
    (x < W - 1 && OCEAN(i + 1)) ||
    (y > 0 && OCEAN(i - W)) ||
    (y < H - 1 && OCEAN(i + W))
  ) {
    coastal[p] = 1;
  }
}
for (let p = 0; p < nProv; p++) {
  if (cellCount[p] === 0) throw new Error(`province ${ANCHORS[p][0]} is empty`);
}

// Label point: the cell deepest inside each province (furthest from its
// border), so names and armies sit well inside it.
const labelCell = new Int32Array(nProv).fill(-1);
{
  const depth = new Int32Array(N).fill(-1);
  let frontier = [];
  for (let i = 0; i < N; i++) {
    const p = LABEL[i];
    if (p < 0) continue;
    const x = i % W;
    const y = (i - x) / W;
    const edge =
      x === 0 ||
      y === 0 ||
      x === W - 1 ||
      y === H - 1 ||
      LABEL[i - 1] !== p ||
      LABEL[i + 1] !== p ||
      LABEL[i - W] !== p ||
      LABEL[i + W] !== p;
    if (edge) {
      depth[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; frontier.length > 0; d++) {
    const next = [];
    for (const c of frontier) {
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= N || depth[n] >= 0 || LABEL[n] !== LABEL[c]) continue;
        depth[n] = d;
        next.push(n);
      }
    }
    frontier = next;
  }
  const bestDepth = new Int32Array(nProv).fill(-1);
  const bestScore = new Float64Array(nProv).fill(Infinity);
  for (let i = 0; i < N; i++) {
    const p = LABEL[i];
    if (p < 0) continue;
    const x = i % W;
    const y = (i - x) / W;
    const cx = sumX[p] / cellCount[p];
    const cy = sumY[p] / cellCount[p];
    // Prefer deep cells, then ones near the centroid.
    const score = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    const dep = Math.min(depth[i], 6 + Math.floor(Math.sqrt(cellCount[p]) / 4));
    if (dep > bestDepth[p] || (dep === bestDepth[p] && score < bestScore[p])) {
      bestDepth[p] = dep;
      bestScore[p] = score;
      labelCell[p] = i;
    }
  }
}

lap("province facts");
// ---- rivers (for drawing, and for river crossings between provinces)
const RIVER = new Uint8Array(N);
const riverLines = [];
{
  const rivers = readGeo("ne_50m_rivers_lake_centerlines.geojson");
  for (const f of rivers.features) {
    const p = f.properties ?? {};
    if (p.featurecla && !/River/.test(p.featurecla)) continue;
    const g = f.geometry;
    if (!g) continue;
    const lines =
      g.type === "LineString"
        ? [g.coordinates]
        : g.type === "MultiLineString"
          ? g.coordinates
          : [];
    for (const line of lines) {
      const pts = line.map(([lon, lat]) => proj(lon, lat));
      if (!pts.some(([x, y]) => x >= 0 && x < W && y >= 0 && y < H)) continue;
      const major = (p.scalerank ?? 9) <= 5;
      riverLines.push({ pts, major });
      for (let k = 1; k < pts.length; k++) {
        const [xa, ya] = pts[k - 1];
        const [xb, yb] = pts[k];
        const steps =
          Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) * 2) + 1;
        for (let s = 0; s <= steps; s++) {
          const x = Math.floor(xa + ((xb - xa) * s) / steps);
          const y = Math.floor(ya + ((yb - ya) * s) / steps);
          if (x >= 0 && y >= 0 && x < W && y < H && major) RIVER[y * W + x] = 1;
        }
      }
    }
  }
}

// ---- land neighbours, with shared border length and river crossings
const border = new Map(); // "a,b" (a<b) -> {len, river}
function addBorder(a, b, river) {
  const k = a < b ? `${a},${b}` : `${b},${a}`;
  let e = border.get(k);
  if (!e) border.set(k, (e = { len: 0, river: 0 }));
  e.len++;
  if (river) e.river++;
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a = LABEL[i];
    if (a < 0) continue;
    if (x < W - 1) {
      const b = LABEL[i + 1];
      if (b >= 0 && b !== a) addBorder(a, b, RIVER[i] || RIVER[i + 1]);
    }
    if (y < H - 1) {
      const b = LABEL[i + W];
      if (b >= 0 && b !== a) addBorder(a, b, RIVER[i] || RIVER[i + W]);
    }
  }
}

lap("neighbours");
// ---- sea reach: water distance between coastal provinces
const SEA_REACH_CELLS = 380;
const seaReach = Array.from({ length: nProv }, () => new Map());
{
  const stamp = new Int32Array(N).fill(-1);
  const distArr = new Int16Array(N);
  const coastCells = Array.from({ length: nProv }, () => []);
  for (let i = 0; i < N; i++) {
    if (!OCEAN(i)) continue;
    const x = i % W;
    const seen = new Set();
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (n < 0 || n >= N || Math.abs((n % W) - x) > 1) continue;
      const p = LABEL[n];
      if (p >= 0 && !seen.has(p)) {
        seen.add(p);
        coastCells[p].push(i);
      }
    }
  }
  const queue = new Int32Array(N);
  for (let p = 0; p < nProv; p++) {
    if (!coastal[p]) continue;
    let head = 0;
    let tail = 0;
    for (const c of coastCells[p]) {
      if (stamp[c] === p) continue;
      stamp[c] = p;
      distArr[c] = 0;
      queue[tail++] = c;
    }
    while (head < tail) {
      const c = queue[head++];
      const d = distArr[c];
      const x = c % W;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= N || Math.abs((n % W) - x) > 1) continue;
        const q = LABEL[n];
        if (q >= 0) {
          if (q !== p && !seaReach[p].has(q)) seaReach[p].set(q, d);
          continue;
        }
        if (!OCEAN(n) || stamp[n] === p) continue;
        if (d + 1 > SEA_REACH_CELLS) continue;
        stamp[n] = p;
        distArr[n] = d + 1;
        queue[tail++] = n;
      }
    }
  }
}

lap("sea reach");
// ---- straits: provinces a short hop apart across any water, lakes too
const STRAIT_CELLS = 9;
const strait = Array.from({ length: nProv }, () => new Map());
{
  const stamp = new Int32Array(N).fill(-1);
  const distArr = new Int16Array(N);
  const starts = Array.from({ length: nProv }, () => []);
  for (let i = 0; i < N; i++) {
    if (LAND[i]) continue;
    const x = i % W;
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (n < 0 || n >= N || Math.abs((n % W) - x) > 1) continue;
      if (LABEL[n] >= 0) starts[LABEL[n]].push(i);
    }
  }
  for (let p = 0; p < nProv; p++) {
    const queue = [];
    for (const c of starts[p]) {
      if (stamp[c] === p) continue;
      stamp[c] = p;
      distArr[c] = 1;
      queue.push(c);
    }
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      const d = distArr[c];
      const x = c % W;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= N || Math.abs((n % W) - x) > 1) continue;
        const q = LABEL[n];
        if (q >= 0) {
          if (q !== p && !strait[p].has(q)) strait[p].set(q, d);
          continue;
        }
        if (stamp[n] === p || d + 1 > STRAIT_CELLS) continue;
        stamp[n] = p;
        distArr[n] = d + 1;
        queue.push(n);
      }
    }
  }
}

// ---------------------------------------------------------------- arcs

// Borders between cells of different labels, traced into arcs between
// junctions so each shared border is stored once.
const L = (x, y) =>
  x < 0 || y < 0 || x >= W || y >= H ? -1 : LABEL[y * W + x];
const NH = (H + 1) * W;
const hEdge = (x, y) => y * W + x; // lattice (x,y)-(x+1,y), between (x,y-1) and (x,y)
const vEdge = (x, y) => NH + y * (W + 1) + x; // lattice (x,y)-(x,y+1), between (x-1,y) and (x,y)
const visited = new Uint8Array(NH + H * (W + 1));

/** Boundary edges leaving lattice point (x,y): [dx, dy, edgeId]. */
function edgesAt(x, y) {
  const a = L(x - 1, y - 1);
  const b = L(x, y - 1);
  const c = L(x - 1, y);
  const d = L(x, y);
  const out = [];
  if (a !== b && y > 0) out.push([0, -1, vEdge(x, y - 1)]);
  if (c !== d && y < H) out.push([0, 1, vEdge(x, y)]);
  if (a !== c && x > 0) out.push([-1, 0, hEdge(x - 1, y)]);
  if (b !== d && x < W) out.push([1, 0, hEdge(x, y)]);
  return out;
}
function isNode(x, y) {
  const e = edgesAt(x, y);
  if (e.length >= 3) return true;
  return false;
}
/** Labels left and right of moving from (x,y) by (dx,dy). */
function sides(x, y, dx, dy) {
  // y is down; the left normal of (dx,dy) is (dy,-dx).
  const mx = x + dx / 2;
  const my = y + dy / 2;
  const lx = mx + dy / 2;
  const ly = my - dx / 2;
  const rx = mx - dy / 2;
  const ry = my + dx / 2;
  return [L(Math.floor(lx), Math.floor(ly)), L(Math.floor(rx), Math.floor(ry))];
}

const arcs = []; // {pts:[[x,y]...], left, right}
function walk(x, y, dx, dy, eid) {
  const pts = [[x, y]];
  const [left, right] = sides(x, y, dx, dy);
  visited[eid] = 1;
  let cx = x + dx;
  let cy = y + dy;
  for (;;) {
    pts.push([cx, cy]);
    if (cx === x && cy === y) break; // closed loop
    if (isNode(cx, cy)) break;
    const next = edgesAt(cx, cy).find(([, , id]) => !visited[id]);
    if (!next) break;
    const [ndx, ndy, nid] = next;
    visited[nid] = 1;
    cx += ndx;
    cy += ndy;
  }
  arcs.push({ pts, left, right });
}
for (let y = 0; y <= H; y++) {
  for (let x = 0; x <= W; x++) {
    if (!isNode(x, y)) continue;
    for (const [dx, dy, id] of edgesAt(x, y)) {
      if (!visited[id]) walk(x, y, dx, dy, id);
    }
  }
}
// Closed loops with no junction (an island held by one province).
for (let y = 0; y <= H; y++) {
  for (let x = 0; x <= W; x++) {
    for (const [dx, dy, id] of edgesAt(x, y)) {
      if (!visited[id]) walk(x, y, dx, dy, id);
    }
  }
}
// Only arcs touching land matter (water/water borders don't exist).
console.log(`arcs: ${arcs.length}`);

lap("arcs traced");
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i];
      const d =
        len === 0
          ? Math.hypot(x - x1, y - y1)
          : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const SIMPLIFY = 0.75;
for (const arc of arcs) {
  const closed =
    arc.pts.length > 2 &&
    arc.pts[0][0] === arc.pts.at(-1)[0] &&
    arc.pts[0][1] === arc.pts.at(-1)[1];
  if (closed) {
    // Split at the point furthest from the start, simplify both halves.
    const [x0, y0] = arc.pts[0];
    let far = 1;
    let farD = -1;
    arc.pts.forEach(([x, y], i) => {
      const d = (x - x0) ** 2 + (y - y0) ** 2;
      if (d > farD) {
        farD = d;
        far = i;
      }
    });
    const a = simplify(arc.pts.slice(0, far + 1), SIMPLIFY);
    const b = simplify(arc.pts.slice(far), SIMPLIFY);
    arc.pts = [...a, ...b.slice(1)];
  } else {
    arc.pts = simplify(arc.pts, SIMPLIFY);
  }
}

// Rings per province: arcs oriented with the province on their left.
const provRings = Array.from({ length: nProv }, () => []);
{
  const byProv = Array.from({ length: nProv }, () => []);
  arcs.forEach((arc, i) => {
    if (arc.left >= 0) byProv[arc.left].push(i); // forward
    if (arc.right >= 0) byProv[arc.right].push(~i); // reversed
  });
  const startOf = (r) => (r >= 0 ? arcs[r].pts[0] : arcs[~r].pts.at(-1));
  const endOf = (r) => (r >= 0 ? arcs[r].pts.at(-1) : arcs[~r].pts[0]);
  const key = ([x, y]) => `${x},${y}`;
  for (let p = 0; p < nProv; p++) {
    const refs = byProv[p];
    const byStart = new Map();
    for (const r of refs) {
      const k = key(startOf(r));
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(r);
    }
    const used = new Set();
    for (const r0 of refs) {
      if (used.has(r0)) continue;
      const ring = [];
      let r = r0;
      for (;;) {
        used.add(r);
        ring.push(r);
        const endK = key(endOf(r));
        if (endK === key(startOf(r0))) break;
        const next = (byStart.get(endK) ?? []).find((c) => !used.has(c));
        if (next === undefined)
          throw new Error(`open ring in ${ANCHORS[p][0]}`);
        r = next;
      }
      provRings[p].push(ring);
    }
  }
}

lap("rings built");
// ---------------------------------------------------------------- output

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ownerOf = new Map();
for (const pw of POWERS)
  for (const name of pw.provinces) ownerOf.set(name, pw.id);
for (const nat of NATIVES) {
  for (const name of nat.provinces) {
    if (ownerOf.has(name)) throw new Error(`${name} has two owners`);
    ownerOf.set(name, nat.id);
  }
}
const anchorIndex = new Map(ANCHORS.map(([name], i) => [name, i]));
for (const name of ownerOf.keys()) {
  if (!anchorIndex.has(name))
    throw new Error(`owner lists unknown province ${name}`);
}

const SEA_LANE_KM = 320;
const provinces = ANCHORS.map(([name, lat, lon, good, terrainOverride], p) => {
  const votes = terrainVotes[p];
  let terrain = 0;
  for (let t = 1; t < 9; t++) if (votes[t] > votes[terrain]) terrain = t;
  const lc = labelCell[p];
  const lx = lc % W;
  const ly = (lc - lx) / W;
  const nb = [];
  for (const [k, e] of border) {
    const [a, b] = k.split(",").map(Number);
    if (a !== p && b !== p) continue;
    const q = a === p ? b : a;
    const km = haversineKm(
      cellLat(ly),
      cellLon(lx),
      cellLat(Math.floor(labelCell[q] / W)),
      cellLon(labelCell[q] % W),
    );
    const river = e.river >= Math.max(3, e.len * 0.25) ? 1 : 0;
    nb.push([q, Math.round(km), river, 0]);
  }
  for (const [q] of strait[p]) {
    if (nb.some(([n]) => n === q)) continue;
    const km = haversineKm(
      cellLat(ly),
      cellLon(lx),
      cellLat(Math.floor(labelCell[q] / W)),
      cellLon(labelCell[q] % W),
    );
    nb.push([q, Math.round(km), 0, 1]);
  }
  const sea = [];
  for (const [q, d] of seaReach[p]) {
    const midLat = (cellLat(ly) + cellLat(Math.floor(labelCell[q] / W))) / 2;
    const waterKm = d * kmPerCell(midLat);
    const directKm = haversineKm(
      cellLat(ly),
      cellLon(lx),
      cellLat(Math.floor(labelCell[q] / W)),
      cellLon(labelCell[q] % W),
    );
    sea.push([q, Math.round(Math.max(waterKm, directKm * 0.8))]);
  }
  nb.sort((a, b) => a[0] - b[0]);
  sea.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return {
    id: slug(name),
    name,
    lat: Math.round(cellLat(ly) * 100) / 100,
    lon: Math.round(cellLon(lx) * 100) / 100,
    x: lx + 0.5,
    y: ly + 0.5,
    terrain: terrainOverride ?? TERRAIN_NAMES[terrain - 1],
    good,
    areaKm2: Math.round(areaKm2[p]),
    coastal: coastal[p] === 1,
    owner: ownerOf.get(name) ?? null,
    nb,
    // Coastal provinces reachable by sea, nearest first: [province, km].
    sea: coastal[p] ? sea : [],
  };
});
// Sea lanes go both ways and need a coast at each end.
for (const p of provinces) p.sea = p.sea.filter(([q]) => provinces[q].coastal);

{
  const ids = new Set();
  for (const p of provinces) {
    if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}`);
    ids.add(p.id);
  }
}

const data = {
  // Bump when the map changes in a way saved games can't follow.
  version: 2,
  width: W,
  height: H,
  seaLaneKm: SEA_LANE_KM,
  provinces,
  powers: POWERS.map(({ id, name, adjective, color, provinces: ps }) => ({
    id,
    name,
    adjective,
    color,
    provinces: ps.map((n) => anchorIndex.get(n)),
  })),
  natives: NATIVES.map(({ id, name, color, horse, strong, provinces: ps }) => ({
    id,
    name,
    color,
    horse: !!horse,
    strong: !!strong,
    provinces: ps.map((n) => anchorIndex.get(n)),
  })),
};

// Arcs delta-encoded as integers; rings as arc refs (~i = reversed).
const usedArcs = arcs.filter((a) => a.left >= 0 || a.right >= 0);
const arcIndex = new Map(usedArcs.map((a, i) => [a, i]));
const remap = (r) => (r >= 0 ? arcIndex.get(arcs[r]) : ~arcIndex.get(arcs[~r]));
const encode = (pts, scale = 1) => {
  const out = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of pts) {
    const ix = Math.round(x * scale);
    const iy = Math.round(y * scale);
    out.push(ix - px, iy - py);
    px = ix;
    py = iy;
  }
  return out;
};
// South America as drawn backdrop: the continent's outline south and east of
// the Darién cut, at half-cell precision. Islands off it are provinces or
// too small to matter.
function backdropRings() {
  // The clip region (lon, lat), counter-clockwise and convex.
  const region = [
    [darienLon(LAT0 - 0.5), LAT0 - 0.5],
    [LON1 + 2, LAT0 - 0.5],
    [LON1 + 2, 13.2],
    [darienLon(13.2), 13.2],
  ];
  const inside = (p, a, b) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  const cross = (p, q, a, b) => {
    const [x1, y1] = p;
    const [x2, y2] = q;
    const [x3, y3] = a;
    const [x4, y4] = b;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  const clip = (ring) => {
    let out = ring;
    for (let i = 0; i < region.length; i++) {
      const a = region[i];
      const b = region[(i + 1) % region.length];
      const input = out;
      out = [];
      for (let j = 0; j < input.length; j++) {
        const cur = input[j];
        const prev = input[(j + input.length - 1) % input.length];
        if (inside(cur, a, b)) {
          if (!inside(prev, a, b)) out.push(cross(prev, cur, a, b));
          out.push(cur);
        } else if (inside(prev, a, b)) out.push(cross(prev, cur, a, b));
      }
      if (out.length === 0) break;
    }
    return out;
  };
  const areaOf = (ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    return Math.abs(a / 2);
  };
  const out = [];
  for (const f of readGeo("ne_50m_land.geojson").features) {
    const g = f.geometry;
    const polys =
      g.type === "Polygon"
        ? [g.coordinates]
        : g.type === "MultiPolygon"
          ? g.coordinates
          : [];
    for (const poly of polys) {
      const clipped = clip(poly[0]);
      if (clipped.length < 3 || areaOf(clipped) < 4) continue;
      const pts = clipped.map(([lon, lat]) => proj(lon, lat));
      pts.push(pts[0]);
      out.push(encode(simplify(pts, 0.6), 2));
    }
  }
  return out;
}

/** Names written on the sea and the land beyond the board, as on old charts. */
const CHART_LABELS = [
  ["Tierra Firme", 8.2, -66.5, "land", 0],
  ["Mar del Norte", 31, -62, "sea", 0],
  ["Golfo de México", 24.5, -92, "sea", 0],
  ["Mar del Sur", 14, -103, "sea", 0],
  ["Mar del Sur", 34, -128, "sea", -8],
  ["Mar Caribe", 14.8, -75, "sea", 0],
  ["Hudson's Bay", 59.5, -86, "sea", 0],
].map(([text, lat, lon, kind, angle]) => {
  const [x, y] = proj(lon, lat);
  return { text, x: Math.round(x), y: Math.round(y), kind, angle };
});

const geo = {
  version: 2,
  width: W,
  height: H,
  backdrop: backdropRings(),
  labels: CHART_LABELS,
  // Each arc: [left province, right province, ...delta-encoded points].
  arcs: usedArcs.map((a) => [a.left, a.right, ...encode(a.pts)]),
  rings: provRings.map((rings) => rings.map((ring) => ring.map(remap))),
  // Rivers at half-cell precision, delta-encoded.
  rivers: riverLines
    .filter((r) => r.major)
    .map((r) =>
      encode(
        simplify(
          r.pts.map(([x, y]) => [
            Math.max(-2, Math.min(W + 2, x)),
            Math.max(-2, Math.min(H + 2, y)),
          ]),
          0.8,
        ),
        2,
      ),
    ),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "americas.json"), JSON.stringify(data));
fs.writeFileSync(path.join(OUT_DIR, "americas-geo.json"), JSON.stringify(geo));
const sizes = ["americas.json", "americas-geo.json"].map((f) => {
  const buf = fs.readFileSync(path.join(OUT_DIR, f));
  return `${f} ${(buf.length / 1e3).toFixed(0)}KB (${(zlib.gzipSync(buf).length / 1e3).toFixed(0)}KB gzipped)`;
});
console.log(sizes.join(", "));

// ---------------------------------------------------------------- report

const areas = provinces.map((p) => p.areaKm2).sort((a, b) => a - b);
console.log(
  `${provinces.length} provinces; area km² min ${areas[0]}, median ${areas[areas.length >> 1]}, max ${areas.at(-1)}`,
);
const biggest = [...provinces]
  .sort((a, b) => b.areaKm2 - a.areaKm2)
  .slice(0, 12);
console.log(
  "biggest:",
  biggest.map((p) => `${p.name} ${Math.round(p.areaKm2 / 1000)}k`).join(", "),
);
const lonely = provinces.filter((p) => p.nb.length === 0 && p.sea.length === 0);
if (lonely.length)
  console.log("unreachable:", lonely.map((p) => p.name).join(", "));
const terrainCount = {};
for (const p of provinces)
  terrainCount[p.terrain] = (terrainCount[p.terrain] ?? 0) + 1;
console.log("terrain:", JSON.stringify(terrainCount));

// ---------------------------------------------------------------- debug pictures

if (PNG_DIR) {
  fs.mkdirSync(PNG_DIR, { recursive: true });
  const crc = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return (buf) => {
      let c = -1;
      for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
  })();
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const writePng = (file, w, h, rgb) => {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    fs.writeFileSync(
      file,
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
      ]),
    );
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const scale = Number(process.env.PNG_SCALE ?? 3);
  const pw = Math.floor(W / scale);
  const ph = Math.floor(H / scale);
  const render = (file, colorOf, crop) => {
    const [cx0, cy0, cw, ch, s] = crop ?? [0, 0, W, H, scale];
    const w = Math.floor(cw / s);
    const h = Math.floor(ch / s);
    const rgb = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const gx = Math.floor(cx0 + x * s);
        const gy = Math.floor(cy0 + y * s);
        const i = gy * W + gx;
        const p = LABEL[i];
        let c;
        if (p < 0) c = LAKE[i] ? [120, 160, 200] : [40, 70, 110];
        else {
          const gx2 = Math.floor(cx0 + x * s + s);
          const gy2 = Math.floor(cy0 + y * s + s);
          const edge =
            (gx2 < W && LABEL[gy * W + gx2] !== p) ||
            (gy2 < H && LABEL[gy2 * W + gx] !== p);
          c = edge ? [20, 20, 20] : colorOf(p);
        }
        rgb[(y * w + x) * 3] = c[0];
        rgb[(y * w + x) * 3 + 1] = c[1];
        rgb[(y * w + x) * 3 + 2] = c[2];
      }
    writePng(path.join(PNG_DIR, file), w, h, rgb);
  };
  const rand = (p) => {
    let h = (p + 1) * 2654435761;
    return [(h >>> 0) & 255, (h >>> 8) & 255, (h >>> 16) & 255].map(
      (v) => 80 + (v % 160),
    );
  };
  const terrainColor = {
    plains: [200, 200, 120],
    forest: [60, 120, 60],
    hills: [150, 140, 90],
    mountains: [120, 100, 90],
    jungle: [20, 90, 40],
    desert: [220, 190, 130],
    marsh: [90, 130, 120],
    tundra: [200, 210, 210],
  };
  const goodColor = {
    tobacco: [140, 90, 40],
    sugar: [240, 240, 240],
    furs: [110, 70, 50],
    silver: [180, 180, 200],
    cotton: [250, 220, 230],
    grain: [230, 200, 60],
    fish: [60, 140, 220],
    timber: [40, 100, 40],
    cattle: [200, 120, 80],
  };
  const ownerColor = new Map();
  for (const pw2 of POWERS)
    for (const n of pw2.provinces)
      ownerColor.set(anchorIndex.get(n), hex(pw2.color));
  for (const nat of NATIVES)
    for (const n of nat.provinces)
      ownerColor.set(anchorIndex.get(n), hex(nat.color));
  render("provinces.png", rand);
  render("terrain.png", (p) => terrainColor[provinces[p].terrain]);
  render("goods.png", (p) => goodColor[provinces[p].good]);
  render("owners.png", (p) => ownerColor.get(p) ?? [225, 215, 190]);
  // Close-ups: eastern North America and the Caribbean.
  const [ex, ey] = proj(-100, 52);
  const [ex2, ey2] = proj(-52, 24);
  render("east-na.png", rand, [ex, ey, ex2 - ex, ey2 - ey, 1.2]);
  const [cx, cy] = proj(-90, 27);
  const [cx2, cy2] = proj(-58, 7);
  render("caribbean.png", rand, [cx, cy, cx2 - cx, cy2 - cy, 1.2]);
  console.log(`pictures in ${PNG_DIR} (${pw}x${ph})`);
}
