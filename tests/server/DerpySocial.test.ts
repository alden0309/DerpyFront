// FRIENDS (r25): who's online, friends, game invites and parties, through
// Derp Land's API against a real Postgres.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first). Skipped without one.

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import type pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { SocialState } from "../../src/derpland/SocialTypes";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

const LOBBY = "AbCd1234";
const LOBBY2 = "ZyXw9876";

describe.skipIf(!TEST_DB)(
  "friends, invites and parties, against Postgres",
  () => {
    let base = "";
    let server: http.Server;
    let pool: pg.Pool;
    let closeDb: () => Promise<void>;
    let P: typeof import("../../src/server/derpy/Presence");
    let S: typeof import("../../src/server/derpy/DerpySocial");
    let L: typeof import("../../src/server/derpy/LiveGames");

    interface User {
      id: number;
      token: string;
      name: string;
    }
    const users: Record<string, User> = {};
    const ids: number[] = [];

    async function call(
      path: string,
      opts: { body?: unknown; token?: string; method?: string } = {},
    ) {
      const res = await fetch(base + path, {
        method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
        headers: {
          ...(opts.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    }

    /** A page of `u`'s says where it is; what it's shown back. */
    async function beat(u: User, where: unknown, tab = `tab-${u.name}`) {
      const r = await call("/social/beat", {
        token: u.token,
        body: { tab, where },
      });
      expect(r.status).toBe(200);
      return r.json as SocialState;
    }

    async function state(u: User): Promise<SocialState> {
      const r = await call("/social/state", { token: u.token });
      expect(r.status).toBe(200);
      return r.json as SocialState;
    }

    async function act(u: User, path: string, body: unknown = {}) {
      return call(`/social${path}`, { token: u.token, body });
    }

    const row = (s: SocialState, u: User) =>
      s.online.find((x) => x.id === u.id);

    async function befriend(a: User, b: User) {
      await pool.query(
        `INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
        [a.id, b.id],
      );
      S.forgetAllSocial();
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const pgm = await import("pg");
      const c = new pgm.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query(
        "DROP TABLE IF EXISTS derpy_invites, derpy_party_invites, derpy_party_members, derpy_parties, derpy_friend_requests, derpy_friends, derpy_conquest_days, derpy_conquest_play, derpy_based_slots, derpy_based_notes, derpy_based_picks, derpy_based_saves, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
      );
      await c.end();
      const D = await import("../../src/server/derpy/DerpyDb");
      closeDb = D.closeDerpyDb;
      P = await import("../../src/server/derpy/Presence");
      S = await import("../../src/server/derpy/DerpySocial");
      L = await import("../../src/server/derpy/LiveGames");
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { derpyApiRouter } =
        await import("../../src/server/derpy/DerpyApi");
      const app = express();
      app.use("/derpy/api", derpyApiRouter());
      server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
      pool = await D.db();
      for (const name of [
        "Fr_Alden",
        "Fr_Pat",
        "Fr_Gary",
        "Fr_Mike",
        "Fr_P5",
        "Fr_P6",
        "Fr_P7",
        "Fr_P8",
        "Fr_P9",
        "Fr_P10",
      ]) {
        const s = await register(name, "hunter22");
        if (typeof s === "string") throw new Error(s);
        users[name.slice(3).toLowerCase()] = {
          id: s.account.id,
          token: s.token,
          name,
        };
        ids.push(s.account.id);
      }
    }, 60_000);

    beforeEach(() => {
      // Every test starts with nobody on the site and no limits used.
      P.presence.clear();
      S.resetSocial();
      L.setLiveSources({ derpyfront: () => [], conquest: () => [] });
      L.forgetLiveGames();
    });

    afterAll(async () => {
      if (pool && ids.length > 0)
        await pool
          .query("DELETE FROM derpy_accounts WHERE id = ANY($1::bigint[])", [
            ids,
          ])
          .catch(() => {});
      await new Promise((r) => server?.close(r));
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("who's online: signed-in accounts, by id, and where each is", async () => {
      const { alden, pat, gary, mike } = users;
      await beat(pat, { k: "store" });
      await beat(gary, {
        k: "df-game",
        id: LOBBY,
        lobby: "public",
        map: "World",
      });
      // Mr. Based's pages say "around"; a page that tried to say more is read
      // as "around" too.
      await beat(mike, { k: "based", chapter: 2 });
      const s = await beat(alden, { k: "home" });

      expect(s.me).toMatchObject({
        id: alden.id,
        username: "Fr_Alden",
        appearOffline: false,
        place: { k: "home" },
        canInvite: false,
      });
      expect(row(s, pat)?.place).toEqual({ k: "store" });
      expect(row(s, gary)?.place).toEqual({
        k: "df-game",
        lobby: "public",
        map: "World",
      });
      expect(row(s, mike)?.place).toEqual({ k: "around" });
      // You aren't in your own list, and Mr. Based is never named.
      expect(row(s, alden)).toBeUndefined();
      expect(JSON.stringify(s).toLowerCase()).not.toContain("based");
      // Nobody signed out is listed, and a signed-out page gets nothing.
      expect(s.online).toHaveLength(3);
      const anon = await call("/social/beat", {
        body: { tab: "anon-tab", where: { k: "home" } },
      });
      expect(anon.status).toBe(401);
    });

    test("a page closing (its beacon) takes you off the list at once", async () => {
      const { alden, pat } = users;
      await beat(pat, { k: "home" }, "pat-only-tab");
      expect(row(await beat(alden, { k: "home" }), pat)).toBeDefined();
      // The beacon carries the token in its body (a page unloading can't set headers).
      const left = await call("/social/beat", {
        body: { tab: "pat-only-tab", leaving: true, token: pat.token },
      });
      expect(left.status).toBe(204);
      expect(row(await state(alden), pat)).toBeUndefined();
    });

    test("appearing offline: nobody sees you, it lasts, and you can come back", async () => {
      const { alden, pat } = users;
      await beat(pat, { k: "home" });
      const hid = await act(pat, "/hidden", { hidden: true });
      expect(hid.status).toBe(200);
      expect((hid.json.state as SocialState).me.appearOffline).toBe(true);
      // You still see where you are yourself.
      expect((hid.json.state as SocialState).me.place).toEqual({ k: "home" });
      expect(row(await beat(alden, { k: "home" }), pat)).toBeUndefined();

      // The server starts again: the choice is in the database.
      P.presence.clear();
      await beat(pat, { k: "home" });
      expect(row(await beat(alden, { k: "home" }), pat)).toBeUndefined();
      const db = await pool.query(
        "SELECT appear_offline FROM derpy_accounts WHERE id = $1",
        [pat.id],
      );
      expect(db.rows[0].appear_offline).toBe(true);

      await act(pat, "/hidden", { hidden: false });
      expect(row(await beat(alden, { k: "home" }), pat)?.place).toEqual({
        k: "home",
      });
    });

    test("friends: ask by username, accept, decline, remove", async () => {
      const { alden, pat, gary, mike } = users;
      await beat(pat, { k: "home" });
      await beat(gary, { k: "home" });

      const asked = await act(alden, "/friends/request", {
        username: "fr_PAT",
      });
      expect(asked.status).toBe(200);
      expect(asked.json.status).toBe("sent");
      const mine = asked.json.state as SocialState;
      expect(mine.requests.outgoing.map((r) => r.username)).toEqual(["Fr_Pat"]);
      expect(row(mine, pat)?.requested).toBe("out");
      const theirs = await state(pat);
      expect(theirs.requests.incoming).toMatchObject([
        { id: alden.id, username: "Fr_Alden" },
      ]);

      expect(
        (await act(alden, "/friends/request", { username: "nobody_here" }))
          .json,
      ).toEqual({ error: "no_such_player" });
      expect(
        (await act(alden, "/friends/request", { username: "Fr_Alden" })).status,
      ).toBe(400);

      const ok = await act(pat, "/friends/accept", { id: alden.id });
      expect(ok.status).toBe(200);
      expect(
        (ok.json.state as SocialState).friends.map((f) => f.username),
      ).toEqual(["Fr_Alden"]);
      const a = await beat(alden, { k: "home" });
      expect(a.friends.map((f) => f.username)).toEqual(["Fr_Pat"]);
      expect(a.requests.outgoing).toEqual([]);
      // Friends first in the list, then everyone else.
      expect(a.online.map((r) => r.username)).toEqual(["Fr_Pat", "Fr_Gary"]);
      expect(a.online[0].friend).toBe(true);
      expect(
        (await act(alden, "/friends/request", { username: "Fr_Pat" })).json,
      ).toEqual({ error: "already_friends" });

      // Declined: nothing comes of it.
      await act(gary, "/friends/request", { username: "Fr_Alden" });
      expect((await state(alden)).requests.incoming).toHaveLength(1);
      expect(
        (await act(alden, "/friends/decline", { id: gary.id })).status,
      ).toBe(200);
      expect((await state(gary)).requests.outgoing).toEqual([]);
      expect((await state(alden)).friends).toHaveLength(1);
      // Taken back before it's answered.
      await act(gary, "/friends/request", { username: "Fr_Alden" });
      expect(
        (await act(gary, "/friends/cancel", { id: alden.id })).status,
      ).toBe(200);
      expect((await state(alden)).requests.incoming).toEqual([]);

      // Asking someone who asked you makes you friends.
      await act(mike, "/friends/request", { username: "Fr_Alden" });
      const both = await act(alden, "/friends/request", {
        username: "Fr_Mike",
      });
      expect(both.json.status).toBe("accepted");
      expect((await state(mike)).friends.map((f) => f.username)).toEqual([
        "Fr_Alden",
      ]);

      // Offline friends are listed too, after the ones on the site.
      const list = (await state(alden)).friends;
      expect(list.map((f) => [f.username, !!f.place])).toEqual([
        ["Fr_Pat", true],
        ["Fr_Mike", false],
      ]);

      expect(
        (await act(alden, "/friends/remove", { id: mike.id })).status,
      ).toBe(200);
      expect((await state(mike)).friends).toEqual([]);
      expect(
        (await act(alden, "/friends/remove", { id: mike.id })).json,
      ).toEqual({ error: "not_friends" });
    });

    test("friends see each other's latest games", async () => {
      const { alden, pat, gary } = users;
      await befriend(alden, pat);
      await pool.query(
        `INSERT INTO derpy_games (game_id, map, mode, game_type, started_at,
         ended_at, duration_s, winner, num_players, record)
       VALUES ('FrG1', 'World', 'Free For All', 'Private', now(), now(), 900,
         null, 3, '\\x00')`,
      );
      await pool.query(
        `INSERT INTO derpy_game_players (game_id, account_id, username, won,
         peak_territory_pct, gold_earned, conquests, ships, betrayals, nukes,
         coins)
       VALUES ('FrG1', $1, 'Fr_Pat', true, 40, 1000, 2, 1, 0, 0, 120)`,
        [pat.id],
      );
      const games = await call("/social/friends/games", { token: alden.token });
      expect(games.status).toBe(200);
      expect(games.json.games).toMatchObject([
        {
          game: "derpyfront",
          gameId: "FrG1",
          username: "Fr_Pat",
          won: true,
          where: "World",
        },
      ]);
      // Not friends: not in their feed.
      const not = await call("/social/friends/games", { token: gary.token });
      expect(not.json.games).toEqual([]);
    });

    test("invites: sent from a lobby, joined from the toast, gone with the lobby", async () => {
      const { alden, pat, gary, mike } = users;
      await befriend(alden, pat);
      await beat(pat, { k: "home" });
      await beat(gary, { k: "home" });
      await beat(mike, { k: "home" });

      // Not in a lobby: nothing to invite anyone into.
      await beat(alden, { k: "home" });
      expect((await act(alden, "/invite", { id: gary.id })).json).toEqual({
        error: "not_in_a_game",
      });

      const inLobby = await beat(alden, {
        k: "df-lobby",
        id: LOBBY,
        lobby: "private",
      });
      expect(inLobby.me.canInvite).toBe(true);
      const sent = await act(alden, "/invite", { id: gary.id });
      expect(sent.status).toBe(200);

      const g = await beat(gary, { k: "home" });
      expect(g.invites).toMatchObject([
        {
          fromId: alden.id,
          from: "Fr_Alden",
          game: "derpyfront",
          href: `/game/${LOBBY}`,
          place: { k: "df-lobby", lobby: "private" },
        },
      ]);
      // A private lobby's way in: for the invited and for friends, not everyone.
      expect(row(g, alden)?.join).toBe(`/game/${LOBBY}`);
      expect(row(await state(pat), alden)?.join).toBe(`/game/${LOBBY}`);
      expect(row(await state(mike), alden)?.join).toBeUndefined();
      // The lobby id itself is never shown as where someone is.
      expect(JSON.stringify(row(await state(mike), alden))).not.toContain(
        LOBBY,
      );

      // Asking someone already there.
      await beat(pat, { k: "df-lobby", id: LOBBY, lobby: "private" });
      expect((await act(alden, "/invite", { id: pat.id })).json).toEqual({
        error: "already_there",
      });

      // The lobby goes (alden leaves it for a public one): the invite with it.
      const pub = await beat(alden, {
        k: "df-lobby",
        id: LOBBY2,
        lobby: "public",
      });
      expect(pub.me.canInvite).toBe(true);
      expect((await state(gary)).invites).toEqual([]);
      // A public lobby: anyone may join.
      expect(row(await state(mike), alden)?.join).toBe(`/game/${LOBBY2}`);

      // Invited again; the game starts: no more joining, but it may be watched.
      S.LIMITS.perPerson.clear();
      expect((await act(alden, "/invite", { id: gary.id })).status).toBe(200);
      expect((await state(gary)).invites).toHaveLength(1);
      L.setLiveSources({
        derpyfront: () => [
          {
            game: "derpyfront",
            id: LOBBY2,
            map: "World",
            mapKey: "world",
            mode: "Free For All",
            private: false,
            startedAt: Date.now(),
            players: 4,
            playersLeft: 4,
            watchers: 0,
            full: false,
          },
        ],
      });
      L.forgetLiveGames();
      await beat(alden, {
        k: "df-game",
        id: LOBBY2,
        lobby: "public",
        map: "World",
      });
      const later = await state(gary);
      expect(later.invites).toEqual([]);
      expect(row(later, alden)?.join).toBeUndefined();
      expect(row(later, alden)?.watch).toBe(`/game/${LOBBY2}?spectate`);

      // Old invites run out even if the lobby doesn't.
      await beat(alden, { k: "df-lobby", id: LOBBY, lobby: "private" });
      S.LIMITS.perPerson.clear();
      await act(alden, "/invite", { id: mike.id });
      expect((await state(mike)).invites).toHaveLength(1);
      await pool.query(
        "UPDATE derpy_invites SET created_at = now() - interval '31 minutes' WHERE to_id = $1",
        [mike.id],
      );
      S.forgetAllSocial();
      expect((await state(mike)).invites).toEqual([]);

      // Waved off (or used): gone.
      S.LIMITS.perPerson.clear();
      await act(alden, "/invite", { id: mike.id });
      const inv = (await state(mike)).invites[0];
      expect((await act(mike, "/invite/close", { id: inv.id })).status).toBe(
        200,
      );
      expect((await state(mike)).invites).toEqual([]);
    });

    test("invites into a Derpy Conquest table, from the rooms' own word", async () => {
      const { alden, gary } = users;
      await beat(gary, { k: "home" });
      await beat(alden, { k: "cq-front" });
      P.presence.setDerived(
        () =>
          new Map([
            [
              alden.id,
              {
                k: "cq-game" as const,
                code: "WXYZ",
                joinable: true,
                private: true,
                solo: false,
                year: 1652,
                colony: "Jamestown",
                power: "England",
                watchId: "watch123",
              },
            ],
          ]),
      );
      const a = await state(alden);
      expect(a.me.place).toEqual({
        k: "cq-game",
        year: 1652,
        colony: "Jamestown",
        power: "England",
        private: true,
        solo: false,
      });
      expect(a.me.canInvite).toBe(true);
      expect((await act(alden, "/invite", { id: gary.id })).status).toBe(200);
      const g = await state(gary);
      expect(g.invites[0]).toMatchObject({
        game: "conquest",
        href: "/conquest?join=WXYZ",
      });
      expect(row(g, alden)?.watch).toBe("/conquest?watch=watch123");
      // The table fills: the invite goes.
      P.presence.setDerived(
        () =>
          new Map([
            [
              alden.id,
              {
                k: "cq-game" as const,
                code: "WXYZ",
                joinable: false,
                private: true,
                solo: false,
                year: 1652,
                colony: "Jamestown",
                power: "England",
              },
            ],
          ]),
      );
      expect((await state(gary)).invites).toEqual([]);
    });

    test("limits on friend requests and invites", async () => {
      const { p5, p6, p7 } = users;
      for (let i = 0; i < 10; i++) {
        const r = await act(p5, "/friends/request", { username: "Fr_P6" });
        expect(r.status).toBe(200);
      }
      expect(
        (await act(p5, "/friends/request", { username: "Fr_P6" })).json,
      ).toEqual({ error: "rate_limited" });
      expect(
        (await act(p5, "/friends/request", { username: "Fr_P6" })).status,
      ).toBe(429);

      await beat(p7, { k: "df-lobby", id: LOBBY, lobby: "public" });
      expect((await act(p7, "/invite", { id: p6.id })).status).toBe(200);
      // The same person again straight away: no.
      expect((await act(p7, "/invite", { id: p6.id })).json).toEqual({
        error: "rate_limited",
      });
      // Others still can be (to a point).
      expect((await act(p7, "/invite", { id: p5.id })).status).toBe(200);

      // The limiter forgets what's out of its window.
      let now = 0;
      const lim = new S.Limiter(2, 1000, () => now);
      expect(lim.take("k")).toBe(true);
      expect(lim.take("k")).toBe(true);
      expect(lim.take("k")).toBe(false);
      now = 1000;
      expect(lim.take("k")).toBe(true);
    });

    test("parties: invite friends, the leader pulls them in (they say yes), leave, hand over, disband", async () => {
      const { alden, pat, gary, mike } = users;
      await befriend(alden, pat);
      await befriend(alden, mike);
      await beat(alden, { k: "home" });
      await beat(pat, { k: "home" });
      await beat(mike, { k: "home" });

      // Only friends can be asked.
      expect((await act(alden, "/party/invite", { id: gary.id })).json).toEqual(
        {
          error: "not_friends",
        },
      );
      // Asking makes the party.
      const asked = await act(alden, "/party/invite", { id: pat.id });
      expect(asked.status).toBe(200);
      const mine = asked.json.state as SocialState;
      expect(mine.party).toMatchObject({
        leaderId: alden.id,
        leading: true,
        members: [{ id: alden.id, leader: true }],
        invited: [{ id: pat.id }],
        max: 8,
      });
      const p = await state(pat);
      expect(p.partyInvites).toMatchObject([
        { from: "Fr_Alden", leader: "Fr_Alden", size: 1 },
      ]);
      const joined = await act(pat, "/party/accept", {
        id: p.partyInvites[0].partyId,
      });
      expect(joined.status).toBe(200);
      expect(
        (joined.json.state as SocialState).party?.members.map(
          (m) => m.username,
        ),
      ).toEqual(["Fr_Alden", "Fr_Pat"]);
      expect(row(await state(alden), pat)?.inParty).toBe(true);

      // Mike says no.
      await act(alden, "/party/invite", { id: mike.id });
      const m = await state(mike);
      expect(
        (await act(mike, "/party/decline", { id: m.partyInvites[0].partyId }))
          .status,
      ).toBe(200);
      expect((await state(mike)).partyInvites).toEqual([]);
      expect((await state(alden)).party?.invited).toEqual([]);

      // The leader goes into a lobby: the members are asked to follow.
      await beat(alden, { k: "df-lobby", id: LOBBY, lobby: "private" });
      const pull = (await beat(pat, { k: "home" })).party?.pull;
      expect(pull).toMatchObject({
        key: `derpyfront:${LOBBY}`,
        href: `/game/${LOBBY}`,
        leader: "Fr_Alden",
        place: { k: "df-lobby", lobby: "private" },
      });
      // Mid-game they're asked too, never moved: the page asks before it goes.
      expect(
        (
          await beat(pat, {
            k: "df-game",
            id: "Other123",
            lobby: "public",
            map: "Asia",
          })
        ).party?.pull?.href,
      ).toBe(`/game/${LOBBY}`);
      // Once they're there, nothing to ask.
      expect(
        (await beat(pat, { k: "df-lobby", id: LOBBY, lobby: "private" })).party
          ?.pull,
      ).toBeUndefined();
      // Nobody pulls the leader.
      expect((await state(alden)).party?.pull).toBeUndefined();
      // A Conquest table too.
      P.presence.setDerived(
        () =>
          new Map([
            [
              alden.id,
              {
                k: "cq-room" as const,
                code: "QRST",
                joinable: true,
                private: true,
                solo: false,
              },
            ],
          ]),
      );
      expect((await beat(pat, { k: "home" })).party?.pull?.href).toBe(
        "/conquest?join=QRST",
      );
      P.presence.setDerived(() => new Map());
      await beat(alden, { k: "home" });
      expect((await state(pat)).party?.pull).toBeUndefined();

      // Only the leader hands over or disbands.
      expect((await act(pat, "/party/disband")).json).toEqual({
        error: "not_leader",
      });
      expect((await act(pat, "/party/lead", { id: pat.id })).json).toEqual({
        error: "not_leader",
      });
      expect((await act(alden, "/party/lead", { id: gary.id })).json).toEqual({
        error: "not_member",
      });
      const handed = await act(alden, "/party/lead", { id: pat.id });
      expect((handed.json.state as SocialState).party?.leading).toBe(false);
      expect((await state(pat)).party?.leading).toBe(true);
      // The leader leaves: the one who's been in longest leads.
      expect((await act(pat, "/party/leave")).status).toBe(200);
      expect((await state(pat)).party).toBeNull();
      expect((await state(alden)).party).toMatchObject({
        leaderId: alden.id,
        leading: true,
        members: [{ id: alden.id }],
      });
      // The last one out ends it.
      expect((await act(alden, "/party/leave")).status).toBe(200);
      expect((await state(alden)).party).toBeNull();
      expect((await act(alden, "/party/leave")).json).toEqual({
        error: "no_party",
      });

      // Disbanding ends it for everyone.
      await act(alden, "/party/create");
      expect((await act(alden, "/party/create")).json).toEqual({
        error: "in_a_party",
      });
      S.LIMITS.perPerson.clear();
      await act(alden, "/party/invite", { id: pat.id });
      const pid = (await state(pat)).partyInvites[0].partyId;
      await act(pat, "/party/accept", { id: pid });
      expect((await act(alden, "/party/disband")).status).toBe(200);
      expect((await state(pat)).party).toBeNull();
      expect((await state(alden)).party).toBeNull();
    });

    test("a party holds eight", async () => {
      const { alden, pat, gary, mike, p5, p6, p7, p8, p9 } = users;
      const friends = [pat, gary, mike, p5, p6, p7, p8, p9];
      for (const f of friends) await befriend(alden, f);
      for (const f of friends.slice(0, 7)) {
        expect((await act(alden, "/party/invite", { id: f.id })).status).toBe(
          200,
        );
        const pid = (await state(f)).partyInvites[0].partyId;
        expect((await act(f, "/party/accept", { id: pid })).status).toBe(200);
      }
      expect((await state(alden)).party?.members).toHaveLength(8);
      expect((await act(alden, "/party/invite", { id: p9.id })).json).toEqual({
        error: "party_full",
      });
      await act(alden, "/party/disband");
    });

    test("renames follow: friends, the list and the party go by account", async () => {
      const { alden, pat } = users;
      await befriend(alden, pat);
      await beat(pat, { k: "home" });
      S.LIMITS.perPerson.clear();
      await act(alden, "/party/invite", { id: pat.id });
      const pid = (await state(pat)).partyInvites[0].partyId;
      await act(pat, "/party/accept", { id: pid });
      expect(row(await beat(alden, { k: "home" }), pat)?.username).toBe(
        "Fr_Pat",
      );

      const renamed = await call("/username", {
        token: pat.token,
        body: { username: "Fr_Patricia" },
      });
      expect(renamed.status).toBe(200);

      const a = await state(alden);
      expect(row(a, pat)?.username).toBe("Fr_Patricia");
      // Online friends first: Patricia, under her new name.
      expect(a.friends[0]).toMatchObject({
        id: pat.id,
        username: "Fr_Patricia",
      });
      expect(a.friends.map((f) => f.username)).not.toContain("Fr_Pat");
      expect(a.party?.members.map((x) => x.username)).toEqual([
        "Fr_Alden",
        "Fr_Patricia",
      ]);
      // Asked by the new name, they're the same friend.
      expect(
        (await act(alden, "/friends/request", { username: "Fr_Patricia" }))
          .json,
      ).toEqual({ error: "already_friends" });
      await act(alden, "/party/disband");
    });
  },
);
