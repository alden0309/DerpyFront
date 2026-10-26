// DFX (r26): Scenario goals' bonus coins, from the saved game: paid once per
// goal per account, only for a game that counts (long enough, spawned, no
// cheats), whether the war was won or lost; and the saved game carries the
// goal. Which goal comes from the game's seats (resolved as the engine
// resolves them).
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://...

import { scenarioEdition } from "@openfront/engine-api/game/Scenarios";
import { GOAL_COINS } from "@openfront/engine-lib/scenario/ScenarioGoals";
import type { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import type pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { goalMetIn } from "../../src/server/derpy/DerpyGoals";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));
vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTilesForSize: async () => 1000,
}));

const A = "AAAAAAAA";
const B = "BBBBBBBB";
let n = 0;

function player(clientID: string, goal?: number): PlayerRecord {
  return {
    clientID,
    username: `name_${clientID}`,
    clanTag: null,
    persistentID: null,
    stats: {
      tiles: [300n, 0n, 0n],
      gold: [2_000_000n, 0n, 0n, 0n, 0n, 0n, 0n],
      ...(goal !== undefined ? { goal } : {}),
    },
  } as unknown as PlayerRecord;
}

/** A saved Europe 1939 game, `seats` nation -> clientID. */
function record(
  players: PlayerRecord[],
  seats: Record<string, string>,
  o: {
    duration?: number;
    winner?: unknown;
    edition?: number | null;
    config?: Record<string, unknown>;
  } = {},
): GameRecord {
  const edition =
    o.edition === undefined ? scenarioEdition("europe1939") : o.edition;
  return {
    info: {
      gameID: `GOAL${String(++n).padStart(4, "0")}`,
      config: {
        gameMap: "Europe",
        gameMapSize: "Normal",
        gameMode: "Team",
        gameType: players.length > 1 ? "Private" : "Singleplayer",
        nations: "default",
        bots: 0,
        scenario: {
          id: "europe1939",
          seats,
          ...(edition === null ? {} : { edition }),
        },
        ...o.config,
      },
      players,
      start: 1_700_000_000_000,
      end: 1_700_000_000_000 + (o.duration ?? 1800) * 1000,
      duration: o.duration ?? 1800,
      num_turns: (o.duration ?? 1800) * 10,
      winner: o.winner ?? ["team", "Allies", A],
    },
  } as unknown as GameRecord;
}

describe("which goal a saved game met", () => {
  test("the player's nation's, from the seats, when their stats say so", () => {
    expect(
      goalMetIn(record([player(A, 9000)], { poland: A }), player(A, 9000)),
    ).toEqual({ key: "europe1939:poland", tick: 9000 });
    // Without a seat, the first free nation in the data's order: Germany.
    expect(goalMetIn(record([player(A, 50)], {}), player(A, 50))?.key).toBe(
      "europe1939:germany",
    );
    // Not met, or not within the game, or not a scenario: none.
    expect(goalMetIn(record([player(A)], { poland: A }), player(A))).toBeNull();
    expect(
      goalMetIn(
        record([player(A, 99_999_999)], { poland: A }),
        player(A, 99_999_999),
      ),
    ).toBeNull();
    const plain = record([player(A, 5)], { poland: A });
    delete (plain.info.config as { scenario?: unknown }).scenario;
    expect(goalMetIn(plain, player(A, 5))).toBeNull();
    // A game from another edition of the scenarios played another war.
    expect(
      goalMetIn(
        record([player(A, 5)], { poland: A }, { edition: null }),
        player(A, 5),
      ),
    ).toBeNull();
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("goals' bonus coins, against Postgres", () => {
  let pool: pg.Pool;
  let closeDb: () => Promise<void>;
  let G: typeof import("../../src/server/derpy/DerpyGames");
  let Goals: typeof import("../../src/server/derpy/DerpyGoals");
  let alden = 0;
  let pat = 0;

  const coins = async (id: number) =>
    Number(
      (await pool.query("SELECT coins FROM derpy_accounts WHERE id = $1", [id]))
        .rows[0].coins,
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const D = await import("../../src/server/derpy/DerpyDb");
    closeDb = D.closeDerpyDb;
    G = await import("../../src/server/derpy/DerpyGames");
    Goals = await import("../../src/server/derpy/DerpyGoals");
    pool = await D.db();
    await pool.query(
      "DELETE FROM derpy_accounts WHERE username_key IN ('goal_alden', 'goal_pat')",
    );
    const add = async (name: string) =>
      Number(
        (
          await pool.query(
            `INSERT INTO derpy_accounts (username, username_key, password_hash)
             VALUES ($1, lower($1), 'x') RETURNING id`,
            [name],
          )
        ).rows[0].id,
      );
    alden = await add("Goal_Alden");
    pat = await add("Goal_Pat");
  }, 60_000);

  beforeEach(async () => {
    await pool.query(
      "DELETE FROM derpy_scenario_goals WHERE account_id = ANY($1::bigint[])",
      [[alden, pat]],
    );
  });

  afterAll(async () => {
    await pool
      ?.query("DELETE FROM derpy_accounts WHERE id = ANY($1::bigint[])", [
        [alden, pat],
      ])
      .catch(() => {});
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  const save = (r: GameRecord, accounts: Record<string, number>) =>
    G.recordDerpyGame(r, [], (p) => accounts[p.clientID]);

  test("a goal met is paid GOAL_COINS, once per goal per account", async () => {
    const before = await coins(alden);
    const r1 = record([player(A, 7000)], { poland: A });
    const l1 = (await save(r1, { [A]: alden })).get(alden)!;
    expect(l1.goal).toEqual({ key: "europe1939:poland", coins: GOAL_COINS });
    expect(await coins(alden)).toBe(before + l1.coins + GOAL_COINS);

    // The same goal again, in another game: met, not paid twice.
    const mid = await coins(alden);
    const r2 = record([player(A, 7100)], { poland: A });
    const l2 = (await save(r2, { [A]: alden })).get(alden)!;
    expect(l2.goal).toEqual({ key: "europe1939:poland", coins: 0 });
    expect(await coins(alden)).toBe(mid + l2.coins);
    // Saving the same game again pays nothing at all.
    expect((await save(r2, { [A]: alden })).size).toBe(0);
    expect(await coins(alden)).toBe(mid + l2.coins);

    // Another nation's goal is another goal.
    const r3 = record([player(A, 100)], { germany: A });
    expect((await save(r3, { [A]: alden })).get(alden)!.goal).toEqual({
      key: "europe1939:germany",
      coins: GOAL_COINS,
    });
    expect(await Goals.goalsMet(alden)).toHaveLength(2);
  });

  test("losing the war doesn't stop a goal met being paid; each player their own", async () => {
    // Pat (Germany) won; Alden (Poland) lost, having held Warsaw past minute 20.
    const r = record(
      [player(A, 12_000), player(B)],
      { poland: A, germany: B },
      { winner: ["team", "Axis", B] },
    );
    const lines = await save(r, { [A]: alden, [B]: pat });
    expect(lines.get(alden)!.won).toBe(false);
    expect(lines.get(alden)!.goal?.coins).toBe(GOAL_COINS);
    expect(lines.get(pat)!.goal).toBeUndefined();
  });

  test("anti-farming: too short, never spawned, or cheats pay no goal", async () => {
    const short = record([player(A, 50)], { poland: A }, { duration: 60 });
    expect(
      (await save(short, { [A]: alden })).get(alden)!.goal,
    ).toBeUndefined();
    const cheats = record(
      [player(A, 50)],
      { poland: A },
      { config: { infiniteGold: true } },
    );
    expect(
      (await save(cheats, { [A]: alden })).get(alden)!.goal,
    ).toBeUndefined();
    const unspawned = player(A, 50);
    (unspawned.stats as { tiles?: unknown }).tiles = [0n, 0n, 0n];
    expect(
      (await save(record([unspawned], { poland: A }), { [A]: alden })).get(
        alden,
      )!.goal,
    ).toBeUndefined();
    expect(await Goals.goalsMet(alden)).toEqual([]);
  });

  test("the saved game carries the goal; the win screen asks what it paid", async () => {
    const r = record([player(A, 4321)], { poland: A });
    await save(r, { [A]: alden });
    const saved = (await G.savedGameRecord(r.info.gameID)) as GameRecord;
    expect(saved.info.players[0].stats?.goal).toBe(4321);
    expect(await Goals.goalInGame(alden, r.info.gameID)).toEqual({
      recorded: true,
      goal: { key: "europe1939:poland", coins: GOAL_COINS },
    });
    expect(await Goals.goalInGame(alden, "NOTSAVED")).toEqual({
      recorded: false,
      goal: null,
    });
  });
});
