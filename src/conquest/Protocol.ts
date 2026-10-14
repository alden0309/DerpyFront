// Derpy Conquest's messages between browsers and the game server, sent as
// JSON over the /conquest/ws WebSocket. Each player is one character living
// in a world the server runs; they send what their character does.

import type {
  Difficulty,
  GameDelta,
  GameState,
  LifeCommand,
  LifePlan,
  StartYear,
} from "./engine/Types";

export const CONQUEST_WS_PATH = "/conquest/ws";
export const MAX_NAME_LENGTH = 24;
/** Every game ends on 1 January 1776. */
export const END_YEAR = 1776;
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
export const START_CHOICES: StartYear[] = [1607, 1650, 1700];

export interface RoomSettings {
  difficulty: Difficulty;
  /** The year the game begins; 1607 if not given. */
  start?: StartYear;
}

export interface SeatInfo {
  id: string;
  name: string;
  online: boolean;
  /** Signed in to a Derp Land account (earns Derp Coins). */
  account: boolean;
  /** Has made a character (in the room) or is living one (in the game). */
  made: boolean;
  /** The people their character comes from, once made. */
  origin: string | null;
  /** Their character's name, once made. */
  character: string | null;
  /** Their line has ended: watching the world. */
  watching: boolean;
  ready: boolean;
}

/** A game anyone can join, for the lobby list. */
export interface OpenRoom {
  code: string;
  host: string;
  players: { name: string; origin: string | null }[];
  settings: RoomSettings;
  started: boolean;
  /** In-game year, once it's started. */
  year: number | null;
  /** SITE (r19): once it's begun, the id to watch it by, and how many do. */
  watchId?: string;
  watchers?: number;
}

/** SITE (r19): watchers a game may have at once. */
export const MAX_WATCHERS = 25;

/**
 * SITE (r19): a game being played now that anyone may watch: one open to
 * all, or a private one whose host allows watchers. Watched by `watchId`
 * (never the room's code, which would let anyone into a private game).
 */
export interface LiveRoom {
  watchId: string;
  /** "The Drackleys and the Coles, from 1650". */
  title: string;
  /** Open to anyone to join (else a private game whose host lets watchers in). */
  open: boolean;
  solo: boolean;
  /** The world's year, and its date ("4 March 1689"). */
  year: number;
  date: string;
  difficulty: Difficulty;
  /** When this sitting began (ms). */
  startedAt: number;
  paused: boolean;
  /** The players living lives in it, with their characters and peoples. */
  players: {
    name: string;
    character: string | null;
    origin: string | null;
    online: boolean;
  }[];
  watchers: number;
  /** As many watching as may. */
  full: boolean;
}

/** A saved game you played in, for picking up later. */
export interface SavedGame {
  id: string;
  title: string;
  /** The people your line comes from. */
  power: string;
  year: number;
  savedAt: string;
  players: string[];
  /** Running right now (join it), or waiting to be loaded. */
  live: string | null;
  /** STORY (r17): you began it, so you may delete it (others may only take it off their list). */
  mine?: boolean;
  /** STORY (r17): who began it (whose it is to delete). */
  by?: string;
  /** STORY (r17): the game has ended (it can't be picked up again). */
  over?: boolean;
  /** STORY (r17): saved by an older version of the game (it can't be loaded). */
  old?: boolean;
}

export interface ResultLine {
  name: string;
  /** The family (or the last character's name). */
  line: string;
  /** Power or native nation key the line began among. */
  power: string;
  rank: number;
  score: number;
  won: boolean;
  /** Derp Coins paid, or null if they weren't signed in. */
  coins: number | null;
  /** The coins, line by line. */
  coinLines: { line: string; coins: number }[];
}

export type ClientMessage =
  | { t: "hello"; name: string; token?: string }
  | { t: "list" }
  | { t: "create"; solo: boolean; open: boolean; settings: RoomSettings }
  | { t: "join"; code: string }
  | { t: "rejoin"; code: string; secret: string }
  | { t: "resume"; id: string }
  /** The character you'll be, made before the game starts. */
  | { t: "plan"; plan: LifePlan }
  /** A new character in a running world (dropping in, or after a line ends). */
  | { t: "life"; plan: LifePlan }
  | { t: "ready"; ready: boolean }
  | { t: "settings"; settings: RoomSettings; open: boolean }
  | { t: "start" }
  | { t: "cmd"; id: number; c: LifeCommand }
  | { t: "speed"; s: number }
  | { t: "pause"; p: boolean }
  /** LIFE (r11): skip ahead until something needs someone (in company, all must agree). */
  | { t: "skip"; on: boolean }
  | { t: "chat"; text: string }
  | { t: "save" }
  | { t: "end" }
  | { t: "leave" }
  // STORY (r17): your saved games: delete one you began, take one off your
  // own list, or clear away every finished (and old) game at once.
  | { t: "delsave"; id: string }
  | { t: "hidesave"; id: string }
  | { t: "clearsaves" }
  // SITE (r19): watch a game (by its watch id), and the host letting
  // watchers into a private (or solo) game, or shutting them out.
  | { t: "watch"; id: string }
  | { t: "allowwatch"; allow: boolean };

export type ServerMessage =
  | { t: "welcome"; name: string; account: string | null }
  | {
      t: "rooms";
      open: OpenRoom[];
      saved: SavedGame[];
      /** STORY (r17): finished games, and those saved by an older version. */
      finished?: SavedGame[];
      /** SITE (r19): games being played now that anyone may watch. */
      live?: LiveRoom[];
    }
  | {
      t: "lobby";
      code: string;
      you: string;
      secret: string;
      host: string;
      solo: boolean;
      open: boolean;
      settings: RoomSettings;
      seats: SeatInfo[];
      /** SITE (r19): the host lets watchers into this private (or solo) game. */
      allowWatchers?: boolean;
    }
  | {
      t: "game";
      code: string;
      you: string;
      secret: string;
      host: string;
      solo: boolean;
      state: GameState;
      speed: number;
      paused: boolean;
      seats: SeatInfo[];
      /**
       * SITE (r19): you're watching (no seat: `you` and `secret` are empty,
       * `code` is the watch id, and the state holds nobody's secrets).
       */
      watcher?: true;
      /** SITE (r19): how many are watching, and whether a private game lets them. */
      watchers?: number;
      allowWatchers?: boolean;
      open?: boolean;
    }
  | { t: "d"; d: GameDelta }
  | { t: "clock"; speed: number; paused: boolean; by: string | null }
  /**
   * LIFE (r11): skipping ahead (on), or who has asked to (seat ids); when a
   * skip stops, why (what needed someone).
   */
  | {
      t: "skip";
      on: boolean;
      asked: string[];
      by: string | null;
      why: string | null;
    }
  | { t: "seats"; seats: SeatInfo[]; host: string }
  | { t: "ack"; id: number; err: string | null }
  | { t: "chat"; from: string; text: string }
  | { t: "saved"; at: string }
  /** STORY (r17): saved games deleted or taken off your list, and what to tell you. */
  | { t: "forgot"; ids: string[]; text: string }
  /** Your waiting events: seconds of unpaused play each has left. */
  | { t: "letters"; left: Record<number, number>; paused: boolean }
  | { t: "end"; results: ResultLine[] }
  | { t: "err"; msg: string }
  // MAP (r12): achievements. The account's (when you join a game), and each
  // one as it's earned: the Derp Coins it paid (0 if the account had it
  // already; null for a guest, who isn't paid).
  | {
      t: "achievements";
      signedIn: boolean;
      have: { key: string; at: string; coins: number }[];
    }
  | { t: "achieved"; key: string; coins: number | null; first: boolean }
  // DICE (r14): whose turn it is at a dice table, and the seconds they have
  // before the table bids for them (only at a table with two players or more).
  | { t: "diceclock"; id: number; c: number; left: number }
  // EVENTS (r21): how long the players holding up a card table have to decide.
  | { t: "cardsclock"; id: number; left: number }
  // SITE (r19): how many are watching (players see "2 watching"), and
  // whether the host lets them; and a watcher's watching over (the game
  // closed, the host shut watchers out, or it couldn't begin), and why.
  | { t: "watchers"; n: number; allow: boolean }
  | { t: "watchend"; why: string };
