// NAMES (r20): who may play Mr. Based goes by account, never by name, so a
// rename neither loses it nor gains it. Each account allowed carries a mark
// (derpy_accounts.based_access). BASED_PLAYERS (comma-separated, default the
// owner, "Alden") names accounts to mark, by name, once each: the account
// holding that name when it is first marked (at startup, or when it signs up
// with it) keeps the mark under any name, and the name is never read again.
// A name still waiting to be marked can't be taken by renaming.
//
// Kept apart from DerpyDb (which marks at startup) and DerpyBased (which
// reads the mark) so neither imports the other.

import type pg from "pg";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** The names BASED_PLAYERS lists (lowercase keys); the default is the owner alone. */
export function basedPlayers(): Set<string> {
  const raw = process.env.BASED_PLAYERS ?? "Alden";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Marks the accounts holding the BASED_PLAYERS names that haven't been used
 * to mark anyone yet (only `accountId`, when given). Returns the accounts
 * marked now.
 */
export async function grantBasedByName(
  q: Queryable,
  accountId?: number,
): Promise<number[]> {
  const names = [...basedPlayers()];
  if (names.length === 0) return [];
  const r = await q.query(
    `UPDATE derpy_accounts a SET based_access = true, based_granted_as = a.username_key
     WHERE a.username_key = ANY($1::text[])
       AND NOT a.based_access
       AND ($2::bigint IS NULL OR a.id = $2)
       AND NOT EXISTS (
         SELECT 1 FROM derpy_accounts b WHERE b.based_granted_as = a.username_key)
     RETURNING a.id`,
    [names, accountId ?? null],
  );
  return r.rows.map((row) => Number(row.id));
}

/** Whether this account may play Mr. Based. */
export async function hasBasedAccess(
  q: Queryable,
  accountId: number,
): Promise<boolean> {
  const r = await q.query(
    "SELECT based_access FROM derpy_accounts WHERE id = $1",
    [accountId],
  );
  return r.rows[0]?.based_access === true;
}

/** A BASED_PLAYERS name nobody has been marked under yet: nobody may rename to it. */
export async function reservedForBased(
  q: Queryable,
  key: string,
): Promise<boolean> {
  if (!basedPlayers().has(key)) return false;
  const r = await q.query(
    "SELECT 1 FROM derpy_accounts WHERE based_granted_as = $1",
    [key],
  );
  return (r.rowCount ?? 0) === 0;
}
