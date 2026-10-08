// Saving finished games: the replay record, each signed-in player's stats
// line, and the Derp Coins they earned. Read back for profiles, the
// leaderboard and replays.

import { AwardKind, GameAwards } from "@openfront/engine-api/game/Awards";
import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { DERPY_RULES } from "@openfront/engine-api/Schemas";
import {
  BOAT_INDEX_SENT,
  BOMB_INDEX_LAUNCH,
  OTHER_INDEX_BUILT,
  PlayerStats,
} from "@openfront/engine-api/StatsSchemas";
import {
  conquestsFromStats,
  derpCoinsForGame,
  goldEarnedFromStats,
  isWinningClient,
  peakTilesFromStats,
} from "@openfront/shared/DerpCoins";
import { replacer } from "@openfront/shared/SharedUtil";
import { GameRecord, PlayerRecord } from "@openfront/shared/WireSchemas";
import { gunzipSync, gzipSync } from "zlib";
import { logger } from "../Logger";
import { getMapLandTilesForSize } from "../MapLandTiles";
import { accountsForPlayIds } from "./DerpyAuth";
import {
  ConquestGameSummary,
  conquestProfile,
  ConquestStats,
} from "./DerpyConquest";
import { db, derpyDbConfigured, inTransaction } from "./DerpyDb";

const log = logger.child({ component: "DerpyGames" });

export interface PlayerLine {
  won: boolean;
  peakTerritoryPct: number;
  goldEarned: bigint;
  conquests: number;
  ships: number;
  betrayals: number;
  nukes: number;
  awards: AwardKind[];
  coins: number;
}

function n(v: bigint | string | number | undefined | null): number {
  return v === undefined || v === null ? 0 : Number(v);
}

/** One player's stats line and Derp Coins from a finished game. */
export function playerLine(
  record: GameRecord,
  player: PlayerRecord,
  awards: GameAwards,
  numLandTiles: number,
): PlayerLine {
  const stats: PlayerStats = player.stats;
  const won = isWinningClient(record.info.winner ?? null, player.clientID);
  const peakTerritoryPct =
    numLandTiles > 0
      ? Math.min(100, (peakTilesFromStats(stats) * 100) / numLandTiles)
      : 0;
  const goldEarned = goldEarnedFromStats(stats);
  const conquests = conquestsFromStats(stats);
  const boats = stats?.boats ?? {};
  const ships =
    n(boats.trade?.[BOAT_INDEX_SENT]) +
    n(boats.trans?.[BOAT_INDEX_SENT]) +
    n(stats?.units?.wshp?.[OTHER_INDEX_BUILT]);
  const bombs = stats?.bombs ?? {};
  const nukes =
    n(bombs.abomb?.[BOMB_INDEX_LAUNCH]) +
    n(bombs.hbomb?.[BOMB_INDEX_LAUNCH]) +
    n(bombs.mirv?.[BOMB_INDEX_LAUNCH]);
  const myAwards = awards
    .filter((a) => a.clientID === player.clientID)
    .map((a) => a.kind);
  const coins = derpCoinsForGame({
    won,
    peakTerritoryPercent: peakTerritoryPct,
    goldEarned,
    humansAndNationsConquered: conquests.humansAndNations,
    botsConquered: conquests.bots,
    awards: myAwards,
    durationSeconds: record.info.duration,
  }).total;
  return {
    won,
    peakTerritoryPct,
    goldEarned,
    conquests: conquests.humansAndNations + conquests.bots,
    ships,
    betrayals: n(stats?.betrayals),
    nukes,
    awards: myAwards,
    coins,
  };
}

function winnerText(record: GameRecord): string | null {
  const w = record.info.winner;
  if (!w) return null;
  if (w[0] === "player") {
    return (
      record.info.players.find((p) => p.clientID === w[1])?.username ?? null
    );
  }
  if (w[0] === "team") return `Team ${w[1]}`;
  return w[1];
}

/** The record as stored and served: no player IDs, playable on any build. */
function storableRecord(record: GameRecord): GameRecord {
  return {
    ...record,
    gitCommit: "DEV",
    info: {
      ...record.info,
      // The rules it was played under, so its replay plays the same game.
      config: {
        ...record.info.config,
        derpyRules: record.info.config.derpyRules ?? DERPY_RULES,
      },
      players: record.info.players.map((p) => ({ ...p, persistentID: null })),
      reports: undefined,
    },
  };
}

/**
 * Saves a finished game if at least one signed-in player played it, and pays
 * each of them their Derp Coins. `accountFor` maps a player to their account
 * (by default through the player ID they joined with). Saving the same game
 * twice does nothing the second time. Returns each credited account's line.
 */
export async function recordDerpyGame(
  record: GameRecord,
  awards: GameAwards,
  accountFor?: (player: PlayerRecord) => number | undefined,
): Promise<Map<number, PlayerLine>> {
  const lines = new Map<number, PlayerLine>();
  if (!derpyDbConfigured()) return lines;
  try {
    let lookup = accountFor;
    if (lookup === undefined) {
      const byPlayId = await accountsForPlayIds(
        record.info.players.map((p) => p.persistentID ?? ""),
      );
      lookup = (p) => byPlayId.get((p.persistentID ?? "").toLowerCase());
    }
    const credited: { player: PlayerRecord; accountId: number }[] = [];
    for (const player of record.info.players) {
      const accountId = lookup(player);
      // A game quit before it was decided has no stats; it still counts
      // as played, and its replay is still worth keeping.
      if (accountId !== undefined) {
        // One line per account, even if they somehow joined twice.
        if (!credited.some((c) => c.accountId === accountId)) {
          credited.push({ player, accountId });
        }
      }
    }
    if (credited.length === 0) return lines;

    const config = record.info.config;
    const numLandTiles = await getMapLandTilesForSize(
      config.gameMap as GameMapType,
      config.gameMapSize === GameMapSize.Compact,
    );
    const blob = gzipSync(
      Buffer.from(JSON.stringify(storableRecord(record), replacer)),
    );

    await inTransaction(async (c) => {
      const inserted = await c.query(
        `INSERT INTO derpy_games (game_id, map, mode, game_type, started_at,
           ended_at, duration_s, winner, num_players, awards, record)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0),
           to_timestamp($6 / 1000.0), $7, $8, $9, $10, $11)
         ON CONFLICT (game_id) DO NOTHING
         RETURNING game_id`,
        [
          record.info.gameID,
          config.gameMap,
          config.gameMode,
          config.gameType,
          record.info.start,
          record.info.end,
          record.info.duration,
          winnerText(record),
          record.info.players.length,
          JSON.stringify(awards),
          blob,
        ],
      );
      if (inserted.rowCount === 0) return; // already saved
      for (const { player, accountId } of credited) {
        const line = playerLine(record, player, awards, numLandTiles);
        lines.set(accountId, line);
        await c.query(
          `INSERT INTO derpy_game_players (game_id, account_id, username, won,
             peak_territory_pct, gold_earned, conquests, ships, betrayals,
             nukes, awards, coins)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            record.info.gameID,
            accountId,
            player.username,
            line.won,
            line.peakTerritoryPct,
            line.goldEarned.toString(),
            line.conquests,
            line.ships,
            line.betrayals,
            line.nukes,
            line.awards,
            line.coins,
          ],
        );
        await c.query(
          "UPDATE derpy_accounts SET coins = coins + $2 WHERE id = $1",
          [accountId, line.coins],
        );
      }
    });
    log.info("saved game", {
      gameID: record.info.gameID,
      accounts: credited.length,
      bytes: blob.length,
    });
  } catch (err) {
    log.error(`failed to save game ${record.info.gameID}: ${err}`);
  }
  return lines;
}

/** A saved game's record for the replay viewer, or null. */
export async function savedGameRecord(gameId: string): Promise<unknown> {
  const res = await (
    await db()
  ).query("SELECT record FROM derpy_games WHERE game_id = $1", [gameId]);
  const row = res.rows[0];
  if (!row) return null;
  return withRulesEdition(
    JSON.parse(gunzipSync(row.record as Buffer).toString("utf8")),
  );
}

/**
 * Games saved before records carried their rules edition were all played
 * under the first one; say so, so their replays don't take today's rules.
 */
export function withRulesEdition(record: unknown): unknown {
  const config = (record as { info?: { config?: Record<string, unknown> } })
    ?.info?.config;
  if (config && config.derpyRules === undefined) config.derpyRules = 1;
  return record;
}

export interface StatsSummary {
  games: number;
  wins: number;
  bestTerritoryPct: number;
  goldEarned: string;
  mostGoldInAGame: string;
  conquests: number;
  ships: number;
  betrayals: number;
  nukes: number;
  mvps: number;
  awards: number;
  coinsEarned: number;
}

const STATS_COLUMNS = `
  count(gp.game_id)::int AS games,
  count(gp.game_id) FILTER (WHERE gp.won)::int AS wins,
  coalesce(max(gp.peak_territory_pct), 0)::float AS best_territory_pct,
  coalesce(sum(gp.gold_earned), 0)::text AS gold_earned,
  coalesce(max(gp.gold_earned), 0)::text AS most_gold,
  coalesce(sum(gp.conquests), 0)::int AS conquests,
  coalesce(sum(gp.ships), 0)::int AS ships,
  coalesce(sum(gp.betrayals), 0)::int AS betrayals,
  coalesce(sum(gp.nukes), 0)::int AS nukes,
  count(gp.game_id) FILTER (WHERE 'mvp' = ANY(gp.awards))::int AS mvps,
  coalesce(sum(cardinality(gp.awards)), 0)::int AS awards,
  coalesce(sum(gp.coins), 0)::int AS coins_earned`;

function rowToStats(row: Record<string, unknown>): StatsSummary {
  return {
    games: Number(row.games),
    wins: Number(row.wins),
    bestTerritoryPct: Math.round(Number(row.best_territory_pct) * 10) / 10,
    goldEarned: String(row.gold_earned),
    mostGoldInAGame: String(row.most_gold),
    conquests: Number(row.conquests),
    ships: Number(row.ships),
    betrayals: Number(row.betrayals),
    nukes: Number(row.nukes),
    mvps: Number(row.mvps),
    awards: Number(row.awards),
    coinsEarned: Number(row.coins_earned),
  };
}

export interface LeaderboardRow extends StatsSummary {
  username: string;
  coins: number;
}

/** Every account's stats, most wins first. */
export async function leaderboard(): Promise<LeaderboardRow[]> {
  const res = await (
    await db()
  ).query(
    `SELECT a.username, a.coins, ${STATS_COLUMNS}
     FROM derpy_accounts a
     LEFT JOIN derpy_game_players gp ON gp.account_id = a.id
     GROUP BY a.id
     ORDER BY wins DESC, games DESC, a.username_key ASC`,
  );
  return res.rows.map((r) => ({
    username: r.username,
    coins: Number(r.coins),
    ...rowToStats(r),
  }));
}

export interface GameSummary {
  gameId: string;
  map: string;
  mode: string;
  gameType: string;
  endedAt: string;
  durationS: number;
  winner: string | null;
  numPlayers: number;
  playedAs: string;
  won: boolean;
  peakTerritoryPct: number;
  goldEarned: string;
  awards: string[];
  coins: number;
}

export interface Profile {
  username: string;
  coins: number;
  createdAt: string;
  stats: StatsSummary;
  games: GameSummary[];
  conquest: { stats: ConquestStats; games: ConquestGameSummary[] };
}

/** A player's stats and their saved games (newest first), or null. */
export async function profile(username: string): Promise<Profile | null> {
  const pool = await db();
  const acc = await pool.query(
    `SELECT a.id, a.username, a.coins, a.created_at, ${STATS_COLUMNS}
     FROM derpy_accounts a
     LEFT JOIN derpy_game_players gp ON gp.account_id = a.id
     WHERE a.username_key = $1
     GROUP BY a.id`,
    [username.toLowerCase()],
  );
  const row = acc.rows[0];
  if (!row) return null;
  const games = await pool.query(
    `SELECT g.game_id, g.map, g.mode, g.game_type, g.ended_at, g.duration_s,
       g.winner, g.num_players, gp.username AS played_as, gp.won,
       gp.peak_territory_pct, gp.gold_earned::text AS gold_earned, gp.awards,
       gp.coins
     FROM derpy_game_players gp
     JOIN derpy_games g ON g.game_id = gp.game_id
     WHERE gp.account_id = $1
     ORDER BY g.ended_at DESC
     LIMIT 200`,
    [row.id],
  );
  const conquest = await conquestProfile(Number(row.id));
  return {
    username: row.username,
    coins: Number(row.coins),
    createdAt: new Date(row.created_at).toISOString(),
    conquest,
    stats: rowToStats(row),
    games: games.rows.map((g) => ({
      gameId: g.game_id,
      map: g.map,
      mode: g.mode,
      gameType: g.game_type,
      endedAt: new Date(g.ended_at).toISOString(),
      durationS: g.duration_s,
      winner: g.winner,
      numPlayers: g.num_players,
      playedAs: g.played_as,
      won: g.won,
      peakTerritoryPct: Math.round(Number(g.peak_territory_pct) * 10) / 10,
      goldEarned: g.gold_earned,
      awards: g.awards,
      coins: g.coins,
    })),
  };
}
