// CHAL (r25): Derpy Conquest's weekly challenges as the server watches a
// game: each challenge's measure, gains counted only at moments that count
// at the table, nothing reported before ten minutes there, one character,
// one game (and a game picked up again), the week's turn; then, against
// Postgres, through the rooms server over real sockets: paid once, the
// bonus, and stepping away.
//
// The database part needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=...

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { achCount } from "../../src/conquest/engine/Achievements";
import type { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS, PLAY_PAY } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { Life } from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";
import {
  CHALLENGE_BONUS,
  CHALLENGE_COINS,
  CONQUEST_CHALLENGES,
  doneAt,
  weekChallenges,
  weekStart,
  type ChallengeDef,
  type ChallengeDone,
} from "../../src/derpland/Challenges";
import type {
  ChallengeStep,
  GameProgress,
} from "../../src/server/derpy/DerpyChallenges";
import { lifeOf, world } from "../conquest/LifeUtil";

process.env.DERPY_CHALLENGES = "on";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const {
  CHALLENGE_MIN_TABLE_SECS,
  CONQUEST_MEASURES,
  ConquestChallenges,
  REPORT_EVERY_MS,
} = await import("../../src/server/conquest/ConquestChallenges");

/** The first week from `from` whose Conquest picks include `key` (and pass `ok`). */
function weekWith(
  key: string,
  ok: (defs: ChallengeDef[]) => boolean = () => true,
  from = 2950,
): number {
  for (let w = from; w < from + 3000; w++) {
    const defs = weekChallenges(w, "conquest");
    if (defs.some((d) => d.key === key) && ok(defs)) return w;
  }
  throw new Error(`no week with ${key}`);
}

/** A stand-in for the database: sums and bests, paid once. */
class FakeStore {
  progress = new Map<string, number>();
  done = new Set<string>();
  calls: ChallengeStep[][] = [];
  prior = new Map<string, GameProgress>();
  record = async (
    _a: number,
    week: number,
    steps: ChallengeStep[],
  ): Promise<ChallengeDone[]> => {
    this.calls.push(steps);
    const out: ChallengeDone[] = [];
    for (const s of steps) {
      const def = CONQUEST_CHALLENGES.find((d) => d.key === s.key)!;
      if (!weekChallenges(week, "conquest").includes(def)) continue;
      const was = this.progress.get(s.key) ?? 0;
      const now = Math.max(was + (s.add ?? 0), s.best ?? 0);
      this.progress.set(s.key, now);
      if (!this.done.has(s.key) && now >= doneAt(def)) {
        this.done.add(s.key);
        out.push({
          key: s.key,
          name: def.name,
          coins: CHALLENGE_COINS[def.tier],
        });
      }
    }
    return out;
  };
  load = async () => this.prior;
}

const settle = () => new Promise((r) => setTimeout(r, 5));

function watcher(clock: { t: number }, store = new FakeStore()) {
  const told: ChallengeDone[] = [];
  const w = new ConquestChallenges({
    now: () => clock.t,
    record: store.record,
    load: store.load,
    tell: (_s, done) => told.push(...done),
    warn: (m) => {
      throw new Error(m);
    },
  });
  return { w, store, told };
}

interface At {
  counting?: boolean;
  tableSecs?: number;
  coins?: number;
}

/** A seat in a fresh world, and a look at it. */
function seatIn(g: ConquestGame) {
  const life = lifeOf(g);
  const seat: { accountId: number | null } = { accountId: 1 };
  const look = async (
    w: InstanceType<typeof ConquestChallenges>,
    o: At = {},
  ) => {
    w.look(seat, "GAME-1", {
      g,
      life,
      counting: o.counting ?? true,
      tableSecs: o.tableSecs ?? 3600,
      coins: o.coins ?? 0,
    });
    await settle();
  };
  return { life, seat, look };
}

describe("Derpy Conquest challenge measures", () => {
  test("every Conquest challenge has a measure", () => {
    for (const d of CONQUEST_CHALLENGES)
      expect(CONQUEST_MEASURES[d.key], d.key).toBeDefined();
  });

  test("each measure reads the life", () => {
    const g = world();
    const life = lifeOf(g);
    const x = { g, life, counting: true, tableSecs: 1234.6, coins: 77.9 };
    const read = (k: string) => CONQUEST_MEASURES[k].read(x);
    life.tally.jobs = 2;
    life.tally.promotions = 3;
    life.tally.marriages = 1;
    life.tally.children = 4;
    life.tally.battlesWon = 5;
    life.tally.elections = 6;
    life.tally.earned = 99.5;
    expect(read("cq-work")).toBe(2);
    expect(read("cq-promoted")).toBe(3);
    expect(read("cq-marry")).toBe(1);
    expect(read("cq-child")).toBe(4);
    expect(read("cq-battle")).toBe(5);
    expect(read("cq-election")).toBe(6);
    expect(read("cq-earn-100")).toBe(99);
    expect(read("cq-places-5")).toBe(life.visited.length);
    expect(read("cq-hour")).toBe(1234);
    expect(read("cq-coins-150")).toBe(77);
    expect(read("cq-30-years")).toBe(g.s.day);
    life.ties = { 5: "friend", 6: "rival", 7: "friend" };
    expect(read("cq-friends-2")).toBe(2);
    life.achCount = { sea: 3, rung3: 1, retook: 2 };
    expect(read("cq-sea")).toBe(3);
    expect(read("cq-rung-3")).toBe(1);
    expect(read("cq-retake")).toBe(2);
    expect(achCount(life, "retook")).toBe(2);
    life.property = [
      { kind: "business" },
      { kind: "house" },
      { kind: "business" },
    ] as unknown as Life["property"];
    expect(read("cq-two-biz")).toBe(2);
    life.legacy = {
      recs: [{ came: "begin" }, { came: "heir" }],
      came: "heir",
    } as unknown as Life["legacy"];
    expect(read("cq-heir")).toBe(2);
    life.purse = 250.7;
    expect(read("cq-savings-250")).toBe(250);
  });
});

describe("watching a seat's challenges", () => {
  test("gains count from the first look, only at moments that count at the table", async () => {
    const week = weekWith("cq-marry");
    const clock = { t: weekStart(week) + 3_600_000 };
    const { w, store, told } = watcher(clock);
    const g = world();
    const { life, look } = seatIn(g);
    life.tally.marriages = 1; // married before the week: not this week's
    await look(w);
    await look(w);
    expect(store.calls).toEqual([]);
    // Married while away from the table (no choice lately): not yours.
    life.tally.marriages = 2;
    clock.t += 60_000;
    await look(w, { counting: false });
    expect(store.calls).toEqual([]);
    // Married at the table, but only five minutes into this game: held.
    life.tally.marriages = 3;
    clock.t += 60_000;
    await look(w, { tableSecs: CHALLENGE_MIN_TABLE_SECS - 300 });
    expect(store.calls).toEqual([]);
    // Ten minutes in: reported, done, told.
    clock.t += 60_000;
    await look(w, { tableSecs: CHALLENGE_MIN_TABLE_SECS });
    expect(store.calls).toEqual([[{ key: "cq-marry", add: 1 }]]);
    expect(told.map((d) => d.key)).toEqual(["cq-marry"]);
    // Nothing new: nothing sent.
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(store.calls.length).toBe(1);
  });

  test("progress goes out every half minute, at once when something's done", async () => {
    const week = weekWith("cq-hour");
    const clock = { t: weekStart(week) + 3_600_000 };
    const { w, store, told } = watcher(clock);
    const { look } = seatIn(world());
    let secs = 1000;
    await look(w, { tableSecs: secs });
    for (let i = 0; i < 20; i++) {
      clock.t += 5_000;
      secs += 5;
      await look(w, { tableSecs: secs });
    }
    // 100 seconds: four reports at most (every 30 s), adding up.
    expect(store.calls.length).toBeLessThanOrEqual(4);
    expect(store.progress.get("cq-hour")).toBeGreaterThanOrEqual(70);
    expect(store.progress.get("cq-hour")).toBeLessThanOrEqual(100);
    // Reaching the hour is sent at once.
    clock.t += 1_000;
    await look(w, { tableSecs: 1000 + 3600 });
    expect(store.progress.get("cq-hour")).toBe(3600);
    expect(told.map((d) => d.key)).toEqual(["cq-hour"]);
  });

  test("thirty years with one character: a new character starts again", async () => {
    const week = weekWith("cq-30-years");
    const clock = { t: weekStart(week) + 3_600_000 };
    const { w, store, told } = watcher(clock);
    const g = world();
    const { life, look } = seatIn(g);
    const first = life.c;
    await look(w);
    g.s.day += 20 * 365;
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(store.progress.get("cq-30-years")).toBe(20 * 365);
    // An heir (another character) plays on 15 years: still 20 for one.
    life.c = first + 1;
    await look(w);
    g.s.day += 15 * 365;
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(store.progress.get("cq-30-years")).toBe(20 * 365);
    expect(told).toEqual([]);
    // Fifteen more: thirty for the heir.
    g.s.day += 15 * 365;
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(store.progress.get("cq-30-years")).toBe(30 * 365);
    expect(told.map((d) => d.key)).toEqual(["cq-30-years"]);
  });

  test("a game picked up again carries on from where it was (one game, one character)", async () => {
    const week = weekWith("cq-30-years");
    const clock = { t: weekStart(week) + 3_600_000 };
    const g = world();
    const life = lifeOf(g);
    // Last sitting: 22 years with this character, in this game.
    const store = new FakeStore();
    store.progress.set("cq-30-years", 22 * 365);
    store.prior.set("cq-30-years", { p: 22 * 365, c: life.c, q: 22 * 365 });
    const { w, told } = watcher(clock, store);
    const { look } = seatIn(g);
    await look(w);
    g.s.day += 8 * 365;
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(told.map((d) => d.key)).toEqual(["cq-30-years"]);
    // Another character's years aren't carried over.
    const other = new FakeStore();
    other.prior.set("cq-30-years", { p: 22 * 365, c: life.c + 9, q: 22 * 365 });
    const o = watcher(clock, other);
    const s2 = seatIn(g);
    await s2.look(o.w);
    g.s.day += 8 * 365;
    clock.t += REPORT_EVERY_MS;
    await s2.look(o.w);
    // Eight years: no more than the game's 22 already, nothing to send.
    expect(o.told).toEqual([]);
    expect(other.calls).toEqual([]);
    // Twenty-three with this one: the game's best now, but not thirty.
    g.s.day += 15 * 365;
    clock.t += REPORT_EVERY_MS;
    await s2.look(o.w);
    expect(other.calls.at(-1)).toEqual([
      { key: "cq-30-years", best: 23 * 365, c: life.c, q: 23 * 365 },
    ]);
    expect(o.told).toEqual([]);
  });

  test("coins in one game: the game's own, carried on when it's picked up again", async () => {
    const week = weekWith("cq-coins-150");
    const clock = { t: weekStart(week) + 3_600_000 };
    const store = new FakeStore();
    store.prior.set("cq-coins-150", { p: 100, c: -1, q: 100 });
    store.progress.set("cq-coins-150", 100);
    const { w, told } = watcher(clock, store);
    const { look } = seatIn(world());
    await look(w, { coins: 500 }); // paid before, in earlier weeks too: where it starts
    clock.t += REPORT_EVERY_MS;
    await look(w, { coins: 530 });
    expect(store.calls.at(-1)).toEqual([{ key: "cq-coins-150", best: 130 }]);
    clock.t += REPORT_EVERY_MS;
    await look(w, { coins: 550 });
    expect(told.map((d) => d.key)).toEqual(["cq-coins-150"]);
  });

  test("two businesses: owned at once, one of them got this week", async () => {
    const week = weekWith("cq-two-biz");
    const clock = { t: weekStart(week) + 3_600_000 };
    const { w, store, told } = watcher(clock);
    const g = world();
    const { life, look } = seatIn(g);
    const biz = { kind: "business" } as unknown as NonNullable<
      Life["property"]
    >[number];
    life.property = [biz, biz];
    await look(w);
    clock.t += REPORT_EVERY_MS;
    await look(w);
    // Two already: one short until another is got.
    expect(store.progress.get("cq-two-biz")).toBe(1);
    life.property = [biz, biz, biz];
    clock.t += REPORT_EVERY_MS;
    await look(w);
    expect(told.map((d) => d.key)).toEqual(["cq-two-biz"]);
  });

  test("a guest, or a seat watching the world, has none; a new week starts again", async () => {
    const week = weekWith("cq-marry");
    const clock = { t: weekStart(week + 1) - 60_000 };
    const { w, store } = watcher(clock);
    const g = world();
    const { life, seat, look } = seatIn(g);
    seat.accountId = null;
    await look(w);
    life.tally.marriages++;
    await look(w);
    expect(store.calls).toEqual([]);
    seat.accountId = 1;
    await look(w);
    // The week turns: what this week's challenges measure starts again there.
    clock.t = weekStart(week + 1) + 1_000;
    await look(w);
    life.tally.marriages++;
    clock.t += REPORT_EVERY_MS;
    await look(w);
    const next = weekChallenges(week + 1, "conquest").map((d) => d.key);
    for (const steps of store.calls)
      for (const s of steps) expect(next).toContain(s.key);
  });
});

// ---------------------------------------------------------------- through the rooms, against Postgres

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
      this.waiters = this.waiters.filter((x) => {
        if (!x.test(m)) return true;
        x.resolve(m);
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

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

/** Moves a life's measure on by hand (the game would, given years). */
const BUMP: Record<string, (l: Life) => void> = {
  "cq-work": (l) => (l.tally.jobs += 1),
  "cq-promoted": (l) => (l.tally.promotions += 1),
  "cq-sea": (l) => ((l.achCount ??= {}).sea = (l.achCount.sea ?? 0) + 10),
  "cq-earn-100": (l) => (l.tally.earned += 120),
  "cq-marry": (l) => (l.tally.marriages += 1),
  "cq-child": (l) => (l.tally.children += 1),
  "cq-rung-3": (l) => ((l.achCount ??= {}).rung3 = (l.achCount.rung3 ?? 0) + 1),
  "cq-battle": (l) => (l.tally.battlesWon += 1),
  "cq-renown-25": (l) => (l.renown += 40),
  "cq-retake": (l) =>
    ((l.achCount ??= {}).retook = (l.achCount.retook ?? 0) + 1),
  "cq-election": (l) => (l.tally.elections += 1),
  "cq-savings-250": (l) => (l.purse += 400),
};

describe.skipIf(!TEST_DB)("Conquest challenges through the rooms", () => {
  let clock = 0;
  let rooms: InstanceType<
    typeof import("../../src/server/conquest/ConquestRooms").ConquestRooms
  >;
  let server: http.Server;
  let url = "";
  let pool: import("pg").Pool;
  let closeDb: () => Promise<void>;
  let n = 0;
  // A week whose three can be done by hand (after the real clock: the rooms
  // count real time from now).
  const week = weekWith(
    "cq-marry",
    (defs) => defs.every((d) => BUMP[d.key]),
    3200,
  );
  const defs = weekChallenges(week, "conquest");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_challenge_games, derpy_challenges, derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    const dbm = await import("../../src/server/derpy/DerpyDb");
    closeDb = dbm.closeDerpyDb;
    pool = await dbm.db();
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    clock = weekStart(week) + 9 * 3_600_000;
    rooms = new ConquestRooms(() => clock);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  const wait = () => new Promise((r) => setTimeout(r, 120));

  async function play(seconds: number, o: { choose?: Client; every?: number }) {
    for (let i = 0; i < seconds; i++) {
      if (o.choose && o.every && i % o.every === 0) {
        o.choose.send({ t: "cmd", id: ++n, c: { k: "will", share: true } });
        await wait();
      } else if (i % 30 === 0) await new Promise((r) => setTimeout(r, 10));
      clock += 1000;
      rooms.step();
    }
    await wait();
  }

  test("done at the table: paid once each, the bonus with the third; away from it, nothing", async () => {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const s = await register("Challenger", "hunter22");
    if (typeof s === "string") throw new Error(s);
    const a = new Client(url);
    await a.open;
    a.send({ t: "hello", name: "Challenger", token: s.token });
    await a.next("welcome");
    a.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "normal", start: 1700 },
    });
    await a.next("lobby");
    a.send({ t: "plan", plan });
    await a.next("lobby", (m) => m.seats.some((x) => x.made));
    const started = a.next("game");
    a.send({ t: "start" });
    const game = await started;
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    const room = rooms.rooms.get(game.code)!;
    const life = () => lifeOfSeat(room.game!.state, room.seats[0].id)!;
    const coins = async () =>
      Number(
        (
          await pool.query("SELECT coins FROM derpy_accounts WHERE id = $1", [
            s.account.id,
          ])
        ).rows[0].coins,
      );
    // Eleven minutes at the table, a choice every four.
    await play(11 * 60, { choose: a, every: 240 });
    expect(room.seats[0].pay?.secs ?? 0).toBeGreaterThanOrEqual(
      CHALLENGE_MIN_TABLE_SECS,
    );

    // Stepping away: twenty minutes without a choice, then the first done.
    await play(20 * 60, {});
    BUMP[defs[0].key](life());
    await play(60, {});
    expect(
      a.messages.some((m) => m.t === "challenge"),
      "nothing while away",
    ).toBe(false);

    // Back at the table: each done there is paid, and told.
    const before = await coins();
    for (const d of defs) {
      a.send({ t: "cmd", id: ++n, c: { k: "will", share: true } });
      await wait();
      BUMP[d.key](life());
      const told = a.next("challenge", (m) =>
        m.done.some((x) => x.key === d.key),
      );
      await play(5, { choose: a, every: 2 });
      const msg = await told;
      const x = msg.done.find((y) => y.key === d.key)!;
      expect(x.coins).toBe(CHALLENGE_COINS[d.tier]);
      if (d === defs[2]) expect(x.bonus).toBe(CHALLENGE_BONUS);
    }
    const paid =
      CHALLENGE_COINS.easy +
      CHALLENGE_COINS.medium +
      CHALLENGE_COINS.hard +
      CHALLENGE_BONUS;
    const after = await coins();
    // Time at the table pays too (a few coins a minute), and the line's
    // marks the bumps moved on: but no challenge twice.
    expect(after - before).toBeGreaterThanOrEqual(paid);
    expect(after - before).toBeLessThan(
      paid + CHALLENGE_COINS.easy + PLAY_PAY.linesPerHour,
    );

    // Doing them all again pays nothing more.
    for (const d of defs) BUMP[d.key](life());
    await play(40, { choose: a, every: 5 });
    const rows = (
      await pool.query(
        "SELECT key, coins, done_at FROM derpy_challenges WHERE account_id = $1 AND week = $2",
        [s.account.id, week],
      )
    ).rows;
    expect(rows.filter((r) => r.done_at !== null).length).toBe(4);
    expect(
      a.messages
        .filter((m) => m.t === "challenge")
        .flatMap((m) => (m.t === "challenge" ? m.done : [])).length,
    ).toBe(3);
    // The home page's view says so.
    const { weekView } = await import("../../src/server/derpy/DerpyChallenges");
    const v = await weekView(s.account.id, clock);
    const cq = v.games.find((x) => x.game === "conquest")!;
    expect(cq.challenges.every((x) => x.doneAt !== null)).toBe(true);
    expect(cq.bonus.doneAt).not.toBeNull();
    a.close();
  }, 60_000);
});
