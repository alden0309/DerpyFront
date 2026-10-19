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
