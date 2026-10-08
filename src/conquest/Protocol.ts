// Derpy Conquest's messages between browsers and the game server, sent as
// JSON over the /conquest/ws WebSocket.

import { STARTS } from "./engine/Starts";
import type {
  Command,
  Difficulty,
  GameDelta,
  GameState,
  GovernorPlan,
  StartYear,
} from "./engine/Types";

export const CONQUEST_WS_PATH = "/conquest/ws";
export const MAX_NAME_LENGTH = 24;
/** The game ends on 1 January of a year the host picks in this range. */
export const END_YEAR_MIN = 1625;
export const END_YEAR_MAX = 1800;
/** A game lasts at least this many years. */
export const MIN_GAME_YEARS = 15;
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export interface RoomSettings {
  endYear: number;
  difficulty: Difficulty;
  /** The year the game begins; 1607 if not given. */
  start?: StartYear;
}

/** Whether a power has a colony to play in a start year. */
export function powerExists(power: string, start: StartYear = 1607): boolean {
  const era = STARTS[start];
  if (!era) return true;
  return Object.values(era.owners).includes(power);
}

/** The earliest end year a start year allows. */
export function minEndYear(start: StartYear = 1607): number {
  return Math.max(END_YEAR_MIN, start + MIN_GAME_YEARS);
}

export interface SeatInfo {
  id: string;
  name: string;
  /** Power key they picked, or null (watching). */
  power: string | null;
  online: boolean;
  /** Signed in to a Derp Land account (earns Derp Coins). */
  account: boolean;
  /** Has made their governor. */
  governor: boolean;
  ready: boolean;
}

/** A game anyone can join, for the lobby list. */
export interface OpenRoom {
  code: string;
  host: string;
  /** Players' names and the nations they've picked. */
  players: { name: string; power: string | null }[];
  settings: RoomSettings;
  started: boolean;
  /** In-game year, once it's started. */
  year: number | null;
}

/** A saved game you played in, for picking up later. */
export interface SavedGame {
  id: string;
  title: string;
  /** Your nation in it. */
  power: string;
  year: number;
  savedAt: string;
  players: string[];
  /** Running right now (join it), or waiting to be loaded. */
  live: string | null;
}

export interface ResultLine {
  name: string;
  power: string;
  rank: number;
  score: number;
  won: boolean;
  /** Derp Coins paid, or null if they weren't signed in. */
  coins: number | null;
}

export type ClientMessage =
  | { t: "hello"; name: string; token?: string }
  | { t: "list" }
  | { t: "create"; solo: boolean; open: boolean; settings: RoomSettings }
  | { t: "join"; code: string }
  | { t: "rejoin"; code: string; secret: string }
  | { t: "resume"; id: string }
  | { t: "pick"; power: string | null }
  | { t: "governor"; plan: GovernorPlan }
  | { t: "ready"; ready: boolean }
  | { t: "settings"; settings: RoomSettings; open: boolean }
  | { t: "start" }
  | { t: "cmd"; id: number; c: Command }
  | { t: "speed"; s: number }
  | { t: "pause"; p: boolean }
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
  | { t: "seats"; seats: SeatInfo[]; host: string }
  | { t: "ack"; id: number; err: string | null }
  | { t: "chat"; from: string; text: string }
  | { t: "saved"; at: string }
  /** Your unanswered letters: seconds of unpaused play each has left. */
  | { t: "letters"; left: Record<number, number>; paused: boolean }
  | { t: "end"; results: ResultLine[] }
  | { t: "err"; msg: string };
