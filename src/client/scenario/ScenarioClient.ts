import type { ScenarioSide } from "@openfront/engine-lib/scenario/ScenarioData";
import type { ScenarioRoster } from "@openfront/engine-lib/scenario/ScenarioSeats";
import { sideMark } from "./ScenarioText";

/**
 * SCEN (r25): the Scenario of the game this client is showing, for the parts
 * of the game UI that only see a team name or a player view (the theme's
 * team colours, the leaderboard's side marks). GameView sets it when a game
 * starts; null in every other game.
 */
let active: ScenarioRoster | null = null;

export function setActiveScenario(roster: ScenarioRoster | null): void {
  active = roster;
}

export function activeScenario(): ScenarioRoster | null {
  return active;
}

/** The side a team name stands for in the active scenario. */
export function activeScenarioSide(team: string | null): ScenarioSide | null {
  if (active === null || team === null) return null;
  return active.data.sides.find((s) => s.id === team) ?? null;
}

/**
 * A player's name with its side's mark in front ("🔵 France"), for lists
 * that show plain text; unchanged outside a scenario and for neutrals.
 */
export function withSideMark(
  name: string,
  player: { team(): string | null },
): string {
  const side = activeScenarioSide(player.team());
  return side === null ? name : `${sideMark(side.color)} ${name}`;
}
