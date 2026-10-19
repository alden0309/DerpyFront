// FRIENDS (r25): who's on Derp Land right now, and where. One small map in
// the master's memory, by account id: each open page of a signed-in player
// says where it is every few seconds (a "beat"), and an account counts as
// here while one of its pages beat in the last PRESENCE_TTL_MS. Derpy
// Conquest's tables are known here already (they run in the master), so a
// seat at one comes from the rooms themselves, never a page's word.
//
// Nothing here touches the database, and a restart only empties the map
// until the next beats.

import { z } from "zod";
import type { ClientWhere, Place } from "../../derpland/SocialTypes";

/** How long a page's last beat counts. Pages beat every 15 to 30 seconds. */
export const PRESENCE_TTL_MS = 75_000;
/** Open pages kept per account (the oldest goes). */
export const MAX_TABS_PER_ACCOUNT = 6;

/** Where a player at a Derpy Conquest table is (from the rooms). */
export type ConquestWhere =
  | {
      k: "cq-room";
      code: string;
      /** There's a seat for someone else (not solo, not full). */
      joinable: boolean;
      private: boolean;
      solo: boolean;
    }
  | {
      k: "cq-game";
      code: string;
      joinable: boolean;
      private: boolean;
      solo: boolean;
      year: number;
      colony: string;
      /** Set when the game may be watched (and isn't full of watchers). */
      watchId?: string;
    }
  | { k: "cq-watch" };

export type Where = ClientWhere | ConquestWhere;

const LOBBY = z.enum(["solo", "private", "public", "matched"]);
const GAME_ID = z.string().regex(/^[A-Za-z0-9]{1,20}$/);
const MAP = z.string().trim().min(1).max(60);

const ClientWhereSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("home") }),
  z.object({ k: z.literal("store") }),
  z.object({ k: z.literal("around") }),
  z.object({ k: z.literal("df-menu") }),
  z.object({ k: z.literal("cq-front") }),
  z.object({
    k: z.literal("df-lobby"),
    id: GAME_ID,
    lobby: LOBBY,
    map: MAP.optional(),
  }),
  z.object({
    k: z.literal("df-game"),
    id: GAME_ID,
    lobby: LOBBY,
    map: MAP,
    watching: z.boolean().optional(),
  }),
]);

/**
 * A page's word for where it is. Anything this doesn't know (an old page, a
 * made-up kind, a Derpy Conquest table, Mr. Based) is "around Derp Land".
 */
export function readClientWhere(raw: unknown): ClientWhere {
  const r = ClientWhereSchema.safeParse(raw);
  return r.success ? (r.data as ClientWhere) : { k: "around" };
}

/** Playing outranks a lobby, and a lobby a page: the most a player is doing. */
export function whereRank(w: Where): number {
  switch (w.k) {
    case "df-game":
      return w.watching ? 2 : 3;
    case "cq-game":
      return 3;
    case "df-lobby":
    case "cq-room":
    case "cq-watch":
      return 2;
    default:
      return 1;
  }
}

/** A lobby or table someone else can be brought into. */
export interface Target {
  game: "derpyfront" | "conquest";
  id: string;
  /** Not open to anyone: only friends, the party and the invited see a way in. */
  private: boolean;
}

export function targetOf(w: Where | null | undefined): Target | null {
  if (!w) return null;
  if (w.k === "df-lobby" && (w.lobby === "private" || w.lobby === "public"))
    return { game: "derpyfront", id: w.id, private: w.lobby === "private" };
  if ((w.k === "cq-room" || w.k === "cq-game") && w.joinable)
    return { game: "conquest", id: w.code, private: w.private };
  return null;
}

export function sameTarget(a: Target | null, b: Target | null): boolean {
  return !!a && !!b && a.game === b.game && a.id === b.id;
}

/** Whether `w` is at (or already in) the lobby or table `t`. */
export function isAt(w: Where | null | undefined, t: Target): boolean {
  if (!w) return false;
  if (t.game === "derpyfront")
    return (w.k === "df-lobby" || w.k === "df-game") && w.id === t.id;
  return (w.k === "cq-room" || w.k === "cq-game") && w.code === t.id;
}

export function joinHref(t: Target): string {
  return t.game === "derpyfront"
    ? `/game/${encodeURIComponent(t.id)}`
    : `/conquest?join=${encodeURIComponent(t.id)}`;
}

/**
 * The link to watch what `w` is playing, if it may be watched: a DerpyFront
 * game the server lists as watchable (`watchable`: its ids), or a Conquest
 * game its rooms say may be.
 */
export function watchHref(
  w: Where | null | undefined,
  watchable: ReadonlySet<string>,
): string | undefined {
  if (!w) return undefined;
  if (w.k === "df-game" && !w.watching && watchable.has(w.id))
    return `/game/${encodeURIComponent(w.id)}?spectate`;
  if (w.k === "cq-game" && w.watchId)
    return `/conquest?watch=${encodeURIComponent(w.watchId)}`;
  return undefined;
}

/** Where someone is, as others are shown it: no lobby ids, codes or watch ids. */
export function placeOf(w: Where): Place {
  switch (w.k) {
    case "df-lobby":
      return { k: w.k, lobby: w.lobby, ...(w.map ? { map: w.map } : {}) };
    case "df-game":
      return {
        k: w.k,
        lobby: w.lobby,
        map: w.map,
        ...(w.watching ? { watching: true } : {}),
      };
    case "cq-room":
      return { k: w.k, private: w.private, solo: w.solo };
    case "cq-game":
      return {
        k: w.k,
        year: w.year,
        colony: w.colony,
        private: w.private,
        solo: w.solo,
      };
    default:
      return { k: w.k };
  }
}

interface Tab {
  where: ClientWhere;
  at: number;
}

export class PresenceBoard {
  private readonly tabs = new Map<number, Map<string, Tab>>();
  private readonly people = new Map<
    number,
    { username: string; hidden: boolean }
  >();
  private derived: () => ReadonlyMap<number, ConquestWhere> = () => new Map();
  private lastPruned = -Infinity;

  constructor(
    private readonly now: () => number = Date.now,
    readonly ttlMs: number = PRESENCE_TTL_MS,
  ) {}

  /**
   * An account's name (as it is now) and whether it appears offline, each
   * time it's signed in to anything here, so renames show at once.
   */
  learn(id: number, username: string, hidden?: boolean): void {
    const was = this.people.get(id);
    this.people.set(id, { username, hidden: hidden ?? was?.hidden ?? false });
  }

  setHidden(id: number, hidden: boolean): void {
    const was = this.people.get(id);
    if (was) was.hidden = hidden;
  }

  hidden(id: number): boolean {
    return this.people.get(id)?.hidden ?? false;
  }

  username(id: number): string | null {
    return this.people.get(id)?.username ?? null;
  }

  /** A page of `id`'s says where it is. */
  beat(id: number, tab: string, where: ClientWhere): void {
    const now = this.now();
    this.prune(now);
    let mine = this.tabs.get(id);
    if (!mine) this.tabs.set(id, (mine = new Map()));
    mine.delete(tab);
    mine.set(tab, { where, at: now });
    // Insertion order is the order they last beat: the first is the oldest.
    while (mine.size > MAX_TABS_PER_ACCOUNT)
      mine.delete(mine.keys().next().value!);
  }

  /** A page closed (or signed out): it's gone at once, not a minute later. */
  leave(id: number, tab?: string): void {
    if (tab === undefined) {
      this.tabs.delete(id);
      return;
    }
    const mine = this.tabs.get(id);
    mine?.delete(tab);
    if (mine && mine.size === 0) this.tabs.delete(id);
  }

  /** Where Derpy Conquest's tables say their signed-in players are (the master, at startup). */
  setDerived(fn: () => ReadonlyMap<number, ConquestWhere>): void {
    this.derived = fn;
  }

  /**
   * Where everyone on the site is now, appearing offline or not (stale pages
   * left out): for each account, the most it's doing, and among pages doing
   * as much, the one that beat last.
   */
  snapshot(): Map<number, Where> {
    const now = this.now();
    this.prune(now, true);
    const out = new Map<number, Where>();
    for (const [id, mine] of this.tabs) {
      let best: Tab | null = null;
      for (const t of mine.values()) {
        if (
          best === null ||
          whereRank(t.where) > whereRank(best.where) ||
          (whereRank(t.where) === whereRank(best.where) && t.at >= best.at)
        )
          best = t;
      }
      if (best) out.set(id, best.where);
    }
    let derived: ReadonlyMap<number, ConquestWhere>;
    try {
      derived = this.derived();
    } catch {
      derived = new Map();
    }
    for (const [id, w] of derived) {
      const page = out.get(id);
      if (!page || whereRank(w) >= whereRank(page)) out.set(id, w);
    }
    return out;
  }

  /** Whether others may see `id` in `snap`: here, named, and not appearing offline. */
  visible(snap: ReadonlyMap<number, Where>, id: number): boolean {
    return snap.has(id) && this.username(id) !== null && !this.hidden(id);
  }

  /** For tests: forget everyone. */
  clear(): void {
    this.tabs.clear();
    this.people.clear();
    this.derived = () => new Map();
  }

  private prune(now: number, force = false): void {
    if (!force && now - this.lastPruned < this.ttlMs / 3) return;
    this.lastPruned = now;
    const cutoff = now - this.ttlMs;
    for (const [id, mine] of this.tabs) {
      for (const [tab, t] of mine) if (t.at < cutoff) mine.delete(tab);
      if (mine.size === 0) this.tabs.delete(id);
    }
  }
}

/** The master's board. */
export const presence = new PresenceBoard();
