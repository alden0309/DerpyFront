// Derp Coins for a game of Derpy Conquest. The server pays this and the
// end screen shows it, so it's the whole rulebook.

export const CONQUEST_COINS = {
  /** A game must last this long (real seconds and game days) to pay. */
  minSeconds: 120,
  minDays: 730,
  played: 10,
  perProvince: 1,
  maxProvinces: 60,
  perColony: 1,
  maxColonies: 40,
  perBattleWon: 2,
  maxBattles: 40,
  perConquest: 3,
  maxConquests: 45,
  win: 100,
  second: 40,
  third: 20,
} as const;

export interface ConquestCoinGame {
  seconds: number;
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
  if (g.seconds < c.minSeconds || g.days < c.minDays)
    return { total: 0, lines: [] };
  const lines = [
    { line: "Played", coins: c.played },
    {
      line: "Provinces held",
      coins: Math.min(c.maxProvinces, g.provinces * c.perProvince),
    },
    {
      line: "Colonies founded",
      coins: Math.min(c.maxColonies, g.colonies * c.perColony),
    },
    {
      line: "Battles won",
      coins: Math.min(c.maxBattles, g.battlesWon * c.perBattleWon),
    },
    {
      line: "Provinces conquered",
      coins: Math.min(c.maxConquests, g.conquests * c.perConquest),
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
