// Derpy Conquest's messages between browsers and the game server, sent as
// JSON over the /conquest/ws WebSocket.

import type { Command, Difficulty, GameDelta, GameState } from "./engine/Types";

export const CONQUEST_WS_PATH = "/conquest/ws";
export const MAX_NAME_LENGTH = 24;
export const END_YEARS = [1630, 1650, 1675, 1700] as const;
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export interface RoomSettings {
  endYear: number;
  difficulty: Difficulty;
}

export interface SeatInfo {
  id: string;
  name: string;
  /** Power key they picked, or null (watching). */
  power: string | null;
  online: boolean;
  /** Signed in to a Derp Land account (earns Derp Coins). */
  account: boolean;
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
  | { t: "create"; solo: boolean; power?: string; settings: RoomSettings }
  | { t: "join"; code: string }
  | { t: "rejoin"; code: string; secret: string }
  | { t: "pick"; power: string | null }
  | { t: "settings"; settings: RoomSettings }
  | { t: "start" }
  | { t: "cmd"; id: number; c: Command }
  | { t: "speed"; s: number }
  | { t: "pause"; p: boolean }
  | { t: "chat"; text: string }
  | { t: "end" }
  | { t: "leave" };

export type ServerMessage =
  | { t: "welcome"; name: string; account: string | null }
  | {
      t: "lobby";
      code: string;
      you: string;
      secret: string;
      host: string;
      solo: boolean;
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
  | { t: "end"; results: ResultLine[] }
  | { t: "err"; msg: string };
