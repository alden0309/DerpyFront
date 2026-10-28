import catalog from "resources/scenarios/index.json";
import { GameMapType, UnitType } from "./GameTypes";

/**
 * SCEN (r25): Scenarios, historical wars on maps we already have. This is
 * the light half that the schemas need (which scenarios exist, their map,
 * sides and nation keys), read from resources/scenarios/index.json. The
 * scenario data itself (territory, capitals, starting strength) is in
 * resources/scenarios/<id>.json, loaded by engine-lib/scenario/ScenarioData.
 * The format is in resources/scenarios/README.md.
 */

/**
 * The scenarios' edition. A game records the edition it was played under
 * (applyScenarioRules sets it at the start), and a replay of a game from
 * another edition is refused as one from another build: its war would not
 * play the same. Bump it when a change to a scenario's data or rules changes
 * how its games play. 1 (or none recorded): round 1's scenarios; 2: the 1776
 * scenarios on American Revolution - Detailed, fronts that hold, the 1939
 * forts and the Red Army's purges; 3 (SCEN3, r27): a side wins only by
 * beating the whole other side (no land bars), with Korea's, the 1776
 * scenarios' and Europe 1939's new rules and numbers.
 */
export const SCENARIO_EDITION = 3;

/**
 * A scenario whose play changed after that has an edition of its own (bump
 * it here, not SCENARIO_EDITION, when only one scenario changes): its older
 * games are refused, the other scenarios' still replay. Thirteen Colonies
 * 1776: 3 was the Royal Navy's blockade and Overtime from minute 40; 4
 * (SCEN3, r27) is edition 3's win rule with Britain's army in waves and
 * France (it can't be 3 again: its old games recorded 3). Korean War 1950:
 * 4 (SCEN3, r27) adds the armistice at minute 60.
 */
const SCENARIO_EDITION_OF: Readonly<Record<string, number>> = {
  colonies1776: 4,
  korea1950: 4,
};

/** The edition scenario `id`'s games are played under now. */
export function scenarioEdition(id: string): number {
  return Object.prototype.hasOwnProperty.call(SCENARIO_EDITION_OF, id)
    ? SCENARIO_EDITION_OF[id]
    : SCENARIO_EDITION;
}

/**
 * Whether a game played with this config can be replayed on this build: an
 * ordinary game always; a scenario game if it was played under its
 * scenario's edition now (scenarioEdition).
 */
export function scenarioReplayable(config: {
  scenario?: { id: string; edition?: number };
}): boolean {
  if (config.scenario === undefined) return true;
  return (config.scenario.edition ?? 1) === scenarioEdition(config.scenario.id);
}

/** Scenario, side and nation keys: lower case, digits and _. */
export const SCENARIO_KEY_RE = /^[a-z0-9_]{1,32}$/;

export interface ScenarioCatalogEntry {
  map: GameMapType;
  /** The side ids, which are the scenario's team names. */
  sides: string[];
  /** Every nation's key, in the data's order. */
  nations: string[];
  /**
   * A capital gives its full troop bonus to a nation holding at least this
   * many full-size tiles, and a share of it below (see the README).
   */
  capitalFullTiles?: number;
  /**
   * SCEN3 (r27): false in a scenario set before nuclear weapons (August
   * 1945): its games have none of NUCLEAR_UNITS, whatever the host's Units
   * settings say. Copied from the scenario's data (`nukes`).
   */
  nukes?: boolean;
}

/**
 * SCEN3 (r27): what a scenario without nukes leaves out: the bombs, the
 * silos that fire them, and the two units that only stop them (SAMs shoot
 * down nothing else, the Dome of Alden shields only from nukes).
 */
export const NUCLEAR_UNITS: readonly UnitType[] = [
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.MIRVWarhead,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
  UnitType.Dome,
];

export const SCENARIO_CATALOG: Readonly<Record<string, ScenarioCatalogEntry>> =
  catalog.scenarios as Record<string, ScenarioCatalogEntry>;

/** The scenario ids, in menu order. */
export const SCENARIO_IDS: readonly string[] = Object.keys(SCENARIO_CATALOG);

export function scenarioCatalogEntry(
  id: string | undefined,
): ScenarioCatalogEntry | null {
  if (id === undefined) return null;
  return Object.prototype.hasOwnProperty.call(SCENARIO_CATALOG, id)
    ? SCENARIO_CATALOG[id]
    : null;
}

/**
 * SCEN3 (r27): the units scenario `id` leaves out, whatever the host chose:
 * NUCLEAR_UNITS in a scenario without nukes, none otherwise (or outside a
 * scenario). Config.isUnitDisabled reads it, so no setting brings them back.
 */
export function scenarioDisabledUnits(
  id: string | undefined,
): readonly UnitType[] {
  return scenarioCatalogEntry(id)?.nukes === false ? NUCLEAR_UNITS : [];
}

/**
 * What's wrong with a scenario choice, or null when it is a valid one: a
 * known scenario, seats only at its own nations, and nobody in two seats.
 */
export function scenarioConfigProblem(c: {
  id: string;
  seats?: Record<string, string>;
}): string | null {
  const entry = scenarioCatalogEntry(c.id);
  if (entry === null) return `unknown scenario ${c.id}`;
  const seen = new Set<string>();
  for (const [nation, clientID] of Object.entries(c.seats ?? {})) {
    if (!entry.nations.includes(nation)) {
      return `${c.id} has no nation ${nation}`;
    }
    if (seen.has(clientID)) return `${clientID} holds two seats`;
    seen.add(clientID);
  }
  return null;
}
