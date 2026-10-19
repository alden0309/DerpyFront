// CHAL (r25): DerpyFront's weekly challenges: each one's check from a saved
// game, what makes a game count (the coin rules' minimum, a real game, one
// seat at a time), paying once, the bonus for all three, the week's edges,
// the stand-in for a challenge an account can't do, and renames.
//
// The database part needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=...
// (every derpy_ table in it is dropped first).

import { GameAwards } from "@openfront/engine-api/game/Awards";
import {
  Difficulty,
  GameMapType,
  GameMode,
  HumansVsNations,
} from "@openfront/engine-api/game/GameTypes";
import { maps } from "@openfront/engine-api/game/Maps.gen";
import { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  CHALLENGE_BONUS,
  CHALLENGE_COINS,
  challengesFor,
  FRONT_ALTS,
  FRONT_CHALLENGES,
  weekChallenges,
  weekStart,
  type ChallengeDef,
} from "../../src/derpland/Challenges";

// The suite turns challenges off (tests/setup.ts); these are about them.
process.env.DERPY_CHALLENGES = "on";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTilesForSize: async () => 1000,
}));

const { FRONT_CHECKS, frontFacts, frontGameProblem } =
  await import("../../src/server/derpy/DerpyChallenges");

const ME = "AAAAAAAA";

/** One player's stats, as a game's record keeps them. */
interface Play {
  peak?: number;
  final?: number;
  gold?: number;
  cities?: number;
  ports?: number;
  factories?: number;
  trade?: number;
  nukes?: number;
  conquests?: number;
  bots?: number;
  killedAtS?: number;
}

function stats(p: Play): unknown {
  return {
    tiles: [String(p.peak ?? 100)],
    finalTiles: String(p.final ?? 0),
    gold: [String(p.gold ?? 0)],
    units: {
      city: [String(p.cities ?? 0)],
      port: [String(p.ports ?? 0)],
      fact: [String(p.factories ?? 0)],
    },
    boats: { trade: [String(p.trade ?? 0)] },
    bombs: { abomb: [String(p.nukes ?? 0)] },
    conquests: ["0", String(p.conquests ?? 0), String(p.bots ?? 0)],
    ...(p.killedAtS !== undefined
      ? { killedAt: String(p.killedAtS * 10) }
      : {}),
  };
}

function player(clientID: string, p: Play): PlayerRecord {
  return {
    clientID,
    username: `name_${clientID}`,
    clanTag: null,
    persistentID: null,
    stats: stats(p),
  } as unknown as PlayerRecord;
}

interface Setup {
  id?: string;
  map?: GameMapType;
  mode?: GameMode;
  teams?: unknown;
  difficulty?: Difficulty;
  durationS?: number;
  nations?: number | "default" | "disabled";
  bots?: number;
  won?: boolean;
  cheats?: boolean;
  ai?: string[];
  others?: number;
}

let games = 0;
function game(s: Setup, p: Play = {}): GameRecord {
  const duration = s.durationS ?? 900;
  const players = [player(ME, p)];
  for (let i = 0; i < (s.others ?? 0); i++)
    players.push(player(`OTHER00${i}`, {}));
  return {
    info: {
      gameID: s.id ?? `G${++games}`,
      config: {
        gameMap: s.map ?? GameMapType.Italia,
        gameMapSize: "Normal",
        gameMode: s.mode ?? GameMode.FFA,
        gameType: "Singleplayer",
        difficulty: s.difficulty ?? Difficulty.Medium,
        nations: s.nations ?? "default",
        bots: s.bots ?? 0,
        infiniteGold: !!s.cheats,
        infiniteTroops: false,
        instantBuild: false,
        donateGold: false,
        donateTroops: false,
        randomSpawn: false,
        ...(s.teams !== undefined ? { playerTeams: s.teams } : {}),
        ...(s.ai ? { aiPersonalities: s.ai } : {}),
      },
      players,
      start: 1_700_000_000_000,
      end: 1_700_000_000_000 + duration * 1000,
      duration,
      num_turns: 10,
      winner: s.won ? ["player", ME] : undefined,
      lobbyFillTime: 0,
      lobbyCreatedAt: 1_700_000_000_000,
    },
    version: "v0.0.2",
    gitCommit: "DEV",
    turns: [],
  } as unknown as GameRecord;
}

const line = (o: Partial<Parameters<typeof frontFacts>[2]> = {}) => ({
  won: false,
  peakTerritoryPct: 10,
  goldEarned: 0n,
  conquests: 0,
  ships: 0,
  nukes: 0,
  awards: [] as string[],
  ...o,
});

/** The facts of one setup, as the checks see them. */
function facts(s: Setup, p: Play = {}, l = line()) {
  const r = game(s, p);
  return frontFacts(r, r.info.players[0], l, 1000, p.conquests ?? 0);
}

describe("DerpyFront challenge checks", () => {
  test("every DerpyFront challenge (and stand-in) has a check", () => {
    for (const d of [...FRONT_CHALLENGES, ...FRONT_ALTS])
      expect(FRONT_CHECKS[d.key], d.key).toBeTypeOf("function");
  });

  test("each check reads the game", () => {
    const c = FRONT_CHECKS;
    const won = line({ won: true });
    // Playing: time in the game, to the end or until wiped out.
    expect(c["df-play-3"](facts({ durationS: 400 }))).toBe(1);
    expect(c["df-play-3"](facts({ durationS: 900 }, { killedAtS: 200 }))).toBe(
      0,
    );
    expect(c["df-play-5-long"](facts({ durationS: 700 }))).toBe(1);
    expect(c["df-play-5-long"](facts({ durationS: 599 }))).toBe(0);
    // Winning, anywhere and on named maps.
    expect(c["df-win"](facts({}, {}, won))).toBe(1);
    expect(c["df-win"](facts({}))).toBe(0);
    expect(c["df-win-china"](facts({ map: GameMapType.China }, {}, won))).toBe(
      1,
    );
    expect(c["df-win-china"](facts({ map: GameMapType.Japan }, {}, won))).toBe(
      0,
    );
    expect(
      c["df-win-florida"](facts({ map: GameMapType.FloridaDetailed }, {}, won)),
    ).toBe(1);
    expect(
      c["df-win-north-america"](
        facts({ map: GameMapType.NorthAmerica }, {}, won),
      ),
    ).toBe(1);
    expect(
      c["df-win-europe"](facts({ map: GameMapType.Europe }, {}, won)),
    ).toBe(1);
    expect(c["df-win-japan"](facts({ map: GameMapType.Japan }, {}, won))).toBe(
      1,
    );
    // Teams, Humans vs Nations.
    const hvn = { mode: GameMode.Team, teams: HumansVsNations };
    expect(c["df-hvn"](facts(hvn, {}, won))).toBe(1);
    expect(c["df-hvn"](facts({ mode: GameMode.Team, teams: 2 }, {}, won))).toBe(
      0,
    );
    expect(
      c["df-team-win"](facts({ mode: GameMode.Team, teams: 2 }, {}, won)),
    ).toBe(1);
    expect(c["df-team-win"](facts({}, {}, won))).toBe(0);
    // Land: the most at once, and at the end.
    expect(c["df-land-25"](facts({}, {}, line({ peakTerritoryPct: 25 })))).toBe(
      1,
    );
    expect(
      c["df-land-25"](facts({}, {}, line({ peakTerritoryPct: 24.9 }))),
    ).toBe(0);
    expect(c["df-third"](facts({}, { final: 334 }))).toBe(1);
    expect(c["df-third"](facts({}, { final: 333 }))).toBe(0);
    // Gold (donations are already left out of the line's gold).
    expect(
      c["df-gold-1m"](facts({}, {}, line({ goldEarned: 1_000_000n }))),
    ).toBe(1);
    expect(c["df-gold-1m"](facts({}, {}, line({ goldEarned: 999_999n })))).toBe(
      0,
    );
    expect(
      c["df-gold-5m"](facts({}, {}, line({ goldEarned: 5_000_000n }))),
    ).toBe(1);
    // Building.
    expect(c["df-cities-5"](facts({}, { cities: 5 }))).toBe(1);
    expect(c["df-cities-5"](facts({}, { cities: 4 }))).toBe(0);
    expect(c["df-ports-3"](facts({}, { ports: 3 }))).toBe(1);
    expect(c["df-factories-3"](facts({}, { factories: 3 }))).toBe(1);
    expect(c["df-factories-3"](facts({}, { factories: 2 }))).toBe(0);
    expect(c["df-ships-20"](facts({}, {}, line({ ships: 20 })))).toBe(1);
    expect(c["df-ships-20"](facts({}, {}, line({ ships: 19 })))).toBe(0);
    // No nukes, in a game of a quarter hour.
    expect(c["df-no-nuke"](facts({ durationS: 900 }, {}, won))).toBe(1);
    expect(
      c["df-no-nuke"](
        facts({ durationS: 900 }, {}, line({ won: true, nukes: 1 })),
      ),
    ).toBe(0);
    expect(c["df-no-nuke"](facts({ durationS: 899 }, {}, won))).toBe(0);
    // Awards.
    expect(c["df-gold-award"](facts({}, {}, line({ awards: ["gold"] })))).toBe(
      1,
    );
    expect(c["df-gold-award"](facts({}, {}, line({ awards: ["ships"] })))).toBe(
      0,
    );
    expect(c["df-mvp"](facts({}, {}, line({ awards: ["mvp"] })))).toBe(1);
    // Hard.
    expect(
      c["df-win-hard"](facts({ difficulty: Difficulty.Hard }, {}, won)),
    ).toBe(1);
    expect(
      c["df-win-hard"](facts({ difficulty: Difficulty.Impossible }, {}, won)),
    ).toBe(1);
    expect(
      c["df-win-hard"](facts({ difficulty: Difficulty.Medium }, {}, won)),
    ).toBe(0);
    // AI personalities ticked (Normal alone isn't), with nations to deal them to.
    expect(c["df-ai-win"](facts({ ai: ["normal", "trader"] }, {}, won))).toBe(
      1,
    );
    expect(c["df-ai-win"](facts({ ai: ["normal"] }, {}, won))).toBe(0);
    expect(
      c["df-ai-win"](
        facts({ ai: ["trader"], nations: "disabled", bots: 5 }, {}, won),
      ),
    ).toBe(0);
    // Fast, against five nations; long.
    expect(
      c["df-fast-win"](facts({ durationS: 800, nations: 5 }, {}, won)),
    ).toBe(1);
    expect(
      c["df-fast-win"](facts({ durationS: 800, nations: 4 }, {}, won)),
    ).toBe(0);
    expect(
      c["df-fast-win"](facts({ durationS: 900, nations: 9 }, {}, won)),
    ).toBe(0);
    expect(c["df-win-long"](facts({ durationS: 1500 }, {}, won))).toBe(1);
    expect(c["df-win-long"](facts({ durationS: 1499 }, {}, won))).toBe(0);
    // Conquests: players and nations, not bots.
    expect(c["df-conquer-8"](facts({}, { conquests: 8, bots: 30 }))).toBe(1);
    expect(c["df-conquer-8"](facts({}, { conquests: 7, bots: 30 }))).toBe(0);
  });

  test("a map's default nations are counted", () => {
    const china = maps.find((m) => m.type === GameMapType.China)!;
    expect(facts({ map: GameMapType.China }).nations).toBe(
      china.defaultNationCount,
    );
    expect(facts({ nations: 7 }).nations).toBe(7);
    expect(facts({ nations: "disabled" }).nations).toBe(0);
  });

  test("only real games count: long enough to pay, spawned, no cheats, someone to play", () => {
    const r = (s: Setup, p: Play = {}) => {
      const g = game(s, p);
      return frontGameProblem(g, g.info.players[0]);
    };
    expect(r({})).toBeNull();
    expect(r({ durationS: 119 })).toBe("short");
    expect(r({}, { peak: 0 })).toBe("unspawned");
    expect(r({ cheats: true })).toBe("cheats");
    expect(r({ nations: "disabled", bots: 0 })).toBe("alone");
    expect(r({ nations: "disabled", bots: 3 })).toBeNull();
    expect(r({ nations: "disabled", bots: 0, others: 1 })).toBeNull();
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("DerpyFront challenges against Postgres", () => {
  let base = "";
  let server: http.Server;
  let pool: import("pg").Pool;
  let closeDb: () => Promise<void>;
  let recordGame: typeof import("../../src/server/derpy/DerpyGames").recordDerpyGame;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_challenge_games, derpy_challenges, derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    const dbm = await import("../../src/server/derpy/DerpyDb");
    closeDb = dbm.closeDerpyDb;
    pool = await dbm.db();
    ({ recordDerpyGame: recordGame } =
      await import("../../src/server/derpy/DerpyGames"));
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  async function call(path: string, token?: string) {
    const res = await fetch(base + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, json: await res.json() };
  }

  async function account(name: string) {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const s = await register(name, "hunter22");
    if (typeof s === "string") throw new Error(s);
    return { id: s.account.id, token: s.token };
  }

  const coinsOf = async (id: number) =>
    Number(
      (await pool.query("SELECT coins FROM derpy_accounts WHERE id = $1", [id]))
        .rows[0].coins,
    );

  const rowsOf = async (id: number) =>
    (
      await pool.query(
        "SELECT week, key, progress, done_at, coins FROM derpy_challenges WHERE account_id = $1 ORDER BY week, key",
        [id],
      )
    ).rows.map((r) => ({
      week: Number(r.week),
      key: String(r.key),
      progress: Number(r.progress),
      done: r.done_at !== null,
      coins: Number(r.coins),
    }));

  /** Sets the clock (Date only: the database's own timers run as ever). */
  const clockAt = (ms: number) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ms);
  };

  /** The first week from `from` whose DerpyFront picks pass `ok`. */
  function findWeek(ok: (defs: ChallengeDef[]) => boolean, from = 2950) {
    for (let w = from; w < from + 2000; w++)
      if (ok(weekChallenges(w, "derpyfront"))) return w;
    throw new Error("no such week");
  }

  async function save(
    accountId: number,
    s: Setup,
    p: Play = {},
    awards: GameAwards = [],
  ) {
    const r = game(s, p);
    return (await recordGame(r, awards, () => accountId)).get(accountId);
  }

  /**
   * A game that does everything a one-game challenge could ask (a win on
   * Hard in a long Humans vs Nations team game, with a third of the land,
   * millions of gold, cities, ports, factories, ships and awards), on `map`.
   */
  const bigWin = (map: GameMapType, id?: string): [Setup, Play, GameAwards] => [
    {
      id,
      map,
      won: true,
      mode: GameMode.Team,
      teams: HumansVsNations,
      difficulty: Difficulty.Hard,
      durationS: 1600,
      ai: ["trader"],
    },
    {
      peak: 900,
      final: 900,
      gold: 6_000_000,
      cities: 6,
      ports: 4,
      factories: 4,
      trade: 25,
      conquests: 9,
    },
    [
      { kind: "gold", clientID: ME, name: "me", value: 1 },
      { kind: "mvp", clientID: ME, name: "me", value: 1 },
    ],
  ];

  const ONE_GAME = new Set(
    Object.keys(FRONT_CHECKS).filter(
      (k) =>
        ![
          "df-play-3",
          "df-play-5-long",
          "df-win-3",
          "df-fast-win",
          "df-ai-win",
        ].includes(k),
    ),
  );
  const MAP_OF: Record<string, GameMapType> = {
    "df-win-china": GameMapType.China,
    "df-win-europe": GameMapType.Europe,
    "df-win-japan": GameMapType.Japan,
    "df-win-florida": GameMapType.FloridaDetailed,
    "df-win-north-america": GameMapType.NorthAmerica,
  };
  const mapFor = (defs: ChallengeDef[]) =>
    defs.map((d) => MAP_OF[d.key]).find((m) => m) ?? GameMapType.Italia;

  test("one game can do all three: each paid once, and the bonus with the third", async () => {
    const a = await account("Bigwin");
    // A week whose three one game can do (at most one named map, no counts).
    const week = findWeek(
      (defs) =>
        defs.every((d) => ONE_GAME.has(d.key)) &&
        defs.filter((d) => MAP_OF[d.key]).length <= 1,
    );
    clockAt(weekStart(week) + 3 * 3_600_000);
    const defs = challengesFor(week, "derpyfront", { aiPersonality: false });
    const [s, p, aw] = bigWin(mapFor(defs), "BIGWIN01");
    const before = await coinsOf(a.id);
    const line1 = await save(a.id, s, p, aw);
    expect(line1).toBeDefined();
    expect(line1!.challenges?.map((x) => x.key)).toEqual(
      defs.map((d) => d.key),
    );
    expect(line1!.challenges![2].bonus).toBe(CHALLENGE_BONUS);
    const paid =
      CHALLENGE_COINS.easy +
      CHALLENGE_COINS.medium +
      CHALLENGE_COINS.hard +
      CHALLENGE_BONUS;
    expect(await coinsOf(a.id)).toBe(before + line1!.coins + paid);
    const rows = await rowsOf(a.id);
    expect(
      rows
        .filter((r) => r.done)
        .map((r) => r.key)
        .sort(),
    ).toEqual([...defs.map((d) => d.key), "bonus:derpyfront"].sort());

    // The end screen asks what the game did.
    const g = await call("/challenges/game/BIGWIN01", a.token);
    expect(g.json.recorded).toBe(true);
    expect(g.json.done.map((x: { key: string }) => x.key)).toEqual(
      defs.map((d) => d.key),
    );
    expect(g.json.done[2].bonus).toBe(CHALLENGE_BONUS);

    // Another game like it, later the same week: its own coins, nothing more.
    clockAt(weekStart(week) + 6 * 3_600_000);
    const mid = await coinsOf(a.id);
    const line2 = await save(a.id, ...bigWin(mapFor(defs)));
    expect(line2!.challenges ?? []).toEqual([]);
    expect(await coinsOf(a.id)).toBe(mid + line2!.coins);
    // The same game saved again does nothing at all.
    const again = await recordGame(game(s, p), aw, () => a.id);
    expect(again.size).toBe(0);
    expect(await coinsOf(a.id)).toBe(mid + line2!.coins);

    // The week after: new challenges, paid again.
    clockAt(weekStart(week + 1) + 3_600_000);
    const next = weekChallenges(week + 1, "derpyfront");
    const v = await call("/challenges", a.token);
    expect(v.json.week).toBe(week + 1);
    expect(
      v.json.games[0].challenges.map((x: { key: string }) => x.key),
    ).toEqual(
      challengesFor(week + 1, "derpyfront", { aiPersonality: false }).map(
        (d) => d.key,
      ),
    );
    expect(next.length).toBe(3);
  });

  test("counts add up over games; a game a second before Monday counts for the old week", async () => {
    const a = await account("Counter");
    const week = findWeek((defs) =>
      defs.some((d) => d.key === "df-play-5-long"),
    );
    const end = weekStart(week + 1);
    for (let i = 0; i < 4; i++) {
      clockAt(weekStart(week) + (i + 1) * 3_600_000);
      await save(a.id, { durationS: 700 });
    }
    let row = (await rowsOf(a.id)).find((r) => r.key === "df-play-5-long")!;
    expect(row).toMatchObject({ week, progress: 4, done: false });
    // A game too short to pay, one with cheats and one alone add nothing.
    clockAt(weekStart(week) + 10 * 3_600_000);
    await save(a.id, { durationS: 100 });
    clockAt(weekStart(week) + 11 * 3_600_000);
    await save(a.id, { durationS: 700, cheats: true });
    clockAt(weekStart(week) + 12 * 3_600_000);
    await save(a.id, { durationS: 700, nations: "disabled", bots: 0 });
    row = (await rowsOf(a.id)).find((r) => r.key === "df-play-5-long")!;
    expect(row.progress).toBe(4);
    // The fifth, ending a second before the week does: the old week's, done.
    clockAt(end - 1000);
    const before = await coinsOf(a.id);
    const l = await save(a.id, { durationS: 700 });
    expect(l!.challenges?.map((x) => x.key)).toContain("df-play-5-long");
    row = (await rowsOf(a.id)).find(
      (r) => r.key === "df-play-5-long" && r.week === week,
    )!;
    expect(row).toMatchObject({ progress: 5, done: true, coins: 175 });
    expect(await coinsOf(a.id)).toBeGreaterThanOrEqual(before + 175);
    // An hour into the new week: the new week's (and only its own challenges).
    clockAt(end + 3_600_000);
    await save(a.id, { durationS: 700 });
    expect(
      (await rowsOf(a.id))
        .filter((r) => r.week === week + 1)
        .every((r) =>
          weekChallenges(week + 1, "derpyfront").some((d) => d.key === r.key),
        ),
    ).toBe(true);
  });

  test("two games at once count once (one seat at a time)", async () => {
    const a = await account("Twotabs");
    const week = findWeek((defs) => defs.some((d) => d.key === "df-play-3"));
    const t = weekStart(week) + 24 * 3_600_000;
    // Game A: 10 minutes ending at t.
    clockAt(t);
    await save(a.id, { durationS: 600 });
    // Game B ends 5 minutes later, but was played alongside A: not counted.
    clockAt(t + 300_000);
    await save(a.id, { durationS: 600 });
    let row = (await rowsOf(a.id)).find((r) => r.key === "df-play-3")!;
    expect(row.progress).toBe(1);
    // Game C starts 30 seconds before A ended (within the grace): counted.
    clockAt(t + 570_000);
    await save(a.id, { durationS: 600 });
    row = (await rowsOf(a.id)).find((r) => r.key === "df-play-3")!;
    expect(row.progress).toBe(2);
  });

  test("an account without AI personalities gets the stand-in; an owner gets the real one", async () => {
    const week = findWeek((defs) => defs.some((d) => d.key === "df-ai-win"));
    clockAt(weekStart(week) + 3_600_000);
    const plain = await account("Noai");
    const owner = await account("Hasai");
    await pool.query(
      "INSERT INTO derpy_owned (account_id, item) VALUES ($1, 'pack:ai_trader')",
      [owner.id],
    );
    const hard = (j: {
      games: { challenges: { key: string; tier: string }[] }[];
    }) => j.games[0].challenges.find((c) => c.tier === "hard")!.key;
    expect(hard((await call("/challenges", plain.token)).json)).toBe(
      "df-win-long",
    );
    expect(hard((await call("/challenges", owner.token)).json)).toBe(
      "df-ai-win",
    );
    // Signed out: the week's own.
    expect(hard((await call("/challenges")).json)).toBe("df-ai-win");
    // A long win with personalities ticked: the owner's real one, the other's stand-in.
    const s: Setup = { won: true, durationS: 1600, ai: ["trader"] };
    const l1 = await save(owner.id, s);
    expect(l1!.challenges?.map((x) => x.key)).toContain("df-ai-win");
    const l2 = await save(plain.id, s);
    expect(l2!.challenges?.map((x) => x.key)).toContain("df-win-long");
  });

  test("progress follows the account through a rename", async () => {
    const a = await account("Oldname");
    const week = findWeek((defs) => defs.some((d) => d.key === "df-play-3"));
    clockAt(weekStart(week) + 3_600_000);
    await save(a.id, { durationS: 400 });
    const { renameAccount } = await import("../../src/server/derpy/DerpyNames");
    const r = await renameAccount(a.id, "Newname", Date.now());
    expect(r.ok).toBe(true);
    clockAt(weekStart(week) + 5 * 3_600_000);
    await save(a.id, { durationS: 400 });
    const p = await call("/challenges/player/Newname");
    expect(p.status).toBe(200);
    expect(p.json.username).toBe("Newname");
    const c = p.json.week.games[0].challenges.find(
      (x: { key: string }) => x.key === "df-play-3",
    );
    expect(c).toMatchObject({ have: 2, of: 3, doneAt: null });
    // The name given up still finds them for a while, as profiles do.
    const old = await call("/challenges/player/Oldname");
    expect(old.json.username).toBe("Newname");
    expect((await call("/challenges/player/Nobody_here")).status).toBe(404);
  });

  test("a profile's history lists the weeks done", async () => {
    const a = await account("Historian");
    const week = findWeek((defs) => defs.some((d) => d.key === "df-win"));
    clockAt(weekStart(week) + 3_600_000);
    await save(a.id, { won: true, durationS: 600 });
    clockAt(weekStart(week + 2) + 3_600_000);
    const p = await call("/challenges/player/Historian");
    expect(p.json.week.week).toBe(week + 2);
    expect(p.json.history[0]).toMatchObject({
      week,
      done: [expect.objectContaining({ key: "df-win", game: "derpyfront" })],
      coins: 100,
    });
  });
});
