import { GameMapImpl } from "@openfront/engine-lib/game/GameMapImpl";
import {
  scenarioTerritory,
  TerritoryMap,
} from "@openfront/engine-lib/scenario/ScenarioTerritory";
import { Game } from "../game/Game";
import { ScenarioRuntime } from "./Scenario";

/**
 * SCEN (r25): each tile's starting nation (1 + its index in the data; 0 for
 * none), worked out from the scenario's data and the map file (not the map
 * as the game has changed it), once per game and kept off the game's
 * objects, so a game restored from a snapshot finds exactly the same.
 */
const LABELS = new WeakMap<ScenarioRuntime, Uint16Array>();

/** The map as the map file has it (before any water nuke). */
function pristineMap(game: Game): TerritoryMap {
  const map = game.map();
  const impl = map instanceof GameMapImpl ? map : null;
  if (impl === null) return map;
  return {
    width: () => impl.width(),
    height: () => impl.height(),
    isLand: (ref) => (impl.pristineTerrainByte(ref) & 0x80) !== 0,
    isImpassable: (ref) => {
      const b = impl.pristineTerrainByte(ref);
      return (b & 0x80) !== 0 && (b & 0x1f) === 31;
    },
  };
}

export function scenarioStartLabels(
  game: Game,
  scenario: ScenarioRuntime,
): Uint16Array {
  let labels = LABELS.get(scenario);
  if (labels === undefined) {
    labels = scenarioTerritory(
      scenario.data,
      pristineMap(game),
      scenario.scale,
    );
    LABELS.set(scenario, labels);
  }
  return labels;
}
