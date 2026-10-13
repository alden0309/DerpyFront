// SITE (r19): watching a Derpy Conquest game from Derp Land. A watcher
// connects without a seat and sees the world (the map, armies, the news, the
// players' public figures) but nothing any player keeps to themselves. They
// never pause, never count toward the room being empty, and never hold a
// seat. A game open to anyone can be watched; a private one only if its host
// allows it. There's a cap on watchers, and they come by a watch id, never
// the room's code.

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
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { MAX_WATCHERS, type ServerMessage } from "../../src/conquest/Protocol";
import { plantSecrets, SECRET, secretsIn } from "../conquest/WatchUtil";

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

  /** Lets messages already on their way arrive. */
  settle() {
    return new Promise((r) => setTimeout(r, 60));
  }

  close() {
    this.ws.close();
  }
}

let clock = 1_800_000_000_000;
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

describe("watching a Derpy Conquest game (SITE r19)", () => {
  let rooms: InstanceType<typeof ConquestRooms>;
  let server: http.Server;
  let url = "";
  const clients: Client[] = [];
  const client = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    return c;
  };

  beforeAll(async () => {
    rooms = new ConquestRooms(() => clock);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await new Promise((r) => setTimeout(r, 30));
    rooms.rooms.clear();
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  /** Two players in a game that's begun: open to anyone, or private. */
  async function twoPlayerGame(open: boolean) {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open,
      settings: { difficulty: "normal", start: 1650 },
    });
    const l = await lobby;
    const friend = await client("Michael");
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code });
    await joined;
    host.send({ t: "plan", plan });
    friend.send({
      t: "plan",
      plan: { ...plan, first: "Michael", family: "Cole" },
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    friend.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    return { host, friend, code: l.code, hg, fg };
  }

  async function liveList(c: Client) {
    const r = c.next("rooms");
    c.send({ t: "list" });
    return (await r).live ?? [];
  }

  test("anyone can watch a game open to all: the world, and no seat", async () => {
    const { host, friend, code, hg } = await twoPlayerGame(true);
    const room = rooms.rooms.get(code)!;
    expect(hg.watchers).toBe(0);

    // No account needed: a guest finds it on the list of games being played.
    const guest = await client("Somebody");
    const live = await liveList(guest);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({
      open: true,
      solo: false,
      year: 1650,
      watchers: 0,
      full: false,
    });
    expect(live[0].players.map((p) => p.name).sort()).toEqual([
      "Alden",
      "Michael",
    ]);
    // Watched by its watch id, which is not the room's code.
    expect(live[0].watchId).not.toBe(code);
    expect(JSON.stringify(live)).not.toContain(code);

    const told = host.next("watchers", (m) => m.n === 1);
    const watched = guest.next("game");
    guest.send({ t: "watch", id: live[0].watchId });
    const w = await watched;
    expect(w).toMatchObject({
      watcher: true,
      you: "",
      secret: "",
      watchers: 1,
    });
    expect(w.code).toBe(live[0].watchId);
    expect(w.state.lives).toHaveLength(2);
    expect(w.seats).toHaveLength(2);
    // Players see "1 watching".
    expect(await told).toMatchObject({ n: 1 });
    // A watcher holds no seat.
    expect(room.seats).toHaveLength(2);
    expect(room.watchers.size).toBe(1);

    // The clock and the news reach the watcher too.
    const clock1 = guest.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    expect(await clock1).toMatchObject({ paused: true, by: "Alden" });
    const going = guest.next("clock", (m) => !m.paused);
    host.send({ t: "pause", p: false });
    await going;
    const day = guest.next("d");
    clock += 1000;
    for (let i = 0; i < 4; i++) {
      clock += 1000;
      rooms.step();
    }
    expect((await day).d.day).toBeGreaterThanOrEqual(w.state.day);

    // A watcher can't pause, keep time, talk, act or change anything.
    for (const m of [
      { t: "pause", p: true },
      { t: "speed", s: 4 },
      { t: "skip", on: true },
      { t: "chat", text: "hello" },
      { t: "cmd", id: 1, c: { k: "act", place: "tavern", act: "drink" } },
      { t: "save" },
      { t: "end" },
      { t: "allowwatch", allow: false },
      { t: "life", plan },
    ]) {
      const err = guest.next("err");
      guest.send(m);
      expect((await err).msg).toMatch(/not in a game/);
    }
    expect(room.paused).toBe(false);
    expect(room.game!.state.over).toBe(false);

    // The players' talk isn't for watchers.
    const said = friend.next("chat");
    host.send({ t: "chat", text: "just us" });
    await said;
    await guest.settle();
    expect(guest.messages.some((m) => m.t === "chat")).toBe(false);

    // When the players go, the game stops, watched or not: a watcher never
    // keeps it running, and doesn't count as anyone being there.
    host.close();
    friend.close();
    await guest.next("clock", (m) => m.paused);
    expect(room.paused).toBe(true);
    expect(room.emptySince).not.toBeNull();
    // Nobody's playing it, so it isn't on the list.
    const other = await client("Gary");
    expect(await liveList(other)).toEqual([]);

    // A watcher leaving tells the room.
    guest.send({ t: "leave" });
    await guest.settle();
    expect(room.watchers.size).toBe(0);
  });

  test("a watcher is never sent anyone's secrets", async () => {
    const { host, friend, code, hg, fg } = await twoPlayerGame(true);
    const room = rooms.rooms.get(code)!;
    const guest = await client("Somebody");
    const [{ watchId }] = await liveList(guest);
    const watched = guest.next("game");
    guest.send({ t: "watch", id: watchId });
    await watched;

    // Every kind of secret, all the host's, goes out with the next change.
    plantSecrets(room.game!, hg.you, fg.you);
    const hostSees = host.next("d", (m) => JSON.stringify(m).includes(SECRET));
    const friendGot = friend.next("d");
    const guestGot = guest.next("d");
    (rooms as unknown as { flush(r: unknown): void }).flush(room);
    await Promise.all([hostSees, friendGot, guestGot]);
    // The other player isn't sent the host's secrets either.
    const fd = (await friendGot).d;
    expect(
      JSON.stringify([
        fd.lives?.[hg.you] ?? null,
        fd.lifePatch?.[hg.you] ?? null,
      ]),
    ).not.toContain(SECRET);

    // ...and the state a watcher is sent on (re)arriving holds none either.
    const again = guest.next("game");
    guest.send({ t: "watch", id: watchId });
    expect(secretsIn((await again).state)).toEqual([]);
    expect(lifeOfSeat((await again).state, hg.you)).toBeDefined();

    // A late watcher, too.
    const late = await client("Gary");
    const lw = late.next("game");
    late.send({ t: "watch", id: watchId });
    expect(secretsIn((await lw).state)).toEqual([]);

    // Days go by: nothing secret in anything sent to a watcher, ever.
    for (let i = 0; i < 12; i++) {
      clock += 1000;
      rooms.step();
    }
    await guest.settle();
    for (const c of [guest, late]) {
      const json = JSON.stringify(c.messages);
      expect(json).not.toContain(SECRET);
      expect(json).not.toContain('"secret":"' + hg.secret);
      for (const m of c.messages)
        expect([
          "letters",
          "achievements",
          "achieved",
          "chat",
          "saved",
        ]).not.toContain(m.t);
    }
  });

  test("a private game is watched only if its host allows it", async () => {
    const { host, friend, code } = await twoPlayerGame(false);
    const room = rooms.rooms.get(code)!;
    const guest = await client("Somebody");
    expect(await liveList(guest)).toEqual([]);
    // Off by default: even knowing the watch id doesn't get you in.
    const no = guest.next("watchend");
    guest.send({ t: "watch", id: room.watchId });
    expect((await no).why).toMatch(/hasn't opened it to watchers/);
    expect(room.watchers.size).toBe(0);

    // Only the host can open it.
    friend.send({ t: "allowwatch", allow: true });
    await friend.settle();
    expect(room.allowWatchers).toBe(false);
    const opened = friend.next("watchers", (m) => m.allow);
    host.send({ t: "allowwatch", allow: true });
    await opened;

    const live = await liveList(guest);
    expect(live).toHaveLength(1);
    expect(live[0].open).toBe(false);
    const w = guest.next("game");
    guest.send({ t: "watch", id: live[0].watchId });
    expect(await w).toMatchObject({ watcher: true, allowWatchers: true });
    // Watching a private game is no way into it: the room's code was never sent.
    expect(JSON.stringify(guest.messages)).not.toContain(`"${code}"`);

    // Shut again: the watcher is sent away.
    const gone = guest.next("watchend");
    host.send({ t: "allowwatch", allow: false });
    expect((await gone).why).toMatch(/closed that game to watchers/);
    expect(room.watchers.size).toBe(0);
    expect(await liveList(guest)).toEqual([]);
  });

  test("a solo game is private too; the host may let watchers in", async () => {
    const a = await client("Alden");
    a.send({
      t: "create",
      solo: true,
      open: true,
      settings: { difficulty: "normal" },
    });
    const l = await a.next("lobby");
    expect(l.allowWatchers).toBe(false);
    const allowed = a.next("lobby", (m) => m.allowWatchers === true);
    a.send({ t: "allowwatch", allow: true });
    await allowed;
    a.send({ t: "plan", plan });
    await a.next("lobby", (m) => m.seats.some((x) => x.made));
    const g = a.next("game");
    a.send({ t: "start" });
    expect(await g).toMatchObject({ allowWatchers: true, open: false });
    const guest = await client("Somebody");
    const live = await liveList(guest);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ solo: true, open: false });
  });

  test("there's a cap on watchers", async () => {
    const { code } = await twoPlayerGame(true);
    const room = rooms.rooms.get(code)!;
    for (let i = 0; i < MAX_WATCHERS; i++) {
      const c = await client(`W${i}`);
      const w = c.next("game");
      c.send({ t: "watch", id: room.watchId });
      await w;
    }
    expect(room.watchers.size).toBe(MAX_WATCHERS);
    const one = await client("One too many");
    expect((await liveList(one))[0]).toMatchObject({
      watchers: MAX_WATCHERS,
      full: true,
    });
    const no = one.next("watchend");
    one.send({ t: "watch", id: room.watchId });
    expect((await no).why).toMatch(/watching that game already/);
    expect(room.watchers.size).toBe(MAX_WATCHERS);
  });

  test("no watchers, no extra work; a room closing sends its watchers home", async () => {
    const { host, friend, code } = await twoPlayerGame(true);
    const room = rooms.rooms.get(code)!;
    const sent: string[] = [];
    // Nobody watching: a change is sent to the players and to nobody else.
    const spy = vi.spyOn(
      rooms as unknown as { toWatchers(r: unknown, j: string): void },
      "toWatchers",
    );
    plantSecrets(room.game!, room.seats[0].id, room.seats[1].id);
    (rooms as unknown as { flush(r: unknown): void }).flush(room);
    for (const call of spy.mock.calls) sent.push(call[1] as string);
    // The per-viewer delta for a watcher isn't even made.
    expect(sent.some((j) => j.includes('"t":"d"'))).toBe(false);
    spy.mockRestore();

    const guest = await client("Somebody");
    const w = guest.next("game");
    guest.send({ t: "watch", id: room.watchId });
    await w;
    host.close();
    friend.close();
    await guest.next("clock", (m) => m.paused);
    const home = guest.next("watchend");
    clock += 31 * 60_000;
    rooms.step();
    expect((await home).why).toMatch(/closed/);
    expect(rooms.rooms.has(code)).toBe(false);
  });
});
