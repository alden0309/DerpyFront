import { TileRef } from "@openfront/engine-api/game/GameMap";
import { MessageType, Team } from "@openfront/engine-api/game/GameTypes";
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
}

/** The special rules, by name. Add one here and name it in the data. */
export const SCENARIO_RULES: Record<string, ScenarioRule> = {};

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
 * holding more than its share of the land. `percent` is the bar (the
 * scenario's, lowered by Overtime). At the lobby timer or the hard limit,
 * pass `timeUp` and the side with the most land wins.
 */
export function scenarioWinner(
  game: Game,
  percent: number,
  timeUp: boolean,
): Team | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  const tiles = new Map<Team, number>();
  for (const side of scenario.sideIds()) tiles.set(side, 0);
  const alive = new Set<Team>();
  for (const p of game.players()) {
    const side = p.team();
    if (side === null || !tiles.has(side)) continue;
    alive.add(side);
    tiles.set(side, tiles.get(side)! + p.numTilesOwned());
  }
  if (alive.size === 1) return [...alive][0];
  if (alive.size === 0) return null;
  let best: Team | null = null;
  let bestTiles = -1;
  for (const side of scenario.sideIds()) {
    if (!alive.has(side)) continue;
    const t = tiles.get(side)!;
    if (t > bestTiles) {
      best = side;
      bestTiles = t;
    }
  }
  if (best === null) return null;
  if (timeUp) return best;
  const land = game.numLandTiles() - game.numTilesWithFallout();
  // Cross-multiplied: whole percentages, exact integer math.
  return bestTiles * 100 > land * percent ? best : null;
}

/**
 * The scenario's bar for a land win at `elapsedSeconds`: its own percent,
 * lowered by Overtime as much as the usual bar would be.
 */
export function scenarioWinPercent(game: Game, elapsedSeconds: number): number {
  const scenario = game.scenario();
  if (scenario === null) return 100;
  const base = game.config().percentageTilesOwnedToWin(0);
  const now = game.config().percentageTilesOwnedToWin(elapsedSeconds);
  return Math.max(0, scenario.data.winPercent - (base - now));
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

/** Whether a computer-run nation is a neutral that starts no fights. */
export function scenarioPassiveNeutral(game: Game, nation: Player): boolean {
  return game.scenario() !== null && nation.team() === null;
}
