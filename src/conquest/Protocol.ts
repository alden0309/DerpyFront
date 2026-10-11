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
  | { t: "leave" };

export type ServerMessage =
  | { t: "welcome"; name: string; account: string | null }
  | { t: "rooms"; open: OpenRoom[]; saved: SavedGame[] }
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
  /** Your waiting events: seconds of unpaused play each has left. */
  | { t: "letters"; left: Record<number, number>; paused: boolean }
  | { t: "end"; results: ResultLine[] }
  | { t: "err"; msg: string };
