// CQTUT (r26): the first life on the server. Asked for, it's a solo game
// of its own at once (no register, no lobby), that nobody else can join;
// finishing it puts First life onto the account with 250 Derp Coins, once
// per account on any difficulty (a second first life pays nothing more, and
// nothing in the game); a guest is told, not paid; saved mid-lessons, it
// comes back at the step, under its own title.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { AMERICAS } from "../../src/conquest/engine/Map";
import {
  FIRST_LIFE,
  FIRST_LIFE_COINS,
  TUTORIAL_STEPS,
} from "../../src/conquest/engine/TutorialCore";
import type { LifeCommand } from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";

const P = (name: string) =>
  AMERICAS.provinces.findIndex((p) => p.name === name);

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms } =
  await import("../../src/server/conquest/ConquestRooms");

type Msg = ServerMessage;

const clock = 1_900_000_000_000;

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
        5000,
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

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("the first life on the server (CQTUT r26)", () => {
  let env: Awaited<ReturnType<typeof startServer>>;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    ({ closeDerpyDb: closeDb } =
      await import("../../src/server/derpy/DerpyDb"));
    env = await startServer();
  });

  afterAll(async () => {
    env.server.closeAllConnections?.();
    await new Promise((r) => env.server.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  /** Ask for a first life; the game comes at once. */
  async function firstLife(c: Client, female = false) {
    const game = c.next("game");
    c.send({ t: "tutorial", female });
    return game;
  }

  /**
   * Every step but the last done on the server's own game (First life is
   * for doing them), then the last by the socket.
   */
  async function finish(c: Client, code: string, you: string, id: number) {
    const room = env.rooms.rooms.get(code)!;
    const g = room.game!;
    const life = () => lifeOfSeat(g.state, you)!;
    const cmd = (x: LifeCommand) => g.lifeCommand(you, x);
    const answer = (choice: number) => {
      const ev = life().events.find((e) => e.key.startsWith("tut-"));
      if (ev) cmd({ k: "event", id: ev.id, choice });
    };
    const run = (done: () => boolean) => {
      for (let n = 0; n < 200 && !done(); n++) g.tick();
    };
    const step = () => TUTORIAL_STEPS[life().tut!.step];
    cmd({ k: "enter", area: "workshop" });
    cmd({ k: "effort", v: "steady" });
    cmd({ k: "person", c: life().tut!.cast.friend, act: "talk" });
    answer(0);
    answer(2);
    cmd({ k: "travel", to: P("Plymouth"), bySea: false });
    run(() => !life().travel);
    answer(2);
    cmd({ k: "travel", to: P("Massachusetts Bay"), bySea: false });
    run(() => step() !== "home");
    answer(2);
    cmd({ k: "ambition", key: "rise" });
    run(() => !!life().tut!.wait);
    answer(1);
    expect(step()).toBe("heir");
    const told = c.next("achieved", (m) => m.key === FIRST_LIFE);
    c.send({
      t: "cmd",
      id,
      c: { k: "tut", act: "saw", what: "heir" },
    });
    return told;
  }

  test("its own solo game at once; nobody else may join it", async () => {
    const a = new Client(env.url);
    await a.open;
    a.send({ t: "hello", name: "Newcomer" });
    await a.next("welcome");
    const g = await firstLife(a);
    expect(g.solo).toBe(true);
    expect(g.paused).toBe(true);
    expect(g.state.settings.tutorial).toBe(true);
    expect(g.state.settings.difficulty).toBe("easy");
    const life = lifeOfSeat(g.state, g.you)!;
    expect(life.tut?.step).toBe(0);
    expect(g.state.chars[life.c].first).toBe("Thomas");
    const b = new Client(env.url);
    await b.open;
    b.send({ t: "hello", name: "Other" });
    await b.next("welcome");
    const no = b.next("err");
    b.send({ t: "join", code: g.code });
    expect((await no).msg).toBe("No game with that code.");
    // As Hannah, the next time.
    const h = await firstLife(a, true);
    expect(h.code).not.toBe(g.code);
    const hl = lifeOfSeat(h.state, h.you)!;
    expect(h.state.chars[hl.c].first).toBe("Hannah");
    a.close();
    b.close();
  });

  test("First life: 250 onto the account once, on Easy; again, nothing; a guest told, not paid", async () => {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const { db } = await import("../../src/server/derpy/DerpyDb");
    const session = await register("Newcomer", "hunter22");
    if (typeof session === "string") throw new Error(session);
    const pool = await db();
    const coinsNow = async () =>
      Number(
        (
          await pool.query("SELECT coins FROM derpy_accounts WHERE id = $1", [
            session.account.id,
          ])
        ).rows[0].coins,
      );
    const a = new Client(env.url);
    await a.open;
    a.send({ t: "hello", name: "whoever", token: session.token });
    await a.next("welcome");
    const before = await coinsNow();
    const g = await firstLife(a);
    const told = await finish(a, g.code, g.you, 1);
    expect(told).toMatchObject({
      key: FIRST_LIFE,
      coins: FIRST_LIFE_COINS,
      first: true,
      overall: true,
      game: 0,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await coinsNow()).toBe(before + 250);
    // A second first life, finished too: told, and nothing more paid.
    const g2 = await firstLife(a, true);
    const again = await finish(a, g2.code, g2.you, 2);
    expect(again).toMatchObject({ coins: 0, first: false, overall: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(await coinsNow()).toBe(before + 250);
    // Left early: nothing.
    const g3 = await firstLife(a);
    const room3 = env.rooms.rooms.get(g3.code)!;
    a.send({ t: "cmd", id: 3, c: { k: "tut", act: "leave" } });
    await a.next("ack", (m) => m.id === 3);
    const l3 = lifeOfSeat(room3.game!.state, g3.you)!;
    expect(l3.tut?.over?.how).toBe("left");
    expect(l3.achieved?.[FIRST_LIFE]).toBeUndefined();
    a.close();

    // A guest finishing it is told, and not paid.
    const q = new Client(env.url);
    await q.open;
    q.send({ t: "hello", name: "Guest" });
    await q.next("welcome");
    const gq = await firstLife(q);
    expect(await finish(q, gq.code, gq.you, 1)).toMatchObject({
      key: FIRST_LIFE,
      coins: null,
    });
    q.close();
  });

  test("saved mid-lessons, it comes back at the step, under its own title", async () => {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const session = await register("Resumer", "hunter22");
    if (typeof session === "string") throw new Error(session);
    const a = new Client(env.url);
    await a.open;
    a.send({ t: "hello", name: "x", token: session.token });
    await a.next("welcome");
    const g = await firstLife(a);
    a.send({ t: "cmd", id: 1, c: { k: "enter", area: "workshop" } });
    await a.next("ack", (m) => m.id === 1);
    const saved = a.next("saved");
    a.send({ t: "save" });
    await saved;
    a.send({ t: "leave" });
    await new Promise((r) => setTimeout(r, 100));
    const rooms = a.next("rooms");
    a.send({ t: "list" });
    const list = await rooms;
    const mine = list.saved.find((x) => x.id.startsWith(g.code))!;
    expect(mine.title).toBe("First life: Thomas Hale, Boston 1700");
    // The room is still open with nobody in it: rejoining it is the same game.
    env.rooms.rooms.delete(g.code);
    const back = a.next("game");
    a.send({ t: "resume", id: mine.id });
    const r = await back;
    const life = lifeOfSeat(r.state, r.you)!;
    expect(life.tut?.step).toBe(1);
    expect(life.tut?.done).toEqual(["places"]);
    expect(r.solo).toBe(true);
    a.close();
  });
});
