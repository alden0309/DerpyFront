import { GameMapType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { SCENARIO_IDS } from "@openfront/engine-api/game/Scenarios";
import colonies1776 from "resources/scenarios/colonies1776.json";
import continental1776 from "resources/scenarios/continental1776.json";
import europe1939 from "resources/scenarios/europe1939.json";

/**
 * SCEN (r25): a Scenario's data, as stored in resources/scenarios/<id>.json
 * (the format, with examples, is in resources/scenarios/README.md).
 *
 * Coordinates are pixels of the map's full-size (Normal) map.bin. A compact
 * game halves them, and the territory is the same polygons sampled at the
 * smaller map's pixel centres.
 */
export interface ScenarioData {
  id: string;
  /** Its English name ("Europe 1939"); shown from en.json where it can be. */
  title: string;
  map: GameMapType;
  /** The year it starts in (the full date and text are in en.json). */
  year: number;
  /**
   * A side wins when it holds more than this percent of the land (or when
   * every nation of every other side is gone).
   */
  winPercent: number;
  /** See ScenarioCatalogEntry.capitalFullTiles (it is copied to the index). */
  capitalFullTiles?: number;
  sides: ScenarioSide[];
  nations: ScenarioNation[];
  /**
   * A special rule this scenario has, by name (ScenarioRules.ts), for
   * something the data can't say. None of the first three need one.
   */
  rule?: string;
}

export interface ScenarioSide {
  /** The side's id, which is also its team name in the game. */
  id: string;
  /** English name, for the server's records ("Allies"). */
  name: string;
  /** "#rrggbb": the side's mark wherever players are listed. */
  color: string;
  /**
   * Optional: the percent of the land this side must hold to win, if not
   * the scenario's `winPercent` (a side that starts small needs less).
   */
  winPercent?: number;
  /**
   * Optional: the side also wins as soon as it holds all the starting land
   * of these nations (Korea 1950: North Korea wins holding all of South
   * Korea, base in Japan or not). Pieces of that land smaller than
   * `ignoreUnder` full-size tiles (islets) don't count.
   */
  winByHolding?: { nations: string[]; ignoreUnder?: number };
}

export type ScenarioStructureType =
  | "City"
  | "Port"
  | "Factory"
  | "Defense Post"
  | "Missile Silo"
  | "SAM Launcher";

export interface ScenarioStructure {
  type: ScenarioStructureType;
  at: [number, number];
  /** Level (default 1). */
  level?: number;
}

export interface ScenarioNation {
  /** Its key, here and in en.json (scenario_nation.<key>). */
  key: string;
  /** Its English name, the name it has in the game. */
  name: string;
  /** A flag from resources/flags (without .svg). */
  flag: string;
  /** Its side's id, or null for a neutral. */
  side: string | null;
  /** "#rrggbb": its territory colour. */
  color: string;
  /**
   * Starting troops, as a percent of the nation's troop cap once its capital
   * and cities stand (so it holds on every difficulty and map size).
   */
  troopsPercent: number;
  /** Starting gold. */
  gold: number;
  /**
   * Troops (as players see them) added to its troop cap for the whole game:
   * an army the map can't show, like Britain's from overseas in 1776. Half
   * as much in a Compact game.
   */
  troopCapBonus?: number;
  /** Where its capital stands. */
  capital: [number, number];
  structures?: ScenarioStructure[];
  /** Warships it starts with, each at a water pixel near one of its ports. */
  warships?: [number, number][];
  /** False keeps players from picking it (default true). */
  playable?: boolean;
  /**
   * Its territory: polygons as rings of integer pixel corners, each ring a
   * string "x0,y0,dx1,dy1,dx2,dy2,..." (deltas after the first point).
   * Rings are filled even-odd; where two nations' polygons overlap, the
   * first nation in the list keeps the tile, and land no polygon covers goes
   * to the nearest nation (ScenarioTerritory.ts).
   */
  regions: string[];
}

/** The structure types a scenario may place, as the game's unit types. */
export const SCENARIO_STRUCTURE_UNITS: Record<ScenarioStructureType, UnitType> =
  {
    City: UnitType.City,
    Port: UnitType.Port,
    Factory: UnitType.Factory,
    "Defense Post": UnitType.DefensePost,
    "Missile Silo": UnitType.MissileSilo,
    "SAM Launcher": UnitType.SAMLauncher,
  };

// Add a scenario: its JSON here, and its id in resources/scenarios/index.json
// (the order there is the menu's order).
const ALL: Record<string, ScenarioData> = {
  europe1939: europe1939 as unknown as ScenarioData,
  colonies1776: colonies1776 as unknown as ScenarioData,
  continental1776: continental1776 as unknown as ScenarioData,
};

/** A scenario's data, or null if there is no such scenario. */
export function scenarioData(id: string | undefined): ScenarioData | null {
  if (id === undefined) return null;
  return Object.prototype.hasOwnProperty.call(ALL, id) ? ALL[id] : null;
}

/** Every scenario's data, in the menu's order (resources/scenarios/index.json). */
export function allScenarioData(): ScenarioData[] {
  return SCENARIO_IDS.flatMap((id) => (id in ALL ? [ALL[id]] : []));
}

export function scenarioNation(
  data: ScenarioData,
  key: string,
): ScenarioNation | null {
  return data.nations.find((n) => n.key === key) ?? null;
}

/** Whether a player may pick this nation. */
export function isPlayable(n: ScenarioNation): boolean {
  return n.playable !== false;
}

/**
 * A scenario nation's in-game name with its player's: "France (Alden)".
 * Computer-run nations keep the plain name.
 */
export function scenarioPlayerName(nationName: string, username: string) {
  return `${nationName} (${username})`;
}
