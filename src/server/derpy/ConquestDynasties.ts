// TREE (r25): each account's Derpy Conquest dynasties. A signed-in seat's
// dynasty (its line's family tree and every life on it, made by the
// engine's Dynasty.ts without ids or anything secret) is kept each time the
// game is saved, and for good when the game ends; deleting an unfinished
// game's save takes its dynasties with it. A profile lists them, newest
// first, with the finished games played before dynasties were kept: those
// show the smaller tree their chronicle still tells. Read by account id,
// so a rename takes them along.

import { dynastyOf } from "../../conquest/engine/Dynasty";
import {
  type DynastyPage,
  type DynastyRecord,
  dynastyFromChronicle,
  type DynastySummary,
  dynName,
  type ThinChar,
  type ThinChronicle,
} from "../../conquest/engine/DynastyCore";
import type { GameState, MapDef } from "../../conquest/engine/Types";
import { db } from "./DerpyDb";
import { heldSince } from "./DerpyNames";

export type { DynastyPage, DynastySummary };

/** A seat's dynasty as the site keeps it. */
export function siteDynasty(
  s: GameState,
  life: GameState["lives"][number],
  map: Pick<MapDef, "provinces">,
): DynastyRecord {
  return dynastyOf(s, life, map, { secrets: false, ids: false });
}

/** Keeps an account's dynasty in a game (once the game is over, it stays as it ended). */
export async function keepDynasty(
  gameId: string,
  accountId: number,
  rec: DynastyRecord,
): Promise<void> {
  const names = rec.line.map((i) => dynName(rec.people[i]));
  await (
    await db()
  ).query(
    `INSERT INTO derpy_conquest_dynasties (game_id, account_id, family,
       from_year, to_year, lives, names, over, record)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (game_id, account_id) DO UPDATE SET family = $3,
       from_year = $4, to_year = $5, lives = $6, names = $7, over = $8,
       record = $9, updated_at = now()
     WHERE NOT derpy_conquest_dynasties.over`,
    [
      gameId,
      accountId,
      rec.family,
      rec.from,
      rec.year,
      rec.line.length,
      JSON.stringify(names),
      rec.over,
      JSON.stringify(rec),
    ],
  );
}

/** An account by its name now, or a name it gave up lately (NAMES r20). */
async function accountByName(
  username: string,
): Promise<{ id: number; username: string } | null> {
  const res = await (
    await db()
  ).query(
    `SELECT id, username FROM derpy_accounts
     WHERE id = COALESCE(
       (SELECT id FROM derpy_accounts WHERE username_key = $1),
       (SELECT id FROM derpy_accounts
        WHERE old_username_key = $1 AND username_changed_at >= $2
        ORDER BY username_changed_at DESC LIMIT 1))`,
    [username.toLowerCase(), heldSince(Date.now())],
  );
  const r = res.rows[0];
  return r ? { id: Number(r.id), username: String(r.username) } : null;
}

function familyFromTitle(title: unknown, names: string[]): string {
  const m = typeof title === "string" ? /^The (.+?) (line|story),/.exec(title) : null;
  if (m) return m[1];
  const first = names[0] ?? "";
  return first.includes(" ") ? first.slice(first.indexOf(" ") + 1) : first;
}

/** Finished games the account played before dynasties were kept, that their chronicle can still tell. */
const STORY_ROWS = `
  SELECT g.game_id, g.ended_at, g.final_year,
    (SELECT jsonb_build_object(
        'names', (SELECT jsonb_agg(ch->>'name')
                  FROM jsonb_array_elements(coalesce(e->'chars', '[]'::jsonb)) ch),
        'from', e->'chars'->0->'from',
        'title', e->'chronicle'->>'title')
     FROM jsonb_array_elements(g.summary) e
     WHERE (e->>'rank')::int = cp.rank LIMIT 1) AS info
  FROM derpy_conquest_players cp
  JOIN derpy_conquest_games g ON g.game_id = cp.game_id
  WHERE cp.account_id = $1
    AND NOT EXISTS (SELECT 1 FROM derpy_conquest_dynasties d
                    WHERE d.game_id = cp.game_id AND d.account_id = cp.account_id)`;

/** An account's dynasties, newest first. */
export async function dynastiesOf(accountId: number): Promise<DynastySummary[]> {
  const pool = await db();
  const [kept, story] = await Promise.all([
    pool.query(
      `SELECT game_id, family, from_year, to_year, lives, names, over, updated_at
       FROM derpy_conquest_dynasties WHERE account_id = $1
       ORDER BY updated_at DESC LIMIT 60`,
      [accountId],
    ),
    pool.query(`${STORY_ROWS} ORDER BY g.ended_at DESC LIMIT 60`, [accountId]),
  ]);
  const out: DynastySummary[] = kept.rows.map((r) => ({
    gameId: String(r.game_id),
    family: String(r.family),
    from: Number(r.from_year),
    to: Number(r.to_year),
    lives: Number(r.lives),
    names: Array.isArray(r.names) ? r.names.map(String) : [],
    over: !!r.over,
    kind: "kept" as const,
    at: new Date(r.updated_at).toISOString(),
  }));
  for (const r of story.rows) {
    const names: string[] = Array.isArray(r.info?.names)
      ? r.info.names.map(String)
      : [];
    if (!names.length) continue;
    out.push({
      gameId: String(r.game_id),
      family: familyFromTitle(r.info?.title, names),
      from: Number(r.info?.from ?? r.final_year),
      to: Number(r.final_year),
      lives: names.length,
      names,
      over: true,
      kind: "story",
      at: new Date(r.ended_at).toISOString(),
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
}

/** One of an account's dynasties, by its name and the game, or null. */
export async function dynastyFor(
  username: string,
  gameId: string,
): Promise<DynastyPage | null> {
  const acc = await accountByName(username);
  if (!acc) return null;
  const pool = await db();
  const kept = (
    await pool.query(
      `SELECT game_id, family, from_year, to_year, lives, names, over,
         updated_at, record
       FROM derpy_conquest_dynasties WHERE game_id = $1 AND account_id = $2`,
      [gameId, acc.id],
    )
  ).rows[0];
  if (kept)
    return {
      username: acc.username,
      summary: {
        gameId,
        family: String(kept.family),
        from: Number(kept.from_year),
        to: Number(kept.to_year),
        lives: Number(kept.lives),
        names: Array.isArray(kept.names) ? kept.names.map(String) : [],
        over: !!kept.over,
        kind: "kept",
        at: new Date(kept.updated_at).toISOString(),
      },
      record: kept.record as DynastyRecord,
    };
  // A game finished before dynasties were kept: the tree its chronicle tells.
  const g = (
    await pool.query(
      `SELECT g.ended_at, g.final_year,
         (SELECT e FROM jsonb_array_elements(g.summary) e
          WHERE (e->>'rank')::int = cp.rank LIMIT 1) AS entry
       FROM derpy_conquest_players cp
       JOIN derpy_conquest_games g ON g.game_id = cp.game_id
       WHERE cp.game_id = $1 AND cp.account_id = $2`,
      [gameId, acc.id],
    )
  ).rows[0];
  const entry = g?.entry as
    | { chars?: ThinChar[]; chronicle?: ThinChronicle }
    | undefined;
  if (!g || !entry?.chars?.length) return null;
  const record = dynastyFromChronicle(entry.chars, entry.chronicle, {
    over: true,
    year: Number(g.final_year),
  });
  const names = entry.chars.map((c) => c.name);
  return {
    username: acc.username,
    summary: {
      gameId,
      family: record.family,
      from: record.from,
      to: Number(g.final_year),
      lives: names.length,
      names,
      over: true,
      kind: "story",
      at: new Date(g.ended_at).toISOString(),
    },
    record,
  };
}
