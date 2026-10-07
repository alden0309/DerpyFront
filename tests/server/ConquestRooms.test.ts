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
const settings = { endYear: 1650, difficulty: "normal" };

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

  test("a solo game starts at once and runs commands", async () => {
    const a = await client("Alden");
    const game = a.next("game");
    a.send({ t: "create", solo: true, power: "france", settings });
    const g = await game;
    const me = g.state.nations.findIndex((n) => n.player === g.you);
    expect(g.state.nations[me].key).toBe("france");
    expect(g.solo).toBe(true);

    const quebec = g.state.nations[me].capital;
    const ack = a.next("ack");
    const delta = a.next("d", (m) => !!m.d.prov?.[quebec]);
    a.send({ t: "cmd", id: 7, c: { k: "recruit", p: quebec, t: "inf" } });
    expect(await ack).toEqual({ t: "ack", id: 7, err: null });
    expect((await delta).d.prov![quebec].recruits).toHaveLength(1);

    const bad = a.next("ack");
    a.send({ t: "cmd", id: 8, c: { k: "recruit", p: quebec, t: "war" } });
    expect((await bad).err).toMatch(/can't raise/);

    // The clock moves the game on and sends the new day.
    const day = a.next("d", (m) => m.d.day > 0);
    runFor(env.rooms, 2);
    expect((await day).d.day).toBeGreaterThan(0);
  });

  test("friends make a lobby, pick nations and play together", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({ t: "create", solo: false, settings });
    const l = await lobby;
    expect(l.code).toMatch(/^[A-Z]{4}$/);

    const friend = await client("Michael");
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code.toLowerCase() });
    await joined;

    host.send({ t: "pick", power: "england" });
    await host.next("lobby", (m) => m.seats.some((s) => s.power === "england"));
    // Two players can't pick the same nation.
    friend.send({ t: "pick", power: "england" });
    friend.send({ t: "pick", power: "netherlands" });
    const picked = await host.next("lobby", (m) =>
      m.seats.some((s) => s.power === "netherlands"),
    );
    expect(picked.seats.filter((s) => s.power === "england")).toHaveLength(1);

    // Only the host starts it.
    friend.send({ t: "start" });
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    expect(
      hg.state.nations
        .filter((n) => n.player !== null)
        .map((n) => n.key)
        .sort(),
    ).toEqual(["england", "netherlands"]);
    expect(fg.state.nations.find((n) => n.player === fg.you)?.key).toBe(
      "netherlands",
    );

    // Anyone can pause; everyone hears about it.
    const clock1 = host.next("clock");
    friend.send({ t: "pause", p: true });
    expect(await clock1).toMatchObject({ paused: true, by: "Michael" });
    const clock2 = friend.next("clock", (m) => m.speed === 5);
    host.send({ t: "speed", s: 5 });
    expect(await clock2).toMatchObject({
      speed: 5,
      paused: false,
      by: "Alden",
    });

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

  test("pauses on its own when every player leaves", async () => {
    const a = await client("Alden");
    const game = a.next("game");
    a.send({ t: "create", solo: true, power: "sweden", settings });
    const g = await game;
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

describe.skipIf(!TEST_DB)("Derpy Conquest results against Postgres", () => {
  let env: Awaited<ReturnType<typeof startServer>>;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
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

  test("a finished game pays Derp Coins and shows on the leaderboards", async () => {
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
    const game = a.next("game");
    a.send({
      t: "create",
      solo: true,
      power: "portugal",
      settings: { endYear: 1630, difficulty: "easy" },
    });
    const g = await game;
    a.send({ t: "speed", s: 5 });
    await a.next("clock");
    // Games pay once they've lasted two real minutes and two game years.
    runFor(env.rooms, 130);
    expect(env.rooms.rooms.get(g.code)!.game!.state.day).toBeGreaterThan(730);

    const end = a.next("end");
    a.send({ t: "end" });
    const results = (await end).results;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "Alden", power: "portugal" });
    expect(results[0].coins).toBeGreaterThanOrEqual(10);

    const board = await conquestLeaderboard();
    const row = board.find((r) => r.username === "Alden")!;
    expect(row.games).toBe(1);
    expect(row.coins).toBe(results[0].coins);
    expect(row.coinsEarned).toBe(results[0].coins);
    const overall = await overallLeaderboard();
    expect(overall.find((r) => r.username === "Alden")).toMatchObject({
      conquestGames: 1,
      derpyFrontGames: 0,
      games: 1,
    });
    a.close();
  });
});
