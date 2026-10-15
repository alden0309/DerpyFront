// NAMES (r20): changing your username on Derp Land. A rename shows
// everywhere (leaderboards, latest games, profiles, replays, Derpy Conquest
// results and saved campaigns, the store, achievements, Mr. Based), once in
// 7 days, unique without regard to case, with the old name kept for its
// account for 7 days. Sessions stay signed in, and sign-in takes the new
// name at once. Mr. Based follows the account, never the name.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import { GameAwards } from "@openfront/engine-api/game/Awards";
import { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { ServerMessage } from "../../src/conquest/Protocol";
import {
  formatWhen,
  NAME_CHANGE_MS,
  nameHeldUntil,
  nextNameChange,
} from "../../src/derpland/Names";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTilesForSize: async () => 1000,
}));

describe("when the form says you may change it again", () => {
  // Tuesday 13 October 2026, 5:20 pm, in this machine's own time.
  const now = new Date(2026, 9, 13, 17, 20).getTime();

  test("the exact day and time, in the viewer's time", () => {
    expect(formatWhen(new Date(2026, 9, 20, 17, 20), { now, up: true })).toBe(
      "Tue 20 Oct, 5:20 pm",
    );
    expect(formatWhen(new Date(2026, 9, 21, 0, 5), { now })).toBe(
      "Wed 21 Oct, 12:05 am",
    );
    expect(formatWhen(new Date(2026, 9, 21, 12, 0), { now })).toBe(
      "Wed 21 Oct, 12:00 pm",
    );
  });

  test("a part-minute rounds up, so at the minute shown it's allowed", () => {
    const at = new Date(2026, 9, 20, 17, 20, 30);
    expect(formatWhen(at, { now, up: true })).toBe("Tue 20 Oct, 5:21 pm");
    expect(formatWhen(at, { now })).toBe("Tue 20 Oct, 5:20 pm");
  });

  test("the 7 days run from the minute of the change", () => {
    const changed = new Date(2026, 9, 13, 17, 20, 41).getTime();
    expect(formatWhen(changed, { now })).toBe("Tue 13 Oct, 5:20 pm");
    expect(formatWhen(nextNameChange(changed), { now })).toBe(
      "Tue 20 Oct, 5:20 pm",
    );
    expect(nameHeldUntil(changed)).toBe(nextNameChange(changed));
    expect(nextNameChange(changed)).toBe(
      new Date(2026, 9, 20, 17, 20).getTime(),
    );
  });

  test("another year says which", () => {
    expect(formatWhen(new Date(2027, 0, 2, 9, 7), { now })).toBe(
      "Sat 2 Jan 2027, 9:07 am",
    );
  });
});

function player(
  clientID: string,
  username: string,
  persistentID: string | null,
): PlayerRecord {
  return {
    clientID,
    username,
    clanTag: null,
    persistentID,
    stats: { tiles: [300n, 0n, 0n] },
  } as unknown as PlayerRecord;
}

function record(
  gameID: string,
  players: PlayerRecord[],
  winner: unknown,
  start = Date.now() - 20 * 60_000,
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
      start,
      end: start + 600_000,
      duration: 600,
      num_turns: 10,
      winner,
      lobbyFillTime: 0,
      lobbyCreatedAt: start,
    },
    version: "v0.0.2",
    gitCommit: "DEV",
    turns: [],
  } as unknown as GameRecord;
}

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("changing your username, against Postgres", () => {
  let base = "";
  let server: http.Server;
  let pool: pg.Pool;
  let closeDb: () => Promise<void>;
  let db: () => Promise<pg.Pool>;
  let N: typeof import("../../src/server/derpy/DerpyNames");

  const ids: number[] = [];
  let alden = { token: "", playId: "", id: 0 };
  let pat = { token: "", playId: "", id: 0 };
  let renamedAt = 0;

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

  /** The server stops and starts again: its pool goes, and the next use migrates. */
  async function restart(): Promise<void> {
    await closeDb();
    pool = await db();
  }

  /** Time passes for an account's last change (its limit and its old name's hold). */
  async function daysPass(id: number, ms: number): Promise<void> {
    await pool.query(
      `UPDATE derpy_accounts
       SET username_changed_at = username_changed_at - make_interval(secs => $2)
       WHERE id = $1`,
      [id, ms / 1000],
    );
  }

  async function marked(id: number): Promise<boolean> {
    const r = await pool.query(
      "SELECT based_access FROM derpy_accounts WHERE id = $1",
      [id],
    );
    return r.rows[0].based_access;
  }

  const access = async (token: string) =>
    (await call("/based/access", { token })).json;

  beforeAll(async () => {
    delete process.env.BASED_PLAYERS;
    process.env.DATABASE_URL = TEST_DB;
    const pgm = await import("pg");
    const c = new pgm.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_based_notes, derpy_based_picks, derpy_based_saves, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    ({ db, closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    N = await import("../../src/server/derpy/DerpyNames");
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    const app = express();
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
    pool = await db();
  }, 60_000);

  afterAll(async () => {
    // Nothing of these accounts is left to mark, hold or block another test.
    if (pool && ids.length > 0)
      await pool
        .query("DELETE FROM derpy_accounts WHERE id = ANY($1::bigint[])", [ids])
        .catch(() => {});
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
    delete process.env.BASED_PLAYERS;
  });

  test("on the first start, the account named Alden is marked for Mr. Based", async () => {
    // The live site's owner, from before access went by account.
    const { hashPassword } = await import("../../src/server/derpy/DerpyAuth");
    const made = await pool.query(
      `INSERT INTO derpy_accounts (username, username_key, password_hash)
       VALUES ('Alden', 'alden', $1) RETURNING id`,
      [await hashPassword("letaldenwin")],
    );
    alden.id = Number(made.rows[0].id);
    ids.push(alden.id);
    expect(await marked(alden.id)).toBe(false);

    await restart();
    expect(await marked(alden.id)).toBe(true);
    // Starting again changes nothing.
    await restart();
    expect(await marked(alden.id)).toBe(true);

    const signedIn = await call("/login", {
      body: { username: "ALDEN", password: "letaldenwin" },
    });
    expect(signedIn.status).toBe(200);
    alden = { ...signedIn.json, id: alden.id };

    const made2 = await call("/register", {
      body: { username: "Tester_Pat", password: "hunter22" },
    });
    expect(made2.status).toBe(200);
    pat = { ...made2.json, id: made2.json.account.id };
    ids.push(pat.id);

    expect(await access(alden.token)).toEqual({ signedIn: true, play: true });
    expect(await access(pat.token)).toEqual({ signedIn: true, play: false });
  });

  test("Alden plays, buys, earns and saves under his name", async () => {
    const { recordDerpyGame } =
      await import("../../src/server/derpy/DerpyGames");
    const { recordConquestGame } =
      await import("../../src/server/derpy/DerpyConquest");
    const { saveConquest } =
      await import("../../src/server/derpy/ConquestSaves");
    const { awardAchievement } =
      await import("../../src/server/derpy/DerpyAchievements");

    // DerpyFront: one game as himself (he won, and was MVP), one as "Bob".
    const awards: GameAwards = [
      { kind: "mvp", name: "Alden", clientID: "AAAAAAAA", value: 9 },
    ];
    await recordDerpyGame(
      record(
        "RENAME01",
        [
          player("AAAAAAAA", "Alden", alden.playId),
          player("BBBBBBBB", "Gary", null),
        ],
        ["player", "AAAAAAAA"],
        Date.now() - 60 * 60_000,
      ),
      awards,
    );
    await recordDerpyGame(
      record(
        "RENAME02",
        [
          player("AAAAAAAA", "Bob", alden.playId),
          player("BBBBBBBB", "Gary", null),
        ],
        ["player", "BBBBBBBB"],
        Date.now() - 40 * 60_000,
      ),
      [],
    );

    // Derpy Conquest: a win as Diego Vargas, beside a guest.
    await recordConquestGame({
      gameId: "RENAMEC1",
      startedAt: Date.now() - 30 * 60_000,
      endedAt: Date.now() - 25 * 60_000,
      endYear: 1776,
      finalYear: 1650,
      difficulty: "easy",
      winner: "Diego Vargas (Alden)",
      players: [
        {
          accountId: alden.id,
          name: "Alden",
          nation: "spain",
          rank: 1,
          score: 900,
          won: true,
          provinces: 3,
          peakProvinces: 3,
          colonies: 1,
          battlesWon: 2,
          conquests: 1,
          goldEarned: 500,
          coins: 40,
        },
        {
          accountId: null,
          name: "Guest",
          nation: "france",
          rank: 2,
          score: 100,
          won: false,
          provinces: 1,
          peakProvinces: 1,
          colonies: 0,
          battlesWon: 0,
          conquests: 0,
          goldEarned: 50,
          coins: 5,
        },
      ],
    });

    // A campaign he began with Pat, saved between sittings.
    await saveConquest(
      "RENAMES1",
      "The Vargases and the Mercers, from 1607",
      1612,
      [
        { seat: "s1", name: "Alden", power: "spain", accountId: alden.id },
        { seat: "s2", name: "Tester_Pat", power: "england", accountId: pat.id },
      ],
      {
        version: 999,
        lives: [
          { seat: "s1", name: "Alden" },
          { seat: "s2", name: "Tester_Pat" },
        ],
      } as never,
      false,
      alden.id,
      [alden.id, pat.id],
    );

    const { ACHIEVEMENTS } =
      await import("../../src/conquest/engine/Achievements");
    expect(
      // CQACH (r22): overall achievements come from games on Hard.
      (
        await awardAchievement(
          alden.id,
          ACHIEVEMENTS[0].key,
          "RENAMEC1",
          "hard",
        )
      ).first,
    ).toBe(true);

    await pool.query("UPDATE derpy_accounts SET coins = 2000 WHERE id = $1", [
      alden.id,
    ]);
    expect(
      (
        await call("/store/buy", {
          body: { pack: "classics" },
          token: alden.token,
        })
      ).status,
    ).toBe(200);

    // Mr. Based: a save, and a note for the writer.
    // BWORLD (r22): the profile is v2 (the scenes seen, and time played).
    const save = { v: 2, seen: {}, finished: {}, played: 60 };
    expect(
      (
        await call("/based/save", {
          method: "PUT",
          body: { save },
          token: alden.token,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await call("/based/notes", {
          body: { chapter: 1, scene: "open", note: "Lovely bit." },
          token: alden.token,
        })
      ).status,
    ).toBe(200);
  });

  test("where you stand, before any change", async () => {
    const s = await call("/username", { token: alden.token });
    expect(s.json).toEqual({
      username: "Alden",
      changedAt: null,
      nextChangeAt: null,
      canChange: true,
      heldName: null,
      heldUntil: null,
    });
    expect((await call("/username")).status).toBe(401);
  });

  test("the live check: the same rules as sign-up, and your own name", async () => {
    const check = async (name: string, token = alden.token) =>
      (
        await call(`/username/check?name=${encodeURIComponent(name)}`, {
          token,
        })
      ).json;
    expect(await check("Alden_D")).toEqual({ username: "Alden_D", ok: true });
    expect(await check("a b")).toMatchObject({
      ok: false,
      reason: "invalid_username",
    });
    expect(await check("ab")).toMatchObject({ reason: "invalid_username" });
    expect(await check("x".repeat(21))).toMatchObject({
      reason: "invalid_username",
    });
    expect(await check("Alden")).toMatchObject({ reason: "same_name" });
    // Capitals only: allowed against your own name, and a change.
    expect(await check("alden")).toEqual({
      username: "alden",
      ok: true,
      caseOnly: true,
    });
    // Someone else's, in any case.
    expect(await check("TESTER_PAT")).toMatchObject({
      ok: false,
      reason: "username_taken",
    });
  });

  test("a rename: the session stays, and the new name is everywhere", async () => {
    const r = await call("/username", {
      body: { username: "Alden_D" },
      token: alden.token,
    });
    expect(r.status).toBe(200);
    renamedAt = Date.parse(r.json.changedAt);
    expect(r.json).toMatchObject({
      account: { username: "Alden_D", coins: 500 },
      username: "Alden_D",
      canChange: false,
      heldName: "Alden",
    });
    expect(Date.parse(r.json.nextChangeAt)).toBe(nextNameChange(renamedAt));
    expect(Date.parse(r.json.heldUntil)).toBe(nameHeldUntil(renamedAt));

    // The same session, signed in, with the new name.
    const me = await call("/me", { token: alden.token });
    expect(me.json.account).toEqual({ username: "Alden_D", coins: 500 });
    // The store and inventory: what he owns is his still.
    expect(me.json.owned).toContain("pack:classics");
    const { derpySkinForPlayer } =
      await import("../../src/server/derpy/DerpySkins");
    expect(await derpySkinForPlayer(alden.playId, "classic_camo")).toEqual({
      name: "classic_camo",
      url: "/derpy-skins/classic_camo.png",
    });

    // Leaderboards: every board.
    for (const game of ["derpyfront", "conquest", "overall"]) {
      const board = await call(`/leaderboard?game=${game}`);
      const names = board.json.players.map(
        (p: { username: string }) => p.username,
      );
      expect(names).toContain("Alden_D");
      expect(names).not.toContain("Alden");
    }

    // Latest games: the account's name, and an alias only where there was one.
    const recent = (await call("/recent")).json.results as {
      gameId: string;
      username: string;
      playedAs?: string;
    }[];
    const line = (id: string) => recent.find((x) => x.gameId === id)!;
    expect(line("RENAME01")).toMatchObject({ username: "Alden_D" });
    expect(line("RENAME01").playedAs).toBeUndefined();
    expect(line("RENAME02")).toMatchObject({
      username: "Alden_D",
      playedAs: "Bob",
    });
    expect(line("RENAMEC1")).toMatchObject({ username: "Alden_D" });
    expect(line("RENAMEC1").playedAs).toBeUndefined();

    // His page: game rows, Conquest games and achievements.
    const p = (await call("/players/alden_d")).json;
    expect(p.username).toBe("Alden_D");
    const played = Object.fromEntries(
      p.games.map((g: { gameId: string; playedAs: string }) => [
        g.gameId,
        g.playedAs,
      ]),
    );
    expect(played).toEqual({ RENAME01: "Alden_D", RENAME02: "Bob" });
    expect(p.conquest.games.map((g: { gameId: string }) => g.gameId)).toEqual([
      "RENAMEC1",
    ]);
    expect(p.conquest.achievements).toHaveLength(1);

    // Replays: his own name follows; an alias, and other players, don't.
    const names = async (id: string) =>
      (await call(`/game/${id}`)).json.info.players.map(
        (x: PlayerRecord) => x.username,
      );
    expect(await names("RENAME01")).toEqual(["Alden_D", "Gary"]);
    expect(await names("RENAME02")).toEqual(["Bob", "Gary"]);

    // Stored copies: the winner, the MVP, the player rows.
    const g = await pool.query(
      "SELECT game_id, winner, awards FROM derpy_games ORDER BY game_id",
    );
    expect(g.rows.map((x) => [x.game_id, x.winner])).toEqual([
      ["RENAME01", "Alden_D"],
      ["RENAME02", "Gary"],
    ]);
    expect(g.rows[0].awards[0]).toMatchObject({ kind: "mvp", name: "Alden_D" });
    const gp = await pool.query(
      "SELECT game_id, username, played_as FROM derpy_game_players ORDER BY game_id",
    );
    expect(gp.rows).toEqual([
      { game_id: "RENAME01", username: "Alden_D", played_as: "Alden" },
      { game_id: "RENAME02", username: "Bob", played_as: null },
    ]);

    // Derpy Conquest results: his name, never his character's.
    const cg = await pool.query(
      "SELECT winner, summary FROM derpy_conquest_games WHERE game_id = 'RENAMEC1'",
    );
    expect(cg.rows[0].winner).toBe("Diego Vargas (Alden_D)");
    expect(cg.rows[0].summary.map((x: { name: string }) => x.name)).toEqual([
      "Alden_D",
      "Guest",
    ]);
    const cp = await pool.query(
      "SELECT username FROM derpy_conquest_players WHERE account_id = $1",
      [alden.id],
    );
    expect(cp.rows).toEqual([{ username: "Alden_D" }]);

    // Saved campaigns: the lobby's lists, who began it, and the lives in it.
    const { savesFor, saveInfo, loadConquest, ownerOf } =
      await import("../../src/server/derpy/ConquestSaves");
    for (const id of [alden.id, pat.id]) {
      const [row] = await savesFor(id, 999);
      expect(row.title).toBe("The Vargases and the Mercers, from 1607");
      expect(row.seats.map((s) => s.name)).toEqual(["Alden_D", "Tester_Pat"]);
      expect(ownerOf(row)).toBe(alden.id);
    }
    expect((await saveInfo("RENAMES1"))!.seats[0].name).toBe("Alden_D");
    const loaded = (await loadConquest("RENAMES1"))!;
    expect(loaded.owner).toBe(alden.id);
    expect(
      (loaded.state as unknown as { lives: { name: string }[] }).lives.map(
        (l) => l.name,
      ),
    ).toEqual(["Alden_D", "Tester_Pat"]);
    const raw = await pool.query(
      "SELECT seats FROM derpy_conquest_saves WHERE game_id = 'RENAMES1'",
    );
    expect(raw.rows[0].seats.map((s: { name: string }) => s.name)).toEqual([
      "Alden_D",
      "Tester_Pat",
    ]);

    // Mr. Based: still his, with his save; the notes name him as he is now.
    expect(await access(alden.token)).toEqual({ signedIn: true, play: true });
    const save = await call("/based/save", { token: alden.token });
    expect(save.json.save).toMatchObject({ v: 2 });
    const { listNotes } = await import("../../src/server/derpy/BasedNotes");
    expect((await listNotes(pool)).map((n) => n.username)).toEqual(["Alden_D"]);
  });

  test("signing in takes the new name at once, and not the old one", async () => {
    const ok = await call("/login", {
      body: { username: "alden_d", password: "letaldenwin" },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.account).toEqual({
      id: alden.id,
      username: "Alden_D",
      coins: 500,
    });
    const old = await call("/login", {
      body: { username: "Alden", password: "letaldenwin" },
    });
    expect(old).toEqual({ status: 401, json: { error: "wrong_password" } });
    // The session from before the change is still good.
    expect((await call("/me", { token: alden.token })).status).toBe(200);
  });

  test("once in 7 days (from the minute of the change), to the millisecond", async () => {
    const at = nextNameChange(renamedAt);
    const next = new Date(at).toISOString();
    const again = await call("/username", {
      body: { username: "Alden_E" },
      token: alden.token,
    });
    expect(again).toEqual({
      status: 429,
      json: { error: "too_soon", nextChangeAt: next },
    });
    expect(
      (await call("/username", { token: alden.token })).json,
    ).toMatchObject({
      username: "Alden_D",
      canChange: false,
      nextChangeAt: next,
    });
    // A moment before: refused, saying when. At that moment: allowed.
    expect(await N.renameAccount(alden.id, "Alden_E", at - 1)).toEqual({
      ok: false,
      error: "too_soon",
      nextChangeAt: next,
    });
    expect(await N.nameStatus(alden.id, at - 1)).toMatchObject({
      canChange: false,
      nextChangeAt: next,
    });
    expect(await N.nameStatus(alden.id, at)).toMatchObject({
      canChange: true,
      nextChangeAt: null,
    });
  });

  test("unique without regard to case, against sign-ups too", async () => {
    const taken = await call("/username", {
      body: { username: "ALDEN_D" },
      token: pat.token,
    });
    expect(taken).toEqual({ status: 409, json: { error: "username_taken" } });
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    expect(await register("aLdEn_D", "whatever1")).toBe("username_taken");
  });

  test("the old name is kept for its account for 7 days", async () => {
    // Nobody else may have it: not by renaming, not by signing up.
    const held = await call("/username", {
      body: { username: "alden" },
      token: pat.token,
    });
    expect(held).toEqual({ status: 409, json: { error: "username_held" } });
    expect(
      (await call("/username/check?name=Alden", { token: pat.token })).json,
    ).toMatchObject({ ok: false, reason: "username_held" });
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    expect(await register("ALDEN", "whatever1")).toBe("username_taken");

    // Its owner may take it back (once his own 7 days allow).
    expect(
      (await call("/username/check?name=Alden", { token: alden.token })).json,
    ).toEqual({ username: "Alden", ok: true });
    expect(
      await N.nameProblem(pool, "Alden", alden.id, Date.now(), true),
    ).toBeNull();

    // Old links to his page still find him while it's kept.
    expect((await call("/players/Alden")).json.username).toBe("Alden_D");

    // A moment before the 7 days are up it's still kept; then it's free.
    expect(
      await N.nameProblem(
        pool,
        "alden",
        pat.id,
        nameHeldUntil(renamedAt) - 1,
        true,
      ),
    ).toBe("username_held");
    expect(
      await N.nameProblem(
        pool,
        "alden",
        pat.id,
        nameHeldUntil(renamedAt),
        true,
      ),
    ).toBeNull();
  });

  test("a change of capitals only counts as a change", async () => {
    const r = await call("/username", {
      body: { username: "TESTER_PAT" },
      token: pat.token,
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      username: "TESTER_PAT",
      canChange: false,
      heldName: null,
    });
    expect(
      (
        await call("/username", {
          body: { username: "Pat_Two" },
          token: pat.token,
        })
      ).json.error,
    ).toBe("too_soon");
    // The campaign they share shows Pat's new capitals too.
    const { savesFor } = await import("../../src/server/derpy/ConquestSaves");
    expect((await savesFor(alden.id, 999))[0].seats[1].name).toBe("TESTER_PAT");
  });

  test("Mr. Based follows the account: renamed Alden keeps it, a new Alden gets none", async () => {
    // A week passes for both of them.
    await daysPass(alden.id, NAME_CHANGE_MS + 60_000);
    await daysPass(pat.id, NAME_CHANGE_MS + 60_000);
    renamedAt -= NAME_CHANGE_MS + 60_000;

    // "Alden" is free now, and Pat takes it.
    const took = await call("/username", {
      body: { username: "Alden" },
      token: pat.token,
    });
    expect(took.status).toBe(200);
    expect(took.json.account.username).toBe("Alden");
    expect((await call("/players/alden")).json.username).toBe("Alden");

    expect(await access(pat.token)).toEqual({ signedIn: true, play: false });
    expect((await call("/based/chapters", { token: pat.token })).status).toBe(
      403,
    );
    expect(await access(alden.token)).toEqual({ signedIn: true, play: true });

    // A restart doesn't hand it to whoever is called Alden now.
    await restart();
    expect(await marked(pat.id)).toBe(false);
    expect(await marked(alden.id)).toBe(true);
    expect(await access(pat.token)).toEqual({ signedIn: true, play: false });
    expect(await access(alden.token)).toEqual({ signedIn: true, play: true });
  });

  test("a name BASED_PLAYERS still waits for can only come by signing up", async () => {
    process.env.BASED_PLAYERS = "Alden, Zed_Friend";
    try {
      expect(
        (
          await call("/username/check?name=zed_friend", {
            token: alden.token,
          })
        ).json,
      ).toMatchObject({ ok: false, reason: "username_reserved" });
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const zed = await register("Zed_Friend", "hunter22");
      if (typeof zed === "string") throw new Error(zed);
      ids.push(zed.account.id);
      expect(await marked(zed.account.id)).toBe(true);
      // Marked now, by account: the name is nothing special any more.
      expect(
        await N.nameProblem(pool, "Zed_Friend", null, Date.now(), true),
      ).toBe("username_taken");
      expect(await marked(pat.id)).toBe(false);
    } finally {
      delete process.env.BASED_PLAYERS;
    }
  });

  test("a game going on through a rename shows the new name from its end", async () => {
    const { recordDerpyGame } =
      await import("../../src/server/derpy/DerpyGames");
    const { recordConquestGame } =
      await import("../../src/server/derpy/DerpyConquest");
    // At the exact moment his 7 days are up, he changes it again.
    const at = nextNameChange(renamedAt);
    const r = await N.renameAccount(alden.id, "Alden_X", at);
    expect(r).toMatchObject({ ok: true, username: "Alden_X" });

    // A DerpyFront game that began before, played as Alden_D, ends now.
    await recordDerpyGame(
      record(
        "RENAME03",
        [
          player("AAAAAAAA", "Alden_D", alden.playId),
          player("BBBBBBBB", "Gary", null),
        ],
        ["player", "AAAAAAAA"],
        at - 10 * 60_000,
      ),
      [{ kind: "mvp", name: "Alden_D", clientID: "AAAAAAAA", value: 3 }],
    );
    const row = await pool.query(
      "SELECT username, played_as FROM derpy_game_players WHERE game_id = 'RENAME03'",
    );
    expect(row.rows).toEqual([{ username: "Alden_X", played_as: "Alden_D" }]);
    const g = await pool.query(
      "SELECT winner, awards FROM derpy_games WHERE game_id = 'RENAME03'",
    );
    expect(g.rows[0].winner).toBe("Alden_X");
    expect(g.rows[0].awards[0].name).toBe("Alden_X");
    expect(
      (await call("/game/RENAME03")).json.info.players.map(
        (x: PlayerRecord) => x.username,
      ),
    ).toEqual(["Alden_X", "Gary"]);

    // A Conquest seat still carrying the name it sat down with.
    await recordConquestGame({
      gameId: "RENAMEC2",
      startedAt: at - 10 * 60_000,
      endedAt: Date.now(),
      endYear: 1776,
      finalYear: 1620,
      difficulty: "easy",
      winner: "Diego Vargas (Alden_D)",
      players: [
        {
          accountId: alden.id,
          name: "Alden_D",
          nation: "spain",
          rank: 1,
          score: 10,
          won: true,
          provinces: 1,
          peakProvinces: 1,
          colonies: 0,
          battlesWon: 0,
          conquests: 0,
          goldEarned: 0,
          coins: 1,
        },
      ],
    });
    const c = await pool.query(
      `SELECT g.winner, g.summary, p.username FROM derpy_conquest_games g
       JOIN derpy_conquest_players p ON p.game_id = g.game_id
       WHERE g.game_id = 'RENAMEC2'`,
    );
    expect(c.rows[0].winner).toBe("Diego Vargas (Alden_X)");
    expect(c.rows[0].summary[0].name).toBe("Alden_X");
    expect(c.rows[0].username).toBe("Alden_X");

    // Everything from before follows the second change as well.
    expect(
      (await call("/game/RENAME01")).json.info.players.map(
        (x: PlayerRecord) => x.username,
      ),
    ).toEqual(["Alden_X", "Gary"]);
    expect(await access(alden.token)).toEqual({ signedIn: true, play: true });
  });

  test("a Conquest game going on: the new name from the player's return", async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    let clock = Date.now();
    const rooms = new ConquestRooms(() => clock);
    const srv = http.createServer();
    attachConquest(srv, rooms);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const url = `ws://127.0.0.1:${(srv.address() as AddressInfo).port}/conquest/ws`;
    const open: Sock[] = [];
    try {
      const a = await sock(url, alden.token, open);
      expect((await a.welcome).name).toBe("Alden_X");
      a.send({
        t: "create",
        solo: true,
        open: false,
        settings: { difficulty: "easy" },
      });
      await a.next("lobby");
      a.send({ t: "plan", plan });
      await a.next("lobby", (m) => m.seats.some((x) => x.made));
      const started = a.next("game");
      a.send({ t: "start" });
      const g = await started;
      expect(lifeOfSeat(g.state, g.you)!.name).toBe("Alden_X");
      const saved = a.next("saved");
      a.send({ t: "save" });
      await saved;
      clock += 1000;

      // He changes his name (in another tab) while the game goes on.
      const at = nextNameChange(
        Date.parse((await N.nameStatus(alden.id))!.changedAt!),
      );
      expect(await N.renameAccount(alden.id, "Alden_Y", at)).toMatchObject({
        ok: true,
      });

      // His saved games list him by his new name at once.
      const b = await sock(url, alden.token, open);
      expect((await b.welcome).name).toBe("Alden_Y");
      const listed = b.next("rooms");
      b.send({ t: "list" });
      const [mine] = (await listed).saved;
      expect(mine.players).toEqual(["Alden_Y"]);

      // Back in the running game from the new tab: his seat and his life
      // carry the new name; his character keeps its own.
      const back = b.next("game");
      b.send({ t: "resume", id: mine.id });
      const r = await back;
      expect(r.code).toBe(g.code);
      const life = lifeOfSeat(r.state, r.you)!;
      expect(life.name).toBe("Alden_Y");
      expect(r.state.chars[life.c]).toMatchObject({
        first: "Alden",
        family: "Drackley",
      });
      expect(r.seats.find((x) => x.id === r.you)!.name).toBe("Alden_Y");
      const room = rooms.rooms.get(g.code)!;
      expect(lifeOfSeat(room.game!.state, r.you)!.name).toBe("Alden_Y");
    } finally {
      for (const c of open) c.ws.close();
      rooms.stop();
      await new Promise((r) => srv.close(r));
    }
  });
});

// ---------------------------------------------------------------- Conquest sockets

type Msg<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;

interface Sock {
  ws: WebSocket;
  send: (m: unknown) => void;
  /** The next message of a type (from now on), matching `test`. */
  next: <T extends ServerMessage["t"]>(
    t: T,
    test?: (m: Msg<T>) => boolean,
  ) => Promise<Msg<T>>;
  /** The server's answer to the sign-in. */
  welcome: Promise<Msg<"welcome">>;
}

/** A Derpy Conquest connection, signed in with `token`. */
async function sock(url: string, token: string, open: Sock[]): Promise<Sock> {
  const ws = new WebSocket(url);
  const waiters: {
    test: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  ws.on("message", (data) => {
    const m = JSON.parse(String(data)) as ServerMessage;
    for (const w of [...waiters])
      if (w.test(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
  });
  await new Promise((r) => ws.on("open", r));
  const next = <T extends ServerMessage["t"]>(
    t: T,
    test: (m: Msg<T>) => boolean = () => true,
  ) =>
    new Promise<Msg<T>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${t}`)), 5000);
      waiters.push({
        test: (m) => m.t === t && test(m as Msg<T>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Msg<T>);
        },
      });
    });
  const welcome = next("welcome");
  ws.send(JSON.stringify({ t: "hello", name: "whoever", token }));
  const s: Sock = {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    next,
    welcome,
  };
  open.push(s);
  return s;
}

const plan = {
  origin: "england",
  home: AMERICAS.provinces.findIndex((p) => p.name === "Jamestown"),
  first: "Alden",
  family: "Drackley",
  female: false,
  age: 24,
  religion: "anglican",
  face: 1,
  sigil: {
    field: "gules",
    division: "fess",
    tincture: "or",
    charge: "lion",
    chargeTincture: "or",
  },
  frame: FRAME_COLORS[1],
  motto: "Onward",
  background: "soldier",
  stats: { dip: 6, mar: 7, ste: 5, int: 5, lea: 5 },
  skills: { leadership: 2 },
  traits: ["brave", "lazy"],
};
