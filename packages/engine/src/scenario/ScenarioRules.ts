import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  Team,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ScenarioSide } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "../game/Game";
import { scenarioStartLabels } from "./ScenarioLabels";
import {
  landWaves,
  ScenarioPlaces,
  ScenarioWave,
  waveCap,
} from "./ScenarioWaves";

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
   * How much more `attacker`'s attacks on `defender` cost now, on `tile`
   * (1: no change; 1.5: half as much again; SCEN3 r27: below 1, cheaper), on
   * top of the front rules (ScenarioFronts.ts). For a nation weaker or
   * stronger in attack for a while, or beyond a line.
   */
  attackFactor?(
    game: Game,
    attacker: Player,
    defender: Player,
    tile: TileRef,
  ): number;
  /**
   * Every second (each side win check, every 10 ticks), just before the
   * check: for what happens at a time (reinforcements landing) or when
   * something changes hands. Like the other hooks it works from the game's
   * state and its tick count; what it must remember it keeps as scenario
   * marks (game state), so a game restored from a snapshot plays on the
   * same.
   */
  tick?(game: Game): void;
  /**
   * Troops (counted as the data counts them, like troopCapBonus) that
   * `player`'s troop cap is raised by now, on top of its data's
   * troopCapBonus: an army that grows as the war goes on (waves). Players
   * see it in their troop bar (PlayerUpdate.scenarioCap).
   */
  troopCapBonus?(game: Game, player: Player): number;
  /**
   * SCEN3 (r27): the enemy the computer's logic sends a nation after first,
   * by land or sea, or null: Europe 1939's Germany goes for Poland, Korea's
   * North for the South. It still answers attacks first and keeps its
   * reserve (AiAttackBehavior). Only the computer's logic reads it; a
   * person chooses for themselves.
   */
  target?(game: Game, nation: Player): Player | null;
  /**
   * SCEN3 (r27): whether the computer's logic leaves enemy `other` alone
   * for now (it still answers its attacks): Europe 1939's Axis and the
   * Soviet Union while their pact holds. A person chooses for themselves.
   */
  spares?(game: Game, nation: Player, other: Player): boolean;
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
  france: 10 * 600,
  united_kingdom: 10 * 600,
  // SCEN3 (r27): and the Allies that were still neutral in 1939 (the Low
  // Countries and Norway until spring 1940, Yugoslavia and Greece until
  // the Balkan campaign), so a computer-run Germany's first war is Poland's
  // and not an answer to Belgium's attack.
  belgium: 10 * 600,
  netherlands: 10 * 600,
  norway: 10 * 600,
  yugoslavia: 10 * 600,
  greece: 10 * 600,
};

/**
 * SCEN3 (r27): the Soviet Union stays out (the pact) until the Axis attacks
 * it, or until minute 20 (June 1941), extending round 25's ten minutes. The
 * mark `soviet_war` holds the tick it entered the war.
 */
export const EUROPE_1939_SOVIET_PACT_TICKS = 20 * 600;
export const EUROPE_1939_SOVIET_WAR = "soviet_war";

/**
 * SCEN3 (r27): then the Red Army is a wall at home (its data's homeland
 * rule), but its attacks beyond its 1939 borders cost extra for a while
 * after it enters the war: a slow steamroller, not an instant win. Each
 * step is [minutes after entering, factor].
 */
export const EUROPE_1939_SOVIET_ABROAD: readonly (readonly [number, number])[] =
  [
    [15, 2],
    [30, 1.5],
  ];

/**
 * SCEN3 (r27): Germany goes for Poland first and runs through it, as in
 * September 1939, when the computer runs Germany (Europe 1939's `target`;
 * it still answers attacks and keeps its reserve). Against a computer-run
 * Poland only, Germany's attacks cost this much for the first minutes
 * (whoever plays Germany); a person playing Poland gets a real fight.
 */
export const EUROPE_1939_BLITZ_TICKS = 6 * 600;
export const EUROPE_1939_BLITZ_FACTOR = 0.5;

/** The player playing scenario nation `key`, if any. */
export function scenarioPlayer(game: Game, key: string): Player | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  for (const p of game.players()) {
    if (scenario.nationOf(p)?.key === key) return p;
  }
  return null;
}

/**
 * Korea 1950 (SCEN3 r27): the UN's reinforcements and China's volunteers
 * (ScenarioWaves.ts). Places in full-size map pixels.
 */
export const KOREA_1950_PLACES: ScenarioPlaces = {
  busan: [823, 1708],
  incheon: [404, 1290],
  sasebo: [909, 2143],
};

/**
 * The UN pushing north past this map row (full-size pixels; Pyongyang is
 * at 972, the Chongchon and Hamhung about 800) brings China in, as in
 * October 1950: the mark `china` is set, and its waves follow.
 */
export const KOREA_1950_YALU_LINE = 880;
export const KOREA_1950_CHINA = "china";

/**
 * Busan's wave lands if the UN still holds the pocket (else in Japan, where
 * it helps less); Incheon's comes only while the UN holds Busan (else not
 * at all): at Incheon if the UN holds it, else it sails from South Korea's
 * coast (or Japan) and lands on it. Holding the pocket pays. China's
 * three come only after the UN nears the Yalu, to save a collapsing North,
 * not to win the war on their own.
 */
export const KOREA_1950_WAVES: ScenarioWave[] = [
  {
    id: "busan",
    minute: 3,
    side: "UnitedNations",
    troops: 500_000,
    cap: 500_000,
    at: ["busan", "sasebo"],
    by: ["un_command", "south_korea"],
    news: "un",
  },
  {
    id: "incheon",
    minute: 8,
    side: "UnitedNations",
    troops: 800_000,
    cap: 800_000,
    requires: "busan",
    at: ["incheon"],
    assault: "incheon",
    by: ["south_korea", "un_command"],
    news: "un",
  },
  ...[0, 2, 4].map(
    (minute, i): ScenarioWave => ({
      id: `china${i + 1}`,
      minute,
      after: KOREA_1950_CHINA,
      side: "NorthKorea",
      troops: 400_000,
      cap: 400_000,
      by: ["north_korea"],
      news: "china",
    }),
  ),
];

/** China enters once a UN nation holds land north of the Yalu line. */
function koreaChinaEnters(game: Game): void {
  if (game.scenarioMark(KOREA_1950_CHINA) !== undefined) return;
  const scenario = game.scenario();
  if (scenario === null) return;
  const north = scenarioPlayer(game, "north_korea");
  if (north === null || !north.isAlive()) return;
  const line = KOREA_1950_YALU_LINE / scenario.scale;
  for (const p of game.players()) {
    if (p.team() !== "UnitedNations") continue;
    let past = false;
    p.borderTiles().forEach((t) => {
      if (!past && game.y(t) < line) past = true;
    });
    if (past) {
      game.setScenarioMark(KOREA_1950_CHINA, game.ticks());
      return;
    }
  }
}

/**
 * Thirteen Colonies 1776 (SCEN3 r27): Britain starts with its garrisons and
 * its army comes from overseas in waves, at New York (where Howe's army is
 * on Staten Island), Boston and Charleston: it lands where Britain holds
 * the port, else sails for it and lands on whoever holds it. After
 * Saratoga, France enters the war for the Patriots: its army lands at the
 * Chesapeake (Yorktown) or Newport with a fleet. Places in full-size map
 * pixels. Tuned with the balance runs.
 */
export const COLONIES_1776_PLACES: ScenarioPlaces = {
  staten_island: [927, 923],
  new_york: [934, 909],
  boston: [1159, 670],
  charleston: [483, 1920],
  quebec: [1039, 141],
  yorktown: [771, 1356],
  newport: [1139, 739],
};
const COLONIES = [
  "virginia",
  "pennsylvania",
  "massachusetts",
  "new_york",
  "north_carolina",
  "south_carolina",
  "maryland",
  "connecticut",
  "new_jersey",
  "georgia",
  "new_hampshire",
  "rhode_island",
  "delaware",
];
export const COLONIES_1776_WAVES: ScenarioWave[] = [
  {
    id: "howe",
    minute: 2,
    side: "British",
    troops: 1_200_000,
    cap: 1_200_000,
    at: ["staten_island", "new_york"],
    assault: "new_york",
    by: ["great_britain"],
    news: "british",
  },
  {
    id: "boston",
    minute: 7,
    side: "British",
    troops: 1_200_000,
    cap: 1_200_000,
    at: ["boston"],
    assault: "boston",
    by: ["great_britain"],
    news: "british",
  },
  {
    id: "charleston",
    minute: 12,
    side: "British",
    troops: 1_200_000,
    cap: 1_200_000,
    at: ["charleston"],
    assault: "charleston",
    by: ["great_britain"],
    news: "british",
  },
  {
    id: "clinton",
    minute: 18,
    side: "British",
    troops: 1_200_000,
    cap: 1_200_000,
    at: ["new_york", "staten_island"],
    assault: "new_york",
    by: ["great_britain"],
    news: "british",
  },
  {
    id: "france",
    minute: 15,
    side: "Patriots",
    troops: 1_000_000,
    cap: 1_000_000,
    at: ["yorktown", "newport"],
    by: COLONIES,
    ships: 4,
    news: "france",
  },
];

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
  // SCEN3 (r27): Britain's army in waves, and France.
  colonies1776: {
    tick: (game) => {
      landWaves(game, COLONIES_1776_WAVES, COLONIES_1776_PLACES);
    },
    troopCapBonus: (game, player) => waveCap(game, COLONIES_1776_WAVES, player),
  },
  // Round 25's balance idea C (no data names it): Loyalist colonies.
  colonies1776_loyalists: {
    tick: (game) => {
      turnColonies1776Loyalists(game);
    },
  },
  // SCEN3 (r27): the UN's waves, China's, and the North's hold (data).
  korea1950: {
    // The North's war aim: the South, to the last island.
    target: (game, nation) =>
      game.scenario()?.nationOf(nation)?.key === "north_korea"
        ? enemyNation(game, nation, "south_korea")
        : null,
    tick: (game) => {
      koreaChinaEnters(game);
      landWaves(game, KOREA_1950_WAVES, KOREA_1950_PLACES);
    },
    troopCapBonus: (game, player) => waveCap(game, KOREA_1950_WAVES, player),
  },
  europe1939: {
    tick: (game) => {
      europe1939SovietEntry(game);
    },
    holdsFire: (game, nation) => {
      const key = game.scenario()?.nationOf(nation)?.key;
      if (key === "soviet_union") {
        return (
          sovietEntry(game) === null && nation.incomingAttacks().length === 0
        );
      }
      const until =
        key !== undefined &&
        Object.prototype.hasOwnProperty.call(EUROPE_1939_HOLD_TICKS, key)
          ? EUROPE_1939_HOLD_TICKS[key]
          : 0;
      return game.ticks() < until && nation.incomingAttacks().length === 0;
    },
    attackFactor: (game, attacker, defender, tile) => {
      const scenario = game.scenario();
      if (scenario === null) return 1;
      const key = scenario.nationOf(attacker)?.key;
      const t = game.ticks();
      if (key === "soviet_union") {
        let f = t < EUROPE_1939_PURGE_TICKS ? EUROPE_1939_PURGE_FACTOR : 1;
        const own = scenario.data.nations.findIndex((n) => n.key === key) + 1;
        if (scenarioStartLabels(game, scenario)[tile] !== own) {
          f *= sovietAbroadFactor(game);
        }
        return f;
      }
      if (
        key === "germany" &&
        t < EUROPE_1939_BLITZ_TICKS &&
        defender.type() === PlayerType.Nation &&
        scenario.nationOf(defender)?.key === "poland"
      ) {
        return EUROPE_1939_BLITZ_FACTOR;
      }
      return 1;
    },
    target: (game, nation) =>
      game.scenario()?.nationOf(nation)?.key === "germany"
        ? enemyNation(game, nation, "poland")
        : null,
    // The pact binds both ways: the computer's Axis leaves the Soviet
    // Union alone until it is in the war (minute 20, or a person's attack).
    spares: (game, nation, other) =>
      nation.team() === "Axis" &&
      game.scenario()?.nationOf(other)?.key === "soviet_union" &&
      sovietEntry(game) === null,
  },
};

/** Scenario nation `key`, if it is alive and an enemy of `nation`. */
function enemyNation(game: Game, nation: Player, key: string): Player | null {
  const p = scenarioPlayer(game, key);
  if (p === null || !p.isAlive()) return null;
  if (p.team() === null || p.team() === nation.team()) return null;
  return p;
}

/**
 * Europe 1939: the tick the Soviet Union entered the war (the Axis
 * attacked it, or the pact ran out), or null while it stays out.
 */
export function sovietEntry(game: Game): number | null {
  const mark = game.scenarioMark(EUROPE_1939_SOVIET_WAR);
  if (mark !== undefined) return mark;
  return game.ticks() >= EUROPE_1939_SOVIET_PACT_TICKS
    ? EUROPE_1939_SOVIET_PACT_TICKS
    : null;
}

/** Each second: the Soviet Union enters the war once attacked. */
function europe1939SovietEntry(game: Game): void {
  if (game.scenarioMark(EUROPE_1939_SOVIET_WAR) !== undefined) return;
  const ussr = scenarioPlayer(game, "soviet_union");
  if (ussr === null) return;
  const t = game.ticks();
  const attacked = ussr
    .incomingAttacks()
    .some((a) => a.attacker().team() !== ussr.team());
  if (attacked || t >= EUROPE_1939_SOVIET_PACT_TICKS) {
    game.setScenarioMark(
      EUROPE_1939_SOVIET_WAR,
      attacked ? t : Math.min(t, EUROPE_1939_SOVIET_PACT_TICKS),
    );
  }
}

/** What a Soviet attack beyond its 1939 borders costs now (1: as usual). */
export function sovietAbroadFactor(game: Game): number {
  const entry = sovietEntry(game);
  if (entry === null) return EUROPE_1939_SOVIET_ABROAD[0]?.[1] ?? 1;
  const since = game.ticks() - entry;
  for (const [minutes, factor] of EUROPE_1939_SOVIET_ABROAD) {
    if (since < minutes * 600) return factor;
  }
  return 1;
}

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
 * other sides before any neutral, and a neutral starts no wars at all; and
 * (SCEN3 r27) any enemy the scenario's rule spares for now.
 */
export function scenarioSparesTarget(
  game: Game,
  nation: Player,
  other: Player,
): boolean {
  if (game.scenario() === null) return false;
  if (nation.team() !== null && other.team() === null) return true;
  return scenarioRule(game)?.spares?.(game, nation, other) ?? false;
}

/** Whether a nation on a side still has an enemy (a nation on another side). */
export function scenarioHasSideEnemies(game: Game, nation: Player): boolean {
  const side = nation.team();
  if (game.scenario() === null || side === null) return false;
  return game.players().some((p) => p.team() !== null && p.team() !== side);
}

/**
 * SCEN3 (r27): the enemy the computer's logic sends `nation` after first
 * now (its scenario rule's `target`), or null.
 */
export function scenarioTarget(game: Game, nation: Player): Player | null {
  if (game.scenario() === null) return null;
  return scenarioRule(game)?.target?.(game, nation) ?? null;
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
