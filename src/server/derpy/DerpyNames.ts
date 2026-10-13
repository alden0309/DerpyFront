// NAMES (r20): changing your username. Once every 7 days per account
// (derpy_accounts.username_changed_at), unique without regard to case like
// sign-up, and the name given up stays with the account for 7 days
// (old_username_key) so nobody else can take it and pass as them.
//
// Everything that shows an account's name either reads it live from
// derpy_accounts by id (leaderboards, profiles, latest games, saved Conquest
// campaigns, Mr. Based's notes) or keeps a copy that is rewritten here, in
// the same transaction as the rename (DerpyFront and Conquest player rows,
// winners, awards and summaries). A game's own player name is the account's
// only when it matched the account's name; a name played under that wasn't
// (an alias) is left alone. Character names in Conquest are never touched.
//
// Sessions hold no name (a token, an account id and a play id), so every
// session stays signed in through a rename.

import pg from "pg";
import {
  minuteOf,
  NAME_HOLD_MS,
  nameHeldUntil,
  NameProblem,
  nextNameChange,
  RenameError,
  USERNAME_RE,
} from "../../derpland/Names";
import { reservedForBased } from "./BasedAccess";
import { db, inTransaction } from "./DerpyDb";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** Taken by every sign-up and rename, so two can't claim one name at once. */
export const NAME_LOCK = 7_317_020;

export async function lockNames(c: pg.PoolClient): Promise<void> {
  await c.query("SELECT pg_advisory_xact_lock($1)", [NAME_LOCK]);
}

/**
 * A name given up is still kept at `now` if it changed at or after this
 * (the 7 days run from the minute of the change: see nameHeldUntil).
 */
export function heldSince(now: number): Date {
  return new Date(minuteOf(now - NAME_HOLD_MS) + 60_000);
}

/**
 * Why `name` can't be taken by `accountId` (null: a new account), or null.
 * Its own current name and its own name given up are never in its way. A
 * name BASED_PLAYERS is still waiting to mark someone with can only come by
 * signing up, never by renaming (`renaming`).
 */
export async function nameProblem(
  q: Queryable,
  name: string,
  accountId: number | null,
  now: number,
  renaming: boolean,
): Promise<NameProblem | null> {
  if (!USERNAME_RE.test(name)) return "invalid_username";
  const key = name.toLowerCase();
  const r = await q.query(
    `SELECT
       EXISTS (SELECT 1 FROM derpy_accounts
               WHERE username_key = $1 AND id IS DISTINCT FROM $2::bigint) AS taken,
       EXISTS (SELECT 1 FROM derpy_accounts
               WHERE old_username_key = $1 AND id IS DISTINCT FROM $2::bigint
                 AND username_changed_at >= $3) AS held,
       EXISTS (SELECT 1 FROM derpy_accounts
               WHERE id = $2::bigint AND username_key = $1) AS own`,
    [key, accountId, heldSince(now)],
  );
  const row = r.rows[0];
  if (row.taken) return "username_taken";
  if (row.held) return "username_held";
  if (renaming && !row.own && (await reservedForBased(q, key)))
    return "username_reserved";
  return null;
}

export interface NameStatus {
  username: string;
  /** When it last changed (ISO), or null: never. */
  changedAt: string | null;
  /** When it may change next (ISO), or null: now. */
  nextChangeAt: string | null;
  canChange: boolean;
  /** The name given up last, while it's still kept for this account. */
  heldName: string | null;
  heldUntil: string | null;
}

const iso = (t: number) => new Date(t).toISOString();

function statusOf(
  row: {
    username: string;
    username_changed_at: Date | string | null;
    old_username: string | null;
  },
  now: number,
): NameStatus {
  const last =
    row.username_changed_at === null
      ? null
      : new Date(row.username_changed_at).getTime();
  const next = last === null ? null : nextNameChange(last);
  const heldUntil = last === null ? null : nameHeldUntil(last);
  const held =
    heldUntil !== null &&
    now < heldUntil &&
    row.old_username !== null &&
    row.old_username.toLowerCase() !== row.username.toLowerCase();
  return {
    username: row.username,
    changedAt: last === null ? null : iso(last),
    nextChangeAt: next === null || now >= next ? null : iso(next),
    canChange: next === null || now >= next,
    heldName: held ? row.old_username : null,
    heldUntil: held ? iso(heldUntil) : null,
  };
}

/** Where an account stands on changing its name. */
export async function nameStatus(
  accountId: number,
  now = Date.now(),
): Promise<NameStatus | null> {
  const r = await (
    await db()
  ).query(
    "SELECT username, username_changed_at, old_username FROM derpy_accounts WHERE id = $1",
    [accountId],
  );
  return r.rows[0] ? statusOf(r.rows[0], now) : null;
}

export interface NameCheck {
  username: string;
  ok: boolean;
  /** Why not, when it isn't. */
  reason?: NameProblem | "same_name";
  /** Only the capitals of the account's own name change. */
  caseOnly?: boolean;
}

/** The form's live check: could this account change to `name`? */
export async function checkName(
  raw: string,
  accountId: number,
  now = Date.now(),
): Promise<NameCheck> {
  const name = raw.trim();
  const pool = await db();
  const me = await pool.query(
    "SELECT username FROM derpy_accounts WHERE id = $1",
    [accountId],
  );
  const current: string | undefined = me.rows[0]?.username;
  if (current === name)
    return { username: name, ok: false, reason: "same_name" };
  const problem = await nameProblem(pool, name, accountId, now, true);
  if (problem) return { username: name, ok: false, reason: problem };
  return current !== undefined && current.toLowerCase() === name.toLowerCase()
    ? { username: name, ok: true, caseOnly: true }
    : { username: name, ok: true };
}

export type RenameResult =
  | ({ ok: true; coins: number } & NameStatus)
  | { ok: false; error: RenameError; nextChangeAt?: string };

/**
 * Changes an account's username, and every stored copy of it, in one
 * transaction. Refused within 7 days of the last change; a change of
 * capitals only counts as a change.
 */
export async function renameAccount(
  accountId: number,
  raw: string,
  now = Date.now(),
): Promise<RenameResult> {
  const name = raw.trim();
  if (!USERNAME_RE.test(name)) return { ok: false, error: "invalid_username" };
  try {
    return await inTransaction(async (c): Promise<RenameResult> => {
      await lockNames(c);
      const r = await c.query(
        `SELECT username, username_key, username_changed_at, coins
         FROM derpy_accounts WHERE id = $1 FOR UPDATE`,
        [accountId],
      );
      const acc = r.rows[0];
      if (!acc) throw new Error(`no account ${accountId}`);
      if (acc.username === name) return { ok: false, error: "same_name" };
      if (acc.username_changed_at !== null) {
        const next = nextNameChange(
          new Date(acc.username_changed_at).getTime(),
        );
        if (now < next)
          return { ok: false, error: "too_soon", nextChangeAt: iso(next) };
      }
      const problem = await nameProblem(c, name, accountId, now, true);
      if (problem) return { ok: false, error: problem };
      const old: string = acc.username;
      await c.query(
        `UPDATE derpy_accounts SET username = $2, username_key = $3,
           old_username = $4, old_username_key = $5, username_changed_at = $6
         WHERE id = $1`,
        [
          accountId,
          name,
          name.toLowerCase(),
          old,
          acc.username_key,
          new Date(now),
        ],
      );
      await followRename(c, accountId, old, name);
      return {
        ok: true,
        coins: Number(acc.coins),
        ...statusOf(
          {
            username: name,
            username_changed_at: new Date(now),
            old_username: old,
          },
          now,
        ),
      };
    });
  } catch (err) {
    // Someone claimed it in the same instant (the lock makes this unlikely).
    if ((err as { code?: string }).code === "23505")
      return { ok: false, error: "username_taken" };
    throw err;
  }
}

/**
 * Rewrites the stored copies of an account's name: wherever a game kept the
 * account's own name (in any case) as the player's, it becomes the new one.
 * Names played under that weren't the account's stay as they were.
 */
async function followRename(
  c: pg.PoolClient,
  accountId: number,
  oldName: string,
  newName: string,
): Promise<void> {
  const args = [accountId, oldName, newName];

  // DerpyFront: the winner's name on the game, where this account won as
  // itself, and the names on the game's awards. Before the player rows,
  // whose name they're matched against.
  await c.query(
    `UPDATE derpy_games g SET winner = $3
     FROM derpy_game_players gp
     WHERE gp.game_id = g.game_id AND gp.account_id = $1 AND gp.won
       AND lower(gp.username) = lower($2) AND g.winner = gp.username`,
    args,
  );
  await c.query(
    `UPDATE derpy_games g SET awards = (
       SELECT jsonb_agg(CASE WHEN t.e->>'name' = gp.username
                        THEN jsonb_set(t.e, '{name}', to_jsonb($3::text))
                        ELSE t.e END ORDER BY t.i)
       FROM jsonb_array_elements(g.awards) WITH ORDINALITY AS t(e, i))
     FROM derpy_game_players gp
     WHERE gp.game_id = g.game_id AND gp.account_id = $1
       AND lower(gp.username) = lower($2)
       AND jsonb_typeof(g.awards) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(g.awards) AS x(e)
                   WHERE x.e->>'name' = gp.username)`,
    args,
  );
  // The player rows: the name shown follows; the replay's is kept.
  await c.query(
    `UPDATE derpy_game_players
     SET played_as = COALESCE(played_as, username), username = $3
     WHERE account_id = $1 AND lower(username) = lower($2)`,
    args,
  );

  // Derpy Conquest: the winner ("<character> (<player>)") where this account
  // came first, the game's summary line for its place, then its rows.
  await c.query(
    `UPDATE derpy_conquest_games g
     SET winner = left(g.winner, length(g.winner) - length(cp.username) - 2)
                  || '(' || $3 || ')'
     FROM derpy_conquest_players cp
     WHERE cp.game_id = g.game_id AND cp.account_id = $1 AND cp.rank = 1
       AND lower(cp.username) = lower($2)
       AND right(g.winner, length(cp.username) + 2) = '(' || cp.username || ')'`,
    args,
  );
  await c.query(
    `UPDATE derpy_conquest_games g SET summary = (
       SELECT jsonb_agg(CASE WHEN (t.e->>'rank')::int = cp.rank
                             AND t.e->>'name' = cp.username
                        THEN jsonb_set(t.e, '{name}', to_jsonb($3::text))
                        ELSE t.e END ORDER BY t.i)
       FROM jsonb_array_elements(g.summary) WITH ORDINALITY AS t(e, i))
     FROM derpy_conquest_players cp
     WHERE cp.game_id = g.game_id AND cp.account_id = $1
       AND lower(cp.username) = lower($2)
       AND jsonb_typeof(g.summary) = 'array'
       AND jsonb_array_length(g.summary) > 0`,
    args,
  );
  await c.query(
    `UPDATE derpy_conquest_players SET username = $3
     WHERE account_id = $1 AND lower(username) = lower($2)`,
    args,
  );
  // Saved campaigns: the account's seats (always its name). They're read
  // with live names anyway; the copy is kept in step for anything that
  // reads the column as it is.
  await c.query(
    `UPDATE derpy_conquest_saves SET seats = (
       SELECT jsonb_agg(CASE WHEN (t.e->>'accountId')::bigint = $1
                        THEN jsonb_set(t.e, '{name}', to_jsonb($2::text))
                        ELSE t.e END ORDER BY t.i)
       FROM jsonb_array_elements(seats) WITH ORDINALITY AS t(e, i))
     WHERE $1 = ANY(accounts) AND jsonb_typeof(seats) = 'array'
       AND jsonb_array_length(seats) > 0`,
    [accountId, newName],
  );
}

/**
 * The name an account's player shows for a game that just finished: the
 * account's new name if it played under the name it gave up during that
 * game (it was renamed while playing), else the name it played under.
 */
export function labelFor(
  playedAs: string,
  account:
    | {
        username: string;
        old_username_key: string | null;
        username_changed_at: Date | string | null;
      }
    | undefined,
  startedAt: number,
): string {
  if (
    account !== undefined &&
    account.old_username_key !== null &&
    account.username_changed_at !== null &&
    playedAs.toLowerCase() === account.old_username_key &&
    new Date(account.username_changed_at).getTime() >= startedAt
  )
    return account.username;
  return playedAs;
}

/** Accounts' names now and the names they gave up, for labelFor. */
export async function namesOf(
  q: Queryable,
  ids: number[],
): Promise<
  Map<
    number,
    {
      username: string;
      old_username_key: string | null;
      username_changed_at: Date | null;
    }
  >
> {
  const out = new Map();
  if (ids.length === 0) return out;
  const r = await q.query(
    `SELECT id, username, old_username_key, username_changed_at
     FROM derpy_accounts WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  for (const row of r.rows) out.set(Number(row.id), row);
  return out;
}
