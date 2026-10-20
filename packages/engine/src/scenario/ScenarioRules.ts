import { TileRef } from "@openfront/engine-api/game/GameMap";
import { MessageType, Team } from "@openfront/engine-api/game/GameTypes";
import { ScenarioSide } from "@openfront/engine-lib/scenario/ScenarioData";
import { scenarioTerritory } from "@openfront/engine-lib/scenario/ScenarioTerritory";
import { Game, Player } from "../game/Game";

/**
 * SCEN (r25): the rules a Scenario adds while it is played.
 *
 * Locked sides are teams (GameImpl gives each nation its side as its team),
 * so side-mates can't attack each other and win together through the
 * game's own team rules. What's added here:
 *  - a neutral invaded by one side joins that side's enemies, locked;
 *  - a neutral that attacks a side does the same;
 *  - the side win check;
 *  - special per-scenario rules, by name (`rule` in the data).
 */

/**
 * A scenario's special rule: what its data can't say, as code. A scenario
 * names one with its data's `rule`; each hook is optional and runs on every
 * client alike, so it must be deterministic like the rest of the engine
 * (the game's PRNG, DetMath, no clocks).
 */
export interface ScenarioRule {
  /** Once the board is laid out (the game's first tick). */
  start?(game: Game): void;
  /**
   * The side a neutral joins when it fights `against` (the side it was
   * invaded by, or attacked). undefined: the usual choice (enemySideFor);
   * null: it stays neutral this time.
   */
  sideToJoin?(
    game: Game,
    neutral: Player,
    against: Team,
  ): Team | null | undefined;
  /**
   * Whether a computer-run nation on a side starts no attacks for now (it
   * still builds and defends). Players are never held back.
   */
  holdsFire?(game: Game, nation: Player): boolean;
}

/**
 * Europe 1939: the war in the west and the east didn't begin at once. The
 * Soviet Union, bound by its pact with Germany, starts no war for the first
 * six minutes, and France and the United Kingdom (the Phoney War) for the
 * first two, unless attacked meanwhile. So Germany is dangerous early, as
 * it was.
 */
const EUROPE_1939_HOLD_TICKS: Record<string, number> = {
  soviet_union: 6 * 600,
  france: 2 * 600,
  united_kingdom: 2 * 600,
};

/** The special rules, by name. Add one here and name it in the data. */
export const SCENARIO_RULES: Record<string, ScenarioRule> = {
  europe1939: {
    holdsFire: (game, nation) => {
      const key = game.scenario()?.nationOf(nation)?.key;
      const until =
        key !== undefined &&
        Object.prototype.hasOwnProperty.call(EUROPE_1939_HOLD_TICKS, key)
          ? EUROPE_1939_HOLD_TICKS[key]
          : 0;
      return game.ticks() < until && nation.incomingAttacks().length === 0;
    },
  },
};

/** The game's special rule, if its scenario names one. */
export function scenarioRule(game: Game): ScenarioRule | null {
  const name = game.scenario()?.data.rule;
  if (name === undefined) return null;
  return Object.prototype.hasOwnProperty.call(SCENARIO_RULES, name)
    ? SCENARIO_RULES[name]
    : null;
}

/** The side a neutral fighting `against` joins: the rule's, else the usual. */
function sideToJoin(game: Game, neutral: Player, against: Team): Team | null {
  const chosen = scenarioRule(game)?.sideToJoin?.(game, neutral, against);
  return chosen === undefined ? enemySideFor(game, neutral, against) : chosen;
}

/**
 * Called when `attacker` invades `target`'s land: a land attack or a landing
 * that has begun, or a nuke or missile launched at it. Within a tick the
 * first call decides, as executions run in a fixed order on every client.
 */
export function onScenarioHostility(
  game: Game,
  attacker: Player,
  target: Player,
): void {
  const scenario = game.scenario();
  if (scenario === null || attacker === target) return;
  const a = attacker.team();
  const t = target.team();
  if (a !== null && t === null) {
    // A side invades a neutral: the neutral joins that side's enemies.
    joinSide(game, target, sideToJoin(game, target, a), attacker);
  } else if (a === null && t !== null) {
    // A neutral attacks a side: it joins that side's enemies.
    joinSide(game, attacker, sideToJoin(game, attacker, t), target);
  }
}

/**
 * The side a neutral joins against `against`: with two sides the other one;
 * with more, the other side it shares the longest land border with, or the
 * smallest (in land) if it borders none of them.
 */
export function enemySideFor(
  game: Game,
  neutral: Player,
  against: Team,
): Team | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  const others = scenario.sideIds().filter((s) => s !== against);
  if (others.length === 0) return null;
  if (others.length === 1) return others[0];

  const border = new Map<Team, number>();
  const nbuf: TileRef[] = [0, 0, 0, 0];
  neutral.borderTiles().forEach((tile) => {
    const n = game.neighbors4(tile, nbuf);
    for (let i = 0; i < n; i++) {
      const owner = game.owner(nbuf[i]);
      if (!owner.isPlayer() || owner === neutral) continue;
      const side = owner.team();
      if (side === null || !others.includes(side)) continue;
      border.set(side, (border.get(side) ?? 0) + 1);
    }
  });
  let best: Team | null = null;
  let bestLen = 0;
  for (const side of others) {
    const len = border.get(side) ?? 0;
    if (len > bestLen) {
      best = side;
      bestLen = len;
    }
  }
  if (best !== null) return best;
  // Borders none: the smallest of them.
  let smallest = others[0];
  for (const side of others.slice(1)) {
    if (sideTiles(game, side) < sideTiles(game, smallest)) smallest = side;
  }
  return smallest;
}

function sideTiles(game: Game, side: Team): number {
  let tiles = 0;
  for (const p of game.players()) {
    if (p.team() === side) tiles += p.numTilesOwned();
  }
  return tiles;
}

/** A neutral joins `side` for the rest of the game, and everyone hears. */
export function joinSide(
  game: Game,
  neutral: Player,
  side: Team | null,
  cause: Player,
): void {
  if (side === null || neutral.team() !== null) return;
  neutral.setTeam(side);
  game.displayMessage(
    "events_display.scenario_joined_side",
    MessageType.ALLIANCE_ACCEPTED,
    null,
    undefined,
    {
      name: neutral.displayName(),
      side,
      by: cause.displayName(),
    },
    undefined,
    neutral.id(),
  );
}

/**
 * The side that has won, or null: the only side with nations left, or one
 * holding more than its bar of the land. Each side's bar is its own
 * `winPercent` (a side that starts small needs less), else the scenario's,
 * lowered by Overtime as much as the usual bar would be at `elapsedSeconds`.
 * At the lobby timer or the hard limit, pass `timeUp`: the side nearest its
 * bar (land over bar) wins.
 */
/** A side holding less than 1/500 of the land (0.2%) is out of the war. */
export const SIDE_OUT_DIVISOR = 500;

export function scenarioWinner(
  game: Game,
  elapsedSeconds: number,
  timeUp: boolean,
): Team | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  const tiles = new Map<Team, number>();
  for (const side of scenario.sideIds()) tiles.set(side, 0);
  for (const p of game.players()) {
    const side = p.team();
    if (side === null || !tiles.has(side)) continue;
    tiles.set(side, tiles.get(side)! + p.numTilesOwned());
  }
  const land = game.numLandTiles() - game.numTilesWithFallout();
  // A side is still in the war while it holds a scrap of land worth the
  // name (0.2%): a fort or an islet the computer never gets round to
  // taking doesn't hold the war up.
  const minLand = Math.max(1, Math.ceil(land / SIDE_OUT_DIVISOR));
  const alive = new Set<Team>();
  for (const [side, t] of tiles) if (t >= minLand) alive.add(side);
  if (alive.size === 1) return [...alive][0];
  if (alive.size === 0) return null;
  // A side that holds all the land its rule names wins outright.
  for (const side of scenario.data.sides) {
    if (alive.has(side.id) && holdsToWin(game, side)) return side.id;
  }
  // The side furthest towards its bar: tiles / bar, compared by
  // cross-multiplying (exact integers). Ties go to the first side listed.
  let best: Team | null = null;
  let bestTiles = 0;
  let bestBar = 1;
  for (const side of scenario.data.sides) {
    if (!alive.has(side.id)) continue;
    const t = tiles.get(side.id)!;
    const bar = scenarioSideWinPercent(game, side.id, elapsedSeconds);
    if (best === null || t * bestBar > bestTiles * bar) {
      best = side.id;
      bestTiles = t;
      bestBar = bar;
    }
  }
  if (best === null) return null;
  if (timeUp) return best;
  // Whole percentages, exact integer math.
  return bestTiles * 100 > land * bestBar ? best : null;
}

/**
 * Whether `side` holds every tile its `winByHolding` names: the listed
 * nations' starting land, less its pieces (4-connected, same nation)
 * smaller than `ignoreUnder` full-size tiles. False without the rule, or
 * when the pieces left are none at all.
 */
export function holdsToWin(game: Game, side: ScenarioSide): boolean {
  const rule = side.winByHolding;
  const scenario = game.scenario();
  if (rule === undefined || scenario === null) return false;
  const targets = scenario.holdTargets(side.id, () =>
    holdTargetTiles(game, rule.nations, rule.ignoreUnder ?? 0),
  );
  if (targets.length === 0) return false;
  for (let i = 0; i < targets.length; i++) {
    const owner = game.owner(targets[i]);
    if (!owner.isPlayer() || owner.team() !== side.id) return false;
  }
  return true;
}

/**
 * The starting land of `nations` (keys) in this game's map, less the
 * pieces smaller than `ignoreUnder` full-size tiles.
 */
export function holdTargetTiles(
  game: Game,
  nations: readonly string[],
  ignoreUnder: number,
): Uint32Array {
  const scenario = game.scenario();
  if (scenario === null) return new Uint32Array(0);
  const data = scenario.data;
  const labels = scenarioTerritory(data, game.map(), scenario.scale);
  const wanted = new Set<number>();
  data.nations.forEach((n, i) => {
    if (nations.includes(n.key)) wanted.add(i + 1);
  });
  // The bar in this map's tiles (a Compact map has a quarter as many).
  const minTiles = Math.ceil(ignoreUnder / (scenario.scale * scenario.scale));
  const seen = new Uint8Array(labels.length);
  const out: number[] = [];
  const piece: number[] = [];
  const nbuf: TileRef[] = [0, 0, 0, 0];
  for (let t = 0; t < labels.length; t++) {
    const label = labels[t];
    if (seen[t] !== 0 || !wanted.has(label)) continue;
    // One piece: breadth first over the same nation's tiles.
    piece.length = 0;
    piece.push(t);
    seen[t] = 1;
    for (let k = 0; k < piece.length; k++) {
      const n = game.map().neighbors4(piece[k], nbuf);
      for (let j = 0; j < n; j++) {
        const u = nbuf[j];
        if (seen[u] === 0 && labels[u] === label) {
          seen[u] = 1;
          piece.push(u);
        }
      }
    }
    if (piece.length >= minTiles) for (const u of piece) out.push(u);
  }
  return Uint32Array.from(out);
}

/**
 * A side's bar for a land win at `elapsedSeconds`: its own percent (or the
 * scenario's), lowered by Overtime as much as the usual bar would be; at
 * least 1.
 */
export function scenarioSideWinPercent(
  game: Game,
  side: Team,
  elapsedSeconds: number,
): number {
  const data = game.scenario()?.data;
  if (data === undefined) return 100;
  const own = data.sides.find((s) => s.id === side)?.winPercent;
  const base = game.config().percentageTilesOwnedToWin(0);
  const now = game.config().percentageTilesOwnedToWin(elapsedSeconds);
  return Math.max(1, (own ?? data.winPercent) - (base - now));
}

/**
 * Whether computer-run `nation` should leave `other` alone while it has
 * side enemies to fight: in a scenario, a nation on a side goes for the
 * other sides before any neutral, and a neutral starts no wars at all.
 */
export function scenarioSparesTarget(
  game: Game,
  nation: Player,
  other: Player,
): boolean {
  if (game.scenario() === null) return false;
  return nation.team() !== null && other.team() === null;
}

/** Whether a nation on a side still has an enemy (a nation on another side). */
export function scenarioHasSideEnemies(game: Game, nation: Player): boolean {
  const side = nation.team();
  if (game.scenario() === null || side === null) return false;
  return game.players().some((p) => p.team() !== null && p.team() !== side);
}

/**
 * Whether a computer-run nation starts no fights for now: a neutral always,
 * a nation on a side when the scenario's rule holds it back.
 */
export function scenarioHoldsFire(game: Game, nation: Player): boolean {
  if (game.scenario() === null) return false;
  if (nation.team() === null) return true;
  return scenarioRule(game)?.holdsFire?.(game, nation) ?? false;
}
