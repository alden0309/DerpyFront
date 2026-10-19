// Derpy Conquest campaigns saved between sittings. The whole game state is
// kept (gzipped JSON) with who played which nation, so anyone signed in who
// played in it can load it again and carry on.
//
// STORY (r17): who began each game is kept (its owner), and only they may
// delete it; anyone else who played in it may take it off their own list
// (it comes back if they play in it again). Finished games, and games saved
// by an older version, are listed apart so they can be cleared away.

import { gunzipSync, gzipSync } from "zlib";
import type { GameState } from "../../conquest/engine/Types";
import { db } from "./DerpyDb";

export interface SavedSeat {
  seat: string;
  name: string;
  power: string;
  accountId: number | null;
}

export interface SaveRow {
  id: string;
  title: string;
  year: number;
  seats: SavedSeat[];
  updatedAt: string;
  /** STORY (r17): who began it (or, for a save from before that was kept, the first signed-in seat). */
  owner: number | null;
  /** STORY (r17): the game has ended. */
  over: boolean;
  /** STORY (r17): the game state's version it was saved with. */
  version: number;
}

/** STORY (r17): who may delete a saved game: whoever began it (an older save: its first signed-in seat). */
export function ownerOf(row: {
  owner: number | null;
  seats: SavedSeat[];
}): number | null {
  if (row.owner !== null && row.owner !== undefined) return Number(row.owner);
  const first = row.seats.find((s) => s.accountId !== null);
  return first ? first.accountId : null;
}

export async function saveConquest(
  id: string,
  title: string,
  year: number,
  seats: SavedSeat[],
  state: GameState,
  over: boolean,
  /** STORY (r17): who began it (kept from the first save on). */
  owner: number | null = null,
  /** STORY (r17): the accounts playing in it now: it comes back to their lists. */
  present: number[] = [],
): Promise<void> {
  const blob = gzipSync(Buffer.from(JSON.stringify(state)), { level: 6 });
  const accounts = [
    ...new Set(
      seats.map((s) => s.accountId).filter((a): a is number => a !== null),
    ),
  ];
  await (
    await db()
  ).query(
    `INSERT INTO derpy_conquest_saves (game_id, title, year, seats, accounts, state, over, version, owner)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (game_id) DO UPDATE SET title = $2, year = $3, seats = $4,
       accounts = $5, state = $6, over = $7, version = $8, updated_at = now(),
       owner = COALESCE(derpy_conquest_saves.owner, $9),
       hidden = ARRAY(SELECT x FROM unnest(derpy_conquest_saves.hidden) AS x
                      WHERE NOT (x = ANY($10::bigint[])))`,
    [
      id,
      title,
      year,
      JSON.stringify(seats),
      accounts,
      blob,
      over,
      state.version,
      owner,
      present,
    ],
  );
}

/**
 * NAMES (r20): the seats with each signed-in player's name as their account
 * is called now, read live by id (a renamed player's saved games show the
 * new name, however the copy in the row was last written).
 */
const LIVE_SEATS = `COALESCE((
  SELECT jsonb_agg(CASE WHEN a.username IS NULL THEN t.e
                   ELSE jsonb_set(t.e, '{name}', to_jsonb(a.username)) END
                   ORDER BY t.i)
  FROM jsonb_array_elements(derpy_conquest_saves.seats) WITH ORDINALITY AS t(e, i)
  LEFT JOIN derpy_accounts a ON a.id = (t.e->>'accountId')::bigint
), '[]'::jsonb) AS seats`;

function rowOf(r: Record<string, unknown>): SaveRow {
  return {
    id: r.game_id as string,
    title: r.title as string,
    year: r.year as number,
    seats: r.seats as SavedSeat[],
    updatedAt: new Date(r.updated_at as string).toISOString(),
    owner: r.owner === null || r.owner === undefined ? null : Number(r.owner),
    over: !!r.over,
    version: Number(r.version),
  };
}

/**
 * Unfinished campaigns an account played in that this version can load, most
 * recent first (not those it took off its list).
 */
export async function savesFor(
  accountId: number,
  version: number,
): Promise<SaveRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT game_id, title, year, ${LIVE_SEATS}, updated_at, owner, over, version
     FROM derpy_conquest_saves
     WHERE $1 = ANY(accounts) AND NOT ($1 = ANY(hidden)) AND NOT over AND version = $2
     ORDER BY updated_at DESC LIMIT 20`,
    [accountId, version],
  );
  return res.rows.map(rowOf);
}

/**
 * STORY (r17): an account's finished campaigns, and those saved by another
 * version (they can't be loaded), most recent first.
 */
export async function finishedFor(
  accountId: number,
  version: number,
): Promise<SaveRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT game_id, title, year, ${LIVE_SEATS}, updated_at, owner, over, version
     FROM derpy_conquest_saves
     WHERE $1 = ANY(accounts) AND NOT ($1 = ANY(hidden)) AND (over OR version <> $2)
     ORDER BY updated_at DESC LIMIT 40`,
    [accountId, version],
  );
  return res.rows.map(rowOf);
}

/** STORY (r17): one saved game's particulars (not its state), or null. */
export async function saveInfo(
  id: string,
): Promise<(SaveRow & { accounts: number[] }) | null> {
  const res = await (
    await db()
  ).query(
    `SELECT game_id, title, year, ${LIVE_SEATS}, updated_at, owner, over, version, accounts
     FROM derpy_conquest_saves WHERE game_id = $1`,
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    ...rowOf(r),
    accounts: (r.accounts as (string | number)[]).map(Number),
  };
}

/**
 * STORY (r17): delete a saved game, if this account began it (checked again
 * here, in the one statement). True if it's gone.
 */
export async function deleteSave(
  id: string,
  accountId: number,
): Promise<boolean> {
  const pool = await db();
  const res = await pool.query(
    `DELETE FROM derpy_conquest_saves
     WHERE game_id = $1 AND COALESCE(owner, (
       SELECT (e->>'accountId')::bigint
       FROM jsonb_array_elements(seats) WITH ORDINALITY AS t(e, i)
       WHERE e->>'accountId' IS NOT NULL ORDER BY i LIMIT 1)) = $2
     RETURNING game_id`,
    [id, accountId],
  );
  const gone = (res.rowCount ?? 0) > 0;
  // TREE (r25): an unfinished game's dynasties go with it (a finished one's stay).
  if (gone)
    await pool.query(
      "DELETE FROM derpy_conquest_dynasties WHERE game_id = $1 AND NOT over",
      [id],
    );
  return gone;
}

/** STORY (r17): take a saved game off one account's list. True if it was on it. */
export async function hideSave(
  id: string,
  accountId: number,
): Promise<boolean> {
  const res = await (
    await db()
  ).query(
    `UPDATE derpy_conquest_saves SET hidden = array_append(hidden, $2::bigint)
     WHERE game_id = $1 AND $2 = ANY(accounts) AND NOT ($2 = ANY(hidden))
     RETURNING game_id`,
    [id, accountId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function loadConquest(id: string): Promise<{
  title: string;
  seats: SavedSeat[];
  state: GameState;
  over: boolean;
  /** STORY (r17) */
  owner: number | null;
} | null> {
  const res = await (
    await db()
  ).query(
    `SELECT title, ${LIVE_SEATS}, state, over, owner FROM derpy_conquest_saves WHERE game_id = $1`,
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;
  const state = JSON.parse(
    gunzipSync(r.state as Buffer).toString(),
  ) as GameState;
  const seats = r.seats as SavedSeat[];
  // NAMES (r20): each signed-in player's life carries their name as it is
  // now (the players' list, the story at the end). Only the player's name:
  // the characters they play keep theirs.
  for (const life of state.lives ?? []) {
    const seat = seats.find(
      (s) => s.seat === life.seat && s.accountId !== null,
    );
    if (seat && life.name !== seat.name) life.name = seat.name;
  }
  return {
    title: r.title,
    seats,
    state,
    over: r.over,
    owner: r.owner === null || r.owner === undefined ? null : Number(r.owner),
  };
}
