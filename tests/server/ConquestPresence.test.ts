// FRIENDS (r25): where Derpy Conquest's tables say their signed-in players
// are, for Derp Land's who's online (ConquestRooms.presence): in a room
// before it starts, playing (the year and the colony), or watching. From the
// seats themselves, by account; guests are never listed.

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
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { ServerMessage } from "../../src/conquest/Protocol";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms } =
  await import("../../src/server/conquest/ConquestRooms");
const { PresenceBoard, targetOf } =
  await import("../../src/server/derpy/Presence");

type Msg = ServerMessage;

class Client {
  private waiters: { test: (m: Msg) => boolean; resolve: (m: Msg) => void }[] =
    [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as Msg;
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
      const timer = setTimeout(() => reject(new Error(`no ${t}`)), 4000);
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
  background: "soldier",
  stats: { dip: 6, mar: 7, ste: 5, int: 5, lea: 5 },
  skills: { leadership: 2 },
  traits: ["brave", "lazy"],
};

describe("Derpy Conquest's tables, for who's online", () => {
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
  /** Sign a seat in as an account (the test has no database). */
  const signIn = (code: string, seatIndex: number, accountId: number) => {
    const room = rooms.rooms.get(code) as unknown as {
      seats: { accountId: number | null; conn: { accountId: number | null } }[];
    };
    room.seats[seatIndex].accountId = accountId;
    room.seats[seatIndex].conn.accountId = accountId;
  };

  beforeAll(async () => {
    rooms = new ConquestRooms(() => 1_800_000_000_000);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  test("a room before its game: joinable while there's a seat, private unless open", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: false,
      settings: { difficulty: "normal" },
    });
    const l = await lobby;
    // A guest is never listed.
    expect(rooms.presence().size).toBe(0);
    signIn(l.code, 0, 41);
    const w = rooms.presence().get(41)!;
    expect(w).toEqual({
      k: "cq-room",
      code: l.code,
      joinable: true,
      private: true,
      solo: false,
    });
    expect(targetOf(w)).toEqual({
      game: "conquest",
      id: l.code,
      private: true,
    });

    // Someone else at the table, signed in: listed too.
    const pat = await client("Pat");
    const joined = pat.next("lobby", (m) => m.seats.length === 2);
    pat.send({ t: "join", code: l.code });
    await joined;
    signIn(l.code, 1, 42);
    expect(rooms.presence().get(42)?.k).toBe("cq-room");

    // They leave: gone at once.
    pat.send({ t: "leave" });
    await host.next("lobby", (m) => m.seats.length === 1);
    expect(rooms.presence().has(42)).toBe(false);
  });

  test("a solo game is nobody's to join; playing shows the year and the colony (the town and its power)", async () => {
    const a = await client("Alden");
    a.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "normal" },
    });
    const l = await a.next("lobby");
    signIn(l.code, 0, 51);
    expect(rooms.presence().get(51)).toMatchObject({
      k: "cq-room",
      joinable: false,
      solo: true,
    });
    a.send({ t: "plan", plan });
    await a.next("lobby", (m) => m.seats.some((x) => x.made));
    const game = a.next("game");
    a.send({ t: "start" });
    await game;
    const w = rooms.presence().get(51)!;
    expect(w.k).toBe("cq-game");
    if (w.k !== "cq-game") return;
    expect(w.year).toBe(1607);
    // Where the character lives, and who holds it.
    expect(w.colony).toBe("Jamestown");
    expect(w.power).toBe("England");
    expect(w.joinable).toBe(false);
    // A solo game nobody may watch offers no Watch.
    expect(w.watchId).toBeUndefined();

    // On the board, the table outranks the page's word ("choosing a game").
    const board = new PresenceBoard(() => 0);
    board.learn(51, "Alden");
    board.beat(51, "tab", { k: "cq-front" });
    board.setDerived(() => rooms.presence());
    expect(board.snapshot().get(51)?.k).toBe("cq-game");

    // Closing the page leaves the table: no longer listed there.
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(rooms.presence().has(51)).toBe(false);
    expect(board.snapshot().get(51)).toEqual({ k: "cq-front" });
  });

  test("an open game in progress can be joined (a new life) and watched", async () => {
    const host = await client("Alden");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal" },
    });
    const l = await host.next("lobby");
    signIn(l.code, 0, 61);
    host.send({ t: "plan", plan });
    await host.next("lobby", (m) => m.seats.some((x) => x.made));
    const game = host.next("game");
    host.send({ t: "start" });
    await game;
    const w = rooms.presence().get(61)!;
    expect(w).toMatchObject({
      k: "cq-game",
      code: l.code,
      joinable: true,
      private: false,
    });
    if (w.k !== "cq-game") return;
    expect(w.watchId).toMatch(/\S/);

    // Someone watching (signed in) shows as watching.
    const live = rooms.live().find((x) => x.title)!;
    const watcher = await client("Gary");
    const watched = watcher.next("game");
    watcher.send({ t: "watch", id: live.watchId });
    await watched;
    const wr = (
      rooms as unknown as {
        rooms: Map<string, { watchers: Set<{ accountId: number | null }> }>;
      }
    ).rooms.get(l.code)!;
    for (const c of wr.watchers) c.accountId = 62;
    expect(rooms.presence().get(62)).toEqual({ k: "cq-watch" });
  });
});
