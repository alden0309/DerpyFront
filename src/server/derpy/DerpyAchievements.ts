// Derpy Conquest achievements (MAP r12): which an account has earned, and
// paying for one. Each pays its Derp Coins once per account: earning it
// again in another game (or the same game replayed) pays nothing.
//
// CQACH (r22): these are the overall achievements, the account's. From now
// on they're earned only in a game on the hardest difficulty
// (countsOverall); those earned before stay. A game's own achievements are
// paid in the game, on any difficulty, with the line's coins (Coins.ts and
// ConquestPay.ts), not here.

import {
  ACHIEVEMENT_BY_KEY,
  paysOverall, // CQTUT (r26)
} from "../../conquest/engine/Achievements";
import { logger } from "../Logger";
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";

const log = logger.child({ component: "DerpyAchievements" });

export interface EarnedAchievement {
  key: string;
  /** When the account first earned it (ISO). */
  at: string;
  coins: number;
}

/** What awarding one came to. */
export interface Awarded {
  /** The account had never had it: it's on the account now. */
  first: boolean;
  /** Derp Coins paid for it now. */
  coins: number;
  /** CQACH (r22): the game counts for overall achievements (its difficulty is the hardest). */
  overall: boolean;
}

/**
 * Records an achievement for an account and pays its coins, the first time
 * only, and (CQACH r22) only from a game on the hardest difficulty; CQTUT
 * (r26): an account's own (the first life's lessons) from any.
 */
export async function awardAchievement(
  accountId: number,
  key: string,
  gameId: string | null,
  difficulty: string,
): Promise<Awarded> {
  const def = ACHIEVEMENT_BY_KEY.get(key);
  // CQTUT (r26): an account's own (the first life's lessons) on any difficulty.
  const overall = paysOverall(key, difficulty);
  if (!def || !overall || !derpyDbConfigured())
    return { first: false, coins: 0, overall };
  return inTransaction(async (c) => {
    const inserted = await c.query(
      `INSERT INTO derpy_conquest_achievements (account_id, key, game_id, coins)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, key) DO NOTHING
       RETURNING key`,
      [accountId, key, gameId, def.coins],
    );
    if (inserted.rowCount === 0) return { first: false, coins: 0, overall };
    await c.query(
      "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1",
      [accountId, def.coins],
    );
    log.info("achievement", { accountId, key, coins: def.coins });
    return { first: true, coins: def.coins, overall };
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

/** CQACH (r22): the overall achievements an account first earned in one game (for its end screen). */
export async function achievementsInGame(
  accountId: number,
  gameId: string,
): Promise<{ key: string; coins: number }[]> {
  if (!derpyDbConfigured()) return [];
  const res = await (
    await db()
  ).query(
    `SELECT key, coins FROM derpy_conquest_achievements
     WHERE account_id = $1 AND game_id = $2 ORDER BY earned_at ASC, key ASC`,
    [accountId, gameId],
  );
  return res.rows.map((r) => ({ key: r.key, coins: Number(r.coins) }));
}
