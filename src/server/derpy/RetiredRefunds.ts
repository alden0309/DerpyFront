// CQ24 (r24): Derp Store items taken off sale are refunded. Hard Winter, a
// Derpy Conquest map style, became the base game's own winter for everyone,
// so whoever bought it is given its price back in Derp Coins, once, by a
// startup migration (DerpyDb.migrate) that is safe to run on every start
// against a database that already has data:
// - each account's refunds are kept on its row (derpy_accounts.refunded),
//   and the credit and the mark are one statement, so an account is paid at
//   most once however often the server starts (or two start together: the
//   migration holds an advisory lock, and the row's lock settles the rest);
// - the old owned row stays (it breaks nothing: nothing for sale or drawn
//   answers to it any more), so the history of what was bought is kept.
//
// Kept apart from DerpyDb so the catalog isn't pulled into every module
// that touches the database.

import type pg from "pg";
import { RETIRED_ITEM_REFUNDS } from "./DerpyCatalog";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export interface Refunded {
  item: string;
  /** Accounts paid this time. */
  accounts: number;
  /** Derp Coins each was given. */
  coins: number;
}

/**
 * Gives every account that bought a retired item its price back, if it
 * hasn't been given it already. Returns what it paid this time (nothing
 * once everyone has been paid).
 */
export async function refundRetiredItems(
  q: Queryable,
  refunds: Readonly<Record<string, number>> = RETIRED_ITEM_REFUNDS,
): Promise<Refunded[]> {
  const out: Refunded[] = [];
  for (const [item, coins] of Object.entries(refunds)) {
    const r = await q.query(
      `UPDATE derpy_accounts AS a
       SET coins = a.coins + $2, refunded = array_append(a.refunded, $1)
       WHERE NOT ($1 = ANY (a.refunded))
         AND EXISTS (SELECT 1 FROM derpy_owned AS o
                     WHERE o.account_id = a.id AND o.item = 'pack:' || $1)`,
      [item, coins],
    );
    if ((r.rowCount ?? 0) > 0)
      out.push({ item, accounts: r.rowCount ?? 0, coins });
  }
  return out;
}
