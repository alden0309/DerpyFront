// Derp Coins for a game of Derpy Conquest. The server pays this and the
// end screen shows it, so it's the whole rulebook.

export const CONQUEST_COINS = {
  /** A game must last this long (game days) to pay. */
  minDays: 730,
  played: 5,
  /** Coins per province held at the end (a half: two provinces a coin). */
  perProvince: 0.5,
  maxProvinces: 30,
  perColony: 0.5,
  maxColonies: 20,
  perBattleWon: 1,
  maxBattles: 20,
  perConquest: 2,
  maxConquests: 30,
  win: 60,
  second: 25,
  third: 10,
} as const;

export interface ConquestCoinGame {
  days: number;
  rank: number;
  provinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
}

export interface ConquestCoinResult {
  total: number;
  lines: { line: string; coins: number }[];
}

export function conquestCoins(g: ConquestCoinGame): ConquestCoinResult {
  const c = CONQUEST_COINS;
  if (g.days < c.minDays) return { total: 0, lines: [] };
  const lines = [
    { line: "Played", coins: c.played },
    {
      line: "Provinces held",
      coins: Math.min(c.maxProvinces, Math.floor(g.provinces * c.perProvince)),
    },
    {
      line: "Colonies founded",
      coins: Math.min(c.maxColonies, Math.floor(g.colonies * c.perColony)),
    },
    {
      line: "Battles won",
      coins: Math.min(c.maxBattles, Math.floor(g.battlesWon * c.perBattleWon)),
    },
    {
      line: "Provinces conquered",
      coins: Math.min(c.maxConquests, Math.floor(g.conquests * c.perConquest)),
    },
    {
      line:
        g.rank === 1
          ? "Victory"
          : g.rank === 2
            ? "Second place"
            : "Third place",
      coins:
        g.rank === 1
          ? c.win
          : g.rank === 2
            ? c.second
            : g.rank === 3
              ? c.third
              : 0,
    },
  ].filter((l) => l.coins > 0);
  return { total: lines.reduce((n, l) => n + l.coins, 0), lines };
}
