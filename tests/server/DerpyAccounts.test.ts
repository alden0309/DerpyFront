import { GameAwards } from "@openfront/engine-api/game/Awards";
import { DERPY_RULES } from "@openfront/engine-api/Schemas";
import {
  DERP_COINS,
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
    // SITE (r22): 7, a sixth more than the 6 it was (5 before r19).
    expect(derpCoinsForGame(base).total).toBe(7);
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
    // SITE (r22): 7 + floor(44.59) + floor(14.1 + 5.6) + 28 (capped) + 49
    // + 70 (r19 paid 6 + 38 + 16 + 24 + 42 + 60 = 186; before it, 154).
    expect(r.total).toBe(217);
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

  // SITE (r22): DerpyFront pays about a sixth more, every way a game pays.
  test("every way a game pays is up by 15 to 20 percent on r19", () => {
    const r19 = {
      played: 6,
      perTerritoryPercent: 0.6,
      maxTerritory: 60,
      perConquest: 4,
      perBotConquest: 1.2,
      maxConquests: 36,
      coinsPerMillionGold: 1_000_000 / 420_000,
      maxGold: 24,
      mvp: 30,
      otherAward: 12,
      win: 60,
    };
    const now = {
      ...DERP_COINS,
      coinsPerMillionGold: 1_000_000 / Number(DERP_COINS.goldPerCoin),
    };
    for (const [k, before] of Object.entries(r19)) {
      const after = now[k as keyof typeof now] as number;
      expect(after / before, k).toBeGreaterThanOrEqual(1.15);
      expect(after / before, k).toBeLessThanOrEqual(1.2);
    }
    // A middling game: some land, a conquest, a little gold, no win.
    const middling = {
      ...base,
      peakTerritoryPercent: 22,
      goldEarned: 3_000_000n,
      humansAndNationsConquered: 1,
      botsConquered: 5,
    };
    // 7 + 15 + floor(4.7 + 7) + 8 = 41 (r19 paid 6 + 13 + 10 + 7 = 36).
    expect(derpCoinsForGame(middling).total).toBe(41);
  });

  test("whole percents of land pay whole coins (no float slips)", () => {
    // 90 × 0.7 is 62.99999999999999 in floating point.
    const r = derpCoinsForGame({ ...base, peakTerritoryPercent: 90 });
    expect(r.lines.find((l) => l.line === "territory")?.coins).toBe(63);
    const c = derpCoinsForGame({
      ...base,
      humansAndNationsConquered: 2,
      botsConquered: 24,
    });
    expect(c.lines.find((l) => l.line === "conquests")?.coins).toBe(42);
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
    // SITE (r22): 7 + floor(17.5) + floor(14.1 + 4.2) + 4 + 35 + 70 (r19
    // paid 129; before it, 107).
    expect(line.coins).toBe(151);
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
      "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
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
      // PROFILE (r26): his picture and pins; the owner looks after pictures.
      picture: null,
      pinned: [],
      moderator: true,
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
    // SITE (r22): 7 + 28 + floor(9.4) + 5 + 35 + 70 (r19 paid 132; before
    // it, 110).
    expect([...lines.values()].map((l) => l.coins)).toEqual([154]);

    // Saving it again (a second vote, say) changes nothing.
    expect((await recordGame(r, awards)).size).toBe(0);

    const me = await call("/me", { token: alden.token });
    expect(me.json.account.coins).toBe(154);

    const board = await call("/leaderboard");
    expect(board.json.players[0]).toMatchObject({
      username: "Alden",
      games: 1,
      wins: 1,
      bestTerritoryPct: 40,
      goldEarned: "2000000",
      mvps: 1,
      coins: 154,
    });

    const profile = await call("/players/alden");
    expect(profile.json.games).toHaveLength(1);
    expect(profile.json.games[0]).toMatchObject({
      gameId: "GAME0001",
      map: "Orlando - Detailed",
      won: true,
      awards: ["mvp"],
      coins: 154,
    });

    // The front page's latest games name the account, not the in-game name.
    const recent = await call("/recent");
    expect(recent.json.results[0]).toMatchObject({
      game: "derpyfront",
      gameId: "GAME0001",
      username: "Alden",
      playedAs: "name_AAAAAAAA",
      won: true,
    });

    const replay = await call("/game/GAME0001");
    expect(replay.status).toBe(200);
    expect(replay.json.gitCommit).toBe("DEV");
    // Saved with the rules it was played under, so it replays the same.
    expect(replay.json.info.config.derpyRules).toBe(DERPY_RULES);
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
      expect.objectContaining({ won: false, peakTerritoryPct: 0, coins: 7 }),
    ]);
    expect((await call("/game/GAME0003")).status).toBe(200);
    // Put Alden's balance back where the later tests expect it.
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query("UPDATE derpy_accounts SET coins = coins - 7 WHERE id = 1");
    await c.end();
  });

  test("buy a pack with Derp Coins", async () => {
    const store = await call("/store");
    const classics = store.json.packs.find(
      (p: { name: string }) => p.name === "classics",
    );
    expect(classics.price).toBe(1500);

    // 154 coins isn't enough yet.
    const poor = await call("/store/buy", {
      body: { pack: "classics" },
      token: alden.token,
    });
    expect(poor).toEqual({ status: 409, json: { error: "not_enough_coins" } });

    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query("UPDATE derpy_accounts SET coins = 2000");
    await c.end();

    const bought = await call("/store/buy", {
      body: { pack: "classics" },
      token: alden.token,
    });
    expect(bought.status).toBe(200);
    expect(bought.json.coins).toBe(500);
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

  // DFSTORE (r21): anything in the store, by `item`; the join check reads it.
  test("buy a Nuke & Dome effects pack, then wear it into a game", async () => {
    const store = await call("/store");
    expect(store.json.tabs.map((t: { game: string }) => t.game)).toEqual([
      "derpyfront",
      "conquest",
    ]);
    const frost = store.json.items.find(
      (i: { name: string }) => i.name === "fx_frost",
    );
    expect(frost).toMatchObject({ category: "effects", price: 2000 });

    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query("UPDATE derpy_accounts SET coins = 2600");
    await c.end();

    const bought = await call("/store/buy", {
      body: { item: "fx_frost" },
      token: alden.token,
    });
    expect(bought.status).toBe(200);
    expect(bought.json.coins).toBe(600);
    expect(bought.json.owned).toEqual(
      expect.arrayContaining([
        "pack:fx_frost",
        "effect:fx_frost_trail",
        "effect:fx_frost_atom",
        "dome:fx_frost",
      ]),
    );
    const nope = await call("/store/buy", {
      body: { item: "no_such_thing" },
      token: alden.token,
    });
    expect(nope.status).toBe(404);

    const { derpyLooksForPlayer } =
      await import("../../src/server/derpy/DerpySkins");
    const looks = await derpyLooksForPlayer(alden.playId, {
      effects: { nukeTrail: "fx_frost_trail", hydro: "fx_solar_hydro" },
      derpyDome: "fx_frost",
    });
    expect(looks.effects).toEqual({
      nukeTrail: { name: "fx_frost_trail", effectType: "nukeTrail" },
    });
    expect(looks.derpyDome).toBe("fx_frost");
  });

  test("signing out ends the session", async () => {
    expect(
      (await call("/logout", { method: "POST", token: alden.token })).status,
    ).toBe(204);
    expect((await call("/me", { token: alden.token })).status).toBe(401);
  });
});
