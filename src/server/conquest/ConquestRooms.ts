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
import { checkAchievements } from "../../conquest/engine/Achievements"; // MAP (r12)
import { validateLook } from "../../conquest/engine/Appearance";
import { dateOf, formatDate } from "../../conquest/engine/Calendar";
import {
  CARD_STALL_SECONDS,
  cardTables,
} from "../../conquest/engine/CardsCore"; // EVENTS (r21)
import { chronicleOf, type Chronicle } from "../../conquest/engine/Chronicle"; // LEGACY (r21)
import { lifeCoins, linesDue } from "../../conquest/engine/Coins"; // LEGACY (r21): linesDue
import { dropFromTable } from "../../conquest/engine/Dice"; // DICE (r14)
import {
  seatOf,
  STALL_SECONDS,
  tablesOf,
} from "../../conquest/engine/DiceCore"; // DICE (r14)
import { ConquestGame, STATE_VERSION } from "../../conquest/engine/Game";
import { lineCharacters } from "../../conquest/engine/Legacy"; // LEGACY (r21)
import { planProblem } from "../../conquest/engine/Life";
import { autoAnswerLife } from "../../conquest/engine/LifeEvents";
import { lifeOfSeat, lifeScore } from "../../conquest/engine/LifeQueries";
import { AMERICAS } from "../../conquest/engine/Map";
import { NOTE_MAX } from "../../conquest/engine/Notes"; // INTRIGUE (r15)
import {
  attentionMark,
  SKIP_DAYS_PER_SECOND,
  SKIP_MAX_DAYS,
  skipBlocker,
  whyWoken,
} from "../../conquest/engine/Pace";
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
import { dropFromCards } from "../../conquest/engine/VingtEtUn"; // EVENTS (r21)
// DICE (r14), INTRIGUE and LABOUR (r15), POLLS (r16), ECON (r17), CROWN (r18):
// what each seat may be sent, composed in one place (SITE r19), and the most
// redacted view of them all for a watcher.
import {
  deltaForViewer,
  deltaForWatcher,
  deltaIsPerViewer,
  stateForViewer,
  stateForWatcher,
} from "../../conquest/engine/Viewers";
import {
  ClientMessage,
  CONQUEST_WS_PATH,
  DIFFICULTIES,
  END_YEAR,
  LiveRoom,
  MAX_NAME_LENGTH,
  MAX_WATCHERS,
  OpenRoom,
  ResultLine,
  RoomSettings,
  SavedGame,
  SeatInfo,
  ServerMessage,
  StoredChronicle,
} from "../../conquest/Protocol";
import {
  deleteSave,
  finishedFor,
  hideSave,
  loadConquest,
  ownerOf,
  saveConquest,
  saveInfo,
  savesFor,
  type SaveRow,
} from "../derpy/ConquestSaves";
import { achievementsOf, awardAchievement } from "../derpy/DerpyAchievements"; // MAP (r12)
import { accountForToken } from "../derpy/DerpyAuth";
import { recordConquestGame } from "../derpy/DerpyConquest";
import { derpyDbConfigured } from "../derpy/DerpyDb";
import { logger } from "../Logger";
import { TablePay, type SeatPay } from "./ConquestPay"; // LEGACY (r21)
// DLC (r21): Conquest's store items, checked here from the account's rows.
import { NO_DLC, type ConquestDlcOwned } from "../../conquest/DlcIds";
import { setLegendsOwned } from "../../conquest/engine/Legends";
import { endYearOf } from "../../conquest/engine/Starts";
import {
  dlcOf,
  hostProblem,
  loadProblem,
  ownedFromDb,
  type OwnedLookup,
} from "./ConquestDlc";

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
/** INTRIGUE (r15): private letters a seat may send in a minute of real time. */
const NOTES_A_MINUTE = 5;
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
    .union([
      z.literal(1607),
      z.literal(1650),
      z.literal(1700),
      z.literal(1776), // DLC (r21): its owner may host it (ConquestDlc.ts)
    ])
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
  z.object({ t: z.literal("skip"), on: z.boolean() }),
  z.object({ t: z.literal("chat"), text: z.string().min(1).max(300) }),
  z.object({ t: z.literal("save") }),
  z.object({ t: z.literal("end") }),
  z.object({ t: z.literal("leave") }),
  // STORY (r17): your saved games.
  z.object({ t: z.literal("delsave"), id: z.string().max(60) }),
  z.object({ t: z.literal("hidesave"), id: z.string().max(60) }),
  z.object({ t: z.literal("clearsaves") }),
  // SITE (r19): watching a game being played, and the host letting watchers in.
  z.object({ t: z.literal("watch"), id: z.string().max(40) }),
  z.object({ t: z.literal("allowwatch"), allow: z.boolean() }),
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
  /** SITE (r19): the room this connection watches (it holds no seat there). */
  watching: Room | null;
  hello: Promise<void> | null;
  recent: number[];
  /** DLC (r21): what the account owns of Conquest's DLC (checked on the server). */
  dlc: ConquestDlcOwned;
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
  /** MAP (r12): achievements already told (and paid for) in this game. */
  achSeen?: Set<string>;
  /** LEGACY (r21): Derp Coins as they play (ConquestPay). */
  pay?: SeatPay;
  /** DLC (r21): what the seat's account owns of Conquest's DLC, when it last sat down. */
  dlc?: ConquestDlcOwned;
}

interface Room {
  code: string;
  /** The campaign's id in the saved games (set when it starts). */
  saveId: string | null;
  /** STORY (r17): the account that began it (only it may delete the save). */
  owner: number | null;
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
  /**
   * DICE (r14): a player's turn at a dice table, by table: the move it's
   * for (the table's count of moves), and when the table moves for them.
   */
  dice: Map<number, { seq: number; due: number; away: boolean }>;
  /** EVENTS (r21): a card table held up by a player, by table: its count of moves, and when it decides for them. */
  cards: Map<number, { seq: number; due: number; away: boolean }>;
  /**
   * LIFE (r11): skipping ahead. Alone it starts when asked; in company when
   * every player living a life has asked. It stops when anything needs anyone
   * (the attention mark changes), and the clock goes back as it was.
   */
  skip: {
    on: boolean;
    asked: Set<string>;
    mark: string;
    from: number;
    wasPaused: boolean;
  };
  /**
   * SITE (r19): watchers. They hold no seat, never pause, never count toward
   * the room being empty, and are sent nobody's secrets. A room open to
   * anyone can be watched; a private (or solo) one only if its host allows.
   * Watchers come by `watchId`, never the room's code, so watching a private
   * game is no way into it.
   */
  watchers: Set<Conn>;
  allowWatchers: boolean;
  watchId: string;
  // LEGACY (r21)
  /** When the clock last stopped (real ms), or null while it runs: pay counts only a stop's first minutes. */
  pausedAt: number | null;
  /** Paused in company: who did, and until when only they may start the clock (PAUSE_LOCK_MS). */
  lock: { seat: string; name: string; until: number } | null;
  /** The end being worked out (once). */
  finishing: Promise<ResultLine[]> | null;
}

/** LEGACY (r21): after someone pauses in company, only they may start the clock for this long. */
export const PAUSE_LOCK_MS = 10_000;

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export class ConquestRooms {
  readonly rooms = new Map<string, Room>();
  /** STORY (r17): saves deleted while this server runs: never written again, never loaded. */
  private readonly deleted = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = Date.now();
  /** LEGACY (r21): Derp Coins as you play. */
  readonly pay: TablePay;

  constructor(
    private readonly now: () => number = Date.now,
    /** DLC (r21): an account's owned store items (the database; tests pass their own). */
    private readonly owned: OwnedLookup = ownedFromDb,
  ) {
    this.pay = new TablePay(
      now,
      (seat, note) => {
        const conn = (seat as Seat).conn;
        if (conn) this.send(conn, note);
      },
      (msg) => log.warn(msg),
    );
  }

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

  /** Save every running campaign (on shutdown), and pay what's owed (LEGACY r21). */
  async saveAll(): Promise<void> {
    await Promise.all(
      [...this.rooms.values()].map((r) =>
        Promise.all([this.save(r), this.pay.settleAll(r)]),
      ),
    );
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
      watching: null,
      hello: null,
      recent: [],
      dlc: NO_DLC, // DLC (r21)
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

  /**
   * To everyone in the room: the players and (SITE r19) its watchers, unless
   * `toWatchers` is false (the players' chat, a save).
   */
  private broadcast(room: Room, msg: ServerMessage, toWatchers = true): void {
    const json = JSON.stringify(msg);
    for (const seat of room.seats) {
      if (seat.conn && seat.conn.ws.readyState === WebSocket.OPEN)
        seat.conn.ws.send(json);
    }
    if (toWatchers) this.toWatchers(room, json);
  }

  /** SITE (r19): one message, written once, to every watcher (none: nothing done). */
  private toWatchers(room: Room, json: string): void {
    for (const w of room.watchers)
      if (w.ws.readyState === WebSocket.OPEN) w.ws.send(json);
  }

  private disconnect(conn: Conn): void {
    this.stopWatching(conn); // SITE (r19)
    const room = conn.room;
    const seat = conn.seat;
    conn.room = null;
    conn.seat = null;
    if (!room || !seat || seat.conn !== conn) return;
    seat.conn = null;
    void this.pay.settle(room, seat, true); // LEGACY (r21): what they're owed
    if (!room.game) {
      // In the lobby a leaver gives up their seat.
      room.seats = room.seats.filter((s) => s !== seat);
      if (room.seats.length === 0) {
        this.closeRoom(room);
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
    // Those who've gone have no say in skipping ahead; with nobody left it stops.
    for (const id of [...room.skip.asked])
      if (!room.seats.some((x) => x.id === id && x.conn))
        room.skip.asked.delete(id);
    if (!playing && room.skip.on) {
      room.skip.on = false;
      room.skip.asked.clear();
      room.skip.wasPaused = true;
    }
    if (!playing && room.game && !room.game.state.over && !room.paused) {
      room.paused = true;
      room.lock = null; // LEGACY (r21)
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
        return this.create(conn, m.solo, m.open, m.settings as RoomSettings);
      case "join":
        return this.join(conn, m.code);
      case "rejoin":
        return this.rejoin(conn, m.code, m.secret);
      case "resume":
        return this.resume(conn, m.id);
      case "leave":
        return this.disconnect(conn);
      // STORY (r17): your saved games, from the lobby.
      case "delsave":
        return this.deleteSaved(conn, m.id);
      case "hidesave":
        return this.hideSaved(conn, m.id);
      case "clearsaves":
        return this.clearFinished(conn);
      // SITE (r19): watch a game being played (no seat, nobody's secrets).
      case "watch":
        return this.watch(conn, m.id);
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
        setLegendsOwned(game, seat.id, !!seat.dlc?.legends); // DLC (r21)
        this.pay.choice(room, seat); // LEGACY (r21)
        this.flush(room);
        this.onSeatsChanged(room);
        void this.save(room);
        return;
      }
      case "ready":
        if (room.game) return;
        seat.ready = m.ready && seat.plan !== null;
        return this.sendLobby(room);
      case "settings": {
        if (room.game || room.host !== seat.id) return;
        // DLC (r21): a start date that needs a store item needs its owner as host.
        const want = m.settings as RoomSettings;
        if (want.start !== room.settings.start) {
          conn.dlc = await dlcOf(conn.accountId, this.owned);
          const why = hostProblem(want.start, conn.dlc);
          if (why) {
            this.send(conn, { t: "err", msg: why });
            return this.sendLobby(room);
          }
        }
        room.settings = want;
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
      }
      case "start":
        if (room.game || room.host !== seat.id) return;
        return this.startGame(room);
      case "cmd":
        return this.command(room, seat, m.id, m.c);
      case "skip":
        return this.askSkip(room, seat, m.on);
      case "speed":
      case "pause":
        if (!room.game || room.game.state.over) return;
        // Touching the clock ends a skip ahead.
        if (room.skip.on && (m.t === "speed" || m.p)) {
          room.skip.on = false;
          room.skip.asked.clear();
          this.skipMsg(room, seat.name, `${seat.name} stopped skipping ahead.`);
        }
        // The host sets the pace in company. LEGACY (r21): anyone may pause
        // or start the clock, but after someone pauses, only they may start
        // it for PAUSE_LOCK_MS (the host's speed is set, the clock stays).
        if (m.t === "speed") {
          if (!room.solo && room.host !== seat.id) return;
          room.speed = m.s;
          if (!this.lockedFor(room, seat)) {
            room.paused = false;
            room.lock = null;
          }
        } else if (m.p) {
          if (room.paused) return;
          room.paused = true;
          room.lock = room.solo
            ? null
            : {
                seat: seat.id,
                name: seat.name,
                until: this.now() + PAUSE_LOCK_MS,
              };
        } else {
          const locked = this.lockedFor(room, seat);
          if (locked) {
            const secs = Math.ceil((locked.until - this.now()) / 1000);
            return this.send(conn, {
              t: "err",
              msg: `${locked.name} paused the game: only they can start the clock for ${secs} more second${secs === 1 ? "" : "s"}.`,
            });
          }
          room.paused = false;
          room.lock = null;
        }
        this.broadcast(room, {
          t: "clock",
          speed: room.speed,
          paused: room.paused,
          by: seat.name,
          lock: this.lockInfo(room), // LEGACY (r21)
        });
        for (const x of room.seats) this.sendLetters(room, x);
        if (room.paused) void this.save(room);
        return;
      case "chat":
        // The players' table talk: not for watchers (SITE r19).
        this.broadcast(
          room,
          {
            t: "chat",
            from: seat.name,
            text: m.text.slice(0, 300),
          },
          false,
        );
        return;
      // SITE (r19): the host lets watchers into a private (or solo) game, or
      // shuts them out, before it starts or while it runs.
      case "allowwatch":
        if (room.host !== seat.id) return;
        return this.setAllowWatchers(room, m.allow);
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
    conn.dlc = await dlcOf(conn.accountId, this.owned); // DLC (r21)
    this.send(conn, {
      t: "welcome",
      name: conn.name,
      account: conn.username,
      dlc: conn.dlc,
    });
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
        // SITE (r19): a game begun can be watched as well as dropped into.
        ...(r.game ? { watchId: r.watchId, watchers: r.watchers.size } : {}),
      });
    }
    let saved: SavedGame[] = [];
    let finished: SavedGame[] = [];
    if (conn.accountId !== null && derpyDbConfigured()) {
      const acc = conn.accountId;
      // STORY (r17): whether it's yours to delete, and the finished and old ones apart.
      const asSaved = (r: SaveRow): SavedGame => {
        const mine = r.seats.find((s) => s.accountId === acc);
        const live = [...this.rooms.values()].find(
          (x) => x.saveId === r.id && x.overAt === null,
        );
        return {
          id: r.id,
          title: r.title,
          power: mine?.power ?? "",
          year: r.year,
          savedAt: r.updatedAt,
          players: r.seats.map((s) => s.name),
          live: live && !r.over ? live.code : null,
          mine: ownerOf(r) === acc,
          by: r.seats.find((x) => x.accountId === ownerOf(r))?.name,
          ...(r.over ? { over: true } : {}),
          ...(r.version !== STATE_VERSION ? { old: true } : {}),
        };
      };
      try {
        saved = (await savesFor(acc, STATE_VERSION))
          .filter((r) => !this.deleted.has(r.id))
          .map(asSaved);
        finished = (await finishedFor(acc, STATE_VERSION))
          .filter((r) => !this.deleted.has(r.id))
          .map(asSaved);
      } catch (err) {
        log.warn(`couldn't list saves: ${err}`);
      }
    }
    // SITE (r19): the games anyone may watch right now.
    this.send(conn, { t: "rooms", open, saved, finished, live: this.live() });
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
      dlc: conn.dlc, // DLC (r21)
    };
  }

  private leaveCurrent(conn: Conn): void {
    if (conn.room || conn.watching) this.disconnect(conn);
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
      owner: null, // STORY (r17)
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
      dice: new Map(), // DICE (r14)
      cards: new Map(), // EVENTS (r21)
      skip: {
        on: false,
        asked: new Set(),
        mark: "",
        from: 0,
        wasPaused: false,
      },
      // SITE (r19): off for a private game until its host allows them.
      watchers: new Set(),
      allowWatchers: false,
      watchId: randomToken(9),
      // LEGACY (r21)
      pausedAt: null,
      lock: null,
      finishing: null,
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

  private async create(
    conn: Conn,
    solo: boolean,
    open: boolean,
    settings: RoomSettings,
  ): Promise<void> {
    // DLC (r21): a start date that needs a store item needs its owner as host.
    if (settings.start !== undefined && hostProblem(settings.start, NO_DLC)) {
      conn.dlc = await dlcOf(conn.accountId, this.owned);
      const why = hostProblem(settings.start, conn.dlc);
      if (why) return this.send(conn, { t: "err", msg: why });
    }
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
    seat.dlc = conn.dlc; // DLC (r21)
    if (room.game) setLegendsOwned(room.game, seat.id, !!conn.dlc.legends);
    if (conn.accountId !== null) {
      seat.accountId = conn.accountId;
      seat.name = conn.name;
      // NAMES (r20): a player who changed their username since they sat
      // down shows the new one from their return (their character keeps
      // its own name).
      const life = room.game ? lifeOfSeat(room.game.state, seat.id) : null;
      if (life && life.name !== seat.name) {
        life.name = seat.name;
        room.game!.lifeChanged(seat.id);
      }
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
    if (this.deleted.has(id))
      return this.send(conn, { t: "err", msg: "That game has been deleted." }); // STORY (r17)
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
    // DLC (r21): loading a game is hosting it.
    conn.dlc = await dlcOf(conn.accountId, this.owned);
    const cannot = loadProblem(saved.state.settings.start, conn.dlc);
    if (cannot) return this.send(conn, { t: "err", msg: cannot });
    // Someone else loaded it while we waited (or deleted it: STORY r17).
    if (running()) return rejoinRunning(running()!);
    if (this.deleted.has(id))
      return this.send(conn, { t: "err", msg: "That game has been deleted." });
    this.leaveCurrent(conn);
    const room = this.newRoom(null, saved.seats.length <= 1, false, {
      difficulty: saved.state.settings.difficulty,
      start: saved.state.settings.start,
    });
    room.saveId = id;
    room.owner = ownerOf(saved); // STORY (r17)
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

  // ---------------------------------------------------------------- watchers (SITE r19)

  /** Whether anyone may watch a room: one open to all, or one its host opened to watchers. */
  private watchable(room: Room): boolean {
    return (room.open && !room.solo) || room.allowWatchers;
  }

  /**
   * The games being played now that anyone may watch, for the lobby and Derp
   * Land's front page. A game nobody's at (they've all stepped away) isn't
   * being played, so it isn't offered.
   */
  live(): LiveRoom[] {
    const out: LiveRoom[] = [];
    for (const r of this.rooms.values()) {
      const g = r.game;
      if (!g || g.state.over || r.overAt !== null || !this.watchable(r))
        continue;
      if (!r.seats.some((x) => x.conn)) continue;
      out.push({
        watchId: r.watchId,
        title: titleOf(r),
        open: r.open && !r.solo,
        solo: r.solo,
        year: dateOf(g.state.day).year,
        date: formatDate(g.state.day),
        difficulty: r.settings.difficulty,
        startedAt: r.startedAt,
        paused: r.paused,
        players: seatInfo(r)
          .filter((x) => x.made)
          .map((x) => ({
            name: x.name,
            character: x.character,
            origin: x.origin,
            online: x.online,
          })),
        watchers: r.watchers.size,
        full: r.watchers.size >= MAX_WATCHERS,
      });
    }
    return out.sort(
      (a, b) =>
        b.players.length - a.players.length || a.startedAt - b.startedAt,
    );
  }

  /** Watch a game being played: no seat, no say, and nobody's secrets. */
  private watch(conn: Conn, id: string): void {
    const room = [...this.rooms.values()].find((r) => r.watchId === id);
    const refuse = (why: string) => this.send(conn, { t: "watchend", why });
    if (!room || !room.game || room.overAt !== null)
      return refuse("That game isn't being played any more.");
    if (!this.watchable(room))
      return refuse("That game's host hasn't opened it to watchers.");
    if (conn.watching !== room) {
      if (room.watchers.size >= MAX_WATCHERS)
        return refuse(
          `${MAX_WATCHERS} people are watching that game already. Try again in a while.`,
        );
      this.leaveCurrent(conn);
      // Everyone else's copy brought up to date first, so the state sent
      // now and the changes that follow it line up.
      this.flush(room);
      room.watchers.add(conn);
      conn.watching = room;
    }
    const game = room.game;
    this.send(conn, {
      t: "game",
      code: room.watchId,
      you: "",
      secret: "",
      host: room.host,
      solo: room.solo,
      state: stateForWatcher(game.state),
      speed: room.speed,
      paused: room.paused,
      seats: seatInfo(room),
      watcher: true,
      watchers: room.watchers.size,
      allowWatchers: room.allowWatchers,
      open: room.open,
    });
    this.sendDiceClocks(room, conn);
    if (room.skip.on || room.skip.asked.size)
      this.send(conn, {
        t: "skip",
        on: room.skip.on,
        asked: [...room.skip.asked],
        by: null,
        why: null,
      });
    this.watchersChanged(room);
  }

  /** A watcher goes (closing the page, leaving, or going to play). */
  private stopWatching(conn: Conn): void {
    const room = conn.watching;
    if (!room) return;
    conn.watching = null;
    room.watchers.delete(conn);
    this.watchersChanged(room);
  }

  /** Everyone in a running game hears how many are watching ("2 watching"). */
  private watchersChanged(room: Room): void {
    if (!room.game) return;
    this.broadcast(room, {
      t: "watchers",
      n: room.watchers.size,
      allow: room.allowWatchers,
    });
  }

  /** The host opens a private game to watchers, or closes it (they're sent away). */
  private setAllowWatchers(room: Room, allow: boolean): void {
    if (room.allowWatchers === allow) return;
    room.allowWatchers = allow;
    if (!this.watchable(room))
      for (const w of [...room.watchers]) {
        room.watchers.delete(w);
        w.watching = null;
        this.send(w, {
          t: "watchend",
          why: "The host has closed that game to watchers.",
        });
      }
    if (room.game) this.watchersChanged(room);
    else this.sendLobby(room);
  }

  /** A room closes: its watchers are told, and go back to the lobby. */
  private closeRoom(room: Room, why = "That game has closed."): void {
    this.rooms.delete(room.code);
    for (const w of room.watchers) {
      w.watching = null;
      this.send(w, { t: "watchend", why });
    }
    room.watchers.clear();
  }

  // ---------------------------------------------------------------- saved games (STORY r17)

  /** Why saved games can't be managed here and now, or null. */
  private savesOff(conn: Conn): string | null {
    if (conn.accountId === null) return "Sign in to manage your saved games.";
    if (!derpyDbConfigured()) return "Games aren't saved on this server.";
    return null;
  }

  /** A running game's room for a save, unless it's over (a finished room only shows its results). */
  private liveRoom(id: string): Room | undefined {
    return [...this.rooms.values()].find(
      (r) => r.saveId === id && r.overAt === null,
    );
  }

  /**
   * Delete a saved game: only the account that began it may, and not while
   * anyone is playing in it. A room with nobody in it is closed first (and
   * never saved again), so the save can't come back.
   */
  private async deleteSaved(conn: Conn, id: string): Promise<void> {
    const off = this.savesOff(conn);
    if (off) return this.send(conn, { t: "err", msg: off });
    const acc = conn.accountId!;
    let row: Awaited<ReturnType<typeof saveInfo>>;
    try {
      row = await saveInfo(id);
    } catch (err) {
      log.warn(`couldn't read save ${id}: ${err}`);
      return this.send(conn, {
        t: "err",
        msg: "Couldn't reach the saved games. Try again in a moment.",
      });
    }
    if (!row || !row.accounts.includes(acc) || this.deleted.has(id)) {
      void this.list(conn);
      return this.send(conn, {
        t: "err",
        msg: "That saved game isn't on your list.",
      });
    }
    const owner = ownerOf(row);
    if (owner !== acc) {
      const who = row.seats.find((x) => x.accountId === owner)?.name;
      return this.send(conn, {
        t: "err",
        msg: `Only ${who ?? "whoever began it"} can delete "${row.title}". You can take it off your own list instead.`,
      });
    }
    const room = this.liveRoom(id);
    const here = room?.seats.filter((x) => x.conn) ?? [];
    if (here.length) {
      const names = here.map((x) =>
        x.accountId === acc ? "you (somewhere else)" : x.name,
      );
      return this.send(conn, {
        t: "err",
        msg: `"${row.title}" is being played right now, by ${names.join(" and ")}. It can be deleted once everyone has left it.`,
      });
    }
    this.deleted.add(id);
    // The room (if it's still open, empty or showing its results) never saves again.
    for (const r of this.rooms.values()) {
      if (r.saveId !== id) continue;
      if (r.saving) await r.saving.catch(() => undefined);
      r.saveId = null;
      if (r.overAt === null) {
        this.closeRoom(r, "That game has been deleted.");
        log.info("room closed: its save was deleted", { code: r.code });
      }
    }
    let gone: boolean;
    try {
      gone = await deleteSave(id, acc);
    } catch (err) {
      log.warn(`couldn't delete save ${id}: ${err}`);
      this.deleted.delete(id);
      return this.send(conn, {
        t: "err",
        msg: "Couldn't delete it just now. Try again in a moment.",
      });
    }
    if (!gone) this.deleted.delete(id);
    log.info("save deleted", { id, gone });
    this.send(conn, {
      t: "forgot",
      ids: gone ? [id] : [],
      text: gone ? `"${row.title}" is deleted.` : "Nothing was deleted.",
    });
    await this.list(conn);
  }

  /** Take a saved game off your own list (it stays for the others who played in it). */
  private async hideSaved(conn: Conn, id: string): Promise<void> {
    const off = this.savesOff(conn);
    if (off) return this.send(conn, { t: "err", msg: off });
    let ok: boolean;
    let title = "That game";
    try {
      const row = await saveInfo(id);
      if (row) title = `"${row.title}"`;
      ok = await hideSave(id, conn.accountId!);
    } catch (err) {
      log.warn(`couldn't hide save ${id}: ${err}`);
      return this.send(conn, {
        t: "err",
        msg: "Couldn't reach the saved games. Try again in a moment.",
      });
    }
    if (!ok) {
      void this.list(conn);
      return this.send(conn, {
        t: "err",
        msg: "That saved game isn't on your list.",
      });
    }
    this.send(conn, {
      t: "forgot",
      ids: [id],
      text: `${title} is off your list. It comes back if you play in it again.`,
    });
    await this.list(conn);
  }

  /** Every finished (or old) game on your list: those you began deleted, the rest taken off your list. */
  private async clearFinished(conn: Conn): Promise<void> {
    const off = this.savesOff(conn);
    if (off) return this.send(conn, { t: "err", msg: off });
    const acc = conn.accountId!;
    let rows: SaveRow[];
    try {
      rows = await finishedFor(acc, STATE_VERSION);
    } catch (err) {
      log.warn(`couldn't list finished saves: ${err}`);
      return this.send(conn, {
        t: "err",
        msg: "Couldn't reach the saved games. Try again in a moment.",
      });
    }
    const ids: string[] = [];
    let deleted = 0;
    let hidden = 0;
    for (const r of rows) {
      // An old version's game can't be running; a finished one only shows its results.
      if (this.liveRoom(r.id)) continue;
      try {
        if (ownerOf(r) === acc) {
          this.deleted.add(r.id);
          for (const room of this.rooms.values())
            if (room.saveId === r.id) {
              if (room.saving) await room.saving.catch(() => undefined);
              room.saveId = null;
            }
          if (await deleteSave(r.id, acc)) {
            deleted++;
            ids.push(r.id);
          } else this.deleted.delete(r.id);
        } else if (await hideSave(r.id, acc)) {
          hidden++;
          ids.push(r.id);
        }
      } catch (err) {
        log.warn(`couldn't clear save ${r.id}: ${err}`);
      }
    }
    const said = [
      deleted
        ? `${deleted} finished game${deleted === 1 ? "" : "s"} deleted`
        : "",
      hidden ? `${hidden} you only joined taken off your list` : "",
    ].filter(Boolean);
    this.send(conn, {
      t: "forgot",
      ids,
      text: said.length ? `${cap(said.join("; "))}.` : "Nothing to clear away.",
    });
    await this.list(conn);
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
        allowWatchers: room.allowWatchers, // SITE (r19)
      });
    }
  }

  // ---------------------------------------------------------------- skipping ahead (LIFE r11)

  private skipMsg(room: Room, by: string | null, why: string | null): void {
    this.broadcast(room, {
      t: "skip",
      on: room.skip.on,
      asked: [...room.skip.asked],
      by,
      why,
    });
  }

  /** Players whose say counts: connected and living a life. */
  private skipVoters(room: Room): Seat[] {
    const s = room.game!.state;
    return room.seats.filter((x) => {
      if (!x.conn) return false;
      const life = lifeOfSeat(s, x.id);
      return !!life && !life.watching && life.c >= 0;
    });
  }

  private askSkip(room: Room, seat: Seat, on: boolean): void {
    const game = room.game;
    if (!game || game.state.over) return;
    if (!on) {
      if (room.skip.on)
        return this.stopSkip(room, `${seat.name} stopped skipping ahead.`);
      room.skip.asked.delete(seat.id);
      return this.skipMsg(room, seat.name, null);
    }
    if (room.skip.on) return;
    const blocked = skipBlocker(game.state);
    if (blocked) {
      if (seat.conn)
        this.send(seat.conn, {
          t: "skip",
          on: false,
          asked: [...room.skip.asked],
          by: null,
          why: blocked,
        });
      return;
    }
    room.skip.asked.add(seat.id);
    const voters = this.skipVoters(room);
    if (room.solo || voters.every((v) => room.skip.asked.has(v.id)))
      return this.startSkip(room, seat.name);
    this.skipMsg(room, seat.name, null);
  }

  private startSkip(room: Room, by: string): void {
    const game = room.game!;
    room.skip.on = true;
    room.skip.wasPaused = room.paused;
    room.skip.mark = attentionMark(game.state);
    room.skip.from = game.state.day;
    room.paused = false;
    room.lock = null; // LEGACY (r21)
    room.owed = 0;
    this.broadcast(room, {
      t: "clock",
      speed: room.speed,
      paused: false,
      by: null,
    });
    this.skipMsg(room, by, null);
    for (const x of room.seats) this.sendLetters(room, x);
  }

  /** Back to the clock as it was, and tell everyone why. */
  private stopSkip(room: Room, why: string): void {
    if (!room.skip.on) return;
    room.skip.on = false;
    room.skip.asked.clear();
    room.paused = room.skip.wasPaused;
    room.owed = 0;
    this.broadcast(room, {
      t: "clock",
      speed: room.speed,
      paused: room.paused,
      by: null,
    });
    this.skipMsg(room, null, why);
    for (const x of room.seats) this.sendLetters(room, x);
    if (room.paused) void this.save(room);
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
      // DICE (r14): everyone's dice but your own stay under their cups.
      // INTRIGUE (r15): and everyone's schemes and private letters but your own.
      // LABOUR (r15): and another household's door, opened to someone fleeing.
      // ECON (r17): and bonds, but your own.
      // CROWN (r18): and another colony's petition to its crown, until it sails.
      // (All composed in Viewers.ts: SITE r19.)
      state: stateForViewer(room.game.state, seat.id),
      speed: room.speed,
      paused: room.paused,
      seats: seatInfo(room),
      // SITE (r19): who's watching, and whether they may.
      watchers: room.watchers.size,
      allowWatchers: room.allowWatchers,
      open: room.open,
    });
    this.sendLetters(room, seat);
    this.sendDiceClocks(room, seat.conn); // DICE (r14)
    void this.sendAchievements(seat); // MAP (r12)
    // LEGACY (r21): who paused (and how long only they may start the clock),
    // and the Derp Coins this game has paid them so far.
    const lock = this.lockInfo(room);
    if (lock)
      this.send(seat.conn, {
        t: "clock",
        speed: room.speed,
        paused: room.paused,
        by: null,
        lock,
      });
    if (seat.accountId === null) this.send(seat.conn, TablePay.guestNote());
    else this.pay.greet(room, seat);
    if (room.skip.on || room.skip.asked.size)
      this.send(seat.conn, {
        t: "skip",
        on: room.skip.on,
        asked: [...room.skip.asked],
        by: null,
        why: null,
      });
  }

  private async startGame(room: Room): Promise<void> {
    const host = room.seats.find((s) => s.id === room.host);
    const players = room.seats.filter((s) => s.plan);
    const tell = (msg: string) => {
      if (host?.conn) this.send(host.conn, { t: "err", msg });
    };
    if (!host?.plan) return tell("Make your character first.");
    // DLC (r21): the host must own a start date's store item (checked again now).
    if (hostProblem(room.settings.start, NO_DLC)) {
      const dlc = await dlcOf(host.accountId, this.owned);
      if (host.conn) host.conn.dlc = dlc;
      host.dlc = dlc;
      const why = hostProblem(room.settings.start, dlc);
      if (why) return tell(why);
      if (room.game) return;
    }
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
        endYear: endYearOf(room.settings.start, END_YEAR), // DLC (r21)
        difficulty: room.settings.difficulty,
        seed: randomBytes(4).readInt32LE(0),
        start: room.settings.start ?? 1607,
      },
      players.map((s) => ({ seat: s.id, name: s.name, plan: s.plan! })),
    );
    // DLC (r21): Legends come to the seats whose accounts own them.
    for (const x of room.seats)
      setLegendsOwned(room.game, x.id, !!x.dlc?.legends);
    room.game.takeDelta();
    room.startedAt = this.now();
    room.saveId = `${room.code}-${room.startedAt}`;
    // STORY (r17): the save is the host's to delete (or the first signed-in player's).
    room.owner =
      host.accountId ??
      players.find((x) => x.accountId !== null)?.accountId ??
      null;
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
    this.pay.choice(room, seat); // LEGACY (r21): a choice of their own
    // INTRIGUE (r15): a letter in your own words, checked here as well as by
    // the game: its length, and how many a seat may send a minute.
    const why = this.noteLimit(seat, c);
    if (why) {
      this.send(seat.conn, { t: "ack", id, err: why });
      return;
    }
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

  /** INTRIGUE (r15): private letters sent by each seat lately (times, by the server's clock). */
  private notes = new Map<string, number[]>();

  /** INTRIGUE (r15): why a private letter can't go just now (too long, too many), or null. */
  private noteLimit(seat: Seat, c: unknown): string | null {
    const cmd = c as {
      k?: unknown;
      act?: unknown;
      body?: unknown;
      subject?: unknown;
    };
    if (!cmd || cmd.k !== "intrigue" || cmd.act !== "write") return null;
    if (typeof cmd.body !== "string" || cmd.body.length > NOTE_MAX * 2)
      return `No more than ${NOTE_MAX} characters.`;
    if (
      cmd.subject !== undefined &&
      (typeof cmd.subject !== "string" || cmd.subject.length > 200)
    )
      return "That subject is too long.";
    const now = this.now();
    const recent = (this.notes.get(seat.id) ?? []).filter(
      (t) => now - t < 60_000,
    );
    if (recent.length >= NOTES_A_MINUTE)
      return "You've written a great deal just now: let the ink dry a minute.";
    recent.push(now);
    this.notes.set(seat.id, recent);
    return null;
  }

  /** Sends everyone what changed since last time. */
  private flush(room: Room): void {
    if (!room.game) return;
    room.lastSent = this.now();
    const d = room.game.takeDelta();
    // DICE (r14): when a dice table changed, each player gets their own copy
    // (their own dice, nobody else's until the cups are lifted).
    // INTRIGUE (r15): so too schemes, and secrets in a life (a plot's lines,
    // a private letter): each player is sent only their own.
    // LABOUR (r15): so too a household's door opened to someone fleeing.
    // ECON (r17): bonds, each player's own. CROWN (r18): a petition is its
    // colony's until it sails. SITE (r19): composed in Viewers.ts; watchers
    // get the view of nobody's seat, worked out only when anyone watches.
    if (deltaIsPerViewer(d)) {
      for (const seat of room.seats) {
        if (!seat.conn) continue;
        this.send(seat.conn, {
          t: "d",
          d: deltaForViewer(room.game.state, d, seat.id),
        });
      }
      if (room.watchers.size)
        this.toWatchers(
          room,
          JSON.stringify({ t: "d", d: deltaForWatcher(room.game.state, d) }),
        );
    } else this.broadcast(room, { t: "d", d });
    void this.achievements(room);
  }

  /**
   * MAP (r12): achievements newly earned in the game: each paid once per
   * account, and the player told (the toast). The first look at a seat
   * (a game begun or picked up again) only notes what's there, quietly
   * making sure it was paid.
   */
  private achievements(room: Room): Promise<unknown> {
    const game = room.game;
    if (!game) return Promise.resolve();
    const pays: Promise<unknown>[] = [];
    for (const seat of room.seats) {
      const life = lifeOfSeat(game.state, seat.id);
      if (!life) continue;
      const got = Object.keys(life.achieved ?? {});
      if (!seat.achSeen) {
        seat.achSeen = new Set(got);
        for (const key of got)
          pays.push(this.payAchievement(room, seat, key, false));
        continue;
      }
      for (const key of got) {
        if (seat.achSeen.has(key)) continue;
        seat.achSeen.add(key);
        pays.push(this.payAchievement(room, seat, key, true));
      }
    }
    return Promise.all(pays);
  }

  private async payAchievement(
    room: Room,
    seat: Seat,
    key: string,
    tell: boolean,
  ): Promise<void> {
    let paid: { first: boolean; coins: number } | null = null;
    if (seat.accountId !== null && derpyDbConfigured()) {
      try {
        paid = await awardAchievement(
          seat.accountId,
          key,
          room.saveId ?? room.code,
        );
      } catch (err) {
        log.warn(`couldn't pay achievement ${key}: ${err}`);
      }
    }
    if (tell && seat.conn)
      this.send(seat.conn, {
        t: "achieved",
        key,
        coins: seat.accountId !== null ? (paid?.coins ?? 0) : null,
        first: paid?.first ?? false,
      });
  }

  /** MAP (r12): the account's achievements, for the page (a guest has none). */
  private async sendAchievements(seat: Seat): Promise<void> {
    if (!seat.conn) return;
    if (seat.accountId === null || !derpyDbConfigured()) {
      this.send(seat.conn, {
        t: "achievements",
        signedIn: seat.accountId !== null,
        have: [],
      });
      return;
    }
    try {
      const have = await achievementsOf(seat.accountId);
      if (seat.conn)
        this.send(seat.conn, { t: "achievements", signedIn: true, have });
    } catch (err) {
      log.warn(`couldn't read achievements: ${err}`);
    }
  }

  /**
   * Save a running campaign with signed-in players to the database. With
   * `fresh`, a save already under way is waited for and then followed by
   * another, so what's written is the state now (the end of a game must not
   * be lost behind an autosave of the day before).
   */
  private save(room: Room, fresh = false): Promise<void> {
    if (!room.game || !room.saveId || !derpyDbConfigured())
      return Promise.resolve();
    if (this.deleted.has(room.saveId)) return Promise.resolve(); // STORY (r17)
    const game = room.game;
    const lives = room.seats.filter((s) => lifeOfSeat(game.state, s.id));
    if (!lives.some((s) => s.accountId !== null)) return Promise.resolve();
    if (room.saving)
      return fresh ? room.saving.then(() => this.save(room)) : room.saving;
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
      // STORY (r17): who began it, and who's playing (it's back on their lists).
      room.owner,
      room.seats
        .filter((x) => x.conn && x.accountId !== null)
        .map((x) => x.accountId!),
    )
      .then(() =>
        this.broadcast(
          room,
          {
            t: "saved",
            at: new Date(this.now()).toISOString(),
          },
          false, // SITE (r19): the players' business
        ),
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
        this.closeRoom(room);
      }
    }
  }

  private stepRoom(room: Room, dt: number, t: number): void {
    const game = room.game;
    if (room.overAt !== null && t - room.overAt > OVER_CLOSE_MS) {
      this.closeRoom(room);
      return;
    }
    if (room.emptySince !== null && t - room.emptySince > IDLE_CLOSE_MS) {
      void this.save(room);
      this.closeRoom(room, "Everyone left that game, and it has closed.");
      return;
    }
    if (!game || game.state.over) return;
    // LEGACY (r21): time at the table, counted on the real clock.
    if (room.paused) room.pausedAt ??= t;
    else room.pausedAt = null;
    this.pay.count(room, dt);
    if (t - room.lastSaved > SAVE_EVERY_MS && !room.paused)
      void this.save(room);
    this.letterClock(room, room.paused ? 0 : dt);
    // DICE (r14): the dice go on whether the world runs or not.
    this.diceClock(room, t);
    this.cardsClock(room, t); // EVENTS (r21): and the cards
    if (room.paused) return;
    const skipping = room.skip.on;
    room.owed +=
      (dt / 1000) *
      (skipping ? SKIP_DAYS_PER_SECOND : SPEED_DAYS_PER_SECOND[room.speed]) *
      TEST_FAST;
    let ticks = 0;
    while (room.owed >= 1 && ticks < 10 * TEST_FAST && !game.state.over) {
      game.tick();
      room.owed -= 1;
      ticks++;
      // Skipping ahead stops the moment anything needs anyone.
      if (skipping) {
        const mark = attentionMark(game.state);
        if (mark !== room.skip.mark) {
          this.flush(room);
          this.stopSkip(room, whyWoken(game.state, room.skip.mark));
          break;
        }
        if (game.state.day - room.skip.from >= SKIP_MAX_DAYS) {
          this.flush(room);
          this.stopSkip(room, "A whole year went by quietly.");
          break;
        }
      }
    }
    if (room.owed > 10 * TEST_FAST) room.owed = 0;
    if (game.state.over) {
      this.flush(room);
      void this.finishRoom(room);
      return;
    }
    if (ticks > 0 && t - room.lastSent >= SEND_EVERY_MS) this.flush(room);
    // LEGACY (r21): paid about once a minute, once the world has moved on.
    if (ticks > 0)
      for (const seat of room.seats) void this.pay.settle(room, seat);
  }

  // ---------------------------------------------------------------- the pause in company (LEGACY r21)

  /** Someone else's pause that `seat` may not undo yet, or null. */
  private lockedFor(
    room: Room,
    seat: Seat,
  ): { seat: string; name: string; until: number } | null {
    const l = room.lock;
    if (!l || room.solo || !room.paused || l.seat === seat.id) return null;
    if (this.now() >= l.until) return null;
    // A pauser who has left can't hold the clock.
    if (!room.seats.some((x) => x.id === l.seat && x.conn)) return null;
    return l;
  }

  /** The pause's lock as players are told it (null when nobody holds the clock). */
  private lockInfo(room: Room): {
    seat: string;
    name: string;
    left: number;
  } | null {
    const l = room.lock;
    if (!l || !room.paused || room.solo) return null;
    return {
      seat: l.seat,
      name: l.name,
      left: Math.max(0, l.until - this.now()),
    };
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

  /**
   * DICE (r14): a player who stalls can't hold up a table they share with
   * another player. On their turn they have STALL_SECONDS of real time (and
   * a little more for the computer players' moves the browsers play back
   * first); away from the game, a moment. Then the table moves for them:
   * an ordinary command, the smallest raise (or "Liar!"). Everyone at the
   * table is told how long they have. Alone with the town's people, the
   * table waits.
   */
  private diceClock(room: Room, now: number): void {
    const game = room.game!;
    const live = new Set<number>();
    for (const t of tablesOf(game.state)) {
      if (t.status !== "playing") continue;
      const x = t.seats[t.turn];
      if (!x || x.seat === undefined || x.state !== "in") continue;
      const players = t.seats.filter(
        (y) => y.seat !== undefined && y.state === "in",
      );
      if (players.length < 2) continue;
      live.add(t.id);
      const seat = room.seats.find((y) => y.id === x.seat);
      const away = !seat?.conn;
      let c = room.dice.get(t.id);
      if (!c || c.seq !== t.seq) {
        // The computer players' moves since the last player's, which the
        // browsers play back before it's anyone's turn.
        let i = t.acts.length - 1;
        while (
          i >= 0 &&
          !(
            (t.acts[i].k === "bid" || t.acts[i].k === "liar") &&
            seatOf(t, t.acts[i].c)?.seat !== undefined
          )
        )
          i--;
        const pace = Math.min(
          25_000,
          t.acts
            .slice(i + 1)
            .reduce(
              (m, a) =>
                m +
                (a.k === "reveal"
                  ? 4000
                  : a.k === "bid" || a.k === "liar"
                    ? 1100
                    : 300),
              0,
            ),
        );
        c = {
          seq: t.seq,
          due: now + pace + (away ? 1500 : STALL_SECONDS * 1000),
          away,
        };
        room.dice.set(t.id, c);
        this.broadcast(room, {
          t: "diceclock",
          id: t.id,
          c: x.c,
          left: Math.ceil((c.due - now) / 1000),
        });
      } else if (away && !c.away) {
        // They've just gone: a moment, then the table moves for them.
        c.away = true;
        c.due = Math.min(c.due, now + 1500);
      }
      if (now < c.due) continue;
      room.dice.delete(t.id);
      const err = game.lifeCommand(x.seat, {
        k: "dice",
        act: "auto",
        id: t.id,
      });
      // Somebody who can't be moved for (in irons, say) leaves the table.
      if (err) dropFromTable(game, t.id, x.c);
      this.flush(room);
    }
    for (const id of [...room.dice.keys()])
      if (!live.has(id)) room.dice.delete(id);
  }

  /**
   * EVENTS (r21): at vingt-et-un, players decide at once and at their own
   * pace; one who stalls can't hold up a table they share with another
   * player. A player still deciding their hand, or (between hands) not yet
   * saying whether they're in the next while another is waiting, has
   * CARD_STALL_SECONDS of real time (a moment, if they've gone from the
   * game). Then the table decides for them, with an ordinary command: their
   * hand played by the town's sense, or sitting the next one out. Alone with
   * the town's people, the table waits.
   */
  private cardsClock(room: Room, now: number): void {
    const game = room.game!;
    const live = new Set<number>();
    for (const t of cardTables(game.state)) {
      if (t.status !== "hand" && t.status !== "between") continue;
      const players = t.seats.filter(
        (y) => y.seat !== undefined && y.state !== "gone",
      );
      if (players.length < 2) continue;
      const waiting =
        t.status === "between" && players.some((y) => y.ready === true);
      const holding = players.filter((y) =>
        t.status === "hand"
          ? y.state === "play"
          : waiting && y.ready === undefined,
      );
      if (!holding.length) continue;
      live.add(t.id);
      const away = holding.every(
        (y) => !room.seats.find((z) => z.id === y.seat)?.conn,
      );
      let c = room.cards.get(t.id);
      if (!c || c.seq !== t.seq) {
        // The town's people's draws and the banker's, played back first.
        const pace = t.acts.some((a) => a.k === "settle" && a.hand === t.hand)
          ? 3500
          : 1200;
        c = {
          seq: t.seq,
          due: now + pace + (away ? 1500 : CARD_STALL_SECONDS * 1000),
          away,
        };
        room.cards.set(t.id, c);
        this.broadcast(room, {
          t: "cardsclock",
          id: t.id,
          left: Math.ceil((c.due - now) / 1000),
        });
      } else if (away && !c.away) {
        c.away = true;
        c.due = Math.min(c.due, now + 1500);
      }
      if (now < c.due) continue;
      room.cards.delete(t.id);
      for (const y of holding) {
        const err = game.lifeCommand(y.seat!, {
          k: "cards",
          act: "auto",
          id: t.id,
        });
        if (err) dropFromCards(game, t.id, y.c);
      }
      this.flush(room);
    }
    for (const id of [...room.cards.keys()])
      if (!live.has(id)) room.cards.delete(id);
  }

  /** DICE (r14): the clocks running at dice tables, for someone just come in (a player, or a watcher: SITE r19). */
  private sendDiceClocks(room: Room, conn: Conn | null): void {
    if (!conn || !room.game) return;
    const now = this.now();
    for (const [id, c] of room.dice) {
      const t = tablesOf(room.game.state).find((x) => x.id === id);
      const x = t?.seats[t.turn];
      if (!t || !x) continue;
      this.send(conn, {
        t: "diceclock",
        id,
        c: x.c,
        left: Math.max(0, Math.ceil((c.due - now) / 1000)),
      });
    }
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

  /** Works out results and coins, saves them, and tells everyone (once: LEGACY r21). */
  finishRoom(room: Room): Promise<ResultLine[]> {
    if (room.results) return Promise.resolve(room.results);
    room.finishing ??= this.finish(room);
    return room.finishing;
  }

  private async finish(room: Room): Promise<ResultLine[]> {
    const game = room.game!;
    room.overAt = this.now();
    const s = game.state;
    // MAP (r12): the last day's achievements (alive in 1776), paid before the results.
    for (const life of s.lives) checkAchievements(game, life);
    await this.achievements(room);
    // LEGACY (r21): what time at the table and the line earned while it was
    // played is paid first; the end pays the rest of the line's coins (still
    // held to the time played) and living to see 1776.
    for (const seat of room.seats) this.pay.ready(room, seat);
    await this.pay.settleAll(room);
    const reachedEnd = s.day >= s.endDay;
    const paying = derpyDbConfigured() && room.saveId !== null;
    const lines = room.seats
      .map((seat) => ({ seat, life: lifeOfSeat(s, seat.id) }))
      .filter(
        (x): x is { seat: Seat; life: NonNullable<typeof x.life> } => !!x.life,
      )
      .map(({ seat, life }) => {
        const coins = lifeCoins(life, reachedEnd && life.c >= 0);
        const last = s.chars[life.line[life.line.length - 1]];
        // Signed in with the games saved, the end is held to the time
        // played as well (pay that couldn't be read counts no time at all).
        const p =
          seat.accountId === null || !paying
            ? null
            : seat.pay?.ready
              ? seat.pay
              : { secs: 0, play: 0, lines: 0 };
        const end = p
          ? linesDue(life, p.secs, p.lines, reachedEnd && life.c >= 0)
          : null;
        return {
          seat,
          life,
          score: lifeScore(s, life),
          coins,
          pay: p && end ? { p, end } : null,
          lineName: last ? `${last.first} ${last.family}` : seat.name,
          // LEGACY (r21): every character the line was, and its chronicle
          // as anyone may read it (nothing secret).
          chars: lineCharacters(s, life, AMERICAS),
          chronicle: storedChronicle(
            chronicleOf(s, life, AMERICAS, { secrets: false }),
          ),
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
      coins:
        x.seat.accountId === null
          ? null
          : x.pay
            ? x.pay.p.play + x.pay.p.lines + x.pay.end.due
            : x.coins.total,
      coinLines: x.coins.lines,
      // LEGACY (r21)
      ...(x.pay
        ? {
            timeCoins: x.pay.p.play,
            linesInPlay: x.pay.p.lines,
            atEnd: x.pay.end.due,
            held: x.pay.end.held,
            minutes: Math.floor(x.pay.p.secs / 60),
          }
        : {}),
      chars: x.chars,
    }));
    const winner = lines[0];
    await this.save(room, true);
    await recordConquestGame({
      gameId: room.saveId ?? `${room.code}-${room.startedAt}`,
      startedAt: room.startedAt,
      endedAt: this.now(),
      endYear: s.settings.endYear, // DLC (r21): 1784 for the 1776 campaign
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
        // LEGACY (r21): what's paid now (the rest was paid as they played),
        // all the game paid them, every character they were, and their chronicle.
        coins: x.pay ? x.pay.end.due : x.coins.total,
        total: room.results![i].coins,
        line: x.lineName,
        chars: x.chars,
        chronicle: x.chronicle,
      })),
    });
    this.broadcast(room, { t: "end", results: room.results });
    log.info("game over", { code: room.code, lines: lines.length });
    return room.results;
  }
}

/** LEGACY (r21): a chronicle as the site keeps it: people by name, no ids, no maps. */
function storedChronicle(ch: Chronicle): StoredChronicle {
  return {
    title: ch.title,
    opening: ch.opening,
    numbers: ch.numbers,
    chapters: ch.chapters.map((c) => ({
      roman: c.roman,
      name: c.name,
      years: c.years,
      title: c.title,
      paras: c.paras,
      people: c.people.map((p) => ({ name: p.name, role: p.role })),
      numbers: c.numbers,
    })),
    closing: ch.closing,
    tree: ch.tree.map((t) => ({
      name: t.name,
      years: t.years,
      came: t.came,
      spouses: t.spouses,
      children: t.children.map((k) => ({
        name: k.name,
        born: k.born,
        heir: k.heir,
        young: k.young,
      })),
    })),
  };
}

/** STORY (r17) */
function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
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
