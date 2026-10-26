// DFX (r26): watching a replay together. Shared by the server's rooms
// (src/server/derpy/ReplayRooms.ts) and the pages (the replay viewer's watch
// room, the hub's "Watch together" buttons). Types and constants only.
//
// A room is one saved DerpyFront game watched by several people at once.
// Every viewer plays the replay in their own browser, as the replay viewer
// always does; the server only keeps the room's clock (where the replay is,
// whether it plays and how fast) and who holds the controls, and relays
// changes. Rooms live in the master's memory and close when empty.

/** The rooms' socket, on the master. */
export const WATCH_WS_PATH = "/derpy/watch/ws";

/** A room's id: what its link carries (/watch/<room>). */
export const WATCH_ROOM_RE = /^[A-Za-z0-9]{10}$/;

/** The speeds a room may play at (the replay viewer's). */
export const WATCH_SPEEDS = [0.5, 1, 2, 4, 8, 16, 32] as const;

/**
 * The reactions anyone in a room may send, as indexes into the game's emoji
 * table (engine-api's flattenedEmojiTable): 👏 🔥 😱 😭 💀 🤡 👑 👍.
 */
export const WATCH_REACTIONS = [16, 30, 8, 7, 32, 11, 38, 20] as const;

/** The page's link for a room. */
export function watchRoomPath(room: string): string {
  return `/watch/${encodeURIComponent(room)}`;
}

/**
 * Where a replay is: `frame` at the server's time `at` (ms), and from there
 * moving at `speed` x 10 frames a second while `playing`.
 */
export interface WatchClock {
  frame: number;
  playing: boolean;
  speed: number;
  at: number;
}

export interface WatchMember {
  /** This connection's number in the room. */
  id: number;
  name: string;
  /** Signed in to Derp Land (the name is the account's). */
  account: boolean;
}

/** What the room's game is, from the saved game. */
export interface WatchGame {
  id: string;
  map: string;
  /** SCEN (r25): its Scenario, if any. */
  scenario: string | null;
}

export interface WatchRoomView {
  id: string;
  game: WatchGame;
  members: WatchMember[];
  /** Who hosts the room (may hand the controls on and take them back). */
  host: number;
  /** Who holds the controls (play, pause, speed, the timeline). */
  ctl: number;
  clock: WatchClock;
}

export type WatchOp = "play" | "pause" | "seek" | "speed";

/** From a page. `token`: a Derp Land session (the name is then the account's). */
export type WatchClientMessage =
  | { t: "join"; room: string; key?: string; token?: string; name?: string }
  /**
   * Whoever holds the controls: `frame` is where their replay is now;
   * `seq` comes back with the clock it makes, so they can tell their own
   * changes' echoes apart.
   */
  | { t: "ctl"; op: WatchOp; frame: number; speed?: number; seq?: number }
  /** The host or whoever holds the controls hands them to `to`. */
  | { t: "hand"; to: number }
  /** The host takes the controls back. */
  | { t: "take" }
  /** A reaction: an index of WATCH_REACTIONS' emoji. */
  | { t: "react"; e: number }
  | { t: "ping" };

export type WatchErrorCode =
  | "no_such_room"
  | "room_full"
  | "rate_limited"
  | "not_in_control"
  | "not_host"
  | "no_such_member"
  | "bad_message";

/** To a page. `now` is the server's clock, for the room's clock. */
export type WatchServerMessage =
  | { t: "welcome"; you: number; room: WatchRoomView; now: number }
  | {
      t: "clock";
      clock: WatchClock;
      op: WatchOp;
      by: number;
      seq?: number;
      now: number;
    }
  | {
      t: "members";
      members: WatchMember[];
      host: number;
      ctl: number;
      now: number;
    }
  | { t: "react"; from: number; e: number; now: number }
  | { t: "pong"; now: number }
  | { t: "error"; code: WatchErrorCode; now: number };

/** What `POST /derpy/api/watch` answers. */
export interface WatchCreated {
  room: string;
  /** Joining with it makes you the room's host (kept in this browser). */
  key: string;
}

export type WatchCreateError =
  | "invalid"
  | "no_such_game"
  | "rate_limited"
  | "too_many_rooms";
