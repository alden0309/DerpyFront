import { AwardKind } from "@openfront/engine-api/game/Awards";
import {
  GOLD_INDEX_DONATE_RECV,
  PLAYER_INDEX_BOT,
  PLAYER_INDEX_HUMAN,
  PLAYER_INDEX_NATION,
  PlayerStats,
  TILE_INDEX_PEAK,
} from "@openfront/engine-api/StatsSchemas";

/**
 * Derp Coins: Derpy Front's store currency, earned after every game by how
 * well you did. The client shows the same breakdown the server pays, so this
 * one function is the whole rulebook.
 */

/** Games shorter than this pay nothing, so quitting straight away isn't a farm. */
export const DERP_COINS_MIN_GAME_SECONDS = 120;

export const DERP_COINS = {
  played: 10,
  perTerritoryPercent: 1,
  maxTerritory: 100,
  perConquest: 5,
  perBotConquest: 1,
  maxConquests: 50,
  goldPerCoin: 250_000n,
  maxGold: 40,
  mvp: 50,
  otherAward: 20,
  win: 100,
} as const;

export type DerpCoinLine =
  | "played"
  | "territory"
  | "conquests"
  | "gold"
  | "awards"
  | "win";

export interface DerpCoinResult {
  total: number;
  /** Each non-zero part of the total, in display order. */
  lines: { line: DerpCoinLine; coins: number }[];
}

/** One player's game, as the coin rules see it. */
export interface DerpCoinGame {
  won: boolean;
  /** Most land owned at once, as a percent (0-100) of the map's land. */
  peakTerritoryPercent: number;
  /** Gold earned from work, conquest, trade and trains (not donations). */
  goldEarned: bigint;
  humansAndNationsConquered: number;
  botsConquered: number;
  /** Awards this player won. */
  awards: readonly AwardKind[];
  durationSeconds: number;
}

export function derpCoinsForGame(g: DerpCoinGame): DerpCoinResult {
  if (g.durationSeconds < DERP_COINS_MIN_GAME_SECONDS) {
    return { total: 0, lines: [] };
  }
  const territory = Math.min(
    DERP_COINS.maxTerritory,
    Math.floor(
      Math.max(0, g.peakTerritoryPercent) * DERP_COINS.perTerritoryPercent,
    ),
  );
  const conquests = Math.min(
    DERP_COINS.maxConquests,
    g.humansAndNationsConquered * DERP_COINS.perConquest +
      g.botsConquered * DERP_COINS.perBotConquest,
  );
  const gold = Math.min(
    DERP_COINS.maxGold,
    Number((g.goldEarned > 0n ? g.goldEarned : 0n) / DERP_COINS.goldPerCoin),
  );
  const awards = g.awards.reduce(
    (sum, kind) =>
      sum + (kind === "mvp" ? DERP_COINS.mvp : DERP_COINS.otherAward),
    0,
  );
  const lines: DerpCoinResult["lines"] = [
    { line: "played", coins: DERP_COINS.played },
    { line: "territory", coins: territory },
    { line: "conquests", coins: conquests },
    { line: "gold", coins: gold },
    { line: "awards", coins: awards },
    { line: "win", coins: g.won ? DERP_COINS.win : 0 },
  ];
  const nonZero = lines.filter((l) => l.coins > 0);
  return {
    total: nonZero.reduce((sum, l) => sum + l.coins, 0),
    lines: nonZero,
  };
}

/** Gold a player earned, from their end-of-game stats. Donations don't count. */
export function goldEarnedFromStats(stats: PlayerStats): bigint {
  let total = 0n;
  (stats?.gold ?? []).forEach((v, i) => {
    if (i !== GOLD_INDEX_DONATE_RECV) total += BigInt(v);
  });
  return total;
}

export function peakTilesFromStats(stats: PlayerStats): number {
  return Number(stats?.tiles?.[TILE_INDEX_PEAK] ?? 0n);
}

export function conquestsFromStats(stats: PlayerStats): {
  humansAndNations: number;
  bots: number;
} {
  const c = stats?.conquests ?? [];
  return {
    humansAndNations:
      Number(c[PLAYER_INDEX_HUMAN] ?? 0n) +
      Number(c[PLAYER_INDEX_NATION] ?? 0n),
    bots: Number(c[PLAYER_INDEX_BOT] ?? 0n),
  };
}

/** Whether `clientID` is on the winning side of `winner`. */
export function isWinningClient(
  winner:
    | readonly [string, string, ...string[]]
    | readonly string[]
    | undefined
    | null,
  clientID: string,
): boolean {
  if (!winner) return false;
  if (winner[0] === "player") return winner[1] === clientID;
  if (winner[0] === "team") return winner.slice(2).includes(clientID);
  return false;
}
