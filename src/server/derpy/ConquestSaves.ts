// Derpy Conquest campaigns saved between sittings. The whole game state is
// kept (gzipped JSON) with who played which nation, so anyone signed in who
// played in it can load it again and carry on.

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
}

export async function saveConquest(
  id: string,
  title: string,
  year: number,
  seats: SavedSeat[],
  state: GameState,
  over: boolean,
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
    `INSERT INTO derpy_conquest_saves (game_id, title, year, seats, accounts, state, over)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (game_id) DO UPDATE SET title = $2, year = $3, seats = $4,
       accounts = $5, state = $6, over = $7, updated_at = now()`,
    [id, title, year, JSON.stringify(seats), accounts, blob, over],
  );
}

/** Unfinished campaigns an account played in, most recent first. */
export async function savesFor(accountId: number): Promise<SaveRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT game_id, title, year, seats, updated_at FROM derpy_conquest_saves
     WHERE $1 = ANY(accounts) AND NOT over
     ORDER BY updated_at DESC LIMIT 20`,
    [accountId],
  );
  return res.rows.map((r) => ({
    id: r.game_id,
    title: r.title,
    year: r.year,
    seats: r.seats as SavedSeat[],
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function loadConquest(
  id: string,
): Promise<{
  title: string;
  seats: SavedSeat[];
  state: GameState;
  over: boolean;
} | null> {
  const res = await (
    await db()
  ).query(
    `SELECT title, seats, state, over FROM derpy_conquest_saves WHERE game_id = $1`,
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;
  const state = JSON.parse(
    gunzipSync(r.state as Buffer).toString(),
  ) as GameState;
  return { title: r.title, seats: r.seats as SavedSeat[], state, over: r.over };
}
