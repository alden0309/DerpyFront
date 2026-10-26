// DFX (r26): "Watch together" buttons, wherever a finished DerpyFront game is
// listed (the profile's games, a friend's recent games, the win screen):
// make a room for the game and go to it. The room's host key is kept in this
// browser, so a reload (or coming back from another tab) is still the host.

import { api, ApiError } from "./Account";
import {
  watchRoomPath,
  type WatchCreated,
  type WatchCreateError,
} from "./WatchTypes";

const KEYS = "derp_watch_keys";

function readKeys(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Keep a room's host key in this browser (the last 20 rooms). */
export function rememberHostKey(room: string, key: string): void {
  try {
    const keys = readKeys();
    delete keys[room];
    keys[room] = key;
    const entries = Object.entries(keys).slice(-20);
    localStorage.setItem(KEYS, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // a private window: the first visit still hosts (the key rides in the
    // link's hash, which the room's page takes off)
  }
}

/** The host key this browser holds for a room, if any. */
export function hostKeyFor(room: string): string | undefined {
  const k = readKeys()[room];
  return typeof k === "string" ? k : undefined;
}

/** Make a room for a saved game. */
export async function createWatchRoom(
  gameId: string,
): Promise<WatchCreated | { error: WatchCreateError | "unreachable" }> {
  try {
    return await api<WatchCreated>("/watch", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      const code = err.code as WatchCreateError;
      return {
        error: (
          ["invalid", "no_such_game", "rate_limited", "too_many_rooms"] as const
        ).includes(code)
          ? code
          : "unreachable",
      };
    }
    return { error: "unreachable" };
  }
}

/**
 * Make a room for a game and go to it. Resolves with why not if it can't
 * (the page stays where it is).
 */
export async function watchTogether(
  gameId: string,
  go: (href: string) => void = (href) => window.location.assign(href),
): Promise<WatchCreateError | "unreachable" | null> {
  const made = await createWatchRoom(gameId);
  if ("error" in made) return made.error;
  rememberHostKey(made.room, made.key);
  go(`${watchRoomPath(made.room)}#key=${encodeURIComponent(made.key)}`);
  return null;
}

/** Whether a game's replay is saved yet (the win screen asks a few times). */
export async function replaySaved(gameId: string): Promise<boolean> {
  try {
    const r = await api<{ saved: boolean }>(
      `/watch/saved/${encodeURIComponent(gameId)}`,
    );
    return r.saved === true;
  } catch {
    return false;
  }
}

/** Words for why a room couldn't be made (Derp Land's pages, in English). */
export const WATCH_CREATE_TEXT: Record<
  WatchCreateError | "unreachable",
  string
> = {
  invalid: "That game can't be watched.",
  no_such_game: "This game's replay isn't saved.",
  rate_limited: "Slow down a moment, then try again.",
  too_many_rooms: "Too many rooms are open right now. Try again soon.",
  unreachable: "Couldn't reach Derp Land. Try again.",
};
