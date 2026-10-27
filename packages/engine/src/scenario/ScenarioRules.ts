import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  Team,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { renderTroops } from "@openfront/engine-lib/Format";
import { ScenarioSide } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "../game/Game";
import { scenarioStartLabels } from "./ScenarioLabels";

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
  /**
   * How much more `attacker`'s attacks on `defender` cost now (1: no
   * change; 1.5: half as much again), on top of the front rules
   * (ScenarioFronts.ts). For a nation weaker or stronger in attack for a
   * while.
   */
  attackFactor?(game: Game, attacker: Player, defender: Player): number;
  /**
   * Every second (each side win check, every 10 ticks), just before the
   * check: for what happens at a time (reinforcements landing) or when
   * something changes hands. Like the other hooks it works from the game's
   * state and its tick count alone and keeps nothing of its own, so a game
   * restored from a snapshot plays on the same.
   */
  tick?(game: Game): void;
  /**
   * Troops (counted as the data counts them, like troopCapBonus) that
   * `player`'s troop cap is raised by now, on top of its data's
   * troopCapBonus: an army that grows as the war goes on. Like the rest,
   * from the game's state and tick count alone. Engine only for now: a
   * client's troop bar shows the data's cap (a balance idea under test).
   */
  troopCapBonus?(game: Game, player: Player): number;
}

/**
 * Europe 1939: the Red Army is the biggest on the board (its data gives it
 * the troops and the deep reserves), but the purges of 1937-38 left it
 * without most of its officers. For the first minutes every Soviet attack
 * costs this many times the troops and the time (players and computer
 * alike), and a computer-run Soviet Union starts no war meanwhile (its pact
 * with Germany) unless attacked. Tested at 5 and 10 minutes on the balance
 * runs.
 */
export const EUROPE_1939_PURGE_TICKS = 10 * 600;
export const EUROPE_1939_PURGE_FACTOR = 2;

/**
 * Europe 1939: the war in the west and the east didn't begin at once. The
 * Soviet Union holds back while the purges last (above); France and the
 * United Kingdom (the Phoney War, which lasted until May 1940) start no war
 * for the first ten minutes unless attacked. So Germany is dangerous early,
 * as it was. (Tuned on the balance runs: with three minutes in the west the
 * Allies won every game.)
 */
export const EUROPE_1939_HOLD_TICKS: Record<string, number> = {
  soviet_union: EUROPE_1939_PURGE_TICKS,
  france: 10 * 600,
  united_kingdom: 10 * 600,
};

/**
 * Thirteen Colonies 1776, a balance idea put to the owner (no scenario's data
 * names this rule yet, so nothing plays it): Britain's reinforcements from
 * overseas, Howe's regiments and the Hessians, land in waves. A wave lands
 * at the first of its places Britain's side still holds (a tile of it
 * within LANDING_REACH full-size tiles), else at Quebec, and joins Britain's
 * troops; everyone hears. Troops are counted as the data counts them
 * (troopCapBonus): a tenth of the engine's. A wave can take Britain over its
 * troop cap for a while; the excess drains back as any troops over the cap
 * do. Tuned with the balance runs (exported so they can try other waves).
 */
export const COLONIES_1776_PLACES: Record<string, readonly [number, number]> = {
  staten_island: [927, 923],
  new_york: [934, 909],
  charleston: [483, 1920],
  quebec: [1039, 141],
};
export interface Colonies1776Wave {
  minute: number;
  troops: number;
  /**
   * How much the wave raises Britain's troop cap for good, from its minute
   * on, wherever it lands (0 or absent: it only brings troops).
   */
  cap?: number;
  /** Where it lands: the first of these Britain's side holds, else Quebec. */
  at: readonly string[];
}
export const COLONIES_1776_WAVES: Colonies1776Wave[] = [
  { minute: 10, troops: 1_000_000, at: ["staten_island", "new_york"] },
  { minute: 20, troops: 1_000_000, at: ["staten_island", "new_york"] },
  {
    minute: 30,
    troops: 1_000_000,
    at: ["charleston", "staten_island", "new_york"],
  },
  {
    minute: 40,
    troops: 1_000_000,
    at: ["charleston", "staten_island", "new_york"],
  },
];
const LANDING_REACH = 8;
/** The news line for a landing at each place. */
const LANDING_NEWS: Record<string, string> = {
  staten_island: "events_display.scenario_landing_staten_island",
  new_york: "events_display.scenario_landing_new_york",
  charleston: "events_display.scenario_landing_charleston",
  quebec: "events_display.scenario_landing_quebec",
};

/** The player playing scenario nation `key`, if any. */
function scenarioPlayer(game: Game, key: string): Player | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  for (const p of game.players()) {
    if (scenario.nationOf(p)?.key === key) return p;
  }
  return null;
}

/** Whether `side` holds a tile within LANDING_REACH of full-size pixel `at`. */
function sideHoldsNear(
  game: Game,
  side: Team,
  at: readonly [number, number],
): boolean {
  const scenario = game.scenario();
  if (scenario === null) return false;
  const [cx, cy] = scenario.px(at);
  const r = Math.ceil(LANDING_REACH / scenario.scale);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!game.isValidCoord(x, y)) continue;
      const owner = game.owner(game.ref(x, y));
      if (owner.isPlayer() && owner.team() === side) return true;
    }
  }
  return false;
}

/** How much the waves landed so far have raised Britain's troop cap. */
function colonies1776WaveCap(game: Game, player: Player): number {
  if (game.scenario()?.nationOf(player)?.key !== "great_britain") return 0;
  const t = game.ticks();
  let cap = 0;
  for (const wave of COLONIES_1776_WAVES) {
    if (t >= wave.minute * 600) cap += wave.cap ?? 0;
  }
  return cap;
}

/** The wave due this second, if any, lands. */
function landColonies1776Waves(game: Game): void {
  const t = game.ticks();
  for (const wave of COLONIES_1776_WAVES) {
    const due = wave.minute * 600;
    // The hook runs every 10 ticks: exactly one run falls in the window.
    if (t < due || t >= due + 10) continue;
    const britain = scenarioPlayer(game, "great_britain");
    if (britain === null || !britain.isAlive()) return;
    const side = britain.team();
    if (side === null) return;
    const place = [...wave.at, "quebec"].find((k) => {
      const at = COLONIES_1776_PLACES[k];
      return (
        at !== undefined &&
        LANDING_NEWS[k] !== undefined &&
        sideHoldsNear(game, side, at)
      );
    });
    if (place === undefined) continue;
    const scale = game.scenario()?.scale ?? 1;
    const troops = (wave.troops * 10) / (scale > 1 ? 2 : 1);
    britain.addTroops(troops);
    game.displayMessage(
      LANDING_NEWS[place],
      MessageType.NAVAL_INVASION_INBOUND,
      null,
      undefined,
      { name: britain.displayName(), troops: renderTroops(troops) },
      undefined,
      britain.id(),
    );
  }
}

/**
 * Thirteen Colonies 1776, balance idea C (no data names it yet): Loyalist
 * colonies. A computer-run colony among these whose capital falls to
 * Britain's side (its capital gone, and the spot it started on held by
 * Britain's side) joins Britain's side for good, and everyone hears. A
 * player's colony never changes sides. New York and the south, where the
 * Loyalists were strongest.
 */
export const COLONIES_1776_LOYALISTS: string[] = [
  "new_york",
  "new_jersey",
  "north_carolina",
  "south_carolina",
  "georgia",
];

/**
 * The minute from which Loyalists rise (0: from the start). A capital that
 * fell earlier and is still Britain's then counts.
 */
export const COLONIES_1776_LOYALISTS_FROM = { minute: 0 };

/** Loyalist colonies whose capital has fallen this second join Britain. */
function turnColonies1776Loyalists(game: Game): void {
  const scenario = game.scenario();
  if (scenario === null) return;
  if (game.ticks() < COLONIES_1776_LOYALISTS_FROM.minute * 600) return;
  const side = scenarioPlayer(game, "great_britain")?.team() ?? null;
  if (side === null) return;
  for (const p of game.players()) {
    const key = scenario.nationOf(p)?.key;
    if (key === undefined || !COLONIES_1776_LOYALISTS.includes(key)) continue;
    if (p.type() !== PlayerType.Nation || !p.isAlive()) continue;
    if (p.team() === null || p.team() === side) continue;
    if (p.units(UnitType.Capital).length > 0) continue;
    const spawn = p.spawnTile();
    if (spawn === undefined) continue;
    const holder = game.owner(spawn);
    if (!holder.isPlayer() || holder.team() !== side) continue;
    p.setTeam(side);
    game.displayMessage(
      "events_display.scenario_loyalists",
      MessageType.ALLIANCE_ACCEPTED,
      null,
      undefined,
      { name: p.displayName(), side },
      undefined,
      p.id(),
    );
  }
}

/** The special rules, by name. Add one here and name it in the data. */
export const SCENARIO_RULES: Record<string, ScenarioRule> = {
  // Thirteen Colonies 1776's balance ideas, one by one and together (no
  // data names them until the owner picks).
  colonies1776_waves: {
    tick: (game) => {
      landColonies1776Waves(game);
    },
    troopCapBonus: colonies1776WaveCap,
  },
  colonies1776_loyalists: {
    tick: (game) => {
      turnColonies1776Loyalists(game);
    },
  },
  colonies1776: {
    tick: (game) => {
      landColonies1776Waves(game);
      turnColonies1776Loyalists(game);
    },
    troopCapBonus: colonies1776WaveCap,
  },
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
    attackFactor: (game, attacker) =>
      game.ticks() < EUROPE_1939_PURGE_TICKS &&
      game.scenario()?.nationOf(attacker)?.key === "soviet_union"
        ? EUROPE_1939_PURGE_FACTOR
        : 1,
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

/**
 * A neutral joins `side` for the rest of the game, and everyone hears. The
 * one path by which a neutral joins a side, whatever brought it in (an
 * invasion, its own attack, or diplomacy): its team becomes the side, so it
 * is at war with the other sides from then on and counts as its side for
 * the win (scenarioWinner), like any nation that started there.
 */
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

/** A side holding less than 1/500 of the land (0.2%) is beaten. */
export const SIDE_OUT_DIVISOR = 500;

/** The scenario mark holding the tick a side's hold (winByHolding) began. */
export function holdMark(side: Team): string {
  return `hold:${side}`;
}

/**
 * SCEN3 (r27): the side that has won, or null. There are no land bars: a
 * side wins only when every nation on every other side is beaten, which is
 * when those nations together hold under 0.2% of the land (a leftover fort
 * or islet the computer never gets round to doesn't hold the war up). A
 * neutral that joined a side counts as that side (it is on its team); one
 * that never joined counts for nobody. A side with `winByHolding` also wins
 * by holding that land for its `seconds` in a row (Korea 1950). At the
 * lobby timer or the hard limit (`timeUp`), the side holding the most of its
 * own starting land (its land now over its land at the start) wins.
 *
 * Runs once a second (WinCheckExecution): a hold's start and break are
 * kept as a scenario mark and told to everyone.
 */
export function scenarioWinner(game: Game, timeUp: boolean): Team | null {
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
  const minLand = Math.max(1, Math.ceil(land / SIDE_OUT_DIVISOR));
  const alive = new Set<Team>();
  for (const [side, t] of tiles) if (t >= minLand) alive.add(side);
  if (alive.size === 1) return [...alive][0];
  if (alive.size === 0) return null;
  const held = holdWinner(game, alive);
  if (held !== null) return held;
  if (!timeUp) return null;
  // Time's up: land now over land at the start, compared by
  // cross-multiplying (exact integers). Ties go to the first side listed.
  const start = sideStartTiles(game);
  let best: Team | null = null;
  let bestNow = 0;
  let bestStart = 1;
  for (const side of scenario.data.sides) {
    if (!alive.has(side.id)) continue;
    const now = tiles.get(side.id)!;
    const was = Math.max(1, start.get(side.id) ?? 0);
    if (best === null || now * bestStart > bestNow * was) {
      best = side.id;
      bestNow = now;
      bestStart = was;
    }
  }
  return best;
}

/**
 * The side whose hold (winByHolding) has lasted its seconds, or null.
 * A side that holds all the land its rule names starts its hold (a mark),
 * and loses it the moment the land is no longer all its own; everyone hears
 * both. A rule without seconds wins at once.
 */
function holdWinner(game: Game, alive: ReadonlySet<Team>): Team | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  for (const side of scenario.data.sides) {
    const rule = side.winByHolding;
    if (rule === undefined) continue;
    const key = holdMark(side.id);
    const since = game.scenarioMark(key);
    const holds = alive.has(side.id) && holdsToWin(game, side);
    const need = Math.max(0, Math.round((rule.seconds ?? 0) * 10));
    const news = side.id.toLowerCase();
    if (!holds) {
      if (since !== undefined) {
        game.setScenarioMark(key, null);
        game.displayMessage(
          `events_display.scenario_hold_broken_${news}`,
          MessageType.ATTACK_FAILED,
          null,
          undefined,
          { side: side.id },
        );
      }
      continue;
    }
    if (need === 0) return side.id;
    if (since === undefined) {
      game.setScenarioMark(key, game.ticks());
      game.displayMessage(
        `events_display.scenario_hold_started_${news}`,
        MessageType.CONQUERED_PLAYER,
        null,
        undefined,
        {
          side: side.id,
          until: game.ticks() + need,
          time: clockTime(need / 10),
        },
      );
      continue;
    }
    if (game.ticks() - since >= need) return side.id;
  }
  return null;
}

/** "2:30" for 150 seconds. */
function clockTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const SIDE_START = new WeakMap<object, Map<Team, number>>();

/** The land each side's nations held at the start (this map's tiles). */
export function sideStartTiles(game: Game): Map<Team, number> {
  const scenario = game.scenario();
  if (scenario === null) return new Map();
  let bySide = SIDE_START.get(scenario);
  if (bySide === undefined) {
    const labels = scenarioStartLabels(game, scenario);
    const perNation = new Uint32Array(scenario.data.nations.length + 1);
    for (let i = 0; i < labels.length; i++) perNation[labels[i]]++;
    bySide = new Map();
    for (const side of scenario.sideIds()) bySide.set(side, 0);
    scenario.data.nations.forEach((n, i) => {
      if (n.side === null) return;
      bySide!.set(n.side, (bySide!.get(n.side) ?? 0) + perNation[i + 1]);
    });
    SIDE_START.set(scenario, bySide);
  }
  return bySide;
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
  const labels = scenarioStartLabels(game, scenario);
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
