import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  Team,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { renderTroops } from "@openfront/engine-lib/Format";
import { TransportShipExecution } from "../execution/TransportShipExecution";
import { WarshipExecution } from "../execution/WarshipExecution";
import { Game, Player } from "../game/Game";

/**
 * SCEN3 (r27): reinforcements that arrive as a war goes on, for any
 * scenario's special rule (round 25's Thirteen Colonies waves, generalised:
 * Britain's army in 1776, France after Saratoga, the UN at Busan and
 * Incheon, China at the Yalu).
 *
 * A wave is due at its minute of the war, or that many minutes after a
 * scenario mark its rule sets (`after`: "china", when the UN nears the
 * Yalu). It lands once:
 *  - at the first of its places (`at`) its side holds (a tile within
 *    WAVE_LANDING_REACH full-size tiles): the side's nation holding it gets
 *    the troops ("UN reinforcements land at Busan");
 *  - else, with an `assault` place, the first nation of `by` still in the
 *    war gets the troops and sails them for that place, landing on whoever
 *    holds it ("UN forces sail for Incheon");
 *  - else that nation gets them where it is.
 * The troops (counted as the data counts them, like troopCapBonus: a tenth
 * of the engine's; half on a Compact map) come with `cap`, a raise of the
 * receiver's troop cap for good: troops over a nation's cap fall back to it
 * at once, so a wave without a cap raise would only refill a depleted army.
 * `ships` warships come too, from the receiver's port nearest the place's
 * waters (France's fleet). Everyone hears.
 *
 * What happened is kept as a scenario mark per wave (`wave:<id>`: 1 + the
 * receiver's index in the data, 0 for none), game state like the rest, so a
 * restored game lands nothing twice and keeps its cap raises.
 */
export interface ScenarioWave {
  /** Unique in its scenario; its mark is `wave:<id>`. */
  id: string;
  /** Due at this minute of the war, or this long after the mark `after`. */
  minute: number;
  after?: string;
  /** The side it reinforces. */
  side: Team;
  troops: number;
  cap?: number;
  /** Places (keys of the scenario's places) to land at, in order. */
  at?: readonly string[];
  /** Else: sail for this place and land on it. */
  assault?: string;
  /** Who gets it when it doesn't land at a place held: the first in the war. */
  by: readonly string[];
  /** Warships that come with it. */
  ships?: number;
  /**
   * Its news: `events_display.scenario_wave_<news>` (landing at a place),
   * `..._assault` (sailing for one) or `..._arrive` (no place); params name,
   * troops and place (a `scenario_place.<key>` translation key).
   */
  news: string;
}

/** A named spot, in full-size map pixels (scenario data coordinates). */
export type ScenarioPlaces = Readonly<
  Record<string, readonly [number, number]>
>;

/** How near a place a side must hold land for a wave to land there. */
export const WAVE_LANDING_REACH = 8;

export function waveMark(id: string): string {
  return `wave:${id}`;
}

/** Lands every wave that is due (a rule's tick, once a second). */
export function landWaves(
  game: Game,
  waves: readonly ScenarioWave[],
  places: ScenarioPlaces,
): void {
  if (game.scenario() === null) return;
  const t = game.ticks();
  for (const wave of waves) {
    if (game.scenarioMark(waveMark(wave.id)) !== undefined) continue;
    let due = wave.minute * 600;
    if (wave.after !== undefined) {
      const since = game.scenarioMark(wave.after);
      if (since === undefined) continue;
      due += since;
    }
    if (t < due) continue;
    landWave(game, wave, places);
  }
}

/**
 * How much the waves landed so far have raised `player`'s troop cap, as the
 * data counts troops (a rule's troopCapBonus hook).
 */
export function waveCap(
  game: Game,
  waves: readonly ScenarioWave[],
  player: Player,
): number {
  const scenario = game.scenario();
  if (scenario === null) return 0;
  let index = 0;
  let cap = 0;
  for (const wave of waves) {
    if (!wave.cap) continue;
    const mark = game.scenarioMark(waveMark(wave.id));
    if (mark === undefined || mark === 0) continue;
    if (index === 0) {
      const n = scenario.nationOf(player);
      if (n === null) return 0;
      index = scenario.data.nations.indexOf(n) + 1;
    }
    if (mark === index) cap += wave.cap;
  }
  return cap;
}

function landWave(
  game: Game,
  wave: ScenarioWave,
  places: ScenarioPlaces,
): void {
  for (const key of wave.at ?? []) {
    const at = places[key];
    if (at === undefined) continue;
    const holder = sideHolderNear(game, wave.side, at);
    if (holder !== null) {
      give(game, wave, holder, key, null, places);
      return;
    }
  }
  const by = firstInWar(game, wave.side, wave.by);
  if (by === null) {
    game.setScenarioMark(waveMark(wave.id), 0);
    return;
  }
  const assault =
    wave.assault !== undefined && places[wave.assault] !== undefined
      ? wave.assault
      : null;
  give(game, wave, by, null, assault, places);
}

function give(
  game: Game,
  wave: ScenarioWave,
  to: Player,
  place: string | null,
  assault: string | null,
  places: ScenarioPlaces,
): void {
  const scenario = game.scenario()!;
  const n = scenario.nationOf(to);
  game.setScenarioMark(
    waveMark(wave.id),
    n === null ? 0 : scenario.data.nations.indexOf(n) + 1,
  );
  const troops = (wave.troops * 10) / (scenario.scale > 1 ? 2 : 1);
  to.addTroops(troops);
  const where = place ?? assault;
  if (assault !== null) {
    const target = nearestLand(game, scenario.px(places[assault]));
    if (target !== null && game.owner(target) !== to) {
      game.addExecution(new TransportShipExecution(to, target, troops));
    }
  }
  if (wave.ships && where !== null) {
    sendShips(game, to, scenario.px(places[where]), wave.ships);
  }
  const kind = assault !== null ? "_assault" : where === null ? "_arrive" : "";
  game.displayMessage(
    `events_display.scenario_wave_${wave.news}${kind}`,
    MessageType.NAVAL_INVASION_INBOUND,
    null,
    undefined,
    {
      name: to.displayName(),
      troops: renderTroops(troops),
      place: where === null ? "" : `scenario_place.${where}`,
    },
    undefined,
    to.id(),
  );
}

/** The first nation of `keys` on `side` still in the war, or null. */
function firstInWar(
  game: Game,
  side: Team,
  keys: readonly string[],
): Player | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  for (const key of keys) {
    for (const p of game.players()) {
      if (scenario.nationOf(p)?.key !== key) continue;
      if (p.isAlive() && p.team() === side) return p;
    }
  }
  return null;
}

/**
 * The nation on `side` holding the tile nearest full-size pixel `at`
 * within WAVE_LANDING_REACH, or null.
 */
export function sideHolderNear(
  game: Game,
  side: Team,
  at: readonly [number, number],
): Player | null {
  const scenario = game.scenario();
  if (scenario === null) return null;
  const [cx, cy] = scenario.px(at);
  const r = Math.ceil(WAVE_LANDING_REACH / scenario.scale);
  let best: Player | null = null;
  let bestD = Infinity;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!game.isValidCoord(x, y)) continue;
      const owner = game.owner(game.ref(x, y));
      if (!owner.isPlayer() || owner.team() !== side) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        best = owner;
        bestD = d;
      }
    }
  }
  return best;
}

/** The land tile nearest (x, y) within 30 tiles, or null. */
function nearestLand(game: Game, [cx, cy]: [number, number]): TileRef | null {
  return nearestTile(game, cx, cy, 30, (t) => game.isLand(t));
}

function nearestTile(
  game: Game,
  cx: number,
  cy: number,
  reach: number,
  ok: (t: TileRef) => boolean,
): TileRef | null {
  let best: TileRef | null = null;
  let bestD = Infinity;
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (!ok(t)) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * `count` warships for `to`, from its port nearest the water off (x, y),
 * stationed there. None if it has no port on that water.
 */
function sendShips(
  game: Game,
  to: Player,
  [cx, cy]: [number, number],
  count: number,
): void {
  if (game.config().isUnitDisabled(UnitType.Warship)) return;
  const water = nearestTile(game, cx, cy, 40, (t) => game.isOcean(t));
  if (water === null) return;
  for (let i = 0; i < count; i++) {
    const spawn = to.warshipSpawn(water);
    if (spawn === false) return;
    const ship = to.buildUnit(
      UnitType.Warship,
      spawn,
      { patrolTile: water },
      true,
    );
    game.addExecution(new WarshipExecution(ship));
  }
}
