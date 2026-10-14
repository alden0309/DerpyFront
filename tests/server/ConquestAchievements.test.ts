// MAP (r12): achievements pay Derp Coins once per account. A signed-in
// player is told of each as it's earned (with the coins it paid) and the
// account is paid; earning it again (a second game, or the same one
// replayed) pays nothing; a guest is told but not paid; the account's list
// comes when you join a game, and shows on your Derp Land profile.
//
// CQACH (r22): onto the account (overall) only in a game on Hard; on any
// difficulty each is told with what it pays in this game, and the end
// screen has both.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
  ACHIEVEMENT_BY_KEY,
  ACHIEVEMENTS,
  gameAchievements,
  gameCoins,
} from "../../src/conquest/engine/Achievements";
import { GAME_ACH_LINE } from "../../src/conquest/engine/Coins"; // CQACH (r22)
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { housePrice } from "../../src/conquest/engine/Property";
import type { ServerMessage } from "../../src/conquest/Protocol";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms } =
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
  traits: ["brave"],
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

function runFor(rooms: InstanceType<typeof ConquestRooms>, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    clock += 1000;
    rooms.step();
  }
}

async function soloGame(c: Client, difficulty = "hard") {
  c.send({
    t: "create",
    solo: true,
    open: false,
    settings: { difficulty },
  });
  await c.next("lobby");
  c.send({ t: "plan", plan });
  await c.next("lobby", (m) => m.seats.some((x) => x.made));
  const game = c.next("game");
  const list = c.next("achievements");
  c.send({ t: "start" });
  return { game: await game, list: await list };
}

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("Derpy Conquest achievements pay Derp Coins", () => {
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

  test("once per account, told as they come, and on the profile", async () => {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const { db } = await import("../../src/server/derpy/DerpyDb");
    const { profile } = await import("../../src/server/derpy/DerpyGames");
    const session = await register("Alden", "hunter22");
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

    // A first game: the account has none yet.
    const a = new Client(env.url);
    await a.open;
    a.send({ t: "hello", name: "whoever", token: session.token });
    await a.next("welcome");
    const first = await soloGame(a);
    expect(first.list).toMatchObject({ signedIn: true, have: [] });
    expect(await coinsNow()).toBe(0);

    // The first day: your first work. Told, and paid.
    const job = a.next("achieved", (m) => m.key === "first-job");
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    runFor(env.rooms, 4);
    const told = await job;
    const worth = ACHIEVEMENT_BY_KEY.get("first-job")!.coins;
    expect(told).toEqual({
      t: "achieved",
      key: "first-job",
      coins: worth,
      first: true,
      game: gameCoins(ACHIEVEMENT_BY_KEY.get("first-job")!),
      overall: true,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await coinsNow()).toBe(worth);
    // A house bought (paused): told at once.
    const room = env.rooms.rooms.get(first.game.code)!;
    const life = lifeOfSeat(room.game!.state, first.game.you)!;
    // Just enough for a cottage (a full purse is an achievement of its own).
    life.purse = Math.min(90, housePrice(room.game!.state, life) + 1);
    life.area = "market";
    a.send({ t: "pause", p: true });
    await a.next("clock", (m) => m.paused);
    const house = a.next("achieved", (m) => m.key === "house");
    a.send({ t: "cmd", id: 1, c: { k: "act", place: "market", act: "house" } });
    expect((await house).coins).toBe(ACHIEVEMENT_BY_KEY.get("house")!.coins);
    await new Promise((r) => setTimeout(r, 50));
    const paid = await coinsNow();
    expect(paid).toBe(worth + ACHIEVEMENT_BY_KEY.get("house")!.coins);
    a.send({ t: "leave" });
    await a.next("rooms").catch(() => undefined);

    // A second game: the account's list comes when it starts, and earning
    // the same again pays nothing.
    const second = await soloGame(a);
    expect(second.list.have.map((x) => x.key).sort()).toEqual([
      "first-job",
      "house",
    ]);
    const again = a.next("achieved", (m) => m.key === "first-job");
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    runFor(env.rooms, 4);
    expect(await again).toMatchObject({ coins: 0, first: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(await coinsNow()).toBe(paid);
    a.send({ t: "leave" });
    await a.next("rooms").catch(() => undefined);

    // CQACH (r22): a game on Normal: each is told with what it pays in this
    // game, and none goes onto the account (a new one included).
    const third = await soloGame(a, "normal");
    const room3 = env.rooms.rooms.get(third.game.code)!;
    const life3 = lifeOfSeat(room3.game!.state, third.game.you)!;
    const job3 = a.next("achieved", (m) => m.key === "first-job");
    a.send({ t: "pause", p: false });
    await a.next("clock", (m) => !m.paused);
    runFor(env.rooms, 4);
    expect(await job3).toMatchObject({
      coins: 0,
      first: false,
      overall: false,
      game: gameCoins(ACHIEVEMENT_BY_KEY.get("first-job")!),
    });
    a.send({ t: "pause", p: true });
    await a.next("clock", (m) => m.paused);
    life3.tally.peakPurse = 150;
    const purse = a.next("achieved", (m) => m.key === "purse");
    a.send({ t: "cmd", id: 2, c: { k: "will", share: true } });
    expect(await purse).toMatchObject({
      coins: 0,
      first: false,
      overall: false,
      game: gameCoins(ACHIEVEMENT_BY_KEY.get("purse")!),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await coinsNow()).toBe(paid);
    // The end screen: this game's, with their coins, and nothing overall.
    const end = a.next("end");
    a.send({ t: "end" });
    const mine = (await end).results[0];
    expect(mine.ach?.hard).toBe(false);
    expect(mine.ach?.overall).toEqual([]);
    expect(mine.ach?.game.map((x) => x.key)).toEqual(
      expect.arrayContaining(["first-job", "purse"]),
    );
    for (const x of mine.ach!.game)
      expect(x.coins).toBe(gameCoins(ACHIEVEMENT_BY_KEY.get(x.key)!));
    expect(mine.coinLines.find((l) => l.line === GAME_ACH_LINE)?.coins).toBe(
      gameAchievements(life3).coins,
    );
    a.close();

    // On the Derp Land profile.
    const p = (await profile("Alden"))!;
    expect(p.conquest.achievements!.map((x) => x.key).sort()).toEqual([
      "first-job",
      "house",
    ]);
    expect(p.conquest.achievements![0].name).toBeTruthy();
    // CQACH (r22): of all but the add-ons' (this account owns none).
    expect(p.conquest.achievementCount).toBe(
      ACHIEVEMENTS.filter((x) => !x.dlc).length,
    );

    // A guest is told, but not paid.
    const g = new Client(env.url);
    await g.open;
    g.send({ t: "hello", name: "Guest" });
    await g.next("welcome");
    const guest = await soloGame(g);
    expect(guest.list).toEqual({
      t: "achievements",
      signedIn: false,
      have: [],
    });
    const gjob = g.next("achieved", (m) => m.key === "first-job");
    g.send({ t: "pause", p: false });
    await g.next("clock", (m) => !m.paused);
    runFor(env.rooms, 4);
    expect(await gjob).toMatchObject({
      coins: null,
      first: false,
      overall: true,
    });
    g.close();
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM derpy_conquest_achievements"))
          .rows[0].count,
      ),
    ).toBe(2);
  }, 60_000);
});
