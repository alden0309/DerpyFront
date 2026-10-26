// DFX (r26): watch-together rooms. The rooms themselves with a fake clock
// and fake connections; their socket on a real server (beside Conquest's);
// and the HTTP routes against Postgres (DERPY_TEST_DATABASE_URL), which
// make a room only for a game that's saved.

import { CloseCode } from "@openfront/shared/CloseCodes";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import type pg from "pg";
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
import {
  WATCH_REACTIONS,
  WATCH_WS_PATH,
  type WatchServerMessage,
} from "../../src/derpland/WatchTypes";
import {
  ReplayRooms,
  WATCH_LIMITS,
  type WatchConn,
  type WatchSession,
} from "../../src/server/derpy/ReplayRooms";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const GAME = { id: "AbCd1234", map: "Europe", scenario: null };

class FakeConn implements WatchConn {
  sent: WatchServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(msg: WatchServerMessage) {
    this.sent.push(msg);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  last<T extends WatchServerMessage["t"]>(
    t: T,
  ): Extract<WatchServerMessage, { t: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--)
      if (this.sent[i].t === t)
        return this.sent[i] as Extract<WatchServerMessage, { t: T }>;
    return undefined;
  }
  all<T extends WatchServerMessage["t"]>(
    t: T,
  ): Extract<WatchServerMessage, { t: T }>[] {
    return this.sent.filter((m) => m.t === t) as Extract<
      WatchServerMessage,
      { t: T }
    >[];
  }
}

const flush = () => new Promise((r) => setImmediate(r));

describe("watch-together rooms", () => {
  let now = 1_000_000;
  let rooms: ReplayRooms;
  const accounts = new Map([["tok-pat", { id: 7, username: "Tester_Pat" }]]);

  beforeEach(() => {
    now = 1_000_000;
    rooms = new ReplayRooms(
      () => now,
      { ...WATCH_LIMITS },
      async (token) => accounts.get(token) ?? null,
    );
  });

  /** Someone opens the room's page. */
  async function join(
    room: string,
    opts: { key?: string; token?: string; name?: string } = {},
  ): Promise<{ conn: FakeConn; s: WatchSession; you: number }> {
    const conn = new FakeConn();
    const s = rooms.connect(conn);
    s.message(JSON.stringify({ t: "join", room, ...opts }));
    await flush();
    return { conn, s, you: conn.last("welcome")?.you ?? 0 };
  }

  const say = (s: WatchSession, msg: object) => s.message(JSON.stringify(msg));

  test("a room is made for a game, and the one with its key hosts it", async () => {
    const made = rooms.create(GAME, 600);
    if (made === "too_many_rooms") throw new Error("refused");
    expect(made.room).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(made.key.length).toBeGreaterThanOrEqual(20);
    expect(rooms.has(made.room)).toBe(true);

    // Someone with the link got there first: they hold it until the host comes.
    const early = await join(made.room, { name: "Early" });
    expect(early.conn.last("welcome")?.room.host).toBe(early.you);

    const host = await join(made.room, { key: made.key, token: "tok-pat" });
    const w = host.conn.last("welcome")!;
    expect(w.room.game).toEqual(GAME);
    expect(w.room.host).toBe(host.you);
    // The controls stay where they were; the host can take them.
    expect(w.room.ctl).toBe(early.you);
    expect(w.room.members.map((m) => m.name)).toEqual(["Early", "Tester_Pat"]);
    expect(w.room.members[1].account).toBe(true);
    expect(w.room.clock).toEqual({
      frame: 0,
      playing: false,
      speed: 1,
      at: 1_000_000,
    });
    // Everyone else hears who's in.
    expect(early.conn.last("members")?.members.length).toBe(2);
    expect(early.conn.last("members")?.host).toBe(host.you);

    // A wrong key hosts nothing.
    const other = await join(made.room, { key: "x".repeat(24) });
    expect(other.conn.last("welcome")?.room.host).toBe(host.you);
  });

  test("a guest goes by their name (made clean), or Guest n", async () => {
    const made = rooms.create(GAME, 600) as { room: string; key: string };
    const a = await join(made.room, { name: "  Alden <b>!!  " });
    const b = await join(made.room);
    const names = b.conn.last("welcome")!.room.members.map((m) => m.name);
    expect(names[0]).toBe("Alden b");
    expect(names[1]).toBe(`Guest ${b.you}`);
    expect(a.you).not.toBe(b.you);
  });

  test("a bad room is refused and the socket closed", async () => {
    const { conn } = await join("NoSuchRoom");
    expect(conn.last("error")?.code).toBe("no_such_room");
    expect(conn.closed?.code).toBe(CloseCode.GameNotFound);
    // Malformed ids never reach a lookup.
    const c2 = new FakeConn();
    rooms.connect(c2).message(JSON.stringify({ t: "join", room: "../x" }));
    await flush();
    expect(c2.last("error")?.code).toBe("bad_message");
    // Nor do messages before joining.
    const c3 = new FakeConn();
    rooms.connect(c3).message(JSON.stringify({ t: "react", e: 16 }));
    expect(c3.last("error")?.code).toBe("bad_message");
  });

  test("the host's controls reach every viewer, and only theirs count", async () => {
    const { room, key } = rooms.create(GAME, 600) as {
      room: string;
      key: string;
    };
    const host = await join(room, { key });
    const a = await join(room);
    const b = await join(room);

    now += 1000;
    say(host.s, { t: "ctl", op: "play", frame: 40, seq: 1 });
    for (const v of [host, a, b]) {
      const c = v.conn.last("clock")!;
      expect(c.clock).toEqual({
        frame: 40,
        playing: true,
        speed: 1,
        at: now,
      });
      expect(c.by).toBe(host.you);
      expect(c.op).toBe("play");
    }
    // Its own change comes back with its number.
    expect(host.conn.last("clock")?.seq).toBe(1);

    now += 500;
    say(host.s, { t: "ctl", op: "speed", frame: 45, speed: 8 });
    expect(a.conn.last("clock")?.clock).toMatchObject({
      frame: 45,
      speed: 8,
      playing: true,
    });
    say(host.s, { t: "ctl", op: "seek", frame: 1200 });
    expect(b.conn.last("clock")?.clock).toMatchObject({
      frame: 1200,
      playing: true,
    });
    say(host.s, { t: "ctl", op: "pause", frame: 1210 });
    expect(b.conn.last("clock")?.clock).toMatchObject({
      frame: 1210,
      playing: false,
      speed: 8,
    });
    // Speeds the viewer doesn't have are refused.
    say(host.s, { t: "ctl", op: "speed", frame: 1, speed: 3 });
    expect(host.conn.last("error")?.code).toBe("bad_message");
    // The clock never names a frame past the game (600 s plus room to spare).
    say(host.s, { t: "ctl", op: "seek", frame: 99_999_999 });
    expect(a.conn.last("clock")?.clock.frame).toBe((600 + 600) * 10);

    // Someone without the controls: refused, and told where the room is.
    const before = b.conn.all("clock").length;
    say(a.s, { t: "ctl", op: "seek", frame: 5 });
    expect(a.conn.last("error")?.code).toBe("not_in_control");
    expect(a.conn.last("clock")?.clock.frame).toBe(12_000);
    expect(b.conn.all("clock").length).toBe(before);
  });

  test("a late joiner gets the room's clock and works out the moment", async () => {
    const { room, key } = rooms.create(GAME, 3600) as {
      room: string;
      key: string;
    };
    const host = await join(room, { key });
    say(host.s, { t: "ctl", op: "speed", frame: 0, speed: 4 });
    say(host.s, { t: "ctl", op: "play", frame: 100 });
    const started = now;
    now += 30_000; // half a minute at x4
    const late = await join(room);
    const w = late.conn.last("welcome")!;
    expect(w.room.clock).toEqual({
      frame: 100,
      playing: true,
      speed: 4,
      at: started,
    });
    expect(w.now).toBe(now);
    // 30 s at x4, 10 frames a second: 1200 frames on.
    const { clockFrameAt } = await import("../../src/client/replay/WatchSync");
    expect(clockFrameAt(w.room.clock, w.now)).toBe(1300);
  });

  test("the host's rewind moves every viewer back, playing or paused", async () => {
    const { WatchSync, ServerTime } =
      await import("../../src/client/replay/WatchSync");
    const { rewindFrame, REWIND_LONG_S, REWIND_SHORT_S } =
      await import("../../src/client/replay/ReplayControls");
    const { room, key } = rooms.create(GAME, 3600) as {
      room: string;
      key: string;
    };
    /** A viewer: the room's real messages drive its WatchSync and playback. */
    async function viewer(opts: { key?: string }) {
      const pb = {
        frame: -1,
        totalFrames: 36_000,
        playing: false,
        speed: 1,
        live: false,
        seeks: [] as number[],
        play() {
          this.playing = true;
        },
        pause() {
          this.playing = false;
        },
        async seek(f: number) {
          this.seeks.push(f);
          this.frame = f;
        },
        setSpeed(sp: number) {
          this.speed = sp;
        },
      };
      let session: WatchSession | null = null;
      const sync = new WatchSync(
        (m) => session?.message(JSON.stringify(m)),
        new ServerTime(() => now),
        () => now,
      );
      const conn = new FakeConn();
      conn.send = (m) => {
        conn.sent.push(m);
        sync.receive(m);
      };
      session = rooms.connect(conn);
      session.message(JSON.stringify({ t: "join", room, ...opts }));
      await flush();
      sync.attach(pb);
      return { sync, pb };
    }
    const host = await viewer({ key });
    const guests = [await viewer({}), await viewer({})];
    expect(host.sync.inControl).toBe(true);

    // Playing at x2, three minutes in.
    host.sync.setSpeed(2);
    host.sync.seek(1800);
    host.sync.togglePlay();
    for (const v of [host, ...guests]) {
      expect(v.pb.frame).toBe(1800);
      expect(v.pb.playing).toBe(true);
    }

    // Back a minute: everyone is there and still playing.
    now += 1000;
    const here = host.pb.frame;
    host.sync.seek(rewindFrame(here, REWIND_LONG_S));
    for (const v of [host, ...guests]) {
      expect(v.pb.frame).toBe(1200);
      expect(v.pb.playing).toBe(true);
    }

    // Paused, back 10 seconds, then to the start: exactly there for all.
    now += 1000;
    host.sync.togglePlay();
    now += 1000;
    host.sync.seek(rewindFrame(host.pb.frame, REWIND_SHORT_S));
    const at = host.pb.frame;
    for (const g of guests) {
      expect(g.pb.playing).toBe(false);
      expect(g.pb.frame).toBe(at);
    }
    now += 1000;
    host.sync.seek(0);
    for (const v of [host, ...guests]) expect(v.pb.frame).toBe(0);

    // A guest can't rewind the room.
    now += 1000;
    guests[0].sync.seek(500);
    for (const v of [host, ...guests]) expect(v.pb.frame).toBe(0);
  });

  test("the controls are handed on, and the host takes them back", async () => {
    const { room, key } = rooms.create(GAME, 600) as {
      room: string;
      key: string;
    };
    const host = await join(room, { key });
    const a = await join(room);
    const b = await join(room);

    // Only the host or whoever holds the controls hands them on.
    say(b.s, { t: "hand", to: b.you });
    expect(b.conn.last("error")?.code).toBe("not_in_control");

    say(host.s, { t: "hand", to: a.you });
    expect(b.conn.last("members")?.ctl).toBe(a.you);
    say(a.s, { t: "ctl", op: "play", frame: 10 });
    expect(b.conn.last("clock")?.by).toBe(a.you);
    say(host.s, { t: "ctl", op: "pause", frame: 1 });
    expect(host.conn.last("error")?.code).toBe("not_in_control");

    // Whoever holds them may pass them on too.
    say(a.s, { t: "hand", to: b.you });
    expect(host.conn.last("members")?.ctl).toBe(b.you);
    say(a.s, { t: "take" });
    expect(a.conn.last("error")?.code).toBe("not_host");
    say(host.s, { t: "take" });
    expect(a.conn.last("members")?.ctl).toBe(host.you);
    say(host.s, { t: "hand", to: 999 });
    expect(host.conn.last("error")?.code).toBe("no_such_member");
  });

  test("leaving: the controls and the host pass on, and the host's key brings them back", async () => {
    const { room, key } = rooms.create(GAME, 600) as {
      room: string;
      key: string;
    };
    const host = await join(room, { key });
    const a = await join(room);
    const b = await join(room);
    say(host.s, { t: "hand", to: b.you });

    // The one at the controls leaves: they go back to the host.
    b.s.close();
    expect(a.conn.last("members")).toMatchObject({
      host: host.you,
      ctl: host.you,
    });
    expect(a.conn.last("members")?.members.map((m) => m.id)).toEqual([
      host.you,
      a.you,
    ]);
    // The host leaves: whoever's been in longest hosts and holds them.
    host.s.close();
    expect(a.conn.last("members")).toMatchObject({ host: a.you, ctl: a.you });
    // The host comes back (a reload, with its key): hosting again; the
    // controls stay where they are until taken.
    const back = await join(room, { key });
    expect(back.conn.last("welcome")?.room).toMatchObject({
      host: back.you,
      ctl: a.you,
    });
  });

  test("a room closes when it's been empty a little while, and a new one nobody came to", async () => {
    const { room } = rooms.create(GAME, 600) as { room: string };
    const v = await join(room);
    v.s.close();
    // A reload is quicker than this.
    now += WATCH_LIMITS.emptyGraceMs - 1;
    rooms.sweep();
    expect(rooms.has(room)).toBe(true);
    const again = await join(room);
    expect(again.conn.last("welcome")).toBeDefined();
    again.s.close();
    now += WATCH_LIMITS.emptyGraceMs;
    rooms.sweep();
    expect(rooms.has(room)).toBe(false);
    expect(rooms.count()).toEqual({ rooms: 0, people: 0 });
    // Gone: joining is refused.
    const late = await join(room);
    expect(late.conn.last("error")?.code).toBe("no_such_room");

    // Made and never joined: it waits longer, then goes.
    const { room: unused } = rooms.create(GAME, 600) as { room: string };
    now += WATCH_LIMITS.emptyGraceMs;
    rooms.sweep();
    expect(rooms.has(unused)).toBe(true);
    now += WATCH_LIMITS.joinGraceMs;
    rooms.sweep();
    expect(rooms.has(unused)).toBe(false);
  });

  test("rate limits: controls, reactions, floods, rooms and seats", async () => {
    const { room, key } = rooms.create(GAME, 600) as {
      room: string;
      key: string;
    };
    const host = await join(room, { key });
    const a = await join(room);

    // A burst of timeline moves goes through, then it's limited...
    let ok = 0;
    for (let i = 0; i < WATCH_LIMITS.ctlBurst + 5; i++) {
      const before = a.conn.all("clock").length;
      say(host.s, { t: "ctl", op: "seek", frame: i });
      if (a.conn.all("clock").length > before) ok++;
    }
    expect(ok).toBe(WATCH_LIMITS.ctlBurst);
    expect(host.conn.last("error")?.code).toBe("rate_limited");
    // ...and told where the room really is.
    expect(host.conn.last("clock")?.clock.frame).toBe(
      WATCH_LIMITS.ctlBurst - 1,
    );
    // ...until a moment has passed.
    now += 1000;
    say(host.s, { t: "ctl", op: "seek", frame: 500 });
    expect(a.conn.last("clock")?.clock.frame).toBe(500);

    // Reactions: a few, then one every two seconds; only the room's own.
    let reacted = 0;
    for (let i = 0; i < 10; i++) {
      const before = host.conn.all("react").length;
      say(a.s, { t: "react", e: WATCH_REACTIONS[0] });
      if (host.conn.all("react").length > before) reacted++;
    }
    expect(reacted).toBe(WATCH_LIMITS.reactBurst);
    now += 2000;
    say(a.s, { t: "react", e: WATCH_REACTIONS[1] });
    expect(host.conn.last("react")).toMatchObject({
      from: a.you,
      e: WATCH_REACTIONS[1],
    });
    now += 2000;
    say(a.s, { t: "react", e: 14 });
    expect(a.conn.last("error")?.code).toBe("bad_message");

    // A flood closes the connection.
    now += 5000;
    for (let i = 0; i <= WATCH_LIMITS.floodPerSecond; i++)
      say(a.s, { t: "ping" });
    expect(a.conn.closed?.code).toBe(CloseCode.TryAgainLater);

    // Seats in a room, and rooms in all.
    const small = new ReplayRooms(() => now, {
      ...WATCH_LIMITS,
      maxMembers: 2,
      maxRooms: 2,
    });
    const r1 = small.create(GAME, 60) as { room: string };
    expect(small.create(GAME, 60)).not.toBe("too_many_rooms");
    expect(small.create(GAME, 60)).toBe("too_many_rooms");
    const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
    for (const c of conns)
      small.connect(c).message(JSON.stringify({ t: "join", room: r1.room }));
    await flush();
    expect(conns[2].last("error")?.code).toBe("room_full");
    expect(conns[2].closed).not.toBeNull();
  });

  test("a connection that never joins is closed", async () => {
    vi.useFakeTimers();
    try {
      const conn = new FakeConn();
      rooms.connect(conn);
      vi.advanceTimersByTime(WATCH_LIMITS.joinTimeoutMs + 1);
      expect(conn.closed?.code).toBe(CloseCode.BadRequest);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("watch-together rooms over sockets, beside Conquest's", () => {
  let server: http.Server;
  let rooms: ReplayRooms;
  let url = "";

  beforeAll(async () => {
    const { attachReplayRooms } =
      await import("../../src/server/derpy/ReplayRooms");
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    server = http.createServer();
    rooms = new ReplayRooms();
    attachReplayRooms(server, rooms);
    attachConquest(server, new ConquestRooms());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  function client(path: string) {
    const ws = new WebSocket(url + path);
    const got: WatchServerMessage[] = [];
    ws.on("message", (d) => got.push(JSON.parse(d.toString())));
    const next = (t: string) =>
      vi.waitFor(
        () => {
          const m = got.find((x) => x.t === t);
          if (!m) throw new Error(`no ${t} yet`);
          got.splice(got.indexOf(m), 1);
          return m;
        },
        { timeout: 3000 },
      );
    return { ws, got, next };
  }

  test("two viewers in one room: the host plays, the other hears it", async () => {
    const { room, key } = rooms.create(GAME, 600) as {
      room: string;
      key: string;
    };
    const host = client(WATCH_WS_PATH);
    await new Promise((r) => host.ws.once("open", r));
    host.ws.send(JSON.stringify({ t: "join", room, key }));
    await host.next("welcome");
    const viewer = client(WATCH_WS_PATH);
    await new Promise((r) => viewer.ws.once("open", r));
    viewer.ws.send(JSON.stringify({ t: "join", room }));
    const w = (await viewer.next("welcome")) as Extract<
      WatchServerMessage,
      { t: "welcome" }
    >;
    expect(w.room.members).toHaveLength(2);
    host.ws.send(JSON.stringify({ t: "ctl", op: "play", frame: 77 }));
    const c = (await viewer.next("clock")) as Extract<
      WatchServerMessage,
      { t: "clock" }
    >;
    expect(c.clock).toMatchObject({ frame: 77, playing: true });
    viewer.ws.close();
    host.ws.close();
    await vi.waitFor(() => expect(rooms.count().people).toBe(0));
  });

  test("Conquest's socket still works, and unknown paths are refused", async () => {
    const cq = client("/conquest/ws");
    await new Promise((r, j) => {
      cq.ws.once("open", r);
      cq.ws.once("error", j);
    });
    cq.ws.close();
    const bad = new WebSocket(url + "/nope/ws");
    await new Promise<void>((r) => {
      bad.once("error", () => r());
      bad.once("close", () => r());
    });
    expect(bad.readyState).not.toBe(WebSocket.OPEN);
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("making a watch room, against Postgres", () => {
  let base = "";
  let server: http.Server;
  let pool: pg.Pool;
  let closeDb: () => Promise<void>;
  let R: typeof import("../../src/server/derpy/ReplayRooms");
  const SAVED = "WtChSv01";

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const D = await import("../../src/server/derpy/DerpyDb");
    closeDb = D.closeDerpyDb;
    R = await import("../../src/server/derpy/ReplayRooms");
    const { derpyApiRouter } = await import("../../src/server/derpy/DerpyApi");
    const app = express();
    app.set("trust proxy", false);
    app.use("/derpy/api", derpyApiRouter());
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/derpy/api`;
    pool = await D.db();
    const { gzipSync } = await import("zlib");
    await pool.query("DELETE FROM derpy_games WHERE game_id = $1", [SAVED]);
    await pool.query(
      `INSERT INTO derpy_games (game_id, map, mode, game_type, started_at,
         ended_at, duration_s, winner, num_players, awards, record, scenario)
       VALUES ($1, 'Europe', 'Free For All', 'Singleplayer', now(), now(),
         321, NULL, 1, '[]', $2, 'europe1939')`,
      [SAVED, gzipSync(Buffer.from("{}"))],
    );
  }, 60_000);

  afterEach(() => R.replayRooms.clear());

  afterAll(async () => {
    await pool?.query("DELETE FROM derpy_games WHERE game_id = $1", [SAVED]);
    await new Promise((r) => server?.close(r));
    await closeDb?.();
    delete process.env.DATABASE_URL;
  });

  async function post(body: unknown) {
    const res = await fetch(`${base}/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  }

  test("a saved game gets a room; an unknown or malformed id doesn't", async () => {
    const ok = await post({ gameId: SAVED });
    expect(ok.status).toBe(200);
    expect(R.replayRooms.has(ok.json.room)).toBe(true);
    expect(R.replayRooms.view(ok.json.room)?.game).toEqual({
      id: SAVED,
      map: "Europe",
      scenario: "europe1939",
    });

    const missing = await post({ gameId: "NoSuch12" });
    expect(missing).toEqual({ status: 404, json: { error: "no_such_game" } });
    const bad = await post({ gameId: "../../etc" });
    expect(bad).toEqual({ status: 400, json: { error: "invalid" } });
    expect((await post({})).status).toBe(400);
    expect(R.replayRooms.count().rooms).toBe(1);
  });

  test("rooms are made a few at a time per address", async () => {
    let limited = false;
    for (let i = 0; i < 20 && !limited; i++) {
      const r = await post({ gameId: SAVED });
      if (r.status === 429) {
        expect(r.json).toEqual({ error: "rate_limited" });
        limited = true;
      }
    }
    expect(limited).toBe(true);
  });
});
