import { GameMapType, GameMode } from "@openfront/engine-api/game/GameTypes";
import {
  scenarioDisabledUnits,
  scenarioEdition,
} from "@openfront/engine-api/game/Scenarios";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { isPlayable, ScenarioData, scenarioData } from "./ScenarioData";

/**
 * SCEN (r25): the settings a Scenario fixes, whatever else the host picked.
 * The solo screen and the game server both run a scenario game's config
 * through this, so a lobby can't be talked into a scenario on the wrong map
 * or with random tribes. Every other option (difficulty, units, gold,
 * AI personalities, timers...) stays the host's, except nukes in a scenario
 * set before them (SCEN3 r27).
 */
export function applyScenarioRules<C extends Partial<GameConfig>>(
  config: C,
): C {
  const data = scenarioData(config.scenario?.id);
  if (data === null || config.scenario === undefined) return config;
  // Played under this edition of the scenarios (replays of others are
  // refused: scenarioReplayable).
  config.scenario = {
    ...config.scenario,
    edition: scenarioEdition(config.scenario.id),
  };
  config.gameMap = data.map as GameMapType;
  config.gameMode = GameMode.Team;
  config.playerTeams = data.sides.length;
  config.bots = 0;
  config.randomSpawn = false;
  config.nations = "default";
  const seats = scenarioSeatCount(data);
  config.maxPlayers = Math.min(config.maxPlayers ?? seats, seats);
  // SCEN3 (r27): a scenario is won by beating the whole other side, so
  // Overtime (which lowers a land bar) has nothing to lower: it is off.
  config.overtime = { enabled: false };
  // SCEN3 (r27): a scenario set before nukes has none (Config.isUnitDisabled
  // enforces it whatever the config says; this keeps the record honest).
  const banned = scenarioDisabledUnits(config.scenario.id);
  if (banned.length > 0) {
    const units = new Set([...(config.disabledUnits ?? []), ...banned]);
    config.disabledUnits = [...units];
  }
  return config;
}

/** How many players a scenario takes: one per playable nation. */
export function scenarioSeatCount(data: ScenarioData): number {
  return data.nations.filter(isPlayable).length;
}

/**
 * DFX (r26): "Random nations": the host deals every player a seat at once.
 * The deal must seat only players in the lobby (`present`), each once, at
 * playable nations, and every player present; it replaces the seats.
 * Returns the new seats, or an error key.
 */
export function dealScenarioSeats(
  data: ScenarioData,
  deal: Readonly<Record<string, string>>,
  present: ReadonlySet<string>,
): { seats: Record<string, string> } | { error: string } {
  const seats: Record<string, string> = {};
  const seated = new Set<string>();
  for (const [key, clientID] of Object.entries(deal)) {
    const nation = data.nations.find((n) => n.key === key);
    if (nation === undefined || !isPlayable(nation)) {
      return { error: "no such nation" };
    }
    if (!present.has(clientID)) return { error: "no such player" };
    if (seated.has(clientID)) return { error: "a player in two seats" };
    seated.add(clientID);
    seats[key] = clientID;
  }
  const free = data.nations.filter(
    (n) => isPlayable(n) && seats[n.key] === undefined,
  ).length;
  // Everyone gets a seat while there are seats to give.
  for (const c of present) {
    if (!seated.has(c) && free > 0) return { error: "a player left out" };
  }
  return { seats };
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
