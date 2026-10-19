import {
  Difficulty,
  GameMapSize,
  GameMode,
  GameType,
} from "@openfront/engine-api/game/GameTypes";
import {
  ErrorUpdate,
  GameUpdateViewData,
} from "@openfront/engine-api/game/GameUpdates";
import { GameConfig, GameStartInfo } from "@openfront/engine-api/Schemas";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { Game, Player } from "@openfront/engine/game/Game";
import { createGameRunner, GameRunner } from "@openfront/engine/GameRunner";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import path from "path";
import { fileURLToPath } from "url";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS = path.join(__dirname, "../../resources/maps");

export interface ScenarioGame {
  runner: GameRunner;
  game: Game;
  updates: GameUpdateViewData[];
  /** Runs `n` ticks with no intents (or the given ones on the first). */
  step(n?: number): void;
  /** The player playing scenario nation `key`. */
  nation(key: string): Player;
}

/**
 * A Scenario game on its real map, started (its board laid out) and ready:
 * `players` are human seats ({ clientID, username, nation? }).
 */
export async function scenarioGame(
  id: string,
  opts: {
    players?: { clientID: string; username: string; nation?: string }[];
    size?: GameMapSize;
    config?: Partial<GameConfig>;
    gameID?: string;
  } = {},
): Promise<ScenarioGame> {
  console.debug = () => {};
  const data = scenarioData(id);
  if (data === null) throw new Error(`no scenario ${id}`);
  const players = opts.players ?? [];
  const seats: Record<string, string> = {};
  for (const p of players) if (p.nation) seats[p.nation] = p.clientID;
  const size = opts.size ?? GameMapSize.Normal;
  const gameStart: GameStartInfo = {
    gameID: opts.gameID ?? "SCENTEST",
    lobbyCreatedAt: 0,
    config: {
      gameMap: data.map,
      gameMapSize: size,
      gameMode: GameMode.Team,
      playerTeams: data.sides.length,
      gameType: players.length > 1 ? GameType.Private : GameType.Singleplayer,
      difficulty: Difficulty.Medium,
      nations: "default",
      donateGold: true,
      donateTroops: true,
      bots: 0,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
      scenario: { id, seats },
      ...opts.config,
    },
    players: players.map((p, i) => ({
      clientID: p.clientID,
      username: p.username,
      clanTag: null,
      isLobbyCreator: i === 0,
    })),
  };
  const files = await loadMapFiles(new NodeGameMapLoader(MAPS), data.map, size);
  const updates: GameUpdateViewData[] = [];
  let error: ErrorUpdate | null = null;
  const runner = await createGameRunner(gameStart, undefined, files, (gu) => {
    if ("errMsg" in gu) error = gu;
    else updates.push(gu);
  });
  const g: ScenarioGame = {
    runner,
    game: runner.game,
    updates,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        runner.addTurn({ turnNumber: runner.game.ticks(), intents: [] });
        if (!runner.executeNextTick()) {
          const e = error as ErrorUpdate | null;
          throw new Error(`tick failed: ${e?.errMsg}\n${e?.stack}`);
        }
      }
    },
    nation(key: string): Player {
      const scenario = runner.game.scenario()!;
      const p = runner.game
        .allPlayers()
        .find((pl) => scenario.nationOf(pl)?.key === key);
      if (p === undefined) throw new Error(`no player for ${key}`);
      return p;
    },
  };
  g.step(2); // tick 0 inits, tick 1 lays out the board
  return g;
}
