import {
  Cell,
  GameMapSize,
  Nation,
  PlayerInfo,
  PlayerType,
  Team,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig, GameStartInfo } from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  ScenarioData,
  ScenarioNation,
  scenarioPlayerName,
} from "@openfront/engine-lib/scenario/ScenarioData";
import {
  computerNations,
  rosterNationOf,
  ScenarioRoster,
  scenarioRoster,
} from "@openfront/engine-lib/scenario/ScenarioSeats";

/**
 * SCEN (r25): a game's Scenario while it runs. Everything here follows from
 * the game's config and its human players, so a game restored from a
 * snapshot rebuilds it the same way; what changes in play (a neutral
 * joining a side) is the players' teams, which the snapshot keeps.
 */
export class ScenarioRuntime {
  readonly data: ScenarioData;
  readonly seats: Map<string, string>;
  /** Normal-size map pixels per pixel of this game's map (1, or 2 compact). */
  readonly scale: number;
  private readonly roster: ScenarioRoster;

  constructor(roster: ScenarioRoster, scale: number) {
    this.roster = roster;
    this.data = roster.data;
    this.seats = roster.seats;
    this.scale = scale;
  }

  /** The scenario nation a player (or a player's info) plays, if any. */
  nationOf(player: {
    clientID(): string | null;
    name(): string;
  }): ScenarioNation | null {
    return rosterNationOf(this.roster, {
      clientID: player.clientID(),
      name: player.name(),
    });
  }

  nationOfInfo(info: PlayerInfo): ScenarioNation | null {
    return rosterNationOf(this.roster, {
      clientID: info.clientID,
      name: info.name,
    });
  }

  /** The team a player starts on: its nation's side (null: neutral). */
  startingTeam(info: PlayerInfo): Team | null {
    return this.nationOfInfo(info)?.side ?? null;
  }

  sideIds(): Team[] {
    return this.data.sides.map((s) => s.id);
  }

  /** A full-size map pixel in this game's map. */
  px(at: readonly [number, number]): [number, number] {
    return [Math.floor(at[0] / this.scale), Math.floor(at[1] / this.scale)];
  }
}

/** The game's scenario, or null for an ordinary game. */
export function scenarioRuntime(
  config: GameConfig,
  humanClientIDs: readonly string[],
): ScenarioRuntime | null {
  if (config.scenario === undefined) return null;
  const roster = scenarioRoster(config, humanClientIDs);
  if (roster === null) return null;
  return new ScenarioRuntime(
    roster,
    config.gameMapSize === GameMapSize.Compact ? 2 : 1,
  );
}

/**
 * A scenario game's human players: each plays their seat's nation under its
 * name and flag, their own name added ("France (Alden)"). One without a seat
 * (more players than nations) keeps their own name and starts with no land.
 */
export function scenarioHumanInfo(
  roster: ScenarioRoster,
  p: GameStartInfo["players"][number],
  id: string,
): PlayerInfo {
  let nation: ScenarioNation | null = null;
  for (const [key, clientID] of roster.seats) {
    if (clientID === p.clientID) {
      nation = roster.data.nations.find((n) => n.key === key) ?? null;
    }
  }
  return new PlayerInfo(
    nation === null ? p.username : scenarioPlayerName(nation.name, p.username),
    PlayerType.Human,
    p.clientID,
    id,
    p.isLobbyCreator ?? false,
    p.clanTag,
    p.friends ?? [],
    null,
    nation?.flag ?? null,
  );
}

/** The nations nobody picked, computer-run, in the data's order. */
export function scenarioComputerNations(
  roster: ScenarioRoster,
  random: PseudoRandom,
  scale: number,
): Nation[] {
  return computerNations(roster).map(
    (n) =>
      new Nation(
        new Cell(
          Math.floor(n.capital[0] / scale),
          Math.floor(n.capital[1] / scale),
        ),
        new PlayerInfo(
          n.name,
          PlayerType.Nation,
          null,
          random.nextID(),
          false,
          null,
          [],
          null,
          n.flag,
        ),
      ),
  );
}

export { scenarioRoster };
