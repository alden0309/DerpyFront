// PROFILE (r26): Derp Land's badges. Each badge's rule, the catalog, the
// check that backfills an account from its records (and changes nothing the
// second time), games' settings read from old records, pinning, the toast's
// "new to you", the two badges earned as they happen, renames, and nothing
// anywhere about Mr. Based.
//
// The database part needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=...
// (every derpy_ table in it is dropped first). Skipped without one.

import { GameAwards } from "@openfront/engine-api/game/Awards";
import {
  Difficulty,
  GameMapType,
  GameMode,
} from "@openfront/engine-api/game/GameTypes";
import type { GameRecord } from "@openfront/shared/WireSchemas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import zlib from "zlib";
import {
  BADGE_GROUPS,
  BADGES,
  cleanPins,
  PIN_MAX,
} from "../../src/derpland/Badges";
import {
  type Kit,
  startKit,
  TEST_DB,
  type TestUser,
} from "../util/ProfileTestKit";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));
vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTilesForSize: async () => 1000,
}));

const B = await import("../../src/server/derpy/DerpyBadges");
type Facts = import("../../src/server/derpy/DerpyBadges").BadgeFacts;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const NOW = Date.UTC(2026, 9, 26);
const DAY = 24 * 3600_000;

const ZERO: Facts = {
  createdAt: NOW - DAY,
  dfGames: 0,
  dfWins: 0,
  dfMvps: 0,
  dfBestLand: 0,
  dfMostGold: 0n,
  dfNukes: 0,
  dfConquests: 0,
  dfTeamWins: 0,
  dfHardWins: 0,
  dfAiWins: 0,
  scPlayed: [],
  scWon: [],
  chDone: 0,
  chFullWeeks: 0,
  chBothWeeks: 0,
  chWeeks: 0,
  cqGames: 0,
  cqWins: 0,
  cqLives: 0,
  cqAchievements: 0,
  cqSeconds: 0,
  friends: 0,
  playedWithFriend: false,
  inParty: false,
  bought: false,
};

const ALL_SC = B.scenarioIds();

/** For each badge: facts that earn it, and facts just short of it. */
const MEET: Record<string, [Partial<Facts>, Partial<Facts>]> = {
  "df-first-win": [{ dfWins: 1 }, { dfGames: 5 }],
  "df-games-10": [{ dfGames: 10 }, { dfGames: 9 }],
  "df-mvp": [{ dfMvps: 1 }, { dfWins: 3 }],
  "df-nuke": [{ dfNukes: 1 }, { dfGames: 3 }],
  "df-team-win": [{ dfTeamWins: 1 }, { dfWins: 3 }],
  "df-wins-10": [{ dfWins: 10 }, { dfWins: 9 }],
  "df-hard-win": [{ dfHardWins: 1 }, { dfWins: 9 }],
  "df-ai-win": [{ dfAiWins: 1 }, { dfWins: 9 }],
  "df-land-50": [{ dfBestLand: 50 }, { dfBestLand: 49.9 }],
  "df-gold-5m": [{ dfMostGold: 5_000_000n }, { dfMostGold: 4_999_999n }],
  "df-conquests-25": [{ dfConquests: 25 }, { dfConquests: 24 }],
  "df-wins-50": [{ dfWins: 50 }, { dfWins: 49 }],
  "df-games-100": [{ dfGames: 100 }, { dfGames: 99 }],
  "sc-first-win": [{ scWon: ["europe1939"] }, { scPlayed: ["europe1939"] }],
  "sc-all-played": [{ scPlayed: ALL_SC }, { scPlayed: ALL_SC.slice(1) }],
  "sc-all-wins": [
    { scWon: ALL_SC },
    { scWon: ALL_SC.slice(1), scPlayed: ALL_SC },
  ],
  "ch-first": [{ chDone: 1 }, { chWeeks: 0 }],
  "ch-full-week": [{ chFullWeeks: 1 }, { chDone: 2 }],
  "ch-both-games": [{ chBothWeeks: 1 }, { chFullWeeks: 5 }],
  "ch-weeks-10": [{ chWeeks: 10 }, { chWeeks: 9 }],
  "cq-first-life": [{ cqLives: 2 }, { cqLives: 1 }],
  "cq-win": [{ cqWins: 1 }, { cqGames: 4 }],
  "cq-hours-5": [{ cqSeconds: 5 * 3600 }, { cqSeconds: 5 * 3600 - 1 }],
  "cq-dynasty-3": [{ cqLives: 3 }, { cqLives: 2 }],
  "cq-achievement": [{ cqAchievements: 1 }, { cqGames: 3 }],
  "cq-hours-25": [{ cqSeconds: 25 * 3600 }, { cqSeconds: 25 * 3600 - 1 }],
  "cq-dynasty-5": [{ cqLives: 5 }, { cqLives: 4 }],
  "cq-achievements-10": [{ cqAchievements: 10 }, { cqAchievements: 9 }],
  "cq-hours-100": [{ cqSeconds: 100 * 3600 }, { cqSeconds: 99 * 3600 }],
  "dl-friend": [{ friends: 1 }, { playedWithFriend: false }],
  "dl-party": [{ inParty: true }, { friends: 3 }],
  "dl-shopper": [{ bought: true }, { dfGames: 3 }],
  "dl-both-games": [
    { dfGames: 1, cqGames: 1 },
    { dfGames: 4, cqGames: 0 },
  ],
  "dl-friends-5": [{ friends: 5 }, { friends: 4 }],
  "dl-played-together": [{ playedWithFriend: true }, { friends: 9 }],
  "dl-year": [{ createdAt: NOW - 366 * DAY }, { createdAt: NOW - 364 * DAY }],
};
/** Earned only as it happens, never read from records. */
const AS_IT_HAPPENS = ["dl-news"];

describe("the badges", () => {
  test("about 25 to 40, in bronze, silver and gold, each with one plain line", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(25);
    expect(BADGES.length).toBeLessThanOrEqual(40);
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
    for (const tier of ["bronze", "silver", "gold"])
      expect(
        BADGES.some((b) => b.tier === tier),
        tier,
      ).toBe(true);
    for (const g of BADGE_GROUPS)
      expect(
        BADGES.some((b) => b.group === g.id),
        g.id,
      ).toBe(true);
    for (const b of BADGES) {
      expect(b.how, b.key).toMatch(/^[A-Z].*\.$/);
      expect(b.how.split(". ").length, b.key).toBeLessThanOrEqual(2);
    }
  });

  test("every badge's rule: earned when met, not just short of it", () => {
    for (const b of BADGES) {
      if (AS_IT_HAPPENS.includes(b.key)) {
        expect(
          B.badgeRule(b.key, { ...ZERO, ...MEET["dl-friend"][0] }, NOW).earned,
        ).toBe(false);
        continue;
      }
      const meet = MEET[b.key];
      expect(meet, `${b.key} has a test`).toBeDefined();
      expect(
        B.badgeRule(b.key, ZERO, NOW).earned,
        `${b.key} from nothing`,
      ).toBe(false);
      expect(
        B.badgeRule(b.key, { ...ZERO, ...meet[0] }, NOW).earned,
        `${b.key} met`,
      ).toBe(true);
      expect(
        B.badgeRule(b.key, { ...ZERO, ...meet[1] }, NOW).earned,
        `${b.key} short`,
      ).toBe(false);
    }
  });

  test("counted badges say how far along they are", () => {
    expect(B.badgeRule("df-wins-10", { ...ZERO, dfWins: 7 }, NOW)).toEqual({
      earned: false,
      have: 7,
      of: 10,
    });
    expect(
      B.badgeRule("cq-hours-5", { ...ZERO, cqSeconds: 3 * 3600 + 5 }, NOW),
    ).toMatchObject({ have: 3, of: 5 });
    expect(
      B.badgeRule("sc-all-wins", { ...ZERO, scWon: ALL_SC.slice(2) }, NOW),
    ).toMatchObject({
      have: ALL_SC.length - 2,
      of: ALL_SC.length,
    });
    // Past the goal it stays at the goal.
    expect(B.badgeRule("df-wins-10", { ...ZERO, dfWins: 70 }, NOW).have).toBe(
      10,
    );
  });

  test("pins: earned ones, once each, three at most, in the player's order", () => {
    const earned = new Set(["df-first-win", "dl-friend", "cq-win", "df-mvp"]);
    expect(
      cleanPins(
        [
          "dl-friend",
          "nope",
          "df-wins-50",
          "dl-friend",
          7,
          "cq-win",
          "df-mvp",
          "df-first-win",
        ],
        earned,
      ),
    ).toEqual(["dl-friend", "cq-win", "df-mvp"]);
    expect(PIN_MAX).toBe(3);
  });

  test("a game's settings are read from the start of its saved record", () => {
    const config = {
      gameMap: "Europe",
      difficulty: "Hard",
      nations: 6,
      aiPersonalities: ["normal", "trader"],
      notes: 'a "quoted" {brace}',
    };
    const record = JSON.stringify({
      info: { gameID: "x", config, players: [] },
      turns: Array.from({ length: 3000 }, (_, i) => ({
        turnNumber: i,
        intents: [{ x: i }],
      })),
    });
    const gz = zlib.gzipSync(Buffer.from(record));
    expect(gz.length).toBeGreaterThan(4096);
    // Only the first 4 KB of the file: the config is whole in it.
    expect(B.configFromRecordHead(gz.subarray(0, 4096))).toEqual(config);
    expect(B.aiPersonalitiesOn(config)).toBe(true);
    expect(
      B.aiPersonalitiesOn({ ...config, aiPersonalities: ["normal"] }),
    ).toBe(false);
    expect(B.aiPersonalitiesOn({ ...config, nations: 0 })).toBe(false);
    expect(B.configFromRecordHead(Buffer.from("not gzip"))).toBeNull();
  });

  test("nothing about Mr. Based: not in a badge, the pages' badge and picture code, or the checks", () => {
    for (const b of BADGES)
      expect(`${b.key} ${b.name} ${b.how}`.toLowerCase(), b.key).not.toContain(
        "based",
      );
    for (const f of [
      "src/derpland/Badges.ts",
      "src/derpland/Pictures.ts",
      "src/derpland/BadgeArt.ts",
      "src/derpland/Avatar.ts",
      "src/hub/Badges.ts",
      "src/hub/PicturePicker.ts",
      "src/hub/PictureModeration.ts",
      "src/hub/looks.css",
    ])
      expect(
        fs.readFileSync(path.join(ROOT, f), "utf8").toLowerCase(),
        f,
      ).not.toContain("based");
    const server = fs.readFileSync(
      path.join(ROOT, "src/server/derpy/DerpyBadges.ts"),
      "utf8",
    );
    expect(server).not.toMatch(/derpy_based|based_access/);
    const en = JSON.parse(
      fs.readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
    ) as Record<string, unknown>;
    const bar = en.derp_bar as Record<string, string>;
    for (const k of ["badge_earned", "badges_earned", "see_badges"])
      expect(bar[k]?.toLowerCase(), k).not.toContain("based");
  });
});

describe.skipIf(!TEST_DB)("badges, against Postgres", () => {
  let kit: Kit;
  let pat: TestUser;
  let gary: TestUser;
  let n = 0;

  beforeAll(async () => {
    kit = await startKit();
    pat = await kit.user("Bdg_Pat");
    gary = await kit.user("Bdg_Gary");
  }, 60_000);

  afterAll(async () => {
    await kit?.close();
  });

  /** A saved DerpyFront game for an account, its settings only in its record (as before badges). */
  async function frontGame(
    accountId: number,
    o: {
      won?: boolean;
      mode?: string;
      difficulty?: string | null;
      recordDifficulty?: string;
      ai?: string[];
      scenario?: string;
      mvp?: boolean;
      peak?: number;
      gold?: bigint;
      nukes?: number;
      conquests?: number;
      also?: number[];
    } = {},
  ): Promise<string> {
    const id = `BG${++n}`;
    const record = zlib.gzipSync(
      Buffer.from(
        JSON.stringify({
          info: {
            gameID: id,
            config: {
              gameMap: "Italia",
              difficulty: o.recordDifficulty ?? "Medium",
              nations: 4,
              ...(o.ai ? { aiPersonalities: o.ai } : {}),
            },
            players: [],
          },
          turns: [],
        }),
      ),
    );
    await kit.pool.query(
      `INSERT INTO derpy_games (game_id, map, mode, game_type, started_at, ended_at,
         duration_s, winner, num_players, record, scenario, difficulty)
       VALUES ($1, 'Italia', $2, 'Singleplayer', now(), now(), 900, null, 1, $3, $4, $5)`,
      [
        id,
        o.mode ?? "Free For All",
        record,
        o.scenario ?? null,
        o.difficulty ?? null,
      ],
    );
    for (const who of [accountId, ...(o.also ?? [])])
      await kit.pool.query(
        `INSERT INTO derpy_game_players (game_id, account_id, username, won,
           peak_territory_pct, gold_earned, conquests, ships, betrayals, nukes, awards, coins)
         VALUES ($1, $2, 'x', $3, $4, $5, $6, 0, 0, $7, $8, 10)`,
        [
          id,
          who,
          who === accountId && !!o.won,
          o.peak ?? 10,
          String(o.gold ?? 0n),
          o.conquests ?? 0,
          o.nukes ?? 0,
          o.mvp && who === accountId ? ["mvp"] : [],
        ],
      );
    return id;
  }

  async function conquestGame(accountId: number, won: boolean, chars: number) {
    const id = `CQ${++n}`;
    await kit.pool.query(
      `INSERT INTO derpy_conquest_games (game_id, started_at, ended_at, duration_s,
         end_year, final_year, difficulty, num_players, winner, summary)
       VALUES ($1, now(), now(), 3600, 1700, 1700, 'hard', 1, null, $2)`,
      [
        id,
        JSON.stringify([
          {
            name: "x",
            nation: "england",
            rank: 1,
            score: 5,
            won,
            account: true,
            chars: Array.from({ length: chars }, (_, i) => ({ name: `C${i}` })),
          },
        ]),
      ],
    );
    await kit.pool.query(
      `INSERT INTO derpy_conquest_players (game_id, account_id, username, nation, won,
         rank, score, provinces, peak_provinces, colonies, battles_won, conquests,
         gold_earned, coins)
       VALUES ($1, $2, 'x', 'england', $3, 1, 5, 1, 1, 0, 0, 0, 0, 10)`,
      [id, accountId, won],
    );
  }

  async function keys(u: TestUser): Promise<string[]> {
    const r = await kit.pool.query(
      "SELECT key FROM derpy_badges WHERE account_id = $1 ORDER BY key",
      [u.id],
    );
    return r.rows.map((x) => x.key as string);
  }

  test("an account's records earn its badges (backfilled the first time it's checked), and checking again changes nothing", async () => {
    const u = await kit.user("Bdg_Vet");
    await kit.pool.query(
      "UPDATE derpy_accounts SET created_at = now() - interval '400 days' WHERE id = $1",
      [u.id],
    );
    // 10 wins, one on Hard (only in its record), one with AI personalities
    // (only in its record), an MVP, a team win, half the map, a nuke.
    await frontGame(u.id, { won: true, recordDifficulty: "Hard" });
    await frontGame(u.id, { won: true, ai: ["normal", "mad_scientist"] });
    await frontGame(u.id, { won: true, mvp: true, peak: 55, nukes: 2 });
    await frontGame(u.id, { won: true, mode: "Team", scenario: "europe1939" });
    for (let i = 0; i < 6; i++) await frontGame(u.id, { won: true });
    await frontGame(u.id, { won: false, scenario: "korea1950" });
    // Challenges: one done; a full week; 2 weeks.
    await kit.pool.query(
      `INSERT INTO derpy_challenges (account_id, week, key, progress, done_at, coins)
       VALUES ($1, 2900, 'df-win', 1, now(), 100), ($1, 2900, 'bonus:derpyfront', 1, now(), 250),
              ($1, 2901, 'df-win', 1, now(), 100), ($1, 2902, 'df-win', 0, null, 0)`,
      [u.id],
    );
    // Conquest: a game won with a line of 3, and 6 hours at the table.
    await conquestGame(u.id, true, 3);
    await kit.pool.query(
      "INSERT INTO derpy_conquest_play (game_id, account_id, secs) VALUES ('p1', $1, 21600)",
      [u.id],
    );
    await kit.pool.query(
      "INSERT INTO derpy_conquest_achievements (account_id, key, coins) VALUES ($1, 'first_job', 10)",
      [u.id],
    );
    // A friend, who was in one of those games; something bought.
    await kit.pool.query(
      "INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1)",
      [u.id, pat.id],
    );
    await frontGame(u.id, { won: false, also: [pat.id] });
    await kit.pool.query(
      "INSERT INTO derpy_owned (account_id, item) VALUES ($1, 'skin:x')",
      [u.id],
    );

    const first = await B.checkBadges(u.id, { force: true });
    const want = [
      "ch-first",
      "ch-full-week",
      "cq-achievement",
      "cq-dynasty-3",
      "cq-first-life",
      "cq-hours-5",
      "cq-win",
      "df-ai-win",
      "df-first-win",
      "df-games-10",
      "df-hard-win",
      "df-land-50",
      "df-mvp",
      "df-nuke",
      "df-team-win",
      "df-wins-10",
      "dl-both-games",
      "dl-friend",
      "dl-played-together",
      "dl-shopper",
      "dl-year",
      "sc-first-win",
    ];
    expect([...first.added].sort()).toEqual(want);
    expect(await keys(u)).toEqual(want);
    // The old games' settings were read from their records and kept.
    const settings = await kit.pool.query(
      `SELECT g.difficulty, g.ai_personalities FROM derpy_games g
       JOIN derpy_game_players gp ON gp.game_id = g.game_id
       WHERE gp.account_id = $1 AND gp.won ORDER BY g.game_id`,
      [u.id],
    );
    expect(settings.rows.filter((r) => r.difficulty === "Hard")).toHaveLength(
      1,
    );
    expect(
      settings.rows.filter((r) => r.ai_personalities === true),
    ).toHaveLength(1);
    expect(settings.rows.every((r) => r.difficulty !== null)).toBe(true);

    // Again: nothing new, nothing changed.
    const at = await kit.pool.query(
      "SELECT key, earned_at FROM derpy_badges WHERE account_id = $1 ORDER BY key",
      [u.id],
    );
    const again = await B.checkBadges(u.id, { force: true });
    expect(again.added).toEqual([]);
    const at2 = await kit.pool.query(
      "SELECT key, earned_at FROM derpy_badges WHERE account_id = $1 ORDER BY key",
      [u.id],
    );
    expect(at2.rows).toEqual(at.rows);

    // The profile shows them, with how far along the rest are.
    const prof = await kit.call(`/players/${u.name}`);
    expect(
      prof.json.badges.earned.map((b: { key: string }) => b.key).sort(),
    ).toEqual(want);
    expect(prof.json.badges.progress["df-wins-50"]).toEqual([10, 50]);
    expect(prof.json.badges.progress["sc-all-played"]).toEqual([
      2,
      ALL_SC.length,
    ]);

    // A badge once earned stays: a friend gone doesn't take Buddy back.
    await kit.pool.query(
      "DELETE FROM derpy_friends WHERE account_id = $1 OR friend_id = $1",
      [u.id],
    );
    await B.checkBadges(u.id, { force: true });
    expect(await keys(u)).toContain("dl-friend");
  });

  test("a game saved now keeps its difficulty and AI personalities", async () => {
    const { recordDerpyGame } =
      await import("../../src/server/derpy/DerpyGames");
    const u = await kit.user("Bdg_Hard");
    const record = {
      info: {
        gameID: "BGHARD1",
        config: {
          gameMap: GameMapType.Italia,
          gameMapSize: "Normal",
          gameMode: GameMode.FFA,
          gameType: "Singleplayer",
          difficulty: Difficulty.Impossible,
          nations: 5,
          bots: 0,
          aiPersonalities: ["trader"],
        },
        players: [
          {
            clientID: "AAAAAAAA",
            username: u.name,
            clanTag: null,
            persistentID: null,
            stats: { tiles: ["100"], conquests: ["0", "0", "0"] },
          },
        ],
        start: 1_700_000_000_000,
        end: 1_700_000_900_000,
        duration: 900,
        num_turns: 10,
        winner: ["player", "AAAAAAAA"],
        lobbyFillTime: 0,
        lobbyCreatedAt: 1_700_000_000_000,
      },
      version: "v0.0.2",
      gitCommit: "DEV",
      turns: [],
    } as unknown as GameRecord;
    await recordDerpyGame(record, [] as GameAwards, () => u.id);
    const g = (
      await kit.pool.query(
        "SELECT difficulty, ai_personalities FROM derpy_games WHERE game_id = 'BGHARD1'",
      )
    ).rows[0];
    expect(g).toEqual({ difficulty: "Impossible", ai_personalities: true });
    await B.checkBadges(u.id, { force: true });
    expect(await keys(u)).toEqual(
      expect.arrayContaining(["df-first-win", "df-hard-win", "df-ai-win"]),
    );
  });

  test("the bar's toast: new badges once, then seen", async () => {
    const u = await kit.user("Bdg_Toast");
    await frontGame(u.id, { won: true });
    B.forgetBadgeChecks();
    const mine = await kit.call("/badges/mine", { token: u.token });
    expect(mine.json.fresh).toEqual(["df-first-win"]);
    expect(
      (
        await kit.call("/badges/seen", {
          token: u.token,
          body: { keys: ["df-first-win"] },
        })
      ).status,
    ).toBe(204);
    const again = await kit.call("/badges/mine", { token: u.token });
    expect(again.json.fresh).toEqual([]);
    expect(again.json.earned.map((e: { key: string }) => e.key)).toEqual([
      "df-first-win",
    ]);
    expect((await kit.call("/badges/mine")).status).toBe(401);
  });

  test("pinning: earned badges only, three at most, shown beside the name everywhere", async () => {
    const u = await kit.user("Bdg_Pin");
    await kit.pool.query(
      `INSERT INTO derpy_badges (account_id, key) VALUES
       ($1, 'df-first-win'), ($1, 'dl-friend'), ($1, 'cq-win'), ($1, 'df-mvp')`,
      [u.id],
    );
    const pin = (k: unknown[]) =>
      kit.call("/badges/pins", { token: u.token, body: { keys: k } });
    expect((await pin(["df-wins-50", "dl-friend"])).json.pinned).toEqual([
      "dl-friend",
    ]);
    expect(
      (await pin(["cq-win", "df-first-win", "dl-friend", "df-mvp"])).json
        .pinned,
    ).toEqual(["cq-win", "df-first-win", "dl-friend"]);
    expect((await pin(["bogus"])).json.pinned).toEqual([]);
    await pin(["df-mvp", "cq-win"]);
    expect((await kit.call(`/players/${u.name}`)).json.badges.pinned).toEqual([
      "df-mvp",
      "cq-win",
    ]);
    expect((await kit.call("/me", { token: u.token })).json.pinned).toEqual([
      "df-mvp",
      "cq-win",
    ]);
    // In a friend's lists.
    await kit.pool.query(
      "INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1)",
      [u.id, gary.id],
    );
    const { forgetAllSocial } =
      await import("../../src/server/derpy/DerpySocial");
    forgetAllSocial();
    const s = await kit.call("/social/state", { token: gary.token });
    expect(s.json.looks[u.id].badges).toEqual(["df-mvp", "cq-win"]);
    // And on the leaderboard (once they've played).
    await frontGame(u.id, { won: true });
    const board = await kit.call("/leaderboard?game=derpyfront");
    expect(
      board.json.players.find(
        (p: { username: string }) => p.username === u.name,
      ).badges,
    ).toEqual(["df-mvp", "cq-win"]);
    // Signed out: no pinning.
    expect(
      (await kit.call("/badges/pins", { body: { keys: [] } })).status,
    ).toBe(401);
  });

  test("earned as it happens: a party with someone (both of them), and reading What's New", async () => {
    await kit.pool.query(
      "INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING",
      [pat.id, gary.id],
    );
    const { forgetAllSocial } =
      await import("../../src/server/derpy/DerpySocial");
    forgetAllSocial();
    expect(
      (
        await kit.call("/social/party/invite", {
          token: pat.token,
          body: { id: gary.id },
        })
      ).status,
    ).toBe(200);
    const party = (
      await kit.pool.query(
        "SELECT party_id FROM derpy_party_members WHERE account_id = $1",
        [pat.id],
      )
    ).rows[0].party_id;
    expect(
      (
        await kit.call("/social/party/accept", {
          token: gary.token,
          body: { id: Number(party) },
        })
      ).status,
    ).toBe(200);
    await expect
      .poll(async () => (await keys(gary)).includes("dl-party"))
      .toBe(true);
    await expect
      .poll(async () => (await keys(pat)).includes("dl-party"))
      .toBe(true);

    const news = await kit.call("/news", { token: gary.token });
    expect(news.status).toBe(200);
    const upTo = news.json.entries[0]?.id;
    expect(upTo).toBeTruthy();
    expect(
      (await kit.call("/news/seen", { token: gary.token, body: { upTo } }))
        .status,
    ).toBe(200);
    await expect
      .poll(async () => (await keys(gary)).includes("dl-news"))
      .toBe(true);
  });

  test("a rename keeps every badge and pin: they go by account", async () => {
    const u = await kit.user("Bdg_Old");
    await frontGame(u.id, { won: true, mvp: true });
    await B.checkBadges(u.id, { force: true });
    await kit.call("/badges/pins", {
      token: u.token,
      body: { keys: ["df-mvp"] },
    });
    const r = await kit.call("/username", {
      token: u.token,
      body: { username: "Bdg_New" },
    });
    expect(r.status).toBe(200);
    for (const name of ["Bdg_New", "Bdg_Old"]) {
      const p = await kit.call(`/players/${name}`);
      expect(p.json.username).toBe("Bdg_New");
      expect(
        p.json.badges.earned.map((b: { key: string }) => b.key).sort(),
      ).toEqual(["df-first-win", "df-mvp"]);
      expect(p.json.badges.pinned).toEqual(["df-mvp"]);
    }
  });

  test("Mr. Based earns nothing and shows nowhere: twins with and without it have the same badges", async () => {
    const plain = await kit.user("Bdg_Twin1");
    const based = await kit.user("Bdg_Twin2");
    await kit.pool.query(
      "UPDATE derpy_accounts SET based_access = true WHERE id = $1",
      [based.id],
    );
    await kit.pool.query(
      `INSERT INTO derpy_based_saves (account_id, save) VALUES ($1, '{"chapter": 5}');
       INSERT INTO derpy_based_notes (account_id, chapter, scene, note) VALUES ($1, 1, 's', 'n')`.replace(
        /\$1/g,
        String(based.id),
      ),
    );
    for (const u of [plain, based]) {
      await frontGame(u.id, { won: true });
      await B.checkBadges(u.id, { force: true });
    }
    expect(await keys(based)).toEqual(await keys(plain));
    const prof = await kit.call(`/players/${based.name}`);
    const mine = await kit.call("/badges/mine", { token: based.token });
    for (const body of [prof.json.badges, mine.json])
      expect(JSON.stringify(body).toLowerCase()).not.toContain("based");
    expect(prof.json.badges.earned).toHaveLength(1);
  });
});
