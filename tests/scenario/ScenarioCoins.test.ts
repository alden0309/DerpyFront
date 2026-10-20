// SCEN (r25): a scenario game pays Derp Coins and counts for stats under the
// ordinary rules; winning as part of the winning side is a win, and the game
// is saved with its scenario.

import { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTilesForSize: async () => 1000,
}));

const { playerLine } = await import("../../src/server/derpy/DerpyGames");

const stats = {
  tiles: [300n, 0n, 0n],
  gold: [2_000_000n, 0n, 0n, 0n, 0n, 0n, 0n],
  conquests: [2n, 0n, 0n],
};

function player(clientID: string, persistentID: string | null = null) {
  return {
    clientID,
    username: `name_${clientID}`,
    clanTag: null,
    persistentID,
    stats,
  } as unknown as PlayerRecord;
}

function record(
  players: PlayerRecord[],
  winner: unknown,
  scenario: string | null,
  gameID = "SCENGAME1",
): GameRecord {
  return {
    info: {
      gameID,
      config: {
        gameMap: scenario === null ? "World" : "Europe",
        gameMapSize: "Normal",
        gameMode: "Team",
        gameType: "Singleplayer",
        ...(scenario === null ? {} : { scenario: { id: scenario } }),
      },
      players,
      start: 1_700_000_000_000,
      end: 1_700_000_000_000 + 900_000,
      duration: 900,
      num_turns: 10,
      winner,
    },
  } as unknown as GameRecord;
}

describe("scenario games pay like ordinary ones", () => {
  test("a side's win is a win for each of its players, paid the same", () => {
    const a = player("AAAAAAAA");
    const b = player("BBBBBBBB");
    const win = ["team", "Allies", "AAAAAAAA"];
    const scen = record([a, b], win, "europe1939");
    const plain = record([a, b], ["team", "Red", "AAAAAAAA"], null);
    const mine = playerLine(scen, a, [], 1000);
    expect(mine.won).toBe(true);
    expect(playerLine(scen, b, [], 1000).won).toBe(false);
    // The same lines and coins as an ordinary team game played the same.
    expect(mine).toEqual(playerLine(plain, a, [], 1000));
    expect(mine.coins).toBeGreaterThan(0);
  });

  test("too short a game pays nothing, scenario or not", () => {
    const a = player("AAAAAAAA");
    const short = {
      ...record([a], ["team", "Allies", "AAAAAAAA"], "europe1939"),
    } as GameRecord;
    short.info = { ...short.info, duration: 30 };
    expect(playerLine(short, a, [], 1000).coins).toBe(0);
  });
});

// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).
const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("a scenario game, saved", () => {
  let closeDb: () => Promise<void>;
  let recordGame: typeof import("../../src/server/derpy/DerpyGames").recordDerpyGame;
  let profile: typeof import("../../src/server/derpy/DerpyGames").profile;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_players, derpy_conquest_games, derpy_conquest_dynasties, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    ({ closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    ({ recordDerpyGame: recordGame, profile } =
      await import("../../src/server/derpy/DerpyGames"));
    const { db } = await import("../../src/server/derpy/DerpyDb");
    await (
      await db()
    ).query(
      "INSERT INTO derpy_accounts (username, username_key, password_hash) VALUES ('Alden', 'alden', 'x')",
    );
  });

  afterAll(async () => {
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  test("records the scenario and the side that won", async () => {
    const a = player("AAAAAAAA");
    const r = record([a], ["team", "Allies", "AAAAAAAA"], "europe1939");
    const lines = await recordGame(r, [], () => 1);
    const line = [...lines.values()][0];
    expect(line.won).toBe(true);
    expect(line.coins).toBe(playerLine(r, a, [], 1000).coins);
    const p = await profile("alden");
    expect(p?.games[0]).toMatchObject({
      gameId: "SCENGAME1",
      scenario: "europe1939",
      winner: "Allies",
      won: true,
    });
  });
});
