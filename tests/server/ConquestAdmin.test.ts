// ADMIN (r26): what Derpy Conquest's rooms do for the owner's admin page:
// list every room (private and solo too) with its seats, close one (its
// game saved first; everyone told why and sent back to the front screen),
// and take a suspended account's seats away.

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
import { type ServerMessage } from "../../src/conquest/Protocol";

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

const clock = 1_800_000_000_000;
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

describe("Derpy Conquest's rooms, for the admin page", () => {
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

  test("every room is listed, with its seats", async () => {
    const { code } = await twoPlayerGame(false);
    const list = rooms.adminRooms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      code,
      solo: false,
      open: false,
      started: true,
      over: false,
      year: 1650,
    });
    expect(list[0].seats.map((s) => [s.name, s.online])).toEqual([
      ["Alden", true],
      ["Michael", true],
    ]);
  });

  test("closed by the owner: each player is told why and sent back; the room is gone", async () => {
    const { host, friend, code } = await twoPlayerGame(true);
    const ends = [host, friend].map((c) => c.next("watchend"));
    const errs = [host, friend].map((c) => c.next("err"));
    expect(await rooms.adminClose(code, "Maintenance")).toBe(true);
    for (const e of await Promise.all(errs))
      expect(e.msg).toMatch(/ended or closed/);
    for (const e of await Promise.all(ends))
      expect(e.why).toBe("Derp Land closed this game: Maintenance");
    expect(rooms.rooms.has(code)).toBe(false);
    expect(rooms.adminRooms()).toEqual([]);
    expect(await rooms.adminClose(code, "again")).toBe(false);
  });

  test("a suspended account's seat is taken away, and only theirs", async () => {
    const { host, friend, code } = await twoPlayerGame(true);
    const room = rooms.rooms.get(code)!;
    room.seats[1].accountId = 4242;
    const gone = friend.next("watchend");
    expect(rooms.adminDrop(4242, "This account is suspended.")).toBe(1);
    expect((await gone).why).toBe("This account is suspended.");
    expect(room.seats[1].conn).toBeNull();
    expect(room.seats[0].conn).not.toBeNull();
    await host.settle();
    expect(host.messages.some((m) => m.t === "watchend")).toBe(false);
    expect(rooms.adminDrop(9999, "nobody")).toBe(0);
  });
});
