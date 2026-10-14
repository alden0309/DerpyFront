// LEGACY (r21): stats and replays show every character a player was. A
// finished game's results carry each line's characters with their stats;
// the site keeps them with each line's chronicle (nothing secret) and shows
// them at /chronicle/<id>, linked from the player's profile. Against
// Postgres, through the rooms server.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { kill, makeCharacter } from "../../src/conquest/engine/Characters";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { lifeOfSeat, meOf } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type {
  ConquestGamePage,
  ServerMessage,
} from "../../src/conquest/Protocol";
import { routeFor } from "../../src/hub/Hub";

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
        8000,
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

const clock = 1_950_000_000_000;
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
  traits: ["robust"],
};

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "every character a player was, on the site (LEGACY r21)",
  () => {
    let rooms: InstanceType<typeof ConquestRooms>;
    let server: http.Server;
    let url: string;
    let api: http.Server;
    let apiUrl: string;
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
      rooms = new ConquestRooms(() => clock);
      server = http.createServer();
      attachConquest(server, rooms);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
      const { derpyApiRouter } =
        await import("../../src/server/derpy/DerpyApi");
      const app = express();
      app.use("/derpy/api", derpyApiRouter());
      api = app.listen(0, "127.0.0.1");
      await new Promise((r) => api.once("listening", r));
      apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}/derpy/api`;
    });

    afterAll(async () => {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      await new Promise((r) => api.close(r));
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("the results, the game's page and the profile show every character, with their stats and chronicle", async () => {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { profile } = await import("../../src/server/derpy/DerpyGames");
      const session = await register("Alden", "hunter22");
      if (typeof session === "string") throw new Error(session);
      const a = new Client(url);
      await a.open;
      a.send({ t: "hello", name: "whoever", token: session.token });
      await a.next("welcome");
      a.send({
        t: "create",
        solo: true,
        open: false,
        settings: { difficulty: "normal", start: 1700 },
      });
      await a.next("lobby");
      a.send({ t: "plan", plan });
      await a.next("lobby", (m) => m.seats.some((x) => x.made));
      const started = a.next("game");
      a.send({ t: "start" });
      const g = await started;
      const room = rooms.rooms.get(g.code)!;
      const game = room.game!;
      const life = lifeOfSeat(game.state, g.you)!;
      const me = meOf(game.state, life)!;
      // A son grown, a secret, and then Alden dies: his son carries on.
      const son = makeCharacter(game.s, game.rng, {
        nation: me.nation,
        culture: game.s.nations[me.nation].culture,
        religion: me.religion,
        female: false,
        age: 19,
        family: me.family,
        father: me.id,
      });
      son.home = life.home;
      me.children.push(son.id);
      milestone(game, life, "married", "Married Mary Cole", life.prov, {
        quiet: true,
      });
      milestone(game, life, "plot", "Plotted the ruin of a rival", life.prov, {
        sec: true,
      });
      life.tally.days = 3 * 365;
      kill(game, me, "a fever at 47");
      expect(life.c).toBe(son.id);

      const end = a.next("end");
      a.send({ t: "end" });
      const r = (await end).results[0];
      expect(r.chars?.map((c) => c.name)).toEqual([
        "Alden Drackley",
        `${son.first} ${son.family}`,
      ]);
      expect(r.chars![0]).toMatchObject({
        came: "born",
        ended: "died",
        fate: "died of a fever at 47",
        home: "Jamestown",
        spouse: "Mary Cole",
      });
      expect(r.chars![1]).toMatchObject({ came: "heir", ended: "living" });

      // The site keeps them, and each line's chronicle without its secrets.
      const page = (await (
        await fetch(
          `${apiUrl}/conquest/game/${encodeURIComponent(room.saveId!)}`,
        )
      ).json()) as ConquestGamePage;
      expect(page.gameId).toBe(room.saveId);
      expect(page.players).toHaveLength(1);
      const p = page.players[0];
      expect(p).toMatchObject({
        username: "Alden",
        rank: 1,
        line: `${son.first} ${son.family}`,
      });
      expect(p.chars?.map((c) => c.name)).toEqual(r.chars!.map((c) => c.name));
      expect(p.chars![0].stats).toEqual(me.stats);
      expect(p.chronicle?.chapters.map((c) => c.name)).toEqual([
        "Alden Drackley",
        `${son.first} ${son.family}`,
      ]);
      const told = JSON.stringify(p.chronicle);
      expect(told).toMatch(/married Mary Cole/);
      expect(told).not.toMatch(/Plotted|plotted/);
      expect(told).not.toMatch(/"c":/); // people by name, no ids
      expect(p.coins).toBe(r.coins);
      // Nothing there: a 404.
      expect((await fetch(`${apiUrl}/conquest/game/NOPE-1`)).status).toBe(404);
      expect((await fetch(`${apiUrl}/conquest/game/a%20b`)).status).toBe(404);

      // The profile's game row names every character, for its Story link.
      const prof = (await profile("Alden"))!;
      expect(prof.conquest.games[0]).toMatchObject({
        gameId: room.saveId,
        chars: ["Alden Drackley", `${son.first} ${son.family}`],
      });
      // And the site's address for it.
      expect(routeFor(`/chronicle/${room.saveId}`)).toEqual({
        page: "chronicle",
        id: room.saveId,
      });
      a.close();
    }, 60_000);
  },
);
