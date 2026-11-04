/**
 * StageMap — the little world the store's effect preview plays out on.
 *
 * A few hundred tiles of procedurally made coast (no map download), in the
 * engine's terrain-byte layout so TerrainPass draws it exactly like a match:
 * bit 7 land, bit 6 shoreline, bit 5 ocean, bits 0-4 magnitude. Two players
 * hold the land: the enemy in the west, you in the east.
 *
 * Pure (no WebGL, no DOM) and deterministic: the same bytes on every load.
 */

export const STAGE_W = 400;
export const STAGE_H = 225;

/** Owner smallIDs on the stage. */
export const STAGE_YOU = 1;
export const STAGE_ENEMY = 2;

export interface StageMapData {
  w: number;
  h: number;
  terrain: Uint8Array;
  /** Owner smallID per tile (0 = nobody: water). */
  owner: Uint8Array;
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 17);
    f *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

/** The strait between the two coasts, at row y. */
function straitAt(y: number): number {
  return STAGE_W * 0.52 + (fbm(5.1, y / 45, 13) - 0.5) * 70;
}

/**
 * How much land there is at (x, y), above 0 for land: two coasts facing each
 * other across a strait, with open sea along the south.
 */
function landField(x: number, y: number): number {
  const n = fbm(x / 60, y / 60, 7) - 0.5;
  const south = (y - STAGE_H * 0.78) / (STAGE_H * 0.2); // > 0 toward the south
  const strait = 1 - Math.abs(x - straitAt(y)) / 34; // > 0 in the strait
  return 0.4 + n * 1.1 - Math.max(0, south) * 1.1 - Math.max(0, strait) * 1.3;
}

let cached: StageMapData | undefined;

/** Build (once per page) the stage's terrain and ownership. */
export function stageMap(): StageMapData {
  if (cached) return cached;
  const w = STAGE_W;
  const h = STAGE_H;
  const land = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      land[y * w + x] = landField(x, y) > 0 ? 1 : 0;
    }
  }
  const terrain = new Uint8Array(w * h);
  const owner = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const isLand = land[i] === 1;
      let nearOther = false;
      let waterDist = 99;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          if (land[ny * w + nx] !== land[i]) {
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            if (d === 1) nearOther = true;
            waterDist = Math.min(waterDist, d);
          }
        }
      }
      if (isLand) {
        const relief = fbm(x / 28, y / 28, 41);
        const magnitude = Math.min(
          24,
          Math.max(0, Math.floor((relief - 0.42) * 46)),
        );
        terrain[i] = 0x80 | (nearOther ? 0x40 : 0) | magnitude;
        owner[i] = x < straitAt(y) ? STAGE_ENEMY : STAGE_YOU;
      } else {
        const depth = Math.min(10, waterDist === 99 ? 10 : waterDist * 2);
        terrain[i] = 0x20 | (nearOther ? 0x40 : 0) | depth;
      }
    }
  }
  cached = { w, h, terrain, owner };
  return cached;
}
