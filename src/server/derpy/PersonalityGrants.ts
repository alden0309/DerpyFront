// AIP (r23): the Derp Store's AI personality packs (r21) gave way to four
// AI personalities sold one by one. Everyone who bought any of the old packs
// is given all four, by a startup migration (DerpyDb.migrate) that is safe
// to run on every start: it only adds the rows an old-pack owner is missing,
// and never removes anything (the old rows stay, unsold and unshown).
//
// Kept apart from DerpyDb so the catalog isn't pulled into every module
// that touches the database.

import type pg from "pg";
import { PERSONALITY_GRANTS, RETIRED_PERSONALITY_PACKS } from "./DerpyCatalog";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/**
 * Gives every account that owns an old personality pack the four AI
 * personalities it doesn't own yet. Returns how many rows it added (0 once
 * everyone has them).
 */
export async function grantPersonalitiesToPackOwners(
  q: Queryable,
): Promise<number> {
  const r = await q.query(
    `INSERT INTO derpy_owned (account_id, item)
     SELECT owners.account_id, grants.item
     FROM (SELECT DISTINCT account_id FROM derpy_owned
           WHERE item = ANY($1::text[])) AS owners
     CROSS JOIN unnest($2::text[]) AS grants(item)
     ON CONFLICT (account_id, item) DO NOTHING`,
    [
      RETIRED_PERSONALITY_PACKS.map((p) => `pack:${p}`),
      [...PERSONALITY_GRANTS],
    ],
  );
  return r.rowCount ?? 0;
}
