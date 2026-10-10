import http from "http";
import { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { WebSocket } from "ws";
import { STATE_VERSION } from "../../src/conquest/engine/Game";
import { raiseLifeEvent } from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { LETTER_SECONDS } from "../../src/conquest/engine/Rules";
import type { ServerMessage } from "../../src/conquest/Protocol";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms, cleanName } =
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

  /** The next message (from now on) of a type, matching `test`. */
  next<T extends Msg["t"]>(
    t: T,
    test: (m: Extract<Msg, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<Msg, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        4000,
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

let clock = 1_800_000_000_000;
const settings = { difficulty: "normal" };
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

/** Advances the server clock `seconds` real seconds, a second at a time. */
function runFor(rooms: InstanceType<typeof ConquestRooms>, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    clock += 1000;
    rooms.step();
  }
}

/** Makes a character and starts a solo game. */
async function soloGame(c: Client, p: unknown = plan, s: unknown = settings) {
  c.send({ t: "create", solo: true, open: false, settings: s });
  await c.next("lobby");
  c.send({ t: "plan", plan: p });
  await c.next("lobby", (m) => m.seats.some((x) => x.made));
  const game = c.next("game");
  c.send({ t: "start" });
  return game;
}

describe("Derpy Conquest server", () => {
  let env: Awaited<ReturnType<typeof startServer>>;
  const clients: Client[] = [];
  const client = async (name: string) => {
    const c = new Client(env.url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    return c;
  };

  beforeAll(async () => {
    env = await startServer();
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
  });
  afterAll(async () => {
    await new Promise((r) => env.server.close(r));
  });

  test("cleans up player names", () => {
    expect(cleanName("  <b>Alden</b>\u0007  ")).toBe("bAlden/b");
    expect(cleanName("")).toBe("Explorer");
    expect(cleanName("x".repeat(50))).toHaveLength(24);
  });

  test("a solo game: make a character, and live", async () => {
    const a = await client("Alden");
    const g = await soloGame(a);
    expect(g.solo).toBe(true);
    // Solo games start paused so you can look around.
    expect(g.paused).toBe(true);
    // Every nation is the computer's; you're one person in the world.
    expect(g.state.nations.every((n) => n.player === null)).toBe(true);
    const life = lifeOfSeat(g.state, g.you)!;
    const me = g.state.chars[life.c];
    expect(me).toMatchObject({
      first: "Alden",
      family: "Drackley",
      made: true,
    });
    expect(life.job?.kind).toBe("soldier");

    const ack = a.next("ack");
    a.send({ t: "cmd", id: 7, c: { k: "act", place: "tavern", act: "drink" } });
    expect(await ack).toEqual({ t: "ack", id: 7, err: null });
    const bad = a.next("ack");
    a.send({
      t: "cmd",
      id: 8,
      c: { k: "act", place: "press", act: "pamphlet" },
    });
    expect((await bad).err).toMatch(/Not here|no such place/i);

    // Unpaused, the clock moves the world on and sends the new days.
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    const day = a.next("d", (m) => m.d.day > g.state.day);
    // A day every three seconds at 1×.
    runFor(env.rooms, 4);
    expect((await day).d.day).toBeGreaterThan(g.state.day);
  });

  test("a character that costs too much is refused", async () => {
    const a = await client("Alden");
    a.send({ t: "create", solo: true, open: false, settings });
    await a.next("lobby");
    const err = a.next("err");
    a.send({
      t: "plan",
      plan: { ...plan, stats: { dip: 12, mar: 12, ste: 12, int: 12, lea: 12 } },
    });
    expect((await err).msg).toMatch(/more points/);
    const where = a.next("err");
    a.send({ t: "plan", plan: { ...plan, home: 0 } });
    expect((await where).msg).toMatch(/home/);
    const nope = a.next("err");
    a.send({ t: "start" });
    expect((await nope).msg).toMatch(/Make your character/);
  });

  test("friends make characters and live in the same world; the host keeps time", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal", start: 1650 },
    });
    const l = await lobby;
    expect(l.code).toMatch(/^[A-Z]{4}$/);

    const friend = await client("Michael");
    const rooms = friend.next("rooms");
    friend.send({ t: "list" });
    expect((await rooms).open.find((r) => r.code === l.code)).toMatchObject({
      host: "Alden",
      started: false,
    });
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code.toLowerCase() });
    await joined;

    host.send({ t: "plan", plan });
    friend.send({
      t: "plan",
      plan: {
        ...plan,
        origin: "france",
        home: AMERICAS.provinces.findIndex((p) => p.name === "Quebec"),
        religion: "catholic",
        first: "Michel",
        family: "Leclerc",
        background: "trapper",
      },
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    friend.send({ t: "start" });
    const waiting = host.next("err");
    host.send({ t: "start" });
    expect((await waiting).msg).toMatch(/Waiting for Michael/);
    friend.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    expect(hg.state.lives).toHaveLength(2);
    expect(lifeOfSeat(fg.state, fg.you)?.origin).toBe("france");
    expect(hg.paused).toBe(false);

    // Only the host sets the speed; anyone may pause.
    friend.send({ t: "speed", s: 4 });
    const clock1 = host.next("clock");
    friend.send({ t: "pause", p: true });
    expect(await clock1).toMatchObject({ paused: true, by: "Michael" });
    const clock2 = friend.next("clock", (m) => m.speed === 4);
    host.send({ t: "speed", s: 4 });
    expect(await clock2).toMatchObject({
      speed: 4,
      paused: false,
      by: "Alden",
    });

    // Someone new drops into the running world with a character of their own.
    const late = await client("Gary");
    const lg = late.next("game");
    late.send({ t: "join", code: l.code });
    const g3 = await lg;
    expect(lifeOfSeat(g3.state, g3.you)).toBeUndefined();
    const seen = host.next(
      "d",
      (m) => !!m.d.lives && Object.keys(m.d.lives).includes(g3.you),
    );
    late.send({
      t: "life",
      plan: { ...plan, first: "Gary", home: hg.state.nations[0].capital },
    });
    await seen;
    expect(env.rooms.rooms.get(l.code)!.game!.state.lives).toHaveLength(3);

    // Leaving and coming back with the seat's secret picks up the game.
    friend.close();
    await host.next("seats", (m) => m.seats.some((s) => !s.online));
    const again = await client("Michael");
    const back = again.next("game");
    again.send({ t: "rejoin", code: fg.code, secret: fg.secret });
    expect((await back).you).toBe(fg.you);

    const nope = await client("Gary");
    const err = nope.next("err");
    nope.send({ t: "rejoin", code: fg.code, secret: "wrong" });
    expect((await err).msg).toMatch(/ended or closed/);
  });

  test("bad settings are refused", async () => {
    const a = await client("Alden");
    const err = a.next("err");
    a.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "impossible" },
    });
    expect((await err).msg).toMatch(/didn't make sense/);
  });

  test("an event waits while paused, counts down in play, then decides itself", async () => {
    const a = await client("Alden");
    const g = await soloGame(a);
    const room = env.rooms.rooms.get(g.code)!;
    const game = room.game!;
    const life = lifeOfSeat(game.state, g.you)!;
    raiseLifeEvent(game, life, "seditious-libel", { m: -1 });
    const ev = life.events[0];
    expect(ev.key).toBe("seditious-libel");

    const told = a.next("letters", (m) => ev.id in m.left);
    runFor(env.rooms, 1);
    const first = await told;
    expect(first.left[ev.id]).toBe(LETTER_SECONDS);
    expect(first.paused).toBe(true);

    runFor(env.rooms, LETTER_SECONDS * 2);
    expect(life.events.some((e) => e.id === ev.id)).toBe(true);

    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    runFor(env.rooms, LETTER_SECONDS - 10);
    expect(
      lifeOfSeat(game.state, g.you)!.events.some((e) => e.id === ev.id),
    ).toBe(true);
    runFor(env.rooms, 11);
    expect(
      lifeOfSeat(game.state, g.you)!.events.some((e) => e.id === ev.id),
    ).toBe(false);
  });

  test("pauses on its own when every player leaves", async () => {
    const a = await client("Alden");
    const g = await soloGame(a);
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    a.close();
    await new Promise((r) => setTimeout(r, 50));
    const room = env.rooms.rooms.get(g.code)!;
    expect(room.paused).toBe(true);
    const day = room.game!.state.day;
    runFor(env.rooms, 5);
    expect(room.game!.state.day).toBe(day);
  });
});

// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).
const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "Derpy Conquest saves and results against Postgres",
  () => {
    let env: Awaited<ReturnType<typeof startServer>>;
    let closeDb: () => Promise<void>;

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const pg = await import("pg");
      const c = new pg.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query(
        "DROP TABLE IF EXISTS derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
      );
      await c.end();
      ({ closeDerpyDb: closeDb } =
        await import("../../src/server/derpy/DerpyDb"));
      env = await startServer();
    });

    afterAll(async () => {
      await new Promise((r) => env.server.close(r));
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("a saved game can be picked up again, and a finished one pays Derp Coins", async () => {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { conquestLeaderboard, overallLeaderboard } =
        await import("../../src/server/derpy/DerpyConquest");
      const session = await register("Alden", "hunter22");
      if (typeof session === "string") throw new Error(session);

      const a = new Client(env.url);
      await a.open;
      a.send({ t: "hello", name: "whoever", token: session.token });
      expect(await a.next("welcome")).toMatchObject({
        name: "Alden",
        account: "Alden",
      });
      const g = await soloGame(
        a,
        {
          ...plan,
          origin: "spain",
          home: AMERICAS.provinces.findIndex((p) => p.name === "Havana"),
          religion: "catholic",
          first: "Diego",
          family: "Vargas",
          traits: ["robust"],
        },
        { difficulty: "easy" },
      );
      a.send({ t: "speed", s: 4 });
      await a.next("clock");
      runFor(env.rooms, 20);

      // Save, leave, and find it among your saved games.
      const saved = a.next("saved");
      a.send({ t: "save" });
      await saved;
      a.send({ t: "leave" });
      const rooms = a.next("rooms");
      a.send({ t: "list" });
      const mine = (await rooms).saved;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ power: "spain" });
      expect(mine[0].year).toBeGreaterThanOrEqual(1607);

      // A save from an older version of the game isn't offered.
      const { db } = await import("../../src/server/derpy/DerpyDb");
      const pool = await db();
      await pool.query("UPDATE derpy_conquest_saves SET version = 2");
      const none = a.next("rooms");
      a.send({ t: "list" });
      expect((await none).saved).toHaveLength(0);
      await pool.query("UPDATE derpy_conquest_saves SET version = $1", [
        STATE_VERSION,
      ]);

      // The server restarts; load it back from the database: the same nation,
      // paused, on the day it was saved.
      const savedDay = env.rooms.rooms.get(g.code)!.game!.state.day;
      env.rooms.rooms.delete(g.code);
      const back = a.next("game");
      a.send({ t: "resume", id: mine[0].id });
      const b = await back;
      expect(b.code).not.toBe(g.code);
      expect(b.paused).toBe(true);
      expect(lifeOfSeat(b.state, b.you)?.origin).toBe("spain");
      expect(b.state.day).toBe(savedDay);

      // Games pay once they've lasted two game years.
      a.send({ t: "speed", s: 4 });
      await a.next("clock", (m) => !m.paused);
      const room = env.rooms.rooms.get(b.code)!;
      // 8×: two and two-thirds days a second.
      runFor(env.rooms, 300);
      expect(room.game!.state.day).toBeGreaterThan(730);
      lifeOfSeat(room.game!.state, b.you)!.tally.days = 1000;

      const end = a.next("end");
      a.send({ t: "end" });
      const results = (await end).results;
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ name: "Alden", power: "spain" });
      expect(results[0].coinLines.length).toBeGreaterThan(0);
      expect(results[0].coins).toBeGreaterThanOrEqual(5);

      const board = await conquestLeaderboard();
      const row = board.find((r) => r.username === "Alden")!;
      expect(row.games).toBe(1);
      expect(row.coins).toBe(results[0].coins);
      const overall = await overallLeaderboard();
      expect(overall.find((r) => r.username === "Alden")).toMatchObject({
        conquestGames: 1,
        derpyFrontGames: 0,
        games: 1,
      });

      // A finished game is no longer offered to resume.
      const after = a.next("rooms");
      a.send({ t: "list" });
      expect((await after).saved).toHaveLength(0);
      a.close();
    });
  },
);
