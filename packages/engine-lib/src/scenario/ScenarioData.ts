import { GameMapType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { SCENARIO_IDS } from "@openfront/engine-api/game/Scenarios";
import colonies1776 from "resources/scenarios/colonies1776.json";
import continental1776 from "resources/scenarios/continental1776.json";
import europe1939 from "resources/scenarios/europe1939.json";
// SCEN2 (r25): six more scenarios.
import civilwar1861 from "resources/scenarios/civilwar1861.json";
import italy1859 from "resources/scenarios/italy1859.json";
import korea1950 from "resources/scenarios/korea1950.json";
import napoleon1812 from "resources/scenarios/napoleon1812.json";
import threekingdoms219 from "resources/scenarios/threekingdoms219.json";
import ww1914 from "resources/scenarios/ww1914.json";
import type { ScenarioLeaningWord } from "./ScenarioLeaning"; // DIPLO (r27)

/**
 * SCEN (r25): a Scenario's data, as stored in resources/scenarios/<id>.json
 * (the format, with examples, is in resources/scenarios/README.md).
 *
 * Coordinates are pixels of the map's full-size (Normal) map.bin. A compact
 * game halves them, and the territory is the same polygons sampled at the
 * smaller map's pixel centres.
 */
/**
 * How hard fronts hold in a scenario (ScenarioFronts.ts). Every field is
 * optional; the defaults suit any scenario. A factor makes attacks cost more
 * troops and take longer, multiplied together.
 */
export interface ScenarioFrontRules {
  /** Extra cost of attacking a nation's own starting land (0.3 = +30%). */
  homeland?: number;
  /**
   * Further cost there as the nation loses land: + lastStand x the share of
   * its starting size it has lost (1.0: up to +100% when nearly gone).
   */
  lastStand?: number;
  /** Full-size tiles an attacker may push beyond its starting land freely. */
  supplyFreeRange?: number;
  /** Extra cost per 100 full-size tiles beyond that (0.3 = +30%). */
  supplyPer100?: number;
  /** The most the supply cost can reach (2.0 = attacks cost double). */
  supplyMax?: number;
}

export interface ScenarioData {
  id: string;
  /** Its English name ("Europe 1939"); shown from en.json where it can be. */
  title: string;
  map: GameMapType;
  /** The year it starts in (the full date and text are in en.json). */
  year: number;
  /** See ScenarioCatalogEntry.capitalFullTiles (it is copied to the index). */
  capitalFullTiles?: number;
  /** Optional overrides of the front rules' defaults (ScenarioFrontRules). */
  fronts?: ScenarioFrontRules;
  /**
   * SCEN3 (r27): false for a scenario set before nuclear weapons (August
   * 1945): its games have no nukes, silos, SAMs or Domes, whatever the
   * host's Units settings (NUCLEAR_UNITS). Copied to the index.
   */
  nukes?: boolean;
  /**
   * SCEN3 (r27): what the bombs (atom, hydrogen, MIRV) cost here, as a
   * multiple of the usual (default 1). Korea 1950, the one scenario with
   * nukes, balances them with it.
   */
  nukePrice?: number;
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
   * Optional: the side also wins by holding all the starting land of these
   * nations (Korea 1950: North Korea wins holding all of South Korea, base
   * in Japan or not), for `seconds` in a row (0 or absent: at once; SCEN3
   * r27). Pieces of that land smaller than `ignoreUnder` full-size tiles
   * (islets) don't count. The hold breaks once `breakAt` full-size tiles
   * of that land or more aren't the side's (default 1: any tile), so a
   * raid by boat doesn't reset it. Otherwise a side wins only when every
   * nation on the other sides is beaten (ScenarioRules.scenarioWinner).
   */
  winByHolding?: {
    nations: string[];
    ignoreUnder?: number;
    seconds?: number;
    breakAt?: number;
  };
}

export type ScenarioStructureType =
  | "City"
  | "Port"
  | "Factory"
  | "Defense Post"
  | "Missile Silo"
  | "SAM Launcher"
  // SCEN3 (r27): the Dome of Alden (a nuke shield; Korea 1950's UN Japan).
  | "Dome";

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
  /**
   * How fast its troops grow back, as a multiple of the usual (default 1):
   * deep reserves, like the Red Army's in 1939 or Britain's from overseas
   * in 1776. A coalition of many small nations regrows faster in all than
   * one big nation with the same troops (the growth is concave), so a lone
   * great power facing many may need this.
   */
  troopGrowth?: number;
  /**
   * Its gold income (trade ships, trains and the steady income), as a
   * multiple of the usual (default 1): a blockade's 0.6 (Thirteen Colonies
   * 1776's colonies), a trading power's 1.2.
   */
  goldIncome?: number;
  /**
   * SCEN3 (r27): its own front rules over the scenario's (any field): the
   * supply fields when it attacks, homeland and lastStand when it is
   * attacked. Korea 1950: North Korea's supply runs out sooner.
   */
  fronts?: ScenarioFrontRules;
  /** Where its capital stands. */
  capital: [number, number];
  structures?: ScenarioStructure[];
  /** Warships it starts with, each at a water pixel near one of its ports. */
  warships?: [number, number][];
  /** False keeps players from picking it (default true). */
  playable?: boolean;
  // DIPLO (r27): courting the neutrals (README, "Courting the neutrals").
  /**
   * A neutral's historical leaning toward each side (side id -> word), which
   * multiplies its price there (ScenarioLeaning.ts). A side left out: "open".
   */
  leaning?: Record<string, ScenarioLeaningWord>;
  /** From `minute` on, these sides' leanings instead (Turkey 1939, late). */
  leaningLate?: { minute: number; sides: Record<string, ScenarioLeaningWord> };
  // DIPLO (r27) end
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
    Dome: UnitType.Dome,
  };

// Add a scenario: its JSON here, and its id in resources/scenarios/index.json
// (the order there is the menu's order).
const ALL: Record<string, ScenarioData> = {
  europe1939: europe1939 as unknown as ScenarioData,
  colonies1776: colonies1776 as unknown as ScenarioData,
  continental1776: continental1776 as unknown as ScenarioData,
  // SCEN2 (r25)
  threekingdoms219: threekingdoms219 as unknown as ScenarioData,
  napoleon1812: napoleon1812 as unknown as ScenarioData,
  italy1859: italy1859 as unknown as ScenarioData,
  civilwar1861: civilwar1861 as unknown as ScenarioData,
  ww1914: ww1914 as unknown as ScenarioData,
  korea1950: korea1950 as unknown as ScenarioData,
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
