// Derpy Conquest results: each finished game, every signed-in player's line
// and the Derp Coins it paid. Read back for the Conquest and Overall
// leaderboards and players' profiles.

import { logger } from "../Logger";
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";

const log = logger.child({ component: "DerpyConquest" });

export interface ConquestPlayerResult {
  accountId: number | null;
  name: string;
  nation: string;
  rank: number;
  score: number;
  won: boolean;
  provinces: number;
  peakProvinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
  goldEarned: number;
  coins: number;
}

export interface ConquestGameResult {
  gameId: string;
  startedAt: number;
  endedAt: number;
  endYear: number;
  finalYear: number;
  difficulty: string;
  winner: string | null;
  players: ConquestPlayerResult[];
}

/**
 * Saves a finished game and pays each signed-in player their coins. Saving
 * the same game twice does nothing the second time. Returns whether it was
 * saved now.
 */
export async function recordConquestGame(
  g: ConquestGameResult,
): Promise<boolean> {
  if (!derpyDbConfigured()) return false;
  const credited = g.players.filter((p) => p.accountId !== null);
  if (credited.length === 0) return false;
  try {
    return await inTransaction(async (c) => {
      const inserted = await c.query(
        `INSERT INTO derpy_conquest_games (game_id, started_at, ended_at,
           duration_s, end_year, final_year, difficulty, num_players, winner,
           summary)
         VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0),
           $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (game_id) DO NOTHING
         RETURNING game_id`,
        [
          g.gameId,
          g.startedAt,
          g.endedAt,
          Math.round((g.endedAt - g.startedAt) / 1000),
          g.endYear,
          g.finalYear,
          g.difficulty,
          g.players.length,
          g.winner,
          JSON.stringify(
            g.players.map(({ name, nation, rank, score, won }) => ({
              name,
              nation,
              rank,
              score,
              won,
            })),
          ),
        ],
      );
      if (inserted.rowCount === 0) return false;
      const seen = new Set<number>();
      for (const p of credited) {
        if (seen.has(p.accountId!)) continue;
        seen.add(p.accountId!);
        await c.query(
          `INSERT INTO derpy_conquest_players (game_id, account_id, username,
             nation, won, rank, score, provinces, peak_provinces, colonies,
             battles_won, conquests, gold_earned, coins)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            g.gameId,
            p.accountId,
            p.name,
            p.nation,
            p.won,
            p.rank,
            p.score,
            p.provinces,
            p.peakProvinces,
            p.colonies,
            p.battlesWon,
            p.conquests,
            Math.round(p.goldEarned),
            p.coins,
          ],
        );
        await c.query(
          "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1",
          [p.accountId, p.coins],
        );
      }
      log.info("saved conquest game", {
        gameId: g.gameId,
        accounts: seen.size,
      });
      return true;
    });
  } catch (err) {
    log.error(`failed to save conquest game ${g.gameId}: ${err}`);
    return false;
  }
}

export interface ConquestStats {
  games: number;
  wins: number;
  bestScore: number;
  mostProvinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
  coinsEarned: number;
}

const CONQUEST_COLUMNS = `
  count(cp.game_id)::int AS c_games,
  count(cp.game_id) FILTER (WHERE cp.won)::int AS c_wins,
  coalesce(max(cp.score), 0)::int AS c_best_score,
  coalesce(max(cp.peak_provinces), 0)::int AS c_most_provinces,
  coalesce(sum(cp.colonies), 0)::int AS c_colonies,
  coalesce(sum(cp.battles_won), 0)::int AS c_battles_won,
  coalesce(sum(cp.conquests), 0)::int AS c_conquests,
  coalesce(sum(cp.coins), 0)::int AS c_coins_earned`;

function rowToConquest(row: Record<string, unknown>): ConquestStats {
  return {
    games: Number(row.c_games ?? 0),
    wins: Number(row.c_wins ?? 0),
    bestScore: Number(row.c_best_score ?? 0),
    mostProvinces: Number(row.c_most_provinces ?? 0),
    colonies: Number(row.c_colonies ?? 0),
    battlesWon: Number(row.c_battles_won ?? 0),
    conquests: Number(row.c_conquests ?? 0),
    coinsEarned: Number(row.c_coins_earned ?? 0),
  };
}

export interface ConquestLeaderboardRow extends ConquestStats {
  username: string;
  coins: number;
}

/** Every account's Conquest stats, most wins first. */
export async function conquestLeaderboard(): Promise<ConquestLeaderboardRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT a.username, a.coins, ${CONQUEST_COLUMNS}
     FROM derpy_accounts a
     LEFT JOIN derpy_conquest_players cp ON cp.account_id = a.id
     GROUP BY a.id
     ORDER BY c_wins DESC, c_best_score DESC, c_games DESC, a.username_key ASC`,
  );
  return res.rows.map((r) => ({
    username: r.username,
    coins: Number(r.coins),
    ...rowToConquest(r),
  }));
}

export interface OverallLeaderboardRow {
  username: string;
  coins: number;
  games: number;
  wins: number;
  derpyFrontGames: number;
  derpyFrontWins: number;
  conquestGames: number;
  conquestWins: number;
  coinsEarned: number;
}

/** Both games together: wins, games and Derp Coins. */
export async function overallLeaderboard(): Promise<OverallLeaderboardRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT a.username, a.coins,
       coalesce(f.games, 0)::int AS f_games, coalesce(f.wins, 0)::int AS f_wins,
       coalesce(f.coins, 0)::int AS f_coins,
       coalesce(c.games, 0)::int AS c_games, coalesce(c.wins, 0)::int AS c_wins,
       coalesce(c.coins, 0)::int AS c_coins
     FROM derpy_accounts a
     LEFT JOIN (
       SELECT account_id, count(*) AS games, count(*) FILTER (WHERE won) AS wins,
         sum(coins) AS coins
       FROM derpy_game_players GROUP BY account_id
     ) f ON f.account_id = a.id
     LEFT JOIN (
       SELECT account_id, count(*) AS games, count(*) FILTER (WHERE won) AS wins,
         sum(coins) AS coins
       FROM derpy_conquest_players GROUP BY account_id
     ) c ON c.account_id = a.id`,
  );
  const rows: OverallLeaderboardRow[] = res.rows.map((r) => ({
    username: r.username,
    coins: Number(r.coins),
    games: Number(r.f_games) + Number(r.c_games),
    wins: Number(r.f_wins) + Number(r.c_wins),
    derpyFrontGames: Number(r.f_games),
    derpyFrontWins: Number(r.f_wins),
    conquestGames: Number(r.c_games),
    conquestWins: Number(r.c_wins),
    coinsEarned: Number(r.f_coins) + Number(r.c_coins),
  }));
  return rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.coinsEarned - a.coinsEarned ||
      b.games - a.games ||
      a.username.toLowerCase().localeCompare(b.username.toLowerCase()),
  );
}

export interface ConquestGameSummary {
  gameId: string;
  endedAt: string;
  durationS: number;
  finalYear: number;
  difficulty: string;
  numPlayers: number;
  winner: string | null;
  nation: string;
  won: boolean;
  rank: number;
  score: number;
  provinces: number;
  coins: number;
}

/** A player's Conquest stats and recent games, by account id. */
export async function conquestProfile(
  accountId: number,
): Promise<{ stats: ConquestStats; games: ConquestGameSummary[] }> {
  const pool = await db();
  const stats = await pool.query(
    `SELECT ${CONQUEST_COLUMNS} FROM derpy_conquest_players cp WHERE cp.account_id = $1`,
    [accountId],
  );
  const games = await pool.query(
    `SELECT g.game_id, g.ended_at, g.duration_s, g.final_year, g.difficulty,
       g.num_players, g.winner, cp.nation, cp.won, cp.rank, cp.score,
       cp.provinces, cp.coins
     FROM derpy_conquest_players cp
     JOIN derpy_conquest_games g ON g.game_id = cp.game_id
     WHERE cp.account_id = $1
     ORDER BY g.ended_at DESC
     LIMIT 100`,
    [accountId],
  );
  return {
    stats: rowToConquest(stats.rows[0] ?? {}),
    games: games.rows.map((g) => ({
      gameId: g.game_id,
      endedAt: new Date(g.ended_at).toISOString(),
      durationS: g.duration_s,
      finalYear: g.final_year,
      difficulty: g.difficulty,
      numPlayers: g.num_players,
      winner: g.winner,
      nation: g.nation,
      won: g.won,
      rank: g.rank,
      score: g.score,
      provinces: g.provinces,
      coins: g.coins,
    })),
  };
}

export interface RecentResult {
  game: "derpyfront" | "conquest";
  gameId: string;
  endedAt: string;
  /** The account that played, whatever name they used in the game. */
  username: string;
  /** The name they played under, when it wasn't their account name. */
  playedAs?: string;
  won: boolean;
  /** DerpyFront: the map. Conquest: the nation played. */
  where: string;
  numPlayers: number;
  coins: number;
}

/** The in-game name, when it differs from the account's. */
function alias(
  account: string,
  playedAs: string | null,
): { playedAs?: string } {
  return playedAs && playedAs.toLowerCase() !== account.toLowerCase()
    ? { playedAs }
    : {};
}

/** The latest finished games across both games, one line per player. */
export async function recentResults(limit = 12): Promise<RecentResult[]> {
  const pool = await db();
  const [front, conquest] = await Promise.all([
    pool.query(
      `SELECT g.game_id, g.ended_at, g.map, g.num_players,
         COALESCE(a.username, gp.username) AS username,
         gp.username AS played_as, gp.won, gp.coins
       FROM derpy_game_players gp
       JOIN derpy_games g ON g.game_id = gp.game_id
       LEFT JOIN derpy_accounts a ON a.id = gp.account_id
       ORDER BY g.ended_at DESC, gp.won DESC
       LIMIT $1`,
      [limit],
    ),
    pool.query(
      `SELECT g.game_id, g.ended_at, g.num_players,
         COALESCE(a.username, cp.username) AS username,
         cp.username AS played_as, cp.nation, cp.won, cp.coins
       FROM derpy_conquest_players cp
       JOIN derpy_conquest_games g ON g.game_id = cp.game_id
       LEFT JOIN derpy_accounts a ON a.id = cp.account_id
       ORDER BY g.ended_at DESC, cp.won DESC
       LIMIT $1`,
      [limit],
    ),
  ]);
  const rows: RecentResult[] = [
    ...front.rows.map((r) => ({
      game: "derpyfront" as const,
      gameId: r.game_id,
      endedAt: new Date(r.ended_at).toISOString(),
      username: r.username,
      ...alias(r.username, r.played_as),
      won: r.won,
      where: r.map,
      numPlayers: r.num_players,
      coins: r.coins,
    })),
    ...conquest.rows.map((r) => ({
      game: "conquest" as const,
      gameId: r.game_id,
      endedAt: new Date(r.ended_at).toISOString(),
      username: r.username,
      ...alias(r.username, r.played_as),
      won: r.won,
      where: r.nation,
      numPlayers: r.num_players,
      coins: r.coins,
    })),
  ];
  return rows
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, limit);
}
