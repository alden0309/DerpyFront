import catalog from "resources/scenarios/index.json";
import { GameMapType } from "./GameTypes";

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
 * forts and the Red Army's purges.
 */
export const SCENARIO_EDITION = 2;

/**
 * A scenario whose play changed after that has an edition of its own (bump
 * it here, not SCENARIO_EDITION, when only one scenario changes): its older
 * games are refused, the other scenarios' still replay. 3 for Thirteen
 * Colonies 1776: the Royal Navy's blockade and Overtime from minute 40.
 */
const SCENARIO_EDITION_OF: Readonly<Record<string, number>> = {
  colonies1776: 3,
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
}

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
