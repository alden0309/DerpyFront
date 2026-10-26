import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  goalMetAt,
  goalPlaceAt,
  goalTile,
  scenarioGoal,
  type ScenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import { Game, Player } from "../game/Game";
import { ScenarioRuntime } from "./Scenario";

/**
 * DFX (r26): the Scenario players' optional goals, checked as the war goes
 * (WinCheckExecution, once a second) and once more when it ends
 * (GameImpl.setWinner). A goal met is written into the player's stats as
 * the tick it was met, which the saved game carries. Stats are bookkeeping
 * only: nothing here changes the game, so DERPY_RULES stays as it is.
 */

/** Ticks between the checks (WinCheckExecution runs every 10th tick). */
export const GOAL_CHECK_INTERVAL = 10;

// Each goal's tile, worked out once per game: a cache, not game state, so a
// restored game's object graph matches the original's.
const TILES = new WeakMap<ScenarioRuntime, Map<ScenarioGoal, TileRef | null>>();

function tileFor(
  game: Game,
  scenario: ScenarioRuntime,
  goal: ScenarioGoal,
): TileRef | null {
  let byGoal = TILES.get(scenario);
  if (byGoal === undefined) {
    byGoal = new Map();
    TILES.set(scenario, byGoal);
  }
  let t = byGoal.get(goal);
  if (t === undefined) {
    const at = goalPlaceAt(scenario.data, goal);
    t = at === null ? null : goalTile(at, game, scenario.scale);
    byGoal.set(goal, t);
  }
  return t;
}

/** Whether `p` (or, for a side goal, its side) holds the goal's place. */
function holds(
  game: Game,
  p: Player,
  goal: ScenarioGoal,
  tile: TileRef,
): boolean {
  const owner = game.owner(tile);
  if (!owner.isPlayer()) return false;
  if (owner === p) return true;
  const team = p.team();
  return goal.side === true && team !== null && owner.team() === team;
}

/** Checks every human player's goal; `final`: the war has just ended. */
export function checkScenarioGoals(game: Game, final: boolean): void {
  const scenario = game.scenario();
  if (scenario === null) return;
  const elapsed = Math.round(game.elapsedGameSeconds() * 10);
  for (const p of game.allPlayers()) {
    if (p.clientID() === null) continue;
    if (game.stats().getPlayerStats(p)?.goal !== undefined) continue;
    const nation = scenario.nationOf(p);
    const goal = scenarioGoal(scenario.data.id, nation?.key);
    if (goal === null) continue;
    const tile = tileFor(game, scenario, goal);
    if (tile === null) continue;
    const met = goalMetAt(
      goal,
      { elapsed, holds: holds(game, p, goal, tile), team: p.team() },
      final,
      GOAL_CHECK_INTERVAL,
    );
    if (met) game.stats().recordScenarioGoal(p, game.ticks());
  }
}
