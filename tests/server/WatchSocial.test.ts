// DFX (r26): watch-together rooms in who's online: where someone is (never
// the room's id), Join on their row while the room is open, invites through
// the bell, and the party's pull into the room. The parts that need no
// database first, then the invites and the party against Postgres
// (DERPY_TEST_DATABASE_URL).

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
import {
  isAt,
  joinHref,
  placeOf,
  readClientWhere,
  targetOf,
  whereRank,
} from "../../src/server/derpy/Presence";
import { replayRooms } from "../../src/server/derpy/ReplayRooms";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const GAME = { id: "AbCd1234", map: "Europe", scenario: null };

function openRoom(): string {
  const made = replayRooms.create(GAME, 600);
  if (made === "too_many_rooms") throw new Error("refused");
  return made.room;
}

describe("a watch room in who's online", () => {
  beforeEach(() => replayRooms.clear());

  test("a page in a room says so; anything else is read as around", () => {
    const room = openRoom();
    expect(readClientWhere({ k: "df-replay", room, map: "Europe" })).toEqual({
      k: "df-replay",
      room,
      map: "Europe",
    });
    expect(readClientWhere({ k: "df-replay", room: "../bad" })).toEqual({
      k: "around",
    });
    expect(whereRank({ k: "df-replay", room })).toBe(2);
  });

  test("others see where, never the room's id; the link is the way in while it's open", () => {
    const room = openRoom();
    const w = { k: "df-replay" as const, room, map: "Europe" };
    expect(placeOf(w)).toEqual({ k: "df-replay", map: "Europe" });
    expect(JSON.stringify(placeOf(w))).not.toContain(room);
    const t = targetOf(w);
    expect(t).toEqual({ game: "replay", id: room, private: true });
    expect(joinHref(t!, "a-pass-it-never-needs")).toBe(`/watch/${room}`);
    expect(isAt(w, t!)).toBe(true);
    expect(isAt({ k: "df-menu" }, t!)).toBe(false);
    // A room that closed (or never was) is nothing to join.
    expect(targetOf({ k: "df-replay", room: "ClosedRm01" })).toBeNull();
    replayRooms.clear();
    expect(targetOf(w)).toBeNull();
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "watch rooms: invites and the party, against Postgres",
  () => {
    let base = "";
    let server: http.Server;
    let pool: pg.Pool;
    let closeDb: () => Promise<void>;
    let P: typeof import("../../src/server/derpy/Presence");
    let S: typeof import("../../src/server/derpy/DerpySocial");
    interface User {
      id: number;
      token: string;
    }
    const users: Record<string, User> = {};
    const ids: number[] = [];

    async function call(path: string, token: string, body?: unknown) {
      const res = await fetch(base + path, {
        method: body !== undefined ? "POST" : "GET",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    }

    async function beat(u: User, where: unknown): Promise<SocialState> {
      const r = await call("/social/beat", u.token, {
        tab: `tab-${u.id}`,
        where,
      });
      expect(r.status).toBe(200);
      return r.json as SocialState;
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const D = await import("../../src/server/derpy/DerpyDb");
      closeDb = D.closeDerpyDb;
      P = await import("../../src/server/derpy/Presence");
      S = await import("../../src/server/derpy/DerpySocial");
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const { derpyApiRouter } =
        await import("../../src/server/derpy/DerpyApi");
      const app = express();
      app.use("/derpy/api", derpyApiRouter());
      server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
      pool = await D.db();
      await pool.query(
        "DELETE FROM derpy_accounts WHERE username_key = ANY($1::text[])",
        [["wt_host", "wt_pat", "wt_gary"]],
      );
      for (const name of ["Wt_Host", "Wt_Pat", "Wt_Gary"]) {
        const s = await register(name, "hunter22");
        if (typeof s === "string") throw new Error(s);
        users[name.slice(3).toLowerCase()] = {
          id: s.account.id,
          token: s.token,
        };
        ids.push(s.account.id);
      }
      await pool.query(
        `INSERT INTO derpy_friends (account_id, friend_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
        [users.host.id, users.pat.id],
      );
    }, 60_000);

    beforeEach(() => {
      P.presence.clear();
      S.resetSocial();
      replayRooms.clear();
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

    test("in a room: Join on your row, and invites through the bell, while it's open", async () => {
      const { host, pat, gary } = users;
      const room = openRoom();
      const mine = await beat(host, { k: "df-replay", room, map: "Europe" });
      expect(mine.me.canInvite).toBe(true);
      expect(mine.me.place).toEqual({ k: "df-replay", map: "Europe" });

      const seen = await beat(gary, { k: "home" });
      const row = seen.online.find((r) => r.id === host.id);
      expect(row?.place).toEqual({ k: "df-replay", map: "Europe" });
      expect(row?.join).toBe(`/watch/${room}`);
      expect(JSON.stringify(row?.place)).not.toContain(room);

      const sent = await call("/social/invite", host.token, { id: gary.id });
      expect(sent.status).toBe(200);
      const got = await beat(gary, { k: "home" });
      expect(got.invites).toMatchObject([
        {
          fromId: host.id,
          game: "replay",
          place: { k: "df-replay", map: "Europe" },
          href: `/watch/${room}`,
        },
      ]);
      // There already: no invite to show, and nobody to invite twice.
      expect(
        (await beat(gary, { k: "df-replay", room, map: "Europe" })).invites,
      ).toEqual([]);
      expect(
        (await call("/social/invite", host.token, { id: gary.id })).json,
      ).toEqual({ error: "already_there" });

      // The room closes: no Join, no invite.
      await beat(gary, { k: "home" });
      replayRooms.clear();
      const after = await beat(gary, { k: "home" });
      expect(after.invites).toEqual([]);
      expect(after.online.find((r) => r.id === host.id)?.join).toBeUndefined();
      expect((await beat(host, { k: "df-replay", room })).me.canInvite).toBe(
        false,
      );
      void pat;
    });

    test("the party's leader in a room: the members are asked to come along", async () => {
      const { host, pat } = users;
      expect(
        (await call("/social/party/invite", host.token, { id: pat.id })).status,
      ).toBe(200);
      expect(
        (
          await call("/social/party/accept", pat.token, {
            id: (await beat(pat, { k: "home" })).partyInvites[0].partyId,
          })
        ).status,
      ).toBe(200);
      const room = openRoom();
      await beat(host, { k: "df-replay", room, map: "Europe" });
      const pull = (await beat(pat, { k: "home" })).party?.pull;
      expect(pull).toMatchObject({
        key: `replay:${room}`,
        href: `/watch/${room}`,
        place: { k: "df-replay", map: "Europe" },
      });
      // Once there, nothing more to ask.
      expect(
        (await beat(pat, { k: "df-replay", room })).party?.pull,
      ).toBeUndefined();
      await call("/social/party/disband", host.token, {});
    });
  },
);
