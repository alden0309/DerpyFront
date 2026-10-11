import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
  generateLook,
  validateLook,
} from "../../src/conquest/engine/Appearance";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
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

type Msg = ServerMessage;

/** A player's connection, waiting on the messages it wants. */
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
      const timer = setTimeout(
        () => reject(new Error(`timed out: ${t}`)),
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
}

const look = {
  ...generateLook({
    id: 77,
    culture: "english",
    female: false,
    age: 24,
    station: "soldier",
    year: 1607,
  }),
  hair: 2,
  hairL: 1,
  cloth: 9,
  flip: true,
};

/** A drawn likeness from before the gallery, as an older client sends it. */
const drawn = {
  skin: 2,
  face: 0,
  jaw: 1,
  cheeks: 2,
  eyes: 0,
  eyeColor: 5,
  eyeSet: 1,
  brows: 2,
  nose: 1,
  mouth: 0,
  ears: 1,
  hair: "collar",
  hairColor: 3,
  beard: "spade",
  hat: "morion",
  clothes: "breastplate",
  colors: [5, 3, 7],
  extras: [],
  marks: [],
  lines: 1,
  greying: 1,
};

const plan = {
  origin: "england",
  home: AMERICAS.provinces.findIndex((p) => p.name === "Jamestown"),
  first: "Alden",
  family: "Drackley",
  female: false,
  age: 24,
  religion: "anglican",
  face: 0,
  look,
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

describe("Derpy Conquest server: likenesses", () => {
  let server: http.Server;
  let url = "";
  beforeAll(async () => {
    const rooms = new ConquestRooms(() => 1_800_000_000_000);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  async function hello(): Promise<Client> {
    const c = new Client(url);
    await c.open;
    c.send({ t: "hello", name: "Alden" });
    await c.next("welcome");
    c.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "normal" },
    });
    await c.next("lobby");
    return c;
  }

  test("a plan's look reaches the character in the game", async () => {
    const c = await hello();
    c.send({ t: "plan", plan });
    await c.next("lobby", (m) => m.seats.some((x) => x.made));
    const game = c.next("game");
    c.send({ t: "start" });
    const g = await game;
    const life = lifeOfSeat(g.state, g.you)!;
    expect(g.state.chars[life.c].look).toEqual(look);
    c.ws.close();
  });

  test("a plan without a look still plays (drawn for them)", async () => {
    const c = await hello();
    const { look: _drop, ...bare } = plan;
    void _drop;
    c.send({ t: "plan", plan: bare });
    await c.next("lobby", (m) => m.seats.some((x) => x.made));
    c.ws.close();
  });

  test("an older client's drawn look is brought over to a portrait", async () => {
    const c = await hello();
    c.send({ t: "plan", plan: { ...plan, look: drawn } });
    await c.next("lobby", (m) => m.seats.some((x) => x.made));
    const game = c.next("game");
    c.send({ t: "start" });
    const g = await game;
    const life = lifeOfSeat(g.state, g.you)!;
    const got = g.state.chars[life.c].look!;
    expect(validateLook(got, { female: false, grown: true })).toBeNull();
    expect(got.cloth).toBe(5);
    c.ws.close();
  });

  test("a made-up look is refused", async () => {
    for (const bad of [
      { ...look, p: "golden-crown" },
      { ...look, hair: 400 },
      { ...look, hairL: 9 },
      { ...look, flip: "yes" },
      { ...look, wings: true },
      { ...drawn, colors: [1, 2] },
    ]) {
      const c = await hello();
      const err = c.next("err");
      c.send({ t: "plan", plan: { ...plan, look: bad } });
      expect((await err).t).toBe("err");
      c.ws.close();
    }
  });
});
