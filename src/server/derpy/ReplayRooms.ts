// DFX (r26): watching a replay together. Rooms live here in the master's
// memory: one per saved DerpyFront game being watched together, with the
// people in it, who hosts it, who holds the controls, and its clock (where
// the replay is, whether it plays and how fast). Every viewer runs the
// replay in their own browser; the server only relays the clock and the
// controls, so a room costs a few hundred bytes and a socket per viewer.
//
// A room is made over HTTP (POST /derpy/api/watch, for a game that's saved)
// and joined over the socket at WATCH_WS_PATH. It closes when it's been
// empty for a few seconds (so a reload doesn't end it), or when nobody came
// to a new one.

import { GAME_ID_REGEX } from "@openfront/engine-api/Schemas";
import { CloseCode } from "@openfront/shared/CloseCodes";
import { randomBytes, timingSafeEqual } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type http from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  WATCH_REACTIONS,
  WATCH_ROOM_RE,
  WATCH_SPEEDS,
  WATCH_WS_PATH,
  type WatchClock,
  type WatchCreated,
  type WatchErrorCode,
  type WatchGame,
  type WatchMember,
  type WatchOp,
  type WatchRoomView,
  type WatchServerMessage,
} from "../../derpland/WatchTypes";
import { censorPlayer } from "../Censor";
import { logger } from "../Logger";
import { accountForToken } from "./DerpyAuth";
import { db } from "./DerpyDb";

const log = logger.child({ component: "ReplayRooms" });

export const WATCH_LIMITS = {
  /** Rooms open at once, all together (each is small; this caps the total). */
  maxRooms: 200,
  /** People in one room. */
  maxMembers: 30,
  /** A new room nobody joined closes after this. */
  joinGraceMs: 2 * 60_000,
  /** An empty room closes after this (long enough for a reload). */
  emptyGraceMs: 20_000,
  /** A connection that doesn't join a room in this long is closed. */
  joinTimeoutMs: 15_000,
  /** Control messages: a burst (dragging the timeline), then this many a second. */
  ctlBurst: 20,
  ctlPerSecond: 8,
  /** Reactions: a few at once, then one every two seconds. */
  reactBurst: 4,
  reactPerSecond: 0.5,
  /** Any messages beyond this many a second close the connection. */
  floodPerSecond: 60,
};

/** A connection as the rooms see it (a WebSocket, or a test's fake). */
export interface WatchConn {
  send(msg: WatchServerMessage): void;
  close(code?: number, reason?: string): void;
}

/** Who a session token belongs to (Derp Land's accounts by default). */
export type ResolveAccount = (
  token: string,
) => Promise<{ id: number; username: string } | null>;

class Bucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(
      this.burst,
      this.tokens + ((now - this.last) / 1000) * this.perSecond,
    );
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

interface Member {
  id: number;
  name: string;
  accountId: number | null;
  conn: WatchConn;
  ctl: Bucket;
  react: Bucket;
}

interface Room {
  id: string;
  key: string;
  game: WatchGame;
  /** The furthest frame the clock may name (the game's length, with room to spare). */
  maxFrame: number;
  /** In the order they joined: the first is the longest in the room. */
  members: Map<number, Member>;
  host: number;
  ctl: number;
  clock: WatchClock;
  nextId: number;
  createdAt: number;
  /** Since when nobody's been in it (null while someone is; the creation time before anyone came). */
  emptySince: number | null;
  /** Someone has been in it. */
  joined: boolean;
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomId(length: number): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // 248 = 4 x 62: drop the bytes above it so every letter is as likely.
    if (bytes[i] < 248) out += BASE62[bytes[i] % 62];
  }
  return out.length === length ? out : randomId(length);
}

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const Name = z
  .string()
  .trim()
  .max(40)
  .transform((s) => s.replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 20));

const ClientMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("join"),
    room: z.string().regex(WATCH_ROOM_RE),
    key: z.string().max(64).optional(),
    token: z.string().max(200).optional(),
    name: Name.optional(),
  }),
  z.object({
    t: z.literal("ctl"),
    op: z.enum(["play", "pause", "seek", "speed"]),
    frame: z.number().int().min(0).max(100_000_000),
    speed: z.number().optional(),
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  z.object({ t: z.literal("hand"), to: z.number().int().positive() }),
  z.object({ t: z.literal("take") }),
  z.object({ t: z.literal("react"), e: z.number().int().min(0) }),
  z.object({ t: z.literal("ping") }),
]);

/** One connection's side: what it says, and its going. */
export interface WatchSession {
  message(raw: string): void;
  close(): void;
}

export class ReplayRooms {
  private readonly rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    readonly limits: typeof WATCH_LIMITS = WATCH_LIMITS,
    private readonly resolve: ResolveAccount = async (token) =>
      (await accountForToken(token))?.account ?? null,
  ) {}

  /** Sweep empty rooms now and then (the master; tests call sweep()). */
  start(): void {
    this.sweeper ??= setInterval(() => this.sweep(), 5_000);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  /** A new room for a saved game. Its key makes whoever joins with it the host. */
  create(game: WatchGame, durationS: number): WatchCreated | "too_many_rooms" {
    this.sweep();
    if (this.rooms.size >= this.limits.maxRooms) return "too_many_rooms";
    let id = randomId(10);
    while (this.rooms.has(id)) id = randomId(10);
    const now = this.now();
    const key = randomId(24);
    this.rooms.set(id, {
      id,
      key,
      game,
      maxFrame: Math.max(0, Math.ceil(durationS) + 600) * 10,
      members: new Map(),
      host: 0,
      ctl: 0,
      clock: { frame: 0, playing: false, speed: 1, at: now },
      nextId: 1,
      createdAt: now,
      emptySince: now,
      joined: false,
    });
    return { room: id, key };
  }

  /** Whether `id` is a room that's open. */
  has(id: string): boolean {
    return this.rooms.has(id);
  }

  /** How many rooms are open (and people in them). */
  count(): { rooms: number; people: number } {
    let people = 0;
    for (const r of this.rooms.values()) people += r.members.size;
    return { rooms: this.rooms.size, people };
  }

  /** What a room looks like to someone in it, or null. */
  view(id: string): WatchRoomView | null {
    const r = this.rooms.get(id);
    return r ? this.viewOf(r) : null;
  }

  /** Close rooms empty past their grace. */
  sweep(): void {
    const now = this.now();
    for (const [id, r] of this.rooms) {
      if (r.members.size > 0 || r.emptySince === null) continue;
      const grace = r.joined
        ? this.limits.emptyGraceMs
        : this.limits.joinGraceMs;
      if (now - r.emptySince >= grace) this.rooms.delete(id);
    }
  }

  /** A new connection. It has a while to say which room it's for. */
  connect(conn: WatchConn): WatchSession {
    let room: Room | null = null;
    let member: Member | null = null;
    let joining = false;
    let closed = false;
    let windowStart = this.now();
    let inWindow = 0;
    const timer = setTimeout(() => {
      if (!member && !closed) conn.close(CloseCode.BadRequest, "no room");
    }, this.limits.joinTimeoutMs);
    timer.unref?.();

    const error = (code: WatchErrorCode) =>
      conn.send({ t: "error", code, now: this.now() });

    return {
      message: (raw: string) => {
        if (closed) return;
        const now = this.now();
        if (now - windowStart >= 1000) {
          windowStart = now;
          inWindow = 0;
        }
        if (++inWindow > this.limits.floodPerSecond) {
          // Retryable: the page reconnects (WatchConnection), after a pause.
          conn.close(CloseCode.TryAgainLater, "too many messages");
          return;
        }
        let parsed: z.infer<typeof ClientMessage>;
        try {
          const r = ClientMessage.safeParse(JSON.parse(raw));
          if (!r.success) {
            error("bad_message");
            return;
          }
          parsed = r.data;
        } catch {
          error("bad_message");
          return;
        }
        if (parsed.t === "join") {
          if (member || joining) return;
          joining = true;
          const msg = parsed;
          void this.join(conn, msg).then((m) => {
            joining = false;
            clearTimeout(timer);
            if (closed) {
              // Gone while its account was being looked up.
              if (m) this.leave(m.room, m.member);
              return;
            }
            if (m === null) {
              conn.close(CloseCode.GameNotFound, "no such room");
              return;
            }
            room = m.room;
            member = m.member;
          });
          return;
        }
        if (!room || !member) {
          error("bad_message");
          return;
        }
        this.handle(room, member, parsed);
      },
      close: () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (room && member) this.leave(room, member);
        room = null;
        member = null;
      },
    };
  }

  private async join(
    conn: WatchConn,
    msg: {
      room: string;
      key?: string;
      token?: string;
      name?: string;
    },
  ): Promise<{ room: Room; member: Member } | null> {
    const error = (code: WatchErrorCode) =>
      conn.send({ t: "error", code, now: this.now() });
    if (!this.rooms.has(msg.room)) {
      error("no_such_room");
      return null;
    }
    let account: { id: number; username: string } | null = null;
    if (msg.token) {
      try {
        account = await this.resolve(msg.token);
      } catch {
        account = null;
      }
    }
    // Looked up again: it may have closed while the account was found.
    const room = this.rooms.get(msg.room);
    if (!room) {
      error("no_such_room");
      return null;
    }
    if (room.members.size >= this.limits.maxMembers) {
      error("room_full");
      return null;
    }
    const now = this.now();
    const id = room.nextId++;
    const guest = msg.name ? censorPlayer(msg.name, null).username : "";
    const member: Member = {
      id,
      name: account?.username ?? (guest || `Guest ${id}`),
      accountId: account?.id ?? null,
      conn,
      ctl: new Bucket(this.limits.ctlBurst, this.limits.ctlPerSecond, now),
      react: new Bucket(
        this.limits.reactBurst,
        this.limits.reactPerSecond,
        now,
      ),
    };
    room.members.set(id, member);
    room.joined = true;
    room.emptySince = null;
    // The key holder hosts (taking it back from whoever inherited it);
    // without one, the first in an empty room does.
    if ((msg.key && sameKey(msg.key, room.key)) || room.host === 0) {
      room.host = id;
    }
    if (room.ctl === 0) room.ctl = room.host;
    conn.send({ t: "welcome", you: id, room: this.viewOf(room), now });
    this.broadcastMembers(room, id);
    return { room, member };
  }

  private leave(room: Room, member: Member): void {
    if (room.members.get(member.id) !== member) return;
    room.members.delete(member.id);
    const first = room.members.keys().next();
    const oldest = first.done ? 0 : first.value;
    if (room.members.size === 0) {
      room.host = 0;
      room.ctl = 0;
      room.emptySince = this.now();
      return;
    }
    if (room.host === member.id) {
      // The one at the controls hosts now, else whoever's been in longest.
      room.host = room.ctl !== member.id ? room.ctl : oldest;
    }
    if (room.ctl === member.id) room.ctl = room.host;
    this.broadcastMembers(room);
  }

  private handle(
    room: Room,
    member: Member,
    msg: Exclude<z.infer<typeof ClientMessage>, { t: "join" }>,
  ): void {
    const now = this.now();
    const error = (code: WatchErrorCode) =>
      member.conn.send({ t: "error", code, now });
    switch (msg.t) {
      case "ping":
        member.conn.send({ t: "pong", now });
        return;
      case "ctl": {
        // Refused: and where the room really is, so a page that moved on
        // its own word goes back.
        const refuse = (code: WatchErrorCode) => {
          error(code);
          member.conn.send({
            t: "clock",
            clock: room.clock,
            op: "seek",
            by: room.ctl,
            now,
          });
        };
        if (room.ctl !== member.id) return refuse("not_in_control");
        if (!member.ctl.take(now)) return refuse("rate_limited");
        const frame = Math.min(msg.frame, room.maxFrame);
        const c = room.clock;
        let next: WatchClock;
        switch (msg.op as WatchOp) {
          case "play":
            next = { frame, playing: true, speed: c.speed, at: now };
            break;
          case "pause":
            next = { frame, playing: false, speed: c.speed, at: now };
            break;
          case "seek":
            next = { frame, playing: c.playing, speed: c.speed, at: now };
            break;
          case "speed": {
            const speed = msg.speed;
            if (
              speed === undefined ||
              !(WATCH_SPEEDS as readonly number[]).includes(speed)
            )
              return error("bad_message");
            next = { frame, playing: c.playing, speed, at: now };
            break;
          }
        }
        room.clock = next;
        this.broadcast(room, {
          t: "clock",
          clock: next,
          op: msg.op,
          by: member.id,
          ...(msg.seq !== undefined ? { seq: msg.seq } : {}),
          now,
        });
        return;
      }
      case "hand": {
        if (room.host !== member.id && room.ctl !== member.id)
          return error("not_in_control");
        if (!room.members.has(msg.to)) return error("no_such_member");
        if (!member.ctl.take(now)) return error("rate_limited");
        room.ctl = msg.to;
        this.broadcastMembers(room);
        return;
      }
      case "take": {
        if (room.host !== member.id) return error("not_host");
        if (room.ctl === member.id) return;
        if (!member.ctl.take(now)) return error("rate_limited");
        room.ctl = member.id;
        this.broadcastMembers(room);
        return;
      }
      case "react": {
        if (!(WATCH_REACTIONS as readonly number[]).includes(msg.e))
          return error("bad_message");
        if (!member.react.take(now)) return error("rate_limited");
        this.broadcast(room, { t: "react", from: member.id, e: msg.e, now });
        return;
      }
    }
  }

  private viewOf(r: Room): WatchRoomView {
    return {
      id: r.id,
      game: r.game,
      members: this.membersOf(r),
      host: r.host,
      ctl: r.ctl,
      clock: r.clock,
    };
  }

  private membersOf(r: Room): WatchMember[] {
    return [...r.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      account: m.accountId !== null,
    }));
  }

  private broadcastMembers(room: Room, except?: number): void {
    this.broadcast(
      room,
      {
        t: "members",
        members: this.membersOf(room),
        host: room.host,
        ctl: room.ctl,
        now: this.now(),
      },
      except,
    );
  }

  private broadcast(
    room: Room,
    msg: WatchServerMessage,
    except?: number,
  ): void {
    for (const m of room.members.values()) {
      if (m.id === except) continue;
      try {
        m.conn.send(msg);
      } catch {
        // a socket on its way out
      }
    }
  }

  /** For tests: close every room. */
  clear(): void {
    this.rooms.clear();
  }
}

/** The master's rooms. */
export const replayRooms = new ReplayRooms();

/** Whether a room is open (who's online offers it to join). */
export function watchRoomOpen(id: string): boolean {
  return replayRooms.has(id);
}

/**
 * Serves the rooms' socket on `server` at WATCH_WS_PATH. Other paths are
 * left to their own handlers (Conquest's, which closes anything unknown).
 */
export function attachReplayRooms(
  server: http.Server,
  rooms: ReplayRooms = replayRooms,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  wss.on("connection", (ws: WebSocket) => {
    const conn: WatchConn = {
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    const session = rooms.connect(conn);
    let alive = true;
    ws.on("pong", () => (alive = true));
    // Behind proxies an idle socket is dropped; a ping keeps it, and finds
    // the ones that went without saying.
    const pinger = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 25_000);
    pinger.unref?.();
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      session.message(data.toString());
    });
    ws.on("close", () => {
      clearInterval(pinger);
      session.close();
    });
    ws.on("error", () => ws.terminate());
  });
  server.on(
    "upgrade",
    (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (req.url ?? "").split("?")[0];
      if (path !== WATCH_WS_PATH) return;
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
    },
  );
  if (rooms === replayRooms) rooms.start();
  return wss;
}

// ---------------------------------------------------------------- HTTP

type Handler = (req: Request, res: Response) => Promise<unknown>;

export interface WatchRouterDeps {
  /** Wraps an async handler (DerpyApi's: errors become JSON 500 or 503). */
  handle: (
    fn: Handler,
  ) => (req: Request, res: Response, n: NextFunction) => void;
  rooms?: ReplayRooms;
}

const CreateBody = z.object({ gameId: z.string().regex(GAME_ID_REGEX) });

/** /derpy/api/watch: make a room for a saved game. */
export function watchRouter({
  handle,
  rooms = replayRooms,
}: WatchRouterDeps): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "2kb" });
  // A room is cheap but not free: a few an address per ten minutes.
  const createLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 12,
    handler: (_req, res) => {
      res.status(429).json({ error: "rate_limited" });
    },
  });

  router.post(
    "/",
    json,
    createLimiter,
    handle(async (req, res) => {
      const body = CreateBody.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const found = await (
        await db()
      ).query(
        "SELECT map, scenario, duration_s FROM derpy_games WHERE game_id = $1",
        [body.data.gameId],
      );
      const row = found.rows[0];
      if (!row) {
        res.status(404).json({ error: "no_such_game" });
        return;
      }
      const made = rooms.create(
        {
          id: body.data.gameId,
          map: String(row.map),
          scenario: row.scenario ?? null,
        },
        Number(row.duration_s ?? 0),
      );
      if (made === "too_many_rooms") {
        res.status(503).json({ error: "too_many_rooms" });
        return;
      }
      log.info("watch room made", { room: made.room, game: body.data.gameId });
      res.json(made);
    }),
  );

  return router;
}
