// Derpy Conquest results: each finished game, every signed-in player's line
// and the Derp Coins it paid. Read back for the Conquest and Overall
// leaderboards and players' profiles.

import { dlcFromOwned } from "../../conquest/DlcIds"; // CQACH (r22)
import {
  ACHIEVEMENT_BY_KEY,
  achievementsFor,
} from "../../conquest/engine/Achievements"; // MAP (r12); CQACH (r22): achievementsFor
import { playCoinsAfter } from "../../conquest/engine/Coins"; // CQACH (r22)
import { PLAY_PAY } from "../../conquest/engine/LifeRules"; // LEGACY (r21)
import type {
  ConquestGamePage,
  LineCharacter,
  StoredChronicle,
} from "../../conquest/Protocol"; // LEGACY (r21)
import { logger } from "../Logger";
import { achievementsOf } from "./DerpyAchievements"; // MAP (r12)
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";
import { namesOf } from "./DerpyNames"; // NAMES (r20)

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
  /** Paid now, at the end (LEGACY r21: the rest was paid as they played). */
  coins: number;
  // LEGACY (r21): for the game's page.
  /** All the game paid them (null: a guest). */
  total?: number | null;
  /** The family (or the last character's name). */
  line?: string;
  chars?: LineCharacter[];
  chronicle?: StoredChronicle;
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
      // NAMES (r20): a signed-in seat plays under its account's name, so
      // the result carries the account's name now (renamed while playing:
      // the new one). Character names are never touched.
      const names = await namesOf(
        c,
        credited.map((p) => p.accountId!),
      );
      const nameOf = (p: ConquestPlayerResult) =>
        p.accountId === null
          ? p.name
          : (names.get(p.accountId)?.username ?? p.name);
      const first = g.players.find((p) => p.rank === 1);
      let winner = g.winner;
      if (winner && first && nameOf(first) !== first.name) {
        const tail = `(${first.name})`;
        if (winner.endsWith(tail))
          winner = `${winner.slice(0, -tail.length)}(${nameOf(first)})`;
      }
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
          winner,
          JSON.stringify(
            g.players.map((p) => ({
              name: nameOf(p),
              nation: p.nation,
              rank: p.rank,
              score: p.score,
              won: p.won,
              // LEGACY (r21): the line, its characters and its chronicle.
              account: p.accountId !== null,
              ...(p.line !== undefined ? { line: p.line } : {}),
              ...(p.total !== undefined ? { coins: p.total } : {}),
              ...(p.chars ? { chars: p.chars } : {}),
              ...(p.chronicle ? { chronicle: p.chronicle } : {}),
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
            nameOf(p),
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

// ---------------------------------------------------------------- LEGACY (r21): pay as you play

/** What a game has paid an account while it was played. */
export interface PlayRow {
  /** Coins for time at the table. */
  play: number;
  /** The line's coins, paid as they were reached. */
  lines: number;
  /** Seconds at the table that counted. */
  secs: number;
}

/** What an account has been paid so far in a game (nothing yet: zeros). */
export async function playRow(
  gameId: string,
  accountId: number,
): Promise<PlayRow> {
  const res = await (
    await db()
  ).query(
    `SELECT play, lines, secs FROM derpy_conquest_play
     WHERE game_id = $1 AND account_id = $2`,
    [gameId, accountId],
  );
  const r = res.rows[0];
  return r
    ? { play: Number(r.play), lines: Number(r.lines), secs: Number(r.secs) }
    : { play: 0, lines: 0, secs: 0 };
}

/** What a payment for play came to. */
export interface PlayPaid {
  /** The game's row as it now stands. */
  row: PlayRow;
  /** Paid now: for time at the table, and the line's coins. */
  time: number;
  lines: number;
  /** Seconds offered that the day's ceiling turned away. */
  refused: number;
}

/**
 * Pays an account for play in a game, all in one transaction: `secs` more
 * seconds at the table (as far as the account's day allows,
 * PLAY_PAY.dailyHours), their coins (PLAY_PAY.perHour, worked out on the
 * game's whole time so nothing is lost to rounding), and the line's coins
 * up to `lineTotal`, held to PLAY_PAY.linesPerHour for each hour the game
 * has been played. The coins go into the account and onto the game's row.
 */
export async function payInPlay(
  gameId: string,
  accountId: number,
  secs: number,
  lineTotal: number,
): Promise<PlayPaid> {
  const offered = Math.max(0, Math.round(secs));
  return inTransaction(async (c) => {
    await c.query(
      `INSERT INTO derpy_conquest_play (game_id, account_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [gameId, accountId],
    );
    const game = (
      await c.query(
        `SELECT play, lines, secs FROM derpy_conquest_play
         WHERE game_id = $1 AND account_id = $2 FOR UPDATE`,
        [gameId, accountId],
      )
    ).rows[0];
    await c.query(
      `INSERT INTO derpy_conquest_days (account_id, day)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`,
      [accountId],
    );
    const day = (
      await c.query(
        `SELECT secs FROM derpy_conquest_days
         WHERE account_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date
         FOR UPDATE`,
        [accountId],
      )
    ).rows[0];
    const room = Math.max(0, PLAY_PAY.dailyHours * 3600 - Number(day.secs));
    const took = Math.min(offered, room);
    const was = {
      play: Number(game.play),
      lines: Number(game.lines),
      secs: Number(game.secs),
    };
    const total = was.secs + took;
    // CQACH (r22): 200 an hour from here on; what was paid before stands.
    const play = playCoinsAfter(was.play, was.secs, total);
    const lines = Math.max(
      was.lines,
      Math.min(
        Math.max(0, Math.floor(lineTotal)),
        Math.floor((total / 3600) * PLAY_PAY.linesPerHour),
      ),
    );
    await c.query(
      `UPDATE derpy_conquest_play SET play = $3, lines = $4, secs = $5,
         updated_at = now()
       WHERE game_id = $1 AND account_id = $2`,
      [gameId, accountId, play, lines, total],
    );
    if (took > 0)
      await c.query(
        `UPDATE derpy_conquest_days SET secs = secs + $2
         WHERE account_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
        [accountId, took],
      );
    const paid = play - was.play + (lines - was.lines);
    if (paid > 0)
      await c.query(
        "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1",
        [accountId, paid],
      );
    return {
      row: { play, lines, secs: total },
      time: play - was.play,
      lines: lines - was.lines,
      refused: offered - took,
    };
  });
}

/** Coins an account was paid while playing, all games together (a subquery on `a.id`). */
const PLAY_COINS_OF = (account: string) =>
  `(SELECT coalesce(sum(pl.play + pl.lines), 0) FROM derpy_conquest_play pl
    WHERE pl.account_id = ${account})`;
// ---------------------------------------------------------------- /LEGACY (r21)

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

// LEGACY (r21): the coins earned count what was paid while playing, too.
const CONQUEST_COLUMNS = `
  count(cp.game_id)::int AS c_games,
  count(cp.game_id) FILTER (WHERE cp.won)::int AS c_wins,
  coalesce(max(cp.score), 0)::int AS c_best_score,
  coalesce(max(cp.peak_provinces), 0)::int AS c_most_provinces,
  coalesce(sum(cp.colonies), 0)::int AS c_colonies,
  coalesce(sum(cp.battles_won), 0)::int AS c_battles_won,
  coalesce(sum(cp.conquests), 0)::int AS c_conquests,
  coalesce(sum(cp.coins), 0)::int AS c_end_coins`;

/** LEGACY (r21): the coins earned, with what was paid while playing. */
const conquestCoinsEarned = (row: Record<string, unknown>) =>
  Number(row.c_end_coins ?? 0) + Number(row.c_play_coins ?? 0);

function rowToConquest(row: Record<string, unknown>): ConquestStats {
  return {
    games: Number(row.c_games ?? 0),
    wins: Number(row.c_wins ?? 0),
    bestScore: Number(row.c_best_score ?? 0),
    mostProvinces: Number(row.c_most_provinces ?? 0),
    colonies: Number(row.c_colonies ?? 0),
    battlesWon: Number(row.c_battles_won ?? 0),
    conquests: Number(row.c_conquests ?? 0),
    coinsEarned: conquestCoinsEarned(row), // LEGACY (r21)
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
    `SELECT a.username, a.coins, ${CONQUEST_COLUMNS},
       ${PLAY_COINS_OF("a.id")}::int AS c_play_coins
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
       (coalesce(c.coins, 0) + ${PLAY_COINS_OF("a.id")})::int AS c_coins
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
  /** LEGACY (r21): the characters their line was, in order (games before r21: none). */
  chars?: string[];
}

/** MAP (r12): an achievement on a player's profile. */
export interface ProfileAchievement {
  key: string;
  name: string;
  how: string;
  group: string;
  coins: number;
  /** When the account first earned it (ISO). */
  at: string;
  /** CQACH (r22): "hard" or "rare". */
  tier?: string;
}

/** A player's Conquest stats and recent games, by account id. */
export async function conquestProfile(accountId: number): Promise<{
  stats: ConquestStats;
  games: ConquestGameSummary[];
  /** MAP (r12): achievements earned, and how many there are. */
  achievements: ProfileAchievement[];
  achievementCount: number;
}> {
  const pool = await db();
  // LEGACY (r21): with what each game paid while it was played.
  const stats = await pool.query(
    `SELECT ${CONQUEST_COLUMNS}, ${PLAY_COINS_OF("$1")}::int AS c_play_coins
     FROM derpy_conquest_players cp WHERE cp.account_id = $1`,
    [accountId],
  );
  const games = await pool.query(
    `SELECT g.game_id, g.ended_at, g.duration_s, g.final_year, g.difficulty,
       g.num_players, g.winner, cp.nation, cp.won, cp.rank, cp.score,
       cp.provinces, (cp.coins + coalesce(pl.play + pl.lines, 0))::int AS coins,
       (SELECT jsonb_agg(ch->>'name')
          FROM jsonb_array_elements(g.summary) e,
               jsonb_array_elements(coalesce(e->'chars', '[]'::jsonb)) ch
          WHERE (e->>'rank')::int = cp.rank) AS chars
     FROM derpy_conquest_players cp
     JOIN derpy_conquest_games g ON g.game_id = cp.game_id
     LEFT JOIN derpy_conquest_play pl
       ON pl.game_id = cp.game_id AND pl.account_id = cp.account_id
     WHERE cp.account_id = $1
     ORDER BY g.ended_at DESC
     LIMIT 100`,
    [accountId],
  );
  const earned = await achievementsOf(accountId);
  // CQACH (r22): of how many: the add-ons' achievements count for their owners.
  const owned = dlcFromOwned(
    (
      await pool.query("SELECT item FROM derpy_owned WHERE account_id = $1", [
        accountId,
      ])
    ).rows.map((r) => String(r.item)),
  );
  return {
    stats: rowToConquest(stats.rows[0] ?? {}),
    achievements: earned.flatMap((a): ProfileAchievement[] => {
      const def = ACHIEVEMENT_BY_KEY.get(a.key);
      return def
        ? [
            {
              key: a.key,
              name: def.name,
              how: def.how,
              group: def.group,
              coins: a.coins,
              at: a.at,
              ...(def.tier ? { tier: def.tier } : {}), // CQACH (r22)
            },
          ]
        : [];
    }),
    achievementCount: achievementsFor(owned).length, // CQACH (r22)
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
      ...(Array.isArray(g.chars) && g.chars.length ? { chars: g.chars } : {}),
    })),
  };
}

/**
 * LEGACY (r21): a finished game for its page: every player (their account's
 * name now, for a link), every character their line was with their stats,
 * and each line's chronicle. Null if there's no such game.
 */
export async function conquestGamePage(
  gameId: string,
): Promise<ConquestGamePage | null> {
  const pool = await db();
  const g = (
    await pool.query(
      `SELECT game_id, ended_at, duration_s, end_year, final_year, difficulty,
         num_players, winner, summary
       FROM derpy_conquest_games WHERE game_id = $1`,
      [gameId],
    )
  ).rows[0];
  if (!g) return null;
  const accounts = await pool.query(
    `SELECT cp.rank, a.username,
       (cp.coins + coalesce(pl.play + pl.lines, 0))::int AS coins
     FROM derpy_conquest_players cp
     JOIN derpy_accounts a ON a.id = cp.account_id
     LEFT JOIN derpy_conquest_play pl
       ON pl.game_id = cp.game_id AND pl.account_id = cp.account_id
     WHERE cp.game_id = $1`,
    [gameId],
  );
  const byRank = new Map(
    accounts.rows.map((r) => [
      Number(r.rank),
      { username: String(r.username), coins: Number(r.coins) },
    ]),
  );
  type Stored = ConquestGamePage["players"][number] & { account?: boolean };
  const summary: Stored[] = Array.isArray(g.summary) ? g.summary : [];
  return {
    gameId: g.game_id,
    endedAt: new Date(g.ended_at).toISOString(),
    durationS: Number(g.duration_s),
    endYear: Number(g.end_year),
    finalYear: Number(g.final_year),
    difficulty: g.difficulty,
    numPlayers: Number(g.num_players),
    winner: g.winner,
    players: summary
      .map((p) => {
        const acc = byRank.get(Number(p.rank));
        return {
          name: p.name,
          username: acc?.username ?? null,
          nation: p.nation,
          rank: Number(p.rank),
          score: Number(p.score),
          won: !!p.won,
          ...(p.line ? { line: p.line } : {}),
          coins: acc
            ? acc.coins
            : p.account === false
              ? null
              : (p.coins ?? null),
          ...(p.chars ? { chars: p.chars } : {}),
          ...(p.chronicle ? { chronicle: p.chronicle } : {}),
        };
      })
      .sort((a, b) => a.rank - b.rank),
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
      // LEGACY (r21): a game's coins with what it paid while it was played.
      `SELECT g.game_id, g.ended_at, g.num_players,
         COALESCE(a.username, cp.username) AS username,
         cp.username AS played_as, cp.nation, cp.won,
         (cp.coins + coalesce(pl.play + pl.lines, 0))::int AS coins
       FROM derpy_conquest_players cp
       JOIN derpy_conquest_games g ON g.game_id = cp.game_id
       LEFT JOIN derpy_accounts a ON a.id = cp.account_id
       LEFT JOIN derpy_conquest_play pl
         ON pl.game_id = cp.game_id AND pl.account_id = cp.account_id
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
