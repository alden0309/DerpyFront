import { ScenarioConfig } from "@openfront/engine-api/Schemas";
import {
  isPlayable,
  ScenarioData,
  scenarioData,
  ScenarioNation,
} from "./ScenarioData";

/**
 * SCEN (r25): who plays which nation. The config's seats are kept where they
 * are valid (a playable nation, a player in the game, one seat each); every
 * player still without one gets the first free playable nation in the
 * data's order. Nations left over are computer-run. The engine, the client
 * and the server all call this with the same inputs, so they agree.
 *
 * `players` are the human players' clientIDs, in the game's roster order.
 * Returns nation key -> clientID, in the data's nation order.
 */
export function resolveScenarioSeats(
  data: ScenarioData,
  seats: Readonly<Record<string, string>> | undefined,
  players: readonly string[],
): Map<string, string> {
  const result = new Map<string, string>();
  const seated = new Set<string>();
  const inGame = new Set(players);
  for (const n of data.nations) {
    const clientID = seats?.[n.key];
    if (clientID === undefined || !isPlayable(n)) continue;
    if (!inGame.has(clientID) || seated.has(clientID)) continue;
    result.set(n.key, clientID);
    seated.add(clientID);
  }
  for (const clientID of players) {
    if (seated.has(clientID)) continue;
    const free = data.nations.find((n) => isPlayable(n) && !result.has(n.key));
    if (free === undefined) break;
    result.set(free.key, clientID);
    seated.add(clientID);
  }
  // Back in the data's order.
  const ordered = new Map<string, string>();
  for (const n of data.nations) {
    const c = result.get(n.key);
    if (c !== undefined) ordered.set(n.key, c);
  }
  return ordered;
}

/** A game's scenario and its resolved seats, or null for ordinary games. */
export interface ScenarioRoster {
  data: ScenarioData;
  /** nation key -> clientID */
  seats: Map<string, string>;
}

export function scenarioRoster(
  config: { scenario?: ScenarioConfig; gameMap: string },
  players: readonly string[],
): ScenarioRoster | null {
  const data = scenarioData(config.scenario?.id);
  if (data === null || data.map !== config.gameMap) return null;
  return {
    data,
    seats: resolveScenarioSeats(data, config.scenario?.seats, players),
  };
}

/**
 * The scenario nation a player plays: a human by their seat, a computer-run
 * nation by its name (unique within a scenario).
 */
export function rosterNationOf(
  roster: ScenarioRoster,
  player: { clientID: string | null; name: string },
): ScenarioNation | null {
  if (player.clientID !== null) {
    for (const [key, clientID] of roster.seats) {
      if (clientID === player.clientID) {
        return roster.data.nations.find((n) => n.key === key) ?? null;
      }
    }
    return null;
  }
  return (
    roster.data.nations.find(
      (n) => n.name === player.name && !roster.seats.has(n.key),
    ) ?? null
  );
}

/** The nations no player took: they are computer-run. */
export function computerNations(roster: ScenarioRoster): ScenarioNation[] {
  return roster.data.nations.filter((n) => !roster.seats.has(n.key));
}
