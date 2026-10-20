import { GameMapType, GameMode } from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { isPlayable, ScenarioData, scenarioData } from "./ScenarioData";

/**
 * SCEN (r25): the settings a Scenario fixes, whatever else the host picked.
 * The solo screen and the game server both run a scenario game's config
 * through this, so a lobby can't be talked into a scenario on the wrong map
 * or with random tribes. Every other option (difficulty, units, gold, nukes,
 * AI personalities, timers...) stays the host's.
 */
export function applyScenarioRules<C extends Partial<GameConfig>>(
  config: C,
): C {
  const data = scenarioData(config.scenario?.id);
  if (data === null) return config;
  config.gameMap = data.map as GameMapType;
  config.gameMode = GameMode.Team;
  config.playerTeams = data.sides.length;
  config.bots = 0;
  config.randomSpawn = false;
  config.nations = "default";
  const seats = scenarioSeatCount(data);
  config.maxPlayers = Math.min(config.maxPlayers ?? seats, seats);
  return config;
}

/** How many players a scenario takes: one per playable nation. */
export function scenarioSeatCount(data: ScenarioData): number {
  return data.nations.filter(isPlayable).length;
}

/**
 * A change of seat in a scenario lobby: `clientID` takes `nation` (null:
 * gives up their seat). Only players in the lobby (`present`) hold seats;
 * a seat whose holder has left counts as free. A player taking a seat
 * leaves their old one. A taken seat can only be given by the host
 * (`byHost`), and its holder is left without one.
 *
 * Returns the new seats, or an error key when the change isn't allowed.
 */
export function changeScenarioSeat(
  data: ScenarioData,
  seats: Readonly<Record<string, string>> | undefined,
  change: { clientID: string; nation: string | null; byHost: boolean },
  present: ReadonlySet<string>,
): { seats: Record<string, string> } | { error: string } {
  const next: Record<string, string> = {};
  for (const [key, holder] of Object.entries(seats ?? {})) {
    if (present.has(holder) && holder !== change.clientID) next[key] = holder;
  }
  if (change.nation === null) return { seats: next };
  const nation = data.nations.find((n) => n.key === change.nation);
  if (nation === undefined || !isPlayable(nation)) {
    return { error: "no such nation" };
  }
  const holder = next[nation.key];
  if (holder !== undefined && !change.byHost) {
    return { error: "seat taken" };
  }
  next[nation.key] = change.clientID;
  return { seats: next };
}
