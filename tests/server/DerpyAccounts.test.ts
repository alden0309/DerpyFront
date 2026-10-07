import { GameAwards } from "@openfront/engine-api/game/Awards";
import {
  DERP_COINS_MIN_GAME_SECONDS,
  derpCoinsForGame,
} from "@openfront/shared/DerpCoins";
import { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
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

function player(
  clientID: string,
  stats: unknown,
  persistentID = "",
): PlayerRecord {
  return {
    clientID,
    username: `name_${clientID}`,
    clanTag: null,
    persistentID: persistentID || null,
    stats,
  } as unknown as PlayerRecord;
}

function record(
  players: PlayerRecord[],
  winner: unknown,
  durationSeconds = 600,
  gameID = "G1",
): GameRecord {
  return {
    info: {
      gameID,
      config: {
        gameMap: "Orlando - Detailed",
        gameMapSize: "Normal",
        gameMode: "Free For All",
        gameType: "Private",
      },
      players,
      start: 1_700_000_000_000,
      end: 1_700_000_000_000 + durationSeconds * 1000,
      duration: durationSeconds,
      num_turns: 10,
      winner,
      lobbyFillTime: 0,
      lobbyCreatedAt: 1_700_000_000_000,
    },
    version: "v0.0.2",
    gitCommit: "DEV",
    turns: [],
  } as unknown as GameRecord;
}

describe("Derp Coins", () => {
  const base = {
    won: false,
    peakTerritoryPercent: 0,
    goldEarned: 0n,
    humansAndNationsConquered: 0,
    botsConquered: 0,
    awards: [],
    durationSeconds: 600,
  };

  test("everyone who finishes a game gets something", () => {
    expect(derpCoinsForGame(base).total).toBe(10);
  });

  test("winning, land, conquests, gold and awards all pay", () => {
    const r = derpCoinsForGame({
      ...base,
      won: true,
      peakTerritoryPercent: 63.7,
      goldEarned: 12_000_000n,
      humansAndNationsConquered: 3,
      botsConquered: 4,
      awards: ["mvp", "ships"],
    });
    // 10 + 63 + (15 + 4) + 40 (capped) + 70 + 100
    expect(r.total).toBe(302);
    expect(r.lines.map((l) => l.line)).toEqual([
      "played",
      "territory",
      "conquests",
      "gold",
      "awards",
      "win",
    ]);
  });

  test("a loser who did well still earns more than one who didn't", () => {
    const good = derpCoinsForGame({ ...base, peakTerritoryPercent: 30 });
    const bad = derpCoinsForGame({ ...base, peakTerritoryPercent: 2 });
    expect(good.total).toBeGreaterThan(bad.total);
    const winner = derpCoinsForGame({ ...base, won: true });
    expect(winner.total).toBeGreaterThan(good.total);
  });

  test("quitting straight away pays nothing", () => {
    expect(
      derpCoinsForGame({
        ...base,
        won: true,
        durationSeconds: DERP_COINS_MIN_GAME_SECONDS - 1,
      }).total,
    ).toBe(0);
  });
});

describe("playerLine", () => {
  test("reads one player's game from the record", () => {
    const stats = {
      tiles: [250n, 0n, 0n],
      gold: [1_000_000n, 500_000n, 0n, 0n, 0n, 0n, 9_000_000n],
      conquests: [1n, 2n, 3n],
      boats: { trade: [4n], trans: [5n] },
      units: { wshp: [2n] },
      bombs: { abomb: [1n], hbomb: [2n], mirvw: [10n] },
      betrayals: 3n,
    };
    const me = player("AAAAAAAA", stats);
    const awards: GameAwards = [
      { kind: "mvp", name: "me", clientID: "AAAAAAAA", value: 100 },
      { kind: "gold", name: "them", clientID: "BBBBBBBB", value: 9 },
    ];
    const line = playerLine(
      record([me], ["player", "AAAAAAAA"]),
      me,
      awards,
      1000,
    );
    expect(line).toMatchObject({
      won: true,
      peakTerritoryPct: 25,
      goldEarned: 1_500_000n, // the donation doesn't count
      conquests: 6,
      ships: 11,
      betrayals: 3,
      nukes: 3, // warheads aren't launches
      awards: ["mvp"],
    });
    // 10 + 25 + (15 + 3) + 6 + 50 + 100
    expect(line.coins).toBe(209);
  });

  test("team wins count for every listed member", () => {
    const a = player("AAAAAAAA", {});
    const b = player("BBBBBBBB", {});
    const r = record([a, b], ["team", "Red", "AAAAAAAA"]);
    expect(playerLine(r, a, [], 1000).won).toBe(true);
    expect(playerLine(r, b, [], 1000).won).toBe(false);
  });
});

// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).
const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("Derpy accounts against Postgres", () => {
  let base = "";
  let server: http.Server;
  let closeDb: () => Promise<void>;
  let recordGame: typeof import("../../src/server/derpy/DerpyGames").recordDerpyGame;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    ({ closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    ({ recordDerpyGame: recordGame } =
      await import("../../src/server/derpy/DerpyGames"));
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
  });

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  async function call(
    path: string,
    opts: { method?: string; body?: unknown; token?: string } = {},
  ) {
    const res = await fetch(base + path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  let alden: { token: string; playId: string };

  test("create an account, then sign in to it", async () => {
    const created = await call("/register", {
      body: { username: "Alden", password: "letaldenwin" },
    });
    expect(created.status).toBe(200);
    expect(created.json.account).toEqual({
      id: expect.any(Number),
      username: "Alden",
      coins: 0,
    });
    expect(created.json.playId).toMatch(/^[0-9a-f-]{36}$/);

    const taken = await call("/register", {
      body: { username: "alden", password: "whatever" },
    });
    expect(taken).toEqual({ status: 409, json: { error: "username_taken" } });

    const wrong = await call("/login", {
      body: { username: "Alden", password: "nope-nope" },
    });
    expect(wrong.status).toBe(401);

    const ok = await call("/login", {
      body: { username: "ALDEN", password: "letaldenwin" },
    });
    expect(ok.status).toBe(200);
    alden = ok.json;
    const me = await call("/me", { token: alden.token });
    expect(me.json).toEqual({
      account: { username: "Alden", coins: 0 },
      owned: [],
    });
    expect((await call("/me", { token: "bogus" })).status).toBe(401);
  });

  test("bad usernames and short passwords are refused", async () => {
    expect(
      (
        await call("/register", {
          body: { username: "a b", password: "123456" },
        })
      ).json,
    ).toEqual({ error: "invalid_username" });
    expect(
      (await call("/register", { body: { username: "Gary", password: "123" } }))
        .json,
    ).toEqual({ error: "invalid_password" });
  });

  test("a finished game is saved, pays coins and shows on the leaderboard", async () => {
    const stats = {
      tiles: [400n, 0n, 0n],
      gold: [2_000_000n],
      conquests: [0n, 2n, 0n],
    };
    const r = record(
      [
        player("AAAAAAAA", stats, alden.playId),
        player("BBBBBBBB", {}, "11111111-1111-4111-8111-111111111111"),
      ],
      ["player", "AAAAAAAA"],
      600,
      "GAME0001",
    );
    const awards: GameAwards = [
      { kind: "mvp", name: "name_AAAAAAAA", clientID: "AAAAAAAA", value: 900 },
    ];
    const lines = await recordGame(r, awards);
    // 10 + 40 + 10 + 8 + 50 + 100
    expect([...lines.values()].map((l) => l.coins)).toEqual([218]);

    // Saving it again (a second vote, say) changes nothing.
    expect((await recordGame(r, awards)).size).toBe(0);

    const me = await call("/me", { token: alden.token });
    expect(me.json.account.coins).toBe(218);

    const board = await call("/leaderboard");
    expect(board.json.players[0]).toMatchObject({
      username: "Alden",
      games: 1,
      wins: 1,
      bestTerritoryPct: 40,
      goldEarned: "2000000",
      mvps: 1,
      coins: 218,
    });

    const profile = await call("/players/alden");
    expect(profile.json.games).toHaveLength(1);
    expect(profile.json.games[0]).toMatchObject({
      gameId: "GAME0001",
      map: "Orlando - Detailed",
      won: true,
      awards: ["mvp"],
      coins: 218,
    });

    const replay = await call("/game/GAME0001");
    expect(replay.status).toBe(200);
    expect(replay.json.gitCommit).toBe("DEV");
    expect(
      replay.json.info.players.map((p: PlayerRecord) => p.persistentID),
    ).toEqual([null, null]);
    expect((await call("/game/NOPE0001")).status).toBe(404);
  });

  test("games nobody signed in played aren't saved", async () => {
    const r = record([player("CCCCCCCC", {})], undefined, 600, "GAME0002");
    expect((await recordGame(r, [])).size).toBe(0);
    expect((await call("/game/GAME0002")).status).toBe(404);
  });

  test("a game quit before it was decided still saves, with its replay", async () => {
    const quit = player("DDDDDDDD", undefined);
    const r = record([quit], undefined, 300, "GAME0003");
    const lines = await recordGame(r, [], () => 1);
    expect([...lines.values()]).toEqual([
      expect.objectContaining({ won: false, peakTerritoryPct: 0, coins: 10 }),
    ]);
    expect((await call("/game/GAME0003")).status).toBe(200);
    // Put Alden's balance back where the later tests expect it.
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query("UPDATE derpy_accounts SET coins = coins - 10 WHERE id = 1");
    await c.end();
  });

  test("buy a pack with Derp Coins", async () => {
    const store = await call("/store");
    const classics = store.json.packs.find(
      (p: { name: string }) => p.name === "classics",
    );
    expect(classics.price).toBe(400);

    // 218 coins isn't enough yet.
    const poor = await call("/store/buy", {
      body: { pack: "classics" },
      token: alden.token,
    });
    expect(poor).toEqual({ status: 409, json: { error: "not_enough_coins" } });

    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query("UPDATE derpy_accounts SET coins = 1000");
    await c.end();

    const bought = await call("/store/buy", {
      body: { pack: "classics" },
      token: alden.token,
    });
    expect(bought.status).toBe(200);
    expect(bought.json.coins).toBe(600);
    expect(bought.json.owned).toContain("skin:classic_camo");
    expect(bought.json.owned).toContain("pack:classics");

    const again = await call("/store/buy", {
      body: { pack: "classics" },
      token: alden.token,
    });
    expect(again.json).toEqual({ error: "already_owned" });

    const { derpySkinForPlayer } =
      await import("../../src/server/derpy/DerpySkins");
    expect(await derpySkinForPlayer(alden.playId, "classic_camo")).toEqual({
      name: "classic_camo",
      url: "/derpy-skins/classic_camo.png",
    });
    expect(await derpySkinForPlayer(alden.playId, "florida_gator")).toBeNull();
    expect(
      await derpySkinForPlayer(
        "11111111-1111-4111-8111-111111111111",
        "classic_camo",
      ),
    ).toBeNull();
  });

  test("signing out ends the session", async () => {
    expect(
      (await call("/logout", { method: "POST", token: alden.token })).status,
    ).toBe(204);
    expect((await call("/me", { token: alden.token })).status).toBe(401);
  });
});
