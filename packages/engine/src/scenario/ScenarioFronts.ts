import { TileRef } from "@openfront/engine-api/game/GameMap";
import { ScenarioFrontRules } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "../game/Game";
import { ScenarioRuntime } from "./Scenario";
import { scenarioStartLabels } from "./ScenarioLabels";
import { scenarioRule } from "./ScenarioRules";

/**
 * SCEN (r25): fronts that hold. Two rules every scenario plays by, so a war
 * isn't decided in its first minutes:
 *
 * - **Homeland:** attacking a nation on its own starting land costs more
 *   (`homeland`), and more again the more of its size it has lost
 *   (`lastStand`): a last stand.
 * - **Supply lines:** an attack costs more the farther it is from the
 *   attacker's own starting land (`supplyPer100` per 100 tiles beyond
 *   `supplyFreeRange`, at most `supplyMax`).
 *
 * The factors multiply, with any `attackFactor` of the scenario's special
 * rule, into one: the attacker's troop loss per tile and the time a tile
 * takes are both multiplied by it (AttackExecution). Ordinary games never
 * get here.
 *
 * Everything follows from the scenario's data, the map file and the players'
 * land now, so every client, and a game restored from a snapshot, works out
 * the same. The caches below are kept off the game's objects.
 */

// Tuned on the balance runs (round 2): the first values (0.3, 1.0, 40,
// 0.3, 2.0) let an early push snowball; these make a war turn more than once.
export const FRONT_DEFAULTS: Required<ScenarioFrontRules> = {
  homeland: 0.5,
  lastStand: 2.0,
  supplyFreeRange: 40,
  supplyPer100: 0.5,
  supplyMax: 2.5,
};

/** Tiles per side of a supply-distance cell (this map's tiles). */
const CELL = 16;

interface FrontCache {
  labels: Uint16Array;
  startTiles: Uint32Array;
  /** smallID -> 1 + nation index (0: no scenario nation). */
  nationBySmallID: Map<number, number>;
  /** nation index -> cell distances (in half cells) from its starting land. */
  supply: Map<number, Uint16Array>;
  gridW: number;
  gridH: number;
}

const CACHE = new WeakMap<ScenarioRuntime, FrontCache>();

function cache(game: Game, scenario: ScenarioRuntime): FrontCache {
  let c = CACHE.get(scenario);
  if (c === undefined) {
    const labels = scenarioStartLabels(game, scenario);
    const startTiles = new Uint32Array(scenario.data.nations.length + 1);
    for (let i = 0; i < labels.length; i++) startTiles[labels[i]]++;
    c = {
      labels,
      startTiles,
      nationBySmallID: new Map(),
      supply: new Map(),
      gridW: Math.ceil(game.width() / CELL),
      gridH: Math.ceil(game.height() / CELL),
    };
    CACHE.set(scenario, c);
  }
  return c;
}

function nationIndex(
  c: FrontCache,
  scenario: ScenarioRuntime,
  p: Player,
): number {
  let i = c.nationBySmallID.get(p.smallID());
  if (i === undefined) {
    const n = scenario.nationOf(p);
    i = n === null ? 0 : scenario.data.nations.indexOf(n) + 1;
    c.nationBySmallID.set(p.smallID(), i);
  }
  return i;
}

/**
 * Distance from a nation's starting land, per cell, by a two-pass chamfer
 * transform (2 straight, 3 diagonal: half cells, near enough to straight
 * line distance), over land and sea alike: a landing is supplied by sea.
 */
function supplyGrid(c: FrontCache, game: Game, label: number): Uint16Array {
  let g = c.supply.get(label);
  if (g !== undefined) return g;
  const W = c.gridW;
  const H = c.gridH;
  const MAX = 0xffff;
  g = new Uint16Array(W * H).fill(MAX);
  const mapW = game.width();
  for (let t = 0; t < c.labels.length; t++) {
    if (c.labels[t] !== label) continue;
    const x = t % mapW;
    const y = (t - x) / mapW;
    g[((y / CELL) | 0) * W + ((x / CELL) | 0)] = 0;
  }
  const relax = (i: number, j: number, w: number) => {
    const v = g![j] + w;
    if (v < g![i]) g![i] = v > MAX ? MAX : v;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) relax(i, i - 1, 2);
      if (y > 0) {
        relax(i, i - W, 2);
        if (x > 0) relax(i, i - W - 1, 3);
        if (x < W - 1) relax(i, i - W + 1, 3);
      }
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) relax(i, i + 1, 2);
      if (y < H - 1) {
        relax(i, i + W, 2);
        if (x < W - 1) relax(i, i + W + 1, 3);
        if (x > 0) relax(i, i + W - 1, 3);
      }
    }
  }
  c.supply.set(label, g);
  return g;
}

/** The scenario's front rules, its own over the defaults. */
export function frontRules(
  scenario: ScenarioRuntime,
): Required<ScenarioFrontRules> {
  return { ...FRONT_DEFAULTS, ...(scenario.data.fronts ?? {}) };
}

/**
 * How much more an attack on `tile` costs: 1 outside a scenario, else the
 * homeland, supply and special-rule factors multiplied (at least 1).
 */
export function scenarioAttackFactor(
  game: Game,
  attacker: Player,
  defender: Player,
  tile: TileRef,
): number {
  const scenario = game.scenario();
  if (scenario === null) return 1;
  const c = cache(game, scenario);
  const rules = frontRules(scenario);
  let factor = 1;

  // Homeland: the defender on its own starting land.
  const d = nationIndex(c, scenario, defender);
  if (d !== 0 && c.labels[tile] === d) {
    const start = c.startTiles[d];
    const lost =
      start === 0 ? 0 : Math.max(0, 1 - defender.numTilesOwned() / start);
    factor *= 1 + rules.homeland + rules.lastStand * lost;
  }

  // Supply: the attacker's distance from its own starting land.
  const a = nationIndex(c, scenario, attacker);
  if (a !== 0 && rules.supplyPer100 > 0) {
    const grid = supplyGrid(c, game, a);
    const x = game.x(tile);
    const y = game.y(tile);
    const half = grid[((y / CELL) | 0) * c.gridW + ((x / CELL) | 0)];
    // Half cells to full-size tiles.
    const dist = (half * CELL * scenario.scale) / 2;
    const beyond = Math.max(0, dist - rules.supplyFreeRange);
    factor *= Math.min(
      rules.supplyMax,
      1 + (rules.supplyPer100 * beyond) / 100,
    );
  }

  const special = scenarioRule(game)?.attackFactor?.(game, attacker, defender);
  if (special !== undefined) factor *= special;
  return Math.max(1, factor);
}
