// DLC (r21): Derpy Conquest's store items are checked on the server, item by
// item, from the account's own rows in derpy_owned:
// - 1776: The Revolution: only its owner hosts a game that begins in 1776
//   (creating it, choosing it in the room, starting it: checked again then,
//   and loading a saved one); anyone joins it free.
// - Legends: come to the lives of the seats whose accounts own it.
// - Map styles: the welcome says which the account owns.
// The rules are tested on their own; the rooms against a throwaway Postgres
// (DERPY_TEST_DATABASE_URL), as the other account tests are.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
  CAMPAIGN_1776,
  dlcFromOwned,
  LEGENDS,
  mapStyleItem,
  NO_DLC,
} from "../../src/conquest/DlcIds";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { ServerMessage } from "../../src/conquest/Protocol";
import {
  dlcOf,
  hostProblem,
  loadProblem,
} from "../../src/server/conquest/ConquestDlc";
import { findItem, itemGrants } from "../../src/server/derpy/DerpyCatalog";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const { attachConquest, ConquestRooms } =
  await import("../../src/server/conquest/ConquestRooms");

describe("Conquest's store items: the rules", () => {
  test("what owned rows come to", () => {
    expect(dlcFromOwned([])).toEqual(NO_DLC);
    const all = [CAMPAIGN_1776, LEGENDS, mapStyleItem("night")].flatMap((n) =>
      itemGrants(findItem(n)!),
    );
    expect(dlcFromOwned(all)).toEqual({
      campaign1776: true,
      legends: true,
      styles: ["night"],
    });
    // A skin or another game's item is nothing here.
    expect(dlcFromOwned(["pack:ai_pirates", "skin:x"])).toEqual(NO_DLC);
  });

  test("who may host and load 1776", () => {
    const owner = { ...NO_DLC, campaign1776: true };
    for (const y of [undefined, 1607, 1650, 1700] as const) {
      expect(hostProblem(y, NO_DLC)).toBeNull();
      expect(loadProblem(y, NO_DLC)).toBeNull();
    }
    expect(hostProblem(1776, NO_DLC)).toMatch(/Derp Store/);
    expect(loadProblem(1776, NO_DLC)).toMatch(/owns 1776/);
    expect(hostProblem(1776, owner)).toBeNull();
    expect(loadProblem(1776, owner)).toBeNull();
    // Legends or map styles don't open 1776.
    expect(
      hostProblem(1776, {
        campaign1776: false,
        legends: true,
        styles: ["night"],
      }),
    ).not.toBeNull();
  });

  test("the account's rows decide, never a guest's word, and a database fault owns nothing", async () => {
    const rows = itemGrants(findItem(CAMPAIGN_1776)!);
    expect(
      await dlcOf(
        7,
        async () => rows,
        () => true,
      ),
    ).toMatchObject({
      campaign1776: true,
    });
    expect(
      await dlcOf(
        null,
        async () => rows,
        () => true,
      ),
    ).toEqual(NO_DLC);
    expect(
      await dlcOf(
        7,
        async () => rows,
        () => false,
      ),
    ).toEqual(NO_DLC);
    expect(
      await dlcOf(
        7,
        async () => {
          throw new Error("down");
        },
        () => true,
      ),
    ).toEqual(NO_DLC);
  });
});

// ---------------------------------------------------------------- the rooms

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
        6000,
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

const clock = 1_800_000_000_000;
const plan = (first: string) => ({
  origin: "england",
  home: AMERICAS.provinces.findIndex((p) => p.name === "Plymouth"),
  first,
  family: "Drackley",
  female: false,
  age: 26,
  religion: "puritan",
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
  stats: { dip: 6, mar: 6, ste: 6, int: 5, lea: 5 },
  skills: { persuasion: 2 },
  traits: [],
});

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

describe.skipIf(!TEST_DB)("Conquest's store items: the rooms", () => {
  let env: Awaited<ReturnType<typeof startServer>>;
  let closeDb: () => Promise<void>;
  let pool: import("pg").Pool;
  const clients: Client[] = [];

  async function account(name: string, items: string[]) {
    const { register } = await import("../../src/server/derpy/DerpyAuth");
    const session = await register(name, "hunter22");
    if (typeof session === "string") throw new Error(session);
    // As the store's purchase writes them (DerpyApi /store/buy).
    const rows = items.flatMap((n) => itemGrants(findItem(n)!));
    if (rows.length)
      await pool.query(
        `INSERT INTO derpy_owned (account_id, item)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [session.account.id, rows],
      );
    return session;
  }

  async function signedIn(token: string) {
    const c = new Client(env.url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name: "whoever", token });
    const w = await c.next("welcome");
    return { c, w };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const pg = await import("pg");
    const c = new pg.default.Client({ connectionString: TEST_DB });
    await c.connect();
    await c.query(
      "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
    );
    await c.end();
    const dbm = await import("../../src/server/derpy/DerpyDb");
    closeDb = dbm.closeDerpyDb;
    pool = await dbm.db();
    env = await startServer();
  });

  afterAll(async () => {
    for (const c of clients) c.close();
    await new Promise((r) => env.server.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  test("only an owner hosts 1776; a friend joins free; Legends come to an owner's seat", async () => {
    const owner = await account("Hostess", [
      CAMPAIGN_1776,
      LEGENDS,
      mapStyleItem("pirate"),
    ]);
    const guest = await account("Friend", []);
    const o = await signedIn(owner.token);
    const f = await signedIn(guest.token);
    expect(o.w.dlc).toEqual({
      campaign1776: true,
      legends: true,
      styles: ["pirate"],
    });
    expect(f.w.dlc).toEqual(NO_DLC);

    // The guest can't create a 1776 game, nor choose 1776 in a room of theirs.
    const refused = f.c.next("err");
    f.c.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "normal", start: 1776 },
    });
    expect((await refused).msg).toMatch(/1776/);
    f.c.send({
      t: "create",
      solo: false,
      open: false,
      settings: { difficulty: "normal", start: 1650 },
    });
    const room = await f.c.next("lobby");
    const no = f.c.next("err");
    const back = f.c.next("lobby");
    f.c.send({
      t: "settings",
      settings: { difficulty: "normal", start: 1776 },
      open: false,
    });
    expect((await no).msg).toMatch(/1776/);
    expect((await back).settings.start).toBe(1650);
    f.c.send({ t: "leave" });
    void room;

    // The owner hosts one; the guest joins it.
    o.c.send({
      t: "create",
      solo: false,
      open: false,
      settings: { difficulty: "normal", start: 1776 },
    });
    const hosted = await o.c.next("lobby");
    expect(hosted.settings.start).toBe(1776);
    const joined = f.c.next("lobby");
    f.c.send({ t: "join", code: hosted.code });
    await joined;
    o.c.send({ t: "plan", plan: plan("Abigail") });
    f.c.send({ t: "plan", plan: plan("Josiah") });
    await o.c.next("lobby", (m) => m.seats.filter((x) => x.made).length === 2);
    f.c.send({ t: "ready", ready: true });
    await o.c.next("lobby", (m) =>
      m.seats.some((x) => x.ready && x.id !== m.host),
    );
    const og = o.c.next("game");
    const fg = f.c.next("game");
    o.c.send({ t: "start" });
    const [gOwner, gGuest] = [await og, await fg];
    expect(gOwner.state.settings.start).toBe(1776);
    expect(gOwner.state.settings.endYear).toBe(1801); // CQ24 (r24): to the end of 1800
    expect(gOwner.state.nations.find((n) => n.key === "england")?.name).toBe(
      "the United Colonies",
    );
    // Legends: the owner's own life has them; the friend's doesn't.
    expect(lifeOfSeat(gOwner.state, gOwner.you)?.dlc?.legends).toBe(true);
    expect(lifeOfSeat(gGuest.state, gGuest.you)?.dlc?.legends).toBeFalsy();

    // Saved and left: the friend can't pick it up again; the owner can.
    const saved = o.c.next("saved");
    o.c.send({ t: "save" });
    await saved;
    o.c.send({ t: "leave" });
    f.c.send({ t: "leave" });
    await new Promise((r) => setTimeout(r, 150));
    env.rooms.rooms.delete(gOwner.code);
    const list = f.c.next("rooms");
    f.c.send({ t: "list" });
    const mine = (await list).saved;
    expect(mine.length).toBe(1);
    const cant = f.c.next("err");
    f.c.send({ t: "resume", id: mine[0].id });
    expect((await cant).msg).toMatch(/owns 1776/);
    const can = o.c.next("game");
    o.c.send({ t: "resume", id: mine[0].id });
    expect((await can).state.settings.start).toBe(1776);
  });

  test("ownership is checked again when the game starts", async () => {
    const owner = await account("Refunded", [CAMPAIGN_1776]);
    const o = await signedIn(owner.token);
    o.c.send({
      t: "create",
      solo: true,
      open: false,
      settings: { difficulty: "normal", start: 1776 },
    });
    await o.c.next("lobby");
    o.c.send({ t: "plan", plan: plan("Mercy") });
    await o.c.next("lobby", (m) => m.seats.some((x) => x.made));
    // The item's gone from the account (a refund) before they start.
    await pool.query("DELETE FROM derpy_owned WHERE account_id = $1", [
      owner.account.id,
    ]);
    const err = o.c.next("err");
    o.c.send({ t: "start" });
    expect((await err).msg).toMatch(/1776/);
    expect(o.c.messages.some((m) => m.t === "game")).toBe(false);
  });
});
