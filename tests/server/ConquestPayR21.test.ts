// LEGACY (r21): Derpy Conquest pays Derp Coins as you play, on par with
// DerpyFront per hour, and can't be farmed. Through the rooms server over
// real sockets with a fake clock, against Postgres.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { lifeCoins, lineCap } from "../../src/conquest/engine/Coins";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS, PLAY_PAY } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { ServerMessage } from "../../src/conquest/Protocol";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms, PAUSE_LOCK_MS } =
  await import("../../src/server/conquest/ConquestRooms");

type Msg = ServerMessage;

class Client {
  readonly messages: Msg[] = [];
  private waiters: { test: (m: Msg) => boolean; resolve: (m: Msg) => void }[] =
    [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as Msg;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends Msg["t"]>(
    t: T,
    test: (m: Extract<Msg, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<Msg, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        8000,
      );
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<Msg, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<Msg, { t: T }>);
        },
      });
    });
  }
  close() {
    this.ws.close();
  }
}

let clock = 1_900_000_000_000;
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
  background: "farmer",
  stats: { dip: 6, mar: 7, ste: 5, int: 5, lea: 5 },
  skills: { leadership: 2 },
  traits: ["robust"],
};

function startServer() {
  const rooms = new ConquestRooms(() => clock);
  const server = http.createServer();
  attachConquest(server, rooms);
  return new Promise<{
    rooms: InstanceType<typeof ConquestRooms>;
    server: http.Server;
    url: string;
  }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        rooms,
        server,
        url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`,
      }),
    ),
  );
}

/** Lets the database catch up with what the server set going. */
const settle = () => new Promise((r) => setTimeout(r, 120));

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "Derpy Conquest pays as you play (LEGACY r21)",
  () => {
    let env: Awaited<ReturnType<typeof startServer>>;
    let closeDb: () => Promise<void>;
    let pool: import("pg").Pool;
    let n = 0;

    /** Advances the server `seconds` real seconds, a second at a time; a choice every `every` seconds (0: none). */
    async function play(
      seconds: number,
      o: { choose?: Client[]; every?: number } = {},
    ) {
      for (let i = 0; i < seconds; i++) {
        if (o.every && i % o.every === 0)
          for (const c of o.choose ?? [])
            c.send({ t: "cmd", id: ++n, c: { k: "will", share: true } });
        if (o.every && i % o.every === 0) await settle();
        else if (i % 30 === 0) await new Promise((r) => setTimeout(r, 15));
        clock += 1000;
        env.rooms.step();
      }
      await settle();
    }

    async function account(name: string) {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const session = await register(name, "hunter22");
      if (typeof session === "string") throw new Error(session);
      return session;
    }

    async function signedIn(token: string | null, name = "whoever") {
      const c = new Client(env.url);
      await c.open;
      c.send(token ? { t: "hello", name, token } : { t: "hello", name });
      await c.next("welcome");
      return c;
    }

    async function soloGame(c: Client, p: unknown = plan) {
      c.send({
        t: "create",
        solo: true,
        open: false,
        settings: { difficulty: "normal", start: 1700 },
      });
      await c.next("lobby");
      c.send({ t: "plan", plan: p });
      await c.next("lobby", (m) => m.seats.some((x) => x.made));
      const game = c.next("game");
      const paid = c.next("paid");
      c.send({ t: "start" });
      return { game: await game, paid: await paid };
    }

    const coinsOf = async (id: number) =>
      Number(
        (
          await pool.query("SELECT coins FROM derpy_accounts WHERE id = $1", [
            id,
          ])
        ).rows[0].coins,
      );
    const playOf = async (id: number) =>
      (
        await pool.query(
          "SELECT game_id, play, lines, secs FROM derpy_conquest_play WHERE account_id = $1 ORDER BY game_id",
          [id],
        )
      ).rows.map((r) => ({
        game: r.game_id as string,
        play: Number(r.play),
        lines: Number(r.lines),
        secs: Number(r.secs),
      }));

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const pg = await import("pg");
      const c = new pg.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query(
        "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
      );
      await c.end();
      const dbm = await import("../../src/server/derpy/DerpyDb");
      closeDb = dbm.closeDerpyDb;
      pool = await dbm.db();
      env = await startServer();
    });

    afterAll(async () => {
      env.server.closeAllConnections?.();
      await new Promise((r) => env.server.close(r));
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("time at the table pays by the real minute, at any speed; stepping away, a long pause and skipping ahead add nothing", async () => {
      const s = await account("Timekeeper");
      const a = await signedIn(s.token);
      const { game, paid } = await soloGame(a);
      expect(paid).toMatchObject({ t: "paid", signedIn: true, play: 0 });
      const room = env.rooms.rooms.get(game.code)!;
      const ach = async () =>
        Number(
          (
            await pool.query(
              "SELECT coalesce(sum(coins), 0)::int AS n FROM derpy_conquest_achievements WHERE account_id = $1",
              [s.account.id],
            )
          ).rows[0].n,
        );

      // Ten minutes at 1×, a choice every four: 25 coins (2½ a minute).
      a.send({ t: "pause", p: false });
      await a.next("clock", (m) => !m.paused);
      await play(600, { choose: [a], every: 240 });
      await play(61);
      let row = (await playOf(s.account.id))[0];
      expect(row.secs).toBeGreaterThanOrEqual(600);
      expect(row.secs).toBeLessThanOrEqual(661);
      expect(row.play).toBe(Math.floor((row.secs / 60) * PLAY_PAY.perMinute));
      expect(await coinsOf(s.account.id)).toBe(
        row.play + row.lines + (await ach()),
      );

      // Stepping away: with no choice for twenty minutes, only the first five count.
      const before = row.secs;
      await play(20 * 60);
      row = (await playOf(s.account.id))[0];
      expect(row.secs - before).toBeLessThanOrEqual(
        PLAY_PAY.idleMinutes * 60 + 61,
      );

      // A long pause, choosing all the while: only its first ten minutes count,
      // and nothing is paid until the world moves on again.
      a.send({ t: "cmd", id: ++n, c: { k: "will", share: true } });
      a.send({ t: "pause", p: true });
      await a.next("clock", (m) => m.paused);
      const counted = async () =>
        (await playOf(s.account.id))[0].secs + room.seats[0].pay!.owed;
      const atPause = (await playOf(s.account.id))[0];
      const countedAtPause = await counted();
      await play(60 * 60, { choose: [a], every: 240 });
      expect((await playOf(s.account.id))[0].secs).toBe(atPause.secs);
      a.send({ t: "pause", p: false });
      await a.next("clock", (m) => !m.paused);
      await play(70, { choose: [a], every: 60 });
      const afterPause = (await playOf(s.account.id))[0];
      // Paid once the world moved on: the pause's first ten minutes, and the
      // minute after, nothing more.
      expect(afterPause.secs).toBeGreaterThan(atPause.secs + 10 * 60);
      expect((await counted()) - countedAtPause).toBeGreaterThanOrEqual(
        10 * 60,
      );
      expect((await counted()) - countedAtPause).toBeLessThanOrEqual(
        10 * 60 + 72,
      );

      // At 8×, or skipping ahead, a minute is a minute.
      a.send({ t: "speed", s: 4 });
      await a.next("clock", (m) => m.speed === 4);
      const fast = (await playOf(s.account.id))[0];
      const day0 = room.game!.state.day;
      await play(120, { choose: [a], every: 30 });
      await play(61, { choose: [a], every: 30 });
      const fastAfter = (await playOf(s.account.id))[0];
      expect(room.game!.state.day - day0).toBeGreaterThan(400); // ~ a year and a half
      expect(fastAfter.secs - fast.secs).toBeLessThanOrEqual(181 + 1);
      expect(fastAfter.play - fast.play).toBeLessThanOrEqual(
        Math.ceil((181 / 60) * PLAY_PAY.perMinute) + 1,
      );

      // Skipping ahead (twenty days a second): half a minute counts as half a minute.
      const life = lifeOfSeat(room.game!.state, game.you)!;
      for (const e of [...life.events])
        a.send({ t: "cmd", id: ++n, c: { k: "event", id: e.id, choice: 0 } });
      await settle();
      const skipping = a.next("skip", (m) => m.on);
      a.send({ t: "skip", on: true });
      await skipping;
      const atSkip = await counted();
      const skipDay = room.game!.state.day;
      await play(30);
      expect(room.game!.state.day - skipDay).toBeGreaterThan(30); // more than 8× would
      expect((await counted()) - atSkip).toBeLessThanOrEqual(31);
      a.close();
    }, 120_000);

    test("the line's coins are paid as they're reached, held to the time played; the end pays the rest", async () => {
      const s = await account("Dynast");
      const a = await signedIn(s.token);
      const { game } = await soloGame(a);
      const room = env.rooms.rooms.get(game.code)!;
      const life = lifeOfSeat(room.game!.state, game.you)!;
      // A line that has done a great deal (already, on the first day).
      Object.assign(life.tally, {
        days: 30 * 365,
        topRank: 4,
        topOffice: 2,
        peakRenown: 60,
        children: 5,
        battlesWon: 3,
      });
      const total = lifeCoins(life, false).total;
      expect(total).toBeGreaterThan(60);
      a.send({ t: "pause", p: false });
      await a.next("clock", (m) => !m.paused);
      // Twenty minutes at the table: 20 of the line's coins at most, told as they come.
      const told = a.next("paid", (m) => m.lines > 0);
      await play(20 * 60, { choose: [a], every: 120 });
      await play(61, { choose: [a], every: 60 });
      expect((await told).grew.length).toBeGreaterThan(0);
      const row = (await playOf(s.account.id))[0];
      expect(row.lines).toBeLessThanOrEqual(lineCap(row.secs));
      expect(row.lines).toBeGreaterThanOrEqual(lineCap(row.secs) - 2);
      const last = a.messages.filter((m) => m.t === "paid").pop() as Extract<
        Msg,
        { t: "paid" }
      >;
      expect(last.held).toBeGreaterThan(0);

      // The end: the rest, still held to the time played.
      const end = a.next("end");
      a.send({ t: "end" });
      const r = (await end).results[0];
      const after = (await playOf(s.account.id))[0];
      expect(r.timeCoins).toBe(after.play);
      expect(r.linesInPlay).toBe(after.lines);
      expect(after.lines + (r.atEnd ?? 0)).toBeLessThanOrEqual(
        lineCap(after.secs),
      );
      expect(r.held).toBeGreaterThan(0);
      expect(r.coins).toBe(after.play + after.lines + (r.atEnd ?? 0));
      await settle();
      const fin = await pool.query(
        "SELECT coins FROM derpy_conquest_players WHERE account_id = $1",
        [s.account.id],
      );
      expect(Number(fin.rows[0].coins)).toBe(r.atEnd);
      a.close();
    }, 120_000);

    test("starting game after game pays only for the time played", async () => {
      const s = await account("Restarter");
      const a = await signedIn(s.token);
      let total = 0;
      for (let i = 0; i < 3; i++) {
        const { game } = await soloGame(a);
        const room = env.rooms.rooms.get(game.code)!;
        const life = lifeOfSeat(room.game!.state, game.you)!;
        life.tally.days = 3 * 365; // two years and more: "Lived a life"
        life.tally.topRank = 2;
        a.send({ t: "pause", p: false });
        await a.next("clock", (m) => !m.paused);
        await play(120, { choose: [a], every: 30 });
        const end = a.next("end");
        a.send({ t: "end" });
        const r = (await end).results[0];
        // Two minutes: 5 coins for the time, and the line's marks held to 2.
        expect((r.linesInPlay ?? 0) + (r.atEnd ?? 0)).toBeLessThanOrEqual(2);
        total += r.coins ?? 0;
        a.send({ t: "leave" });
        await settle();
      }
      // Three games of two minutes: about 6 minutes' pay, not three lives' worth.
      expect(total).toBeLessThanOrEqual(
        Math.ceil(6.1 * PLAY_PAY.perMinute) + 3 * 2,
      );
      expect(
        lifeCoins(
          { tally: { ...blankTally(), days: 3 * 365, topRank: 2 } } as never,
          false,
        ).total,
      ).toBeGreaterThan(15);
      a.close();
    }, 120_000);

    test("two games at once: an account is paid for one seat at a time", async () => {
      const s = await account("Twotabs");
      const a = await signedIn(s.token);
      const b = await signedIn(s.token);
      const ga = await soloGame(a);
      const gb = await soloGame(b);
      expect(ga.game.code).not.toBe(gb.game.code);
      a.send({ t: "pause", p: false });
      b.send({ t: "pause", p: false });
      await play(10 * 60, { choose: [a, b], every: 60 });
      await play(61, { choose: [a, b], every: 60 });
      const rows = await playOf(s.account.id);
      const secs = rows.reduce((x, r) => x + r.secs, 0);
      expect(secs).toBeLessThanOrEqual(11 * 60 + 2);
      a.close();
      b.close();
    }, 120_000);

    test("time at the table pays for six hours a day at most, all games together", async () => {
      const s = await account("Allday");
      // Six hours less one minute paid already today.
      await pool.query(
        `INSERT INTO derpy_conquest_days (account_id, day, secs)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)`,
        [s.account.id, PLAY_PAY.dailyHours * 3600 - 60],
      );
      const a = await signedIn(s.token);
      await soloGame(a);
      a.send({ t: "pause", p: false });
      await play(5 * 60, { choose: [a], every: 60 });
      await play(61, { choose: [a], every: 60 });
      const rows = await playOf(s.account.id);
      expect(rows[0].secs).toBe(60);
      expect(rows[0].play).toBe(Math.floor(PLAY_PAY.perMinute));
      const capped = a.messages.filter(
        (m): m is Extract<Msg, { t: "paid" }> => m.t === "paid" && !!m.capped,
      );
      expect(capped.length).toBeGreaterThan(0);
      a.close();
    }, 60_000);

    test("a guest is told, and isn't paid", async () => {
      const g = await signedIn(null, "Guest");
      const { paid } = await soloGame(g);
      expect(paid).toMatchObject({ signedIn: false, play: 0 });
      g.send({ t: "pause", p: false });
      await play(120, { choose: [g], every: 30 });
      expect(g.messages.filter((m) => m.t === "paid")).toHaveLength(1);
      g.close();
    }, 60_000);

    test("coming back to a game, you're told at once what it has paid you", async () => {
      const s = await account("Returner");
      const a = await signedIn(s.token);
      const { game } = await soloGame(a);
      a.send({ t: "pause", p: false });
      await a.next("clock", (m) => !m.paused);
      await play(120, { choose: [a], every: 30 });
      await play(61, { choose: [a], every: 30 });
      a.close();
      await settle();
      const row = (await playOf(s.account.id))[0];
      expect(row.play).toBeGreaterThan(0);
      const b = await signedIn(s.token);
      const back = b.next("game");
      const told = b.next("paid");
      b.send({ t: "rejoin", code: game.code, secret: game.secret });
      await back;
      expect(await told).toMatchObject({
        signedIn: true,
        time: 0,
        lines: 0,
        play: row.play,
        linePaid: row.lines,
      });
      b.close();
    }, 60_000);

    test("in-play coins count on the profile, the leaderboards and the latest games", async () => {
      const { profile } = await import("../../src/server/derpy/DerpyGames");
      const { conquestLeaderboard, overallLeaderboard, recentResults } =
        await import("../../src/server/derpy/DerpyConquest");
      const id = (
        await pool.query(
          "SELECT id FROM derpy_accounts WHERE username = 'Dynast'",
        )
      ).rows[0].id;
      const rows = await playOf(Number(id));
      const fin = await pool.query(
        "SELECT coins FROM derpy_conquest_players WHERE account_id = $1",
        [id],
      );
      const all =
        rows.reduce((x, r) => x + r.play + r.lines, 0) +
        Number(fin.rows[0].coins);
      const p = (await profile("Dynast"))!;
      expect(p.conquest.stats.coinsEarned).toBe(all);
      expect(p.conquest.games[0].coins).toBe(all);
      expect(
        (await conquestLeaderboard()).find((r) => r.username === "Dynast")!
          .coinsEarned,
      ).toBe(all);
      expect(
        (await overallLeaderboard()).find((r) => r.username === "Dynast")!
          .coinsEarned,
      ).toBe(all);
      expect(
        (await recentResults(40)).find((r) => r.username === "Dynast")!.coins,
      ).toBe(all);
    });
  },
);

function blankTally() {
  return {
    days: 0,
    jobs: 0,
    promotions: 0,
    topRank: 0,
    topOffice: 0,
    peakRenown: 0,
    peakPurse: 0,
    earned: 0,
    children: 0,
    marriages: 0,
    battles: 0,
    battlesWon: 0,
    wounds: 0,
    events: 0,
    generations: 1,
    takeovers: 0,
    provinces: 0,
    risings: 0,
    risingsWon: 0,
    elections: 0,
    europe: null,
  };
}

void PAUSE_LOCK_MS;
