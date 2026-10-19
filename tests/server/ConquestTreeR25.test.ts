// TREE (r25): the dynasty on the site. A signed-in seat's dynasty (its
// line's family tree and every life on it, no ids, nothing secret) is kept
// with each save and for good when the game ends; the profile lists it, its
// page shows it (by the player's name, which a rename takes along); a game
// finished before dynasties were kept shows the tree its chronicle tells;
// deleting an unfinished game's save takes its dynasty with it. Against
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
import type { DynastyRecord } from "../../src/conquest/engine/DynastyCore";
import type { ServerMessage } from "../../src/conquest/Protocol";
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
  "the dynasty, kept on the site (TREE r25)",
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
        "DROP TABLE IF EXISTS derpy_conquest_dynasties, derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
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

    /** A signed-in solo game begun, with Alden in it. */
    async function begin(token: string) {
      const a = new Client(url);
      await a.open;
      a.send({ t: "hello", name: "whoever", token });
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
      return { a, g, room, game, life };
    }

    async function until(ok: () => Promise<boolean>): Promise<void> {
      for (let i = 0; i < 100; i++) {
        if (await ok()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("timed out");
    }

    async function rowOf(gameId: string) {
      const { db } = await import("../../src/server/derpy/DerpyDb");
      return (
        await (
          await db()
        ).query("SELECT * FROM derpy_conquest_dynasties WHERE game_id = $1", [
          gameId,
        ])
      ).rows;
    }

    test("kept with each save and for good at the end; the profile lists it; its page has every life, nothing secret; a rename takes it along", async () => {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { profile } = await import("../../src/server/derpy/DerpyGames");
      const { renameAccount } =
        await import("../../src/server/derpy/DerpyNames");
      const session = await register("Alden", "hunter22");
      if (typeof session === "string") throw new Error(session);
      const { a, room, game, life } = await begin(session.token);
      const me = meOf(game.state, life)!;
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
      kill(game, me, "a fever at 47");
      expect(life.c).toBe(son.id);

      // Saved: the dynasty is kept beside the save (a save of the start
      // that's still under way is let finish first).
      if (room.saving) await room.saving;
      a.send({ t: "save" });
      const id = room.saveId!;
      // (A "saved" may still be on its way from that earlier save.)
      await until(async () => (await rowOf(id))[0]?.lives === 2);
      let rows = await rowOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        family: "Drackley",
        lives: 2,
        over: false,
        names: ["Alden Drackley", `${son.first} ${son.family}`],
      });
      const kept = rows[0].record as DynastyRecord;
      expect(kept.line).toHaveLength(2);
      expect(JSON.stringify(kept)).not.toMatch(/"c":/);
      expect(JSON.stringify(kept)).not.toMatch(/Plotted|plotted/);
      expect(kept.people[kept.line[0]].life?.fate).toBe(
        "died of a fever at 47",
      );

      // The profile lists it while it's played.
      let prof = (await profile("Alden"))!;
      expect(prof.conquest.dynasties!).toHaveLength(1);
      expect(prof.conquest.dynasties![0]).toMatchObject({
        gameId: id,
        kind: "kept",
        over: false,
        lives: 2,
        family: "Drackley",
      });

      // The end keeps it for good.
      const end = a.next("end");
      a.send({ t: "end" });
      await end;
      rows = await rowOf(id);
      expect(rows[0].over).toBe(true);
      // Once over, a later save doesn't change it.
      const { keepDynasty } =
        await import("../../src/server/derpy/ConquestDynasties");
      await keepDynasty(id, session.account.id, {
        ...kept,
        family: "Changed",
        over: false,
      });
      expect((await rowOf(id))[0].family).toBe("Drackley");

      // Its page, by the player's name.
      const res = await fetch(
        `${apiUrl}/players/Alden/dynasty/${encodeURIComponent(id)}`,
      );
      expect(res.status).toBe(200);
      const page = (await res.json()) as {
        username: string;
        record: DynastyRecord;
        summary: { over: boolean; kind: string };
      };
      expect(page.username).toBe("Alden");
      expect(page.summary).toMatchObject({ over: true, kind: "kept" });
      // Alden and his son (his wife is only a name in his moments here).
      expect(page.record.people.map((x) => x.first)).toEqual([
        "Alden",
        son.first,
      ]);
      expect(page.record.people[1].father).toBe(0);
      expect(
        (await fetch(`${apiUrl}/players/Alden/dynasty/NOPE-1`)).status,
      ).toBe(404);
      expect(
        (await fetch(`${apiUrl}/players/Nobody/dynasty/${id}`)).status,
      ).toBe(404);
      expect((await fetch(`${apiUrl}/players/a%20b/dynasty/${id}`)).status).toBe(
        404,
      );

      // A rename takes it along; the old name still finds it a while.
      expect(
        await renameAccount(session.account.id, "Alden_Two"),
      ).toMatchObject({ ok: true });
      prof = (await profile("Alden_Two"))!;
      expect(prof.conquest.dynasties!.map((d) => d.gameId)).toEqual([id]);
      const old = (await (
        await fetch(`${apiUrl}/players/Alden/dynasty/${id}`)
      ).json()) as { username: string };
      expect(old.username).toBe("Alden_Two");
      // And the site's address for its page.
      expect(routeFor(`/dynasty/Alden_Two/${id}`)).toEqual({
        page: "dynasty",
        name: "Alden_Two",
        id,
      });
      a.close();
    }, 60_000);

    test("a game finished before dynasties were kept shows the tree its chronicle tells; deleting an unfinished game takes its dynasty", async () => {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { db } = await import("../../src/server/derpy/DerpyDb");
      const { dynastiesOf, dynastyFor } =
        await import("../../src/server/derpy/ConquestDynasties");
      const { deleteSave } =
        await import("../../src/server/derpy/ConquestSaves");
      const session = await register("Bea", "hunter22");
      if (typeof session === "string") throw new Error(session);
      const pool = await db();
      // A finished game from round 21 on: its characters and chronicle, no dynasty.
      const chars = [
        {
          name: "Amos Fell",
          female: false,
          born: 1680,
          from: 1700,
          to: 1740,
          came: "born",
          ended: "died",
          fate: "died of old age at 60",
          age: 60,
          title: "Master cooper",
          office: null,
          home: "Boston",
          renown: 40,
          purse: 120,
          earned: 900,
          children: 2,
          battles: 0,
          battlesWon: 0,
          duels: 0,
          wounds: 0,
          places: 3,
          skills: [["Craft", 12]],
          traits: ["honest"],
        },
        {
          name: "Ruth Fell",
          female: true,
          born: 1712,
          from: 1740,
          to: null,
          came: "heir",
          ended: "living",
          fate: "living in 1776",
          age: 64,
          title: "Mistress of the cooperage",
          office: null,
          home: "Boston",
          renown: 20,
          purse: 300,
          earned: 500,
          children: 0,
          battles: 0,
          battlesWon: 0,
          duels: 0,
          wounds: 0,
          places: 1,
          skills: [],
          traits: [],
        },
      ];
      const chronicle = {
        title: "The Fell line, 1700 to 1776",
        chapters: [
          { name: "Amos Fell", paras: ["Amos Fell began at Boston."] },
          { name: "Ruth Fell", paras: ["Ruth Fell kept the shop."] },
        ],
        tree: [
          {
            name: "Amos Fell",
            years: "1680–1740",
            came: "born",
            spouses: ["Hannah Fell"],
            children: [
              { name: "Ruth", born: 1712, heir: true, young: false },
              { name: "Caleb", born: 1715, heir: false, young: true },
            ],
          },
          {
            name: "Ruth Fell",
            years: "1712–",
            came: "heir",
            spouses: [],
            children: [],
          },
        ],
      };
      await pool.query(
        `INSERT INTO derpy_conquest_games (game_id, started_at, ended_at,
           duration_s, end_year, final_year, difficulty, num_players, winner, summary)
         VALUES ('OLD-1', now() - interval '2 days', now() - interval '1 day',
           3600, 1776, 1776, 'normal', 1, 'Ruth Fell (Bea)', $1)`,
        [
          JSON.stringify([
            {
              name: "Bea",
              nation: "england",
              rank: 1,
              score: 50,
              won: true,
              account: true,
              line: "Ruth Fell",
              chars,
              chronicle,
            },
          ]),
        ],
      );
      await pool.query(
        `INSERT INTO derpy_conquest_players (game_id, account_id, username,
           nation, won, rank, score, provinces, peak_provinces, colonies,
           battles_won, conquests, gold_earned, coins)
         VALUES ('OLD-1', $1, 'Bea', 'england', true, 1, 50, 1, 1, 0, 0, 0, 0, 10)`,
        [session.account.id],
      );
      const list = await dynastiesOf(session.account.id);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        gameId: "OLD-1",
        kind: "story",
        family: "Fell",
        from: 1700,
        to: 1776,
        lives: 2,
        names: ["Amos Fell", "Ruth Fell"],
      });
      const page = (await dynastyFor("bea", "OLD-1"))!;
      expect(page.record.thin).toBe(true);
      const firsts = page.record.people.map((p) => p.first);
      expect(firsts).toEqual(["Amos", "Hannah", "Ruth", "Caleb"]);
      const ruth = page.record.people[2];
      expect(ruth.life?.n).toBe(2);
      expect(ruth.female).toBe(true);
      expect(ruth.father).toBe(0);
      expect(ruth.mother).toBe(1);
      expect(page.record.people[3]).toMatchObject({ young: true, dead: true });

      // An unfinished game, saved and then deleted: its dynasty goes with it.
      const { a, room } = await begin(session.token);
      a.send({ t: "save" });
      const id = room.saveId!;
      await until(async () => (await rowOf(id)).length === 1);
      expect(
        (await dynastiesOf(session.account.id)).map((d) => d.gameId),
      ).toContain(id);
      if (room.saving) await room.saving;
      expect(await deleteSave(id, session.account.id)).toBe(true);
      expect(await rowOf(id)).toHaveLength(0);
      a.close();
    }, 60_000);
  },
);
