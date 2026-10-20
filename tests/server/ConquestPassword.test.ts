// FRIENDS (r25): a password a host may give a Derpy Conquest room. Every
// room is open to anyone with its code (who's online shows the way in); one
// with a password asks anyone new for it, before the game and when dropping
// into one that runs. An invite (or the party's leader) brings a pass that
// lets its account in without it. The password stays on the server: rooms,
// lobbies and who's online say only whether there is one.

import http from "http";
import { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
const K = await import("../../src/server/derpy/LobbyLock");

type Msg = ServerMessage;
const SECRET = "Sassafras-Root-77";
const NOW = 1_800_000_000_000;

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
  settle() {
    return new Promise((r) => setTimeout(r, 60));
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

// The rooms, keeping each connection so a test can sign one in (no database).
class TestRooms extends ConquestRooms {
  readonly conns: { accountId: number | null }[] = [];
  connect(ws: WebSocket, ip = "") {
    const c = super.connect(ws, ip);
    this.conns.push(c);
    return c;
  }
}

describe("a Derpy Conquest room with a password", () => {
  let rooms: TestRooms;
  let server: http.Server;
  let url = "";
  const clients: Client[] = [];
  const client = async (name: string, accountId?: number) => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    if (accountId !== undefined)
      rooms.conns[rooms.conns.length - 1].accountId = accountId;
    return c;
  };

  beforeAll(async () => {
    rooms = new TestRooms(() => NOW);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  beforeEach(() => {
    K.GUESSES.clear();
    K.LOBBY_GUESSES.clear();
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await new Promise((r) => setTimeout(r, 30));
    rooms.rooms.clear();
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  /** A room its host (Alden, account 1) gave a password. */
  async function lockedRoom(open = false) {
    const host = await client("Alden", 1);
    const made = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open,
      settings: { difficulty: "normal", start: 1650 },
    });
    const l = await made;
    expect(l.locked).toBeUndefined();
    const locked = host.next("lobby", (m) => m.locked === true);
    host.send({ t: "password", password: `  ${SECRET} ` });
    await locked;
    return { host, code: l.code };
  }

  const seats = (code: string) => rooms.rooms.get(code)!.seats.length;

  test("missing, wrong and right passwords", async () => {
    const { host, code } = await lockedRoom();
    const guest = await client("Pat");

    let asked = guest.next("needpass");
    guest.send({ t: "join", code });
    expect(await asked).toEqual({ t: "needpass", code, why: "required" });
    expect(seats(code)).toBe(1);

    asked = guest.next("needpass");
    guest.send({ t: "join", code: code.toLowerCase(), password: "sassafras" });
    expect(await asked).toEqual({ t: "needpass", code, why: "wrong" });
    expect(seats(code)).toBe(1);

    const inside = guest.next("lobby");
    const told = host.next("lobby", (m) => m.seats.length === 2);
    guest.send({ t: "join", code, password: SECRET });
    const l = await inside;
    await told;
    expect(l.seats).toHaveLength(2);
    // Those inside see that it has one; never what it is.
    expect(l.locked).toBe(true);
    for (const c of [host, guest])
      expect(JSON.stringify(c.messages)).not.toContain(SECRET);
  });

  test("a refused join leaves you where you were", async () => {
    const { code } = await lockedRoom();
    const pat = await client("Pat");
    const own = pat.next("lobby");
    pat.send({
      t: "create",
      solo: false,
      open: false,
      settings: { difficulty: "normal" },
    });
    const mine = await own;
    const asked = pat.next("needpass");
    pat.send({ t: "join", code, password: "nope" });
    await asked;
    // Still in their own room.
    expect(rooms.rooms.get(mine.code)?.seats).toHaveLength(1);
    expect(seats(code)).toBe(1);
  });

  test("an invite's pass lets its own account in without the password", async () => {
    const { code } = await lockedRoom();
    // Someone else's pass (Gary's, account 7), held by Mike (8): asked.
    const mike = await client("Mike", 8);
    let asked = mike.next("needpass");
    mike.send({ t: "join", code, pass: K.mintPass("conquest", code, 7, NOW) });
    expect((await asked).why).toBe("required");
    // A pass into another room, or into a DerpyFront lobby of that name: asked.
    asked = mike.next("needpass");
    mike.send({
      t: "join",
      code,
      pass: K.mintPass("conquest", "ZZZZ", 8, NOW),
    });
    expect((await asked).why).toBe("required");
    asked = mike.next("needpass");
    mike.send({
      t: "join",
      code,
      pass: K.mintPass("derpyfront", code, 8, NOW),
    });
    expect((await asked).why).toBe("required");
    // A guest (no account) with a pass: asked.
    const guest = await client("Somebody");
    asked = guest.next("needpass");
    guest.send({ t: "join", code, pass: K.mintPass("conquest", code, 7, NOW) });
    expect((await asked).why).toBe("required");

    // Gary with his own: in.
    const gary = await client("Gary", 7);
    const inside = gary.next("lobby");
    gary.send({ t: "join", code, pass: K.mintPass("conquest", code, 7, NOW) });
    expect((await inside).seats).toHaveLength(2);
  });

  test("wrong guesses are limited", async () => {
    const { code } = await lockedRoom();
    const guest = await client("Pat");
    for (let i = 0; i < 8; i++) {
      const asked = guest.next("needpass");
      guest.send({ t: "join", code, password: `guess${i}` });
      expect((await asked).why).toBe("wrong");
    }
    const asked = guest.next("needpass");
    guest.send({ t: "join", code, password: SECRET });
    expect((await asked).why).toBe("too_many");
    expect(seats(code)).toBe(1);
  });

  test("only its host gives it one; taken away, anyone joins again", async () => {
    const { host, code } = await lockedRoom();
    const pat = await client("Pat");
    const inside = pat.next("lobby");
    pat.send({ t: "join", code, password: SECRET });
    await inside;
    // Pat isn't the host: nothing changes.
    pat.send({ t: "password", password: null });
    await pat.settle();
    expect(rooms.rooms.get(code)!.password.locked).toBe(true);
    // Too long, from the host: refused, with why.
    const err = host.next("err");
    host.send({ t: "password", password: "x".repeat(41) });
    expect((await err).msg).toMatch(/1 to 40/);
    // The host takes it away.
    const open = host.next("lobby", (m) => !m.locked);
    host.send({ t: "password", password: null });
    await open;
    const gary = await client("Gary");
    const joined = gary.next("lobby");
    gary.send({ t: "join", code });
    expect((await joined).seats).toHaveLength(3);
  });

  test("the open list and who's online show a lock, never the password", async () => {
    const { host, code } = await lockedRoom(true);
    const looking = await client("Pat");
    const listed = looking.next("rooms");
    looking.send({ t: "list" });
    const r = await listed;
    expect(r.open.find((x) => x.code === code)?.locked).toBe(true);
    const w = rooms.presence().get(1)!;
    expect(w).toMatchObject({ k: "cq-room", code, locked: true });
    expect(JSON.stringify([...rooms.presence()])).not.toContain(SECRET);
    for (const c of [host, looking])
      expect(JSON.stringify(c.messages)).not.toContain(SECRET);
  });

  test("dropping into a game that's begun asks for it too; its players come and go freely", async () => {
    const { host, code } = await lockedRoom();
    const pat = await client("Pat", 2);
    const inside = pat.next("lobby");
    pat.send({ t: "join", code, password: SECRET });
    await inside;
    host.send({ t: "plan", plan });
    pat.send({ t: "plan", plan: { ...plan, first: "Pat", family: "Cole" } });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    pat.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const began = pat.next("game");
    host.send({ t: "start" });
    await began;
    // The host can't change it now (it's set as the room is made ready).
    host.send({ t: "password", password: null });
    await host.settle();
    expect(rooms.rooms.get(code)!.password.locked).toBe(true);

    const late = await client("Gary");
    const asked = late.next("needpass");
    late.send({ t: "join", code });
    expect((await asked).why).toBe("required");
    const dropped = late.next("game");
    late.send({ t: "join", code, password: SECRET });
    await dropped;

    // Pat leaves and comes back by the code: their account was let in.
    pat.close();
    await host.settle();
    const back = await client("Pat", 2);
    const again = back.next("game");
    back.send({ t: "join", code });
    await again;
    for (const c of [host, late, back])
      expect(JSON.stringify(c.messages)).not.toContain(SECRET);
  });
});
