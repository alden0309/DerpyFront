// Derpy Conquest achievements (MAP r12): which an account has earned, and
// paying for one. Each pays its Derp Coins once per account: earning it
// again in another game (or the same game replayed) pays nothing.

import { ACHIEVEMENT_BY_KEY } from "../../conquest/engine/Achievements";
import { logger } from "../Logger";
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";

const log = logger.child({ component: "DerpyAchievements" });

export interface EarnedAchievement {
  key: string;
  /** When the account first earned it (ISO). */
  at: string;
  coins: number;
}

/**
 * Records an achievement for an account and pays its coins, the first time
 * only. Returns whether this was the first time, and the coins paid.
 */
export async function awardAchievement(
  accountId: number,
  key: string,
  gameId: string | null,
): Promise<{ first: boolean; coins: number }> {
  const def = ACHIEVEMENT_BY_KEY.get(key);
  if (!def || !derpyDbConfigured()) return { first: false, coins: 0 };
  return inTransaction(async (c) => {
    const inserted = await c.query(
      `INSERT INTO derpy_conquest_achievements (account_id, key, game_id, coins)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, key) DO NOTHING
       RETURNING key`,
      [accountId, key, gameId, def.coins],
    );
    if (inserted.rowCount === 0) return { first: false, coins: 0 };
    await c.query(
      "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1",
      [accountId, def.coins],
    );
    log.info("achievement", { accountId, key, coins: def.coins });
    return { first: true, coins: def.coins };
  });
}

/** Every achievement an account has earned, first earned first. */
export async function achievementsOf(
  accountId: number,
): Promise<EarnedAchievement[]> {
  if (!derpyDbConfigured()) return [];
  const res = await (
    await db()
  ).query(
    `SELECT key, earned_at, coins FROM derpy_conquest_achievements
     WHERE account_id = $1 ORDER BY earned_at ASC, key ASC`,
    [accountId],
  );
  return res.rows.map((r) => ({
    key: r.key,
    at: new Date(r.earned_at).toISOString(),
    coins: Number(r.coins),
  }));
}
