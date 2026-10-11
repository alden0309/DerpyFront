// Derpy Conquest's game server: rooms of players, each running a world here
// on the server (every nation played by the computer) with a life in it for
// each player, and sending players what changed. Lives in the master process
// on /conquest/ws.
//
// Every game, solo ones too, runs here, so pausing, speed and results work
// the same way for everyone and nobody can doctor their own score. Players
// can drop into a running world with a new character. Games with signed-in
// players are saved to the database as they go, so a world can be picked up
// again another day.

import { randomBytes } from "crypto";
import type http from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { validateLook } from "../../conquest/engine/Appearance";
import { dateOf } from "../../conquest/engine/Calendar";
import { lifeCoins } from "../../conquest/engine/Coins";
import { ConquestGame, STATE_VERSION } from "../../conquest/engine/Game";
import { planProblem } from "../../conquest/engine/Life";
import { autoAnswerLife } from "../../conquest/engine/LifeEvents";
import { lifeOfSeat, lifeScore } from "../../conquest/engine/LifeQueries";
import { AMERICAS } from "../../conquest/engine/Map";
import {
  DEFAULT_SPEED,
  LETTER_SECONDS,
  MAX_SPEED,
  SPEED_DAYS_PER_SECOND,
} from "../../conquest/engine/Rules";
import { newGameState } from "../../conquest/engine/Setup";
import type {
  GameState,
  LifePlan,
  StartYear,
} from "../../conquest/engine/Types";
import {
  ClientMessage,
  CONQUEST_WS_PATH,
  DIFFICULTIES,
  END_YEAR,
  MAX_NAME_LENGTH,
  OpenRoom,
  ResultLine,
  RoomSettings,
  SavedGame,
  SeatInfo,
  ServerMessage,
} from "../../conquest/Protocol";
import { loadConquest, saveConquest, savesFor } from "../derpy/ConquestSaves";
import { accountForToken } from "../derpy/DerpyAuth";
import { recordConquestGame } from "../derpy/DerpyConquest";
import { derpyDbConfigured } from "../derpy/DerpyDb";
import { logger } from "../Logger";

/**
 * For browser tests only: the clock runs this many times faster
 * (CONQUEST_TEST_FAST, at most 50). Never set on a real server.
 */
const TEST_FAST = Math.max(
  1,
  Math.min(50, Math.floor(Number(process.env.CONQUEST_TEST_FAST) || 1)),
);

const log = logger.child({ component: "Conquest" });

const TICK_MS = 100;
const SEND_EVERY_MS = 250;
const MAX_ROOMS = 40;
const MAX_SEATS = 10;
/** A room nobody's connected to is closed after this long. */
const IDLE_CLOSE_MS = 30 * 60_000;
/** A finished game's room stays open this long for its players to look. */
const OVER_CLOSE_MS = 10 * 60_000;
/** Running games are saved this often. */
const SAVE_EVERY_MS = 3 * 60_000;
const MAX_MESSAGES_PER_SECOND = 25;
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** The world as it stands on each start date, to check characters against before a game begins. */
const previews = new Map<StartYear, GameState>();
function previewWorld(start: StartYear): GameState {
  let s = previews.get(start);
  if (!s) {
    s = newGameState(AMERICAS, {
      endYear: END_YEAR,
      difficulty: "normal",
      seed: 1,
      start,
    });
    previews.set(start, s);
  }
  return s;
}

// ---------------------------------------------------------------- messages

const Settings = z.object({
  difficulty: z.enum(DIFFICULTIES as [string, ...string[]]),
  start: z
    .union([z.literal(1607), z.literal(1650), z.literal(1700)])
    .optional(),
});

const Tincture = z.string().max(12);
const Feature = z.number().int().min(0).max(40);
const Part = z.string().max(24);
/** A likeness: a portrait from the gallery and how it's tuned (Appearance.ts). */
const GalleryLook = z
  .object({
    p: z.string().max(24),
    kid: z.string().max(24).optional(),
    hair: z.number().int().min(-1).max(40),
    hairL: z.number().int().min(-2).max(2),
    cloth: z.number().int().min(-1).max(40),
    clothL: z.number().int().min(-2).max(2),
    grey: z.number().int().min(0).max(2),
    flip: z.boolean(),
  })
  .strict();
/** A drawn likeness from before the gallery (an older client): brought over to a portrait. */
const DrawnLook = z
  .object({
    skin: Feature,
    face: Feature,
    jaw: Feature,
    cheeks: Feature,
    eyes: Feature,
    eyeColor: Feature,
    eyeSet: Feature,
    brows: Feature,
    nose: Feature,
    mouth: Feature,
    ears: Feature,
    hair: Part,
    hairColor: Feature,
    beard: Part,
    hat: Part,
    clothes: Part,
    colors: z.tuple([Feature, Feature, Feature]),
    extras: z.array(Part).max(12),
    marks: z.array(Part).max(12),
    lines: Feature,
    greying: Feature,
  })
  .strict();
/** Checked to the last part (Appearance.ts) once it's the right shape. */
const Look = z
  .union([GalleryLook, DrawnLook])
  .refine((l) => validateLook(l) === null, { message: "Not a likeness." });
const Plan = z.object({
  origin: z.string().max(40),
  home: z.number().int().min(0).max(10_000),
  first: z.string().max(20),
  family: z.string().max(28),
  female: z.boolean(),
  age: z.number().int(),
  religion: z.string().max(20),
  face: z.number().int().min(0).max(999),
  look: Look.optional(),
  sigil: z.object({
    field: Tincture,
    division: z.string().max(12),
    tincture: Tincture,
    charge: z.string().max(12),
    chargeTincture: Tincture,
  }),
  frame: z.string().max(12),
  motto: z.string().max(80),
  background: z.string().max(20),
  stats: z.object({
    dip: z.number(),
    mar: z.number(),
    ste: z.number(),
    int: z.number(),
    lea: z.number(),
  }),
  skills: z.record(z.string().max(20), z.number()),
  traits: z.array(z.string().max(20)).max(6),
});

const Message = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    name: z.string().max(200),
    token: z.string().max(200).optional(),
  }),
  z.object({ t: z.literal("list") }),
  z.object({
    t: z.literal("create"),
    solo: z.boolean(),
    open: z.boolean(),
    settings: Settings,
  }),
  z.object({ t: z.literal("join"), code: z.string().max(10) }),
  z.object({
    t: z.literal("rejoin"),
    code: z.string().max(10),
    secret: z.string().max(100),
  }),
  z.object({ t: z.literal("resume"), id: z.string().max(60) }),
  z.object({ t: z.literal("plan"), plan: Plan }),
  z.object({ t: z.literal("life"), plan: Plan }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  z.object({ t: z.literal("settings"), settings: Settings, open: z.boolean() }),
  z.object({ t: z.literal("start") }),
  z.object({
    t: z.literal("cmd"),
    id: z.number(),
    c: z.object({ k: z.string().max(20) }).passthrough(),
  }),
  z.object({
    t: z.literal("speed"),
    s: z.number().int().min(1).max(MAX_SPEED),
  }),
  z.object({ t: z.literal("pause"), p: z.boolean() }),
  z.object({ t: z.literal("chat"), text: z.string().min(1).max(300) }),
  z.object({ t: z.literal("save") }),
  z.object({ t: z.literal("end") }),
  z.object({ t: z.literal("leave") }),
]);

export function cleanName(raw: string): string {
  // Drop control characters and angle brackets.
  const name = [...raw]
    .filter(
      (ch) =>
        ch.charCodeAt(0) >= 32 &&
        ch.charCodeAt(0) !== 127 &&
        ch !== "<" &&
        ch !== ">",
    )
    .join("")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name || "Explorer";
}

// ---------------------------------------------------------------- rooms

interface Conn {
  ws: WebSocket;
  name: string;
  accountId: number | null;
  username: string | null;
  room: Room | null;
  seat: Seat | null;
  hello: Promise<void> | null;
  recent: number[];
}

interface Seat {
  id: string;
  secret: string;
  name: string;
  accountId: number | null;
  /** The character made in the room, before the game starts. */
  plan: LifePlan | null;
  ready: boolean;
  conn: Conn | null;
}

interface Room {
  code: string;
  /** The campaign's id in the saved games (set when it starts). */
  saveId: string | null;
  solo: boolean;
  open: boolean;
  settings: RoomSettings;
  seats: Seat[];
  host: string;
  game: ConquestGame | null;
  speed: number;
  paused: boolean;
  /** Game days owed to the clock, carried between ticks. */
  owed: number;
  startedAt: number;
  lastSent: number;
  lastSaved: number;
  saving: Promise<void> | null;
  emptySince: number | null;
  overAt: number | null;
  results: ResultLine[] | null;
  /** Players' unanswered events: milliseconds of unpaused play left. */
  letters: Map<number, number>;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export class ConquestRooms {
  readonly rooms = new Map<string, Room>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = Date.now();

  constructor(private readonly now: () => number = Date.now) {}

  start(): void {
    if (this.timer) return;
    this.last = this.now();
    this.timer = setInterval(() => this.step(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Save every running campaign (on shutdown). */
  async saveAll(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((r) => this.save(r)));
  }

  // ---------------------------------------------------------------- sockets

  connect(ws: WebSocket): Conn {
    const conn: Conn = {
      ws,
      name: "Explorer",
      accountId: null,
      username: null,
      room: null,
      seat: null,
      hello: null,
      recent: [],
    };
    ws.on("message", (data) => {
      const t = this.now();
      conn.recent = conn.recent.filter((x) => t - x < 1000);
      conn.recent.push(t);
      if (conn.recent.length > MAX_MESSAGES_PER_SECOND) return;
      let parsed: ClientMessage;
      try {
        const result = Message.safeParse(JSON.parse(String(data)));
        if (!result.success)
          return this.send(conn, {
            t: "err",
            msg: "That message didn't make sense.",
          });
        parsed = result.data as ClientMessage;
      } catch {
        return;
      }
      // Wait for sign-in to finish before anything else.
      void (conn.hello ?? Promise.resolve()).then(() =>
        this.handle(conn, parsed),
      );
    });
    ws.on("close", () => this.disconnect(conn));
    ws.on("error", () => ws.terminate());
    return conn;
  }

  private send(conn: Conn, msg: ServerMessage): void {
    if (conn.ws.readyState === WebSocket.OPEN)
      conn.ws.send(JSON.stringify(msg));
  }

  private broadcast(room: Room, msg: ServerMessage): void {
    const json = JSON.stringify(msg);
    for (const seat of room.seats) {
      if (seat.conn && seat.conn.ws.readyState === WebSocket.OPEN)
        seat.conn.ws.send(json);
    }
  }

  private disconnect(conn: Conn): void {
    const room = conn.room;
    const seat = conn.seat;
    conn.room = null;
    conn.seat = null;
    if (!room || !seat || seat.conn !== conn) return;
    seat.conn = null;
    if (!room.game) {
      // In the lobby a leaver gives up their seat.
      room.seats = room.seats.filter((s) => s !== seat);
      if (room.seats.length === 0) {
        this.rooms.delete(room.code);
        return;
      }
      if (room.host === seat.id) room.host = room.seats[0].id;
      this.sendLobby(room);
      return;
    }
    this.onSeatsChanged(room);
    if (!room.seats.some((s) => s.conn)) void this.save(room);
  }

  /** Called when someone comes or goes during a game. */
  private onSeatsChanged(room: Room): void {
    const playing = room.seats.some((s) => s.conn);
    if (!playing && room.game && !room.game.state.over && !room.paused) {
      room.paused = true;
      this.broadcast(room, {
        t: "clock",
        speed: room.speed,
        paused: true,
        by: null,
      });
    }
    room.emptySince = room.seats.some((s) => s.conn) ? null : this.now();
    if (room.host && !room.seats.some((s) => s.id === room.host && s.conn)) {
      const next = room.seats.find((s) => s.conn);
      if (next) room.host = next.id;
    }
    this.broadcast(room, {
      t: "seats",
      seats: seatInfo(room),
      host: room.host,
    });
  }

  // ---------------------------------------------------------------- messages

  async handle(conn: Conn, m: ClientMessage): Promise<void> {
    switch (m.t) {
      case "hello":
        conn.hello = this.hello(conn, m.name, m.token);
        await conn.hello;
        return;
      case "list":
        return this.list(conn);
      case "create":
        return this.create(conn, m.solo, m.open, m.settings);
      case "join":
        return this.join(conn, m.code);
      case "rejoin":
        return this.rejoin(conn, m.code, m.secret);
      case "resume":
        return this.resume(conn, m.id);
      case "leave":
        return this.disconnect(conn);
    }
    const room = conn.room;
    const seat = conn.seat;
    if (!room || !seat)
      return this.send(conn, { t: "err", msg: "You're not in a game." });
    switch (m.t) {
      case "plan": {
        if (room.game) return;
        const plan = m.plan as LifePlan;
        const problem = planProblem(
          previewWorld(room.settings.start ?? 1607),
          plan,
        );
        if (problem) return this.send(conn, { t: "err", msg: problem });
        seat.plan = plan;
        return this.sendLobby(room);
      }
      case "life": {
        const game = room.game;
        if (!game) return;
        const err = game.beginLife(seat.id, seat.name, m.plan as LifePlan);
        if (err) return this.send(conn, { t: "err", msg: err });
        this.flush(room);
        this.onSeatsChanged(room);
        void this.save(room);
        return;
      }
      case "ready":
        if (room.game) return;
        seat.ready = m.ready && seat.plan !== null;
        return this.sendLobby(room);
      case "settings":
        if (room.game || room.host !== seat.id) return;
        room.settings = m.settings as RoomSettings;
        room.open = m.open && !room.solo;
        // A character whose home doesn't exist in the new start year must be remade.
        for (const x of room.seats)
          if (
            x.plan &&
            planProblem(previewWorld(room.settings.start ?? 1607), x.plan)
          ) {
            x.plan = null;
            x.ready = false;
          }
        return this.sendLobby(room);
      case "start":
        if (room.game || room.host !== seat.id) return;
        return this.startGame(room);
      case "cmd":
        return this.command(room, seat, m.id, m.c);
      case "speed":
      case "pause":
        if (!room.game || room.game.state.over) return;
        // The host sets the pace in company (anyone may pause).
        if (m.t === "speed") {
          if (!room.solo && room.host !== seat.id) return;
          room.speed = m.s;
          room.paused = false;
        } else {
          if (!m.p && !room.solo && room.host !== seat.id) return;
          room.paused = m.p;
        }
        this.broadcast(room, {
          t: "clock",
          speed: room.speed,
          paused: room.paused,
          by: seat.name,
        });
        for (const x of room.seats) this.sendLetters(room, x);
        if (room.paused) void this.save(room);
        return;
      case "chat":
        this.broadcast(room, {
          t: "chat",
          from: seat.name,
          text: m.text.slice(0, 300),
        });
        return;
      case "save":
        await this.save(room);
        return;
      case "end":
        if (!room.game || room.game.state.over) return;
        if (room.host !== seat.id && !room.solo) return;
        room.game.finish();
        this.flush(room);
        await this.finishRoom(room);
        return;
    }
  }

  private async hello(conn: Conn, name: string, token?: string): Promise<void> {
    conn.name = cleanName(name);
    if (token && derpyDbConfigured()) {
      try {
        const found = await accountForToken(token);
        if (found) {
          conn.accountId = found.account.id;
          conn.username = found.account.username;
          conn.name = found.account.username;
        }
      } catch (err) {
        log.warn(`couldn't check a sign-in: ${err}`);
      }
    }
    this.send(conn, { t: "welcome", name: conn.name, account: conn.username });
  }

  private async list(conn: Conn): Promise<void> {
    const open: OpenRoom[] = [];
    for (const r of this.rooms.values()) {
      if (r.solo || !r.open || r.overAt !== null) continue;
      open.push({
        code: r.code,
        host: r.seats.find((s) => s.id === r.host)?.name ?? "?",
        players: r.seats.map((s) => ({
          name: s.name,
          origin: seatOrigin(r, s),
        })),
        settings: r.settings,
        started: r.game !== null,
        year: r.game ? dateOf(r.game.state.day).year : null,
      });
    }
    let saved: SavedGame[] = [];
    if (conn.accountId !== null && derpyDbConfigured()) {
      try {
        const rows = await savesFor(conn.accountId, STATE_VERSION);
        saved = rows.map((r) => {
          const mine = r.seats.find((s) => s.accountId === conn.accountId);
          const live = [...this.rooms.values()].find((x) => x.saveId === r.id);
          return {
            id: r.id,
            title: r.title,
            power: mine?.power ?? "",
            year: r.year,
            savedAt: r.updatedAt,
            players: r.seats.map((s) => s.name),
            live: live ? live.code : null,
          };
        });
      } catch (err) {
        log.warn(`couldn't list saves: ${err}`);
      }
    }
    this.send(conn, { t: "rooms", open, saved });
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 4; i++)
        code += CODE_LETTERS[randomBytes(1)[0] % CODE_LETTERS.length];
      if (!this.rooms.has(code)) return code;
    }
  }

  private seatFor(conn: Conn): Seat {
    return {
      id: randomToken(6),
      secret: randomToken(18),
      name: conn.name,
      accountId: conn.accountId,
      plan: null,
      ready: false,
      conn,
    };
  }

  private leaveCurrent(conn: Conn): void {
    if (conn.room) this.disconnect(conn);
  }

  private newRoom(
    conn: Conn | null,
    solo: boolean,
    open: boolean,
    settings: RoomSettings,
  ): Room {
    const room: Room = {
      code: this.newCode(),
      saveId: null,
      solo,
      open: open && !solo,
      settings,
      seats: [],
      host: "",
      game: null,
      speed: DEFAULT_SPEED,
      paused: false,
      owed: 0,
      startedAt: 0,
      lastSent: 0,
      lastSaved: this.now(),
      saving: null,
      emptySince: null,
      overAt: null,
      results: null,
      letters: new Map(),
    };
    if (conn) {
      const seat = this.seatFor(conn);
      room.seats.push(seat);
      room.host = seat.id;
      conn.room = room;
      conn.seat = seat;
    }
    this.rooms.set(room.code, room);
    return room;
  }

  private create(
    conn: Conn,
    solo: boolean,
    open: boolean,
    settings: RoomSettings,
  ): void {
    this.leaveCurrent(conn);
    if (this.rooms.size >= MAX_ROOMS) {
      return this.send(conn, {
        t: "err",
        msg: "The server is full of games right now. Try again soon.",
      });
    }
    const room = this.newRoom(conn, solo, open, settings);
    this.sendLobby(room);
    log.info("room opened", { code: room.code, solo });
  }

  private join(conn: Conn, rawCode: string): void {
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    if (!room || room.solo)
      return this.send(conn, { t: "err", msg: "No game with that code." });
    if (conn.room === room) return;
    this.leaveCurrent(conn);
    // Someone coming back to their nation in a loaded campaign.
    const mine =
      conn.accountId !== null
        ? room.seats.find((s) => s.accountId === conn.accountId && !s.conn)
        : undefined;
    if (mine) return this.takeSeat(room, mine, conn);
    if (room.seats.length >= MAX_SEATS)
      return this.send(conn, { t: "err", msg: "That game is full." });
    const seat = this.seatFor(conn);
    room.seats.push(seat);
    conn.room = room;
    conn.seat = seat;
    if (room.game) {
      // Late arrivals watch.
      this.sendGame(room, seat);
      this.onSeatsChanged(room);
    } else {
      this.sendLobby(room);
    }
  }

  private takeSeat(room: Room, seat: Seat, conn: Conn): void {
    if (seat.conn && seat.conn !== conn) {
      const old = seat.conn;
      old.room = null;
      old.seat = null;
      this.send(old, { t: "err", msg: "You opened this game somewhere else." });
      old.ws.close();
    }
    seat.conn = conn;
    if (conn.accountId !== null) {
      seat.accountId = conn.accountId;
      seat.name = conn.name;
    }
    conn.room = room;
    conn.seat = seat;
    if (room.game) {
      this.sendGame(room, seat);
      if (room.results) this.send(conn, { t: "end", results: room.results });
      this.onSeatsChanged(room);
    } else {
      this.sendLobby(room);
    }
  }

  private rejoin(conn: Conn, rawCode: string, secret: string): void {
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    const seat = room?.seats.find((s) => s.secret === secret);
    if (!room || !seat)
      return this.send(conn, {
        t: "err",
        msg: "That game has ended or closed.",
      });
    this.leaveCurrent(conn);
    this.takeSeat(room, seat, conn);
  }

  /** Load a saved campaign (or join it, if it's already running). */
  private async resume(conn: Conn, id: string): Promise<void> {
    if (conn.accountId === null)
      return this.send(conn, {
        t: "err",
        msg: "Sign in to load your saved games.",
      });
    const running = () =>
      [...this.rooms.values()].find(
        (r) => r.saveId === id && r.overAt === null,
      );
    const rejoinRunning = (room: Room) => {
      // Your own seat back (solo games included); anyone else watches.
      const mine = room.seats.find((s) => s.accountId === conn.accountId);
      if (mine) {
        this.leaveCurrent(conn);
        return this.takeSeat(room, mine, conn);
      }
      return this.join(conn, room.code);
    };
    if (running()) return rejoinRunning(running()!);
    let saved: Awaited<ReturnType<typeof loadConquest>>;
    try {
      saved = await loadConquest(id);
    } catch (err) {
      log.warn(`couldn't load ${id}: ${err}`);
      return this.send(conn, {
        t: "err",
        msg: "Couldn't load that game. Try again in a moment.",
      });
    }
    if (!saved || saved.over)
      return this.send(conn, { t: "err", msg: "That game is over." });
    if (!saved.seats.some((s) => s.accountId === conn.accountId))
      return this.send(conn, {
        t: "err",
        msg: "You didn't play in that game.",
      });
    if (saved.state.version !== STATE_VERSION)
      return this.send(conn, {
        t: "err",
        msg: "That game was saved by an older version and can't be loaded.",
      });
    // Someone else loaded it while we waited.
    if (running()) return rejoinRunning(running()!);
    this.leaveCurrent(conn);
    const room = this.newRoom(null, saved.seats.length <= 1, false, {
      difficulty: saved.state.settings.difficulty,
      start: saved.state.settings.start,
    });
    room.saveId = id;
    room.paused = true;
    room.startedAt = this.now();
    room.game = new ConquestGame(AMERICAS, saved.state);
    room.seats = saved.seats.map((s) => ({
      id: s.seat,
      secret: randomToken(18),
      name: s.name,
      accountId: s.accountId,
      plan: null,
      ready: true,
      conn: null,
    }));
    const mine = room.seats.find((s) => s.accountId === conn.accountId)!;
    room.host = mine.id;
    log.info("campaign loaded", { code: room.code, id });
    this.takeSeat(room, mine, conn);
  }

  private sendLobby(room: Room): void {
    for (const seat of room.seats) {
      if (!seat.conn) continue;
      this.send(seat.conn, {
        t: "lobby",
        code: room.code,
        you: seat.id,
        secret: seat.secret,
        host: room.host,
        solo: room.solo,
        open: room.open,
        settings: room.settings,
        seats: seatInfo(room),
      });
    }
  }

  private sendGame(room: Room, seat: Seat): void {
    if (!seat.conn || !room.game) return;
    // Bring everyone else's copy up to date first, so this full state and
    // the deltas that follow line up.
    this.flush(room);
    this.send(seat.conn, {
      t: "game",
      code: room.code,
      you: seat.id,
      secret: seat.secret,
      host: room.host,
      solo: room.solo,
      state: room.game.state,
      speed: room.speed,
      paused: room.paused,
      seats: seatInfo(room),
    });
    this.sendLetters(room, seat);
  }

  private startGame(room: Room): void {
    const host = room.seats.find((s) => s.id === room.host);
    const players = room.seats.filter((s) => s.plan);
    const tell = (msg: string) => {
      if (host?.conn) this.send(host.conn, { t: "err", msg });
    };
    if (!host?.plan) return tell("Make your character first.");
    if (!room.solo) {
      const waiting = room.seats.find(
        (s) => s.id !== room.host && (!s.plan || !s.ready),
      );
      if (waiting)
        return tell(
          waiting.plan
            ? `Waiting for ${waiting.name} to be ready.`
            : `${waiting.name} hasn't made their character yet.`,
        );
    }
    room.game = ConquestGame.create(
      AMERICAS,
      {
        endYear: END_YEAR,
        difficulty: room.settings.difficulty,
        seed: randomBytes(4).readInt32LE(0),
        start: room.settings.start ?? 1607,
      },
      players.map((s) => ({ seat: s.id, name: s.name, plan: s.plan! })),
    );
    room.startedAt = this.now();
    room.saveId = `${room.code}-${room.startedAt}`;
    room.paused = room.solo;
    room.speed = DEFAULT_SPEED;
    room.owed = 0;
    for (const seat of room.seats) this.sendGame(room, seat);
    log.info("game started", { code: room.code, players: players.length });
    void this.save(room);
  }

  private command(room: Room, seat: Seat, id: number, c: unknown): void {
    const game = room.game;
    if (!game || !seat.conn) return;
    let err: string | null;
    try {
      err = game.lifeCommand(
        seat.id,
        c as Parameters<ConquestGame["lifeCommand"]>[1],
      );
    } catch (e) {
      log.warn(`command failed: ${e}`);
      err = "That didn't work.";
    }
    // Show the result straight away rather than on the next beat.
    this.flush(room);
    this.send(seat.conn, { t: "ack", id, err });
  }

  /** Sends everyone what changed since last time. */
  private flush(room: Room): void {
    if (!room.game) return;
    room.lastSent = this.now();
    this.broadcast(room, { t: "d", d: room.game.takeDelta() });
  }

  /** Save a running campaign with signed-in players to the database. */
  private save(room: Room): Promise<void> {
    if (!room.game || !room.saveId || !derpyDbConfigured())
      return Promise.resolve();
    const game = room.game;
    const lives = room.seats.filter((s) => lifeOfSeat(game.state, s.id));
    if (!lives.some((s) => s.accountId !== null)) return Promise.resolve();
    if (room.saving) return room.saving;
    const seats = lives.map((s) => ({
      seat: s.id,
      name: s.name,
      power: lifeOfSeat(game.state, s.id)!.origin,
      accountId: s.accountId,
    }));
    room.lastSaved = this.now();
    const saving = saveConquest(
      room.saveId,
      titleOf(room),
      dateOf(game.state.day).year,
      seats,
      game.state,
      game.state.over,
    )
      .then(() =>
        this.broadcast(room, {
          t: "saved",
          at: new Date(this.now()).toISOString(),
        }),
      )
      .catch((err) => {
        log.warn(`couldn't save ${room.code}: ${err}`);
      })
      .finally(() => {
        room.saving = null;
      });
    room.saving = saving;
    return saving;
  }

  // ---------------------------------------------------------------- clock

  step(): void {
    const t = this.now();
    const dt = Math.min(1000, t - this.last);
    this.last = t;
    for (const room of [...this.rooms.values()]) {
      try {
        this.stepRoom(room, dt, t);
      } catch (err) {
        log.error(`room ${room.code} failed: ${err}`);
        this.rooms.delete(room.code);
      }
    }
  }

  private stepRoom(room: Room, dt: number, t: number): void {
    const game = room.game;
    if (room.overAt !== null && t - room.overAt > OVER_CLOSE_MS) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.emptySince !== null && t - room.emptySince > IDLE_CLOSE_MS) {
      void this.save(room);
      this.rooms.delete(room.code);
      return;
    }
    if (!game || game.state.over) return;
    if (t - room.lastSaved > SAVE_EVERY_MS && !room.paused)
      void this.save(room);
    this.letterClock(room, room.paused ? 0 : dt);
    if (room.paused) return;
    room.owed += (dt / 1000) * SPEED_DAYS_PER_SECOND[room.speed] * TEST_FAST;
    let ticks = 0;
    while (room.owed >= 1 && ticks < 10 * TEST_FAST && !game.state.over) {
      game.tick();
      room.owed -= 1;
      ticks++;
    }
    if (room.owed > 10 * TEST_FAST) room.owed = 0;
    if (game.state.over) {
      this.flush(room);
      void this.finishRoom(room);
      return;
    }
    if (ticks > 0 && t - room.lastSent >= SEND_EVERY_MS) this.flush(room);
  }

  /**
   * Letters wait LETTER_SECONDS of unpaused play for an answer, then the
   * council decides. Each player hears how long their letters have left
   * whenever a letter arrives or goes, and whenever the clock starts or stops.
   */
  private letterClock(room: Room, dt: number): void {
    const game = room.game!;
    const pending = new Set<number>();
    let answered = false;
    for (const seat of room.seats) {
      const life = lifeOfSeat(game.state, seat.id);
      if (!life) continue;
      let changed = false;
      for (const ev of [...life.events]) {
        pending.add(ev.id);
        let left = room.letters.get(ev.id);
        if (left === undefined) {
          left = LETTER_SECONDS * 1000;
          changed = true;
        }
        left -= dt;
        if (left <= 0) {
          autoAnswerLife(game, seat.id, ev.id);
          room.letters.delete(ev.id);
          pending.delete(ev.id);
          answered = changed = true;
        } else room.letters.set(ev.id, left);
      }
      if (changed) this.sendLetters(room, seat);
    }
    for (const id of [...room.letters.keys()])
      if (!pending.has(id)) room.letters.delete(id);
    if (answered) this.flush(room);
  }

  private sendLetters(room: Room, seat: Seat): void {
    if (!seat.conn || !room.game) return;
    const life = lifeOfSeat(room.game.state, seat.id);
    if (!life) return;
    const left: Record<number, number> = {};
    for (const ev of life.events)
      left[ev.id] = Math.ceil(
        (room.letters.get(ev.id) ?? LETTER_SECONDS * 1000) / 1000,
      );
    this.send(seat.conn, { t: "letters", left, paused: room.paused });
  }

  /** Works out results and coins, saves them, and tells everyone. */
  async finishRoom(room: Room): Promise<ResultLine[]> {
    const game = room.game!;
    if (room.results) return room.results;
    room.overAt = this.now();
    const s = game.state;
    const reachedEnd = s.day >= s.endDay;
    const lines = room.seats
      .map((seat) => ({ seat, life: lifeOfSeat(s, seat.id) }))
      .filter(
        (x): x is { seat: Seat; life: NonNullable<typeof x.life> } => !!x.life,
      )
      .map(({ seat, life }) => {
        const coins = lifeCoins(life, reachedEnd && life.c >= 0);
        const last = s.chars[life.line[life.line.length - 1]];
        return {
          seat,
          life,
          score: lifeScore(s, life),
          coins,
          lineName: last ? `${last.first} ${last.family}` : seat.name,
        };
      })
      .sort((a, b) => b.score - a.score);
    const many = lines.length >= 2;
    room.results = lines.map((x, i) => ({
      name: x.seat.name,
      line: x.lineName,
      power: x.life.origin,
      rank: i + 1,
      score: x.score,
      won: many
        ? i === 0
        : x.life.tally.topOffice >= 3 || x.life.tally.risingsWon > 0,
      coins: x.seat.accountId !== null ? x.coins.total : null,
      coinLines: x.coins.lines,
    }));
    const winner = lines[0];
    await this.save(room);
    await recordConquestGame({
      gameId: room.saveId ?? `${room.code}-${room.startedAt}`,
      startedAt: room.startedAt,
      endedAt: this.now(),
      endYear: END_YEAR,
      finalYear: dateOf(s.day).year,
      difficulty: room.settings.difficulty,
      winner: winner ? `${winner.lineName} (${winner.seat.name})` : null,
      players: lines.map((x, i) => ({
        accountId: x.seat.accountId,
        name: x.seat.name,
        nation: x.life.origin,
        rank: i + 1,
        score: x.score,
        won: room.results![i].won,
        provinces: x.life.tally.provinces,
        peakProvinces: x.life.tally.provinces,
        colonies: x.life.tally.children,
        battlesWon: x.life.tally.battlesWon,
        conquests: x.life.tally.generations,
        goldEarned: x.life.tally.earned,
        coins: x.coins.total,
      })),
    });
    this.broadcast(room, { t: "end", results: room.results });
    log.info("game over", { code: room.code, lines: lines.length });
    return room.results;
  }
}

function titleOf(room: Room): string {
  const s = room.game?.state;
  const from = room.settings.start ?? 1607;
  const families = room.seats
    .map((seat) => (s ? lifeOfSeat(s, seat.id) : undefined))
    .filter((l) => l !== undefined)
    .map((l) => s!.chars[l.line[0]]?.family)
    .filter((f): f is string => !!f);
  const names = [...new Set(families)].map((f) =>
    /^of the /.test(f) ? `a family ${f}` : `the ${f}s`,
  );
  if (names.length === 0) return `The Americas from ${from}`;
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who[0].toUpperCase()}${who.slice(1)}, from ${from}`;
}

function seatOrigin(room: Room, seat: Seat): string | null {
  if (room.game) return lifeOfSeat(room.game.state, seat.id)?.origin ?? null;
  return seat.plan?.origin ?? null;
}

function seatInfo(room: Room): SeatInfo[] {
  return room.seats.map((seat) => {
    const life = room.game ? lifeOfSeat(room.game.state, seat.id) : undefined;
    const me = life && life.c >= 0 ? room.game!.state.chars[life.c] : undefined;
    const plan = seat.plan;
    return {
      id: seat.id,
      name: seat.name,
      online: seat.conn !== null,
      account: seat.accountId !== null,
      made: room.game ? !!life : plan !== null,
      origin: seatOrigin(room, seat),
      character: me
        ? `${me.first} ${me.family}`
        : plan
          ? `${plan.first} ${plan.family}`
          : null,
      watching: !!life?.watching,
      ready: seat.ready,
    };
  });
}

/**
 * Serves Derpy Conquest on `server` at /conquest/ws. Tests pass their own
 * `rooms` (with a fake clock) and drive it themselves.
 */
export function attachConquest(
  server: http.Server,
  given?: ConquestRooms,
): ConquestRooms {
  const rooms = given ?? new ConquestRooms();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: {
      threshold: 512,
      zlibDeflateOptions: { level: 6, memLevel: 7 },
    },
  });
  wss.on("connection", (ws) => rooms.connect(ws));
  server.on(
    "upgrade",
    (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (req.url ?? "").split("?")[0];
      if (path !== CONQUEST_WS_PATH) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      );
    },
  );
  if (!given) {
    rooms.start();
    // Save running campaigns when the server is told to stop (a deploy).
    process.once("SIGTERM", () => {
      setTimeout(() => process.exit(0), 8000).unref();
      void rooms.saveAll().finally(() => process.exit(0));
    });
  }
  return rooms;
}
