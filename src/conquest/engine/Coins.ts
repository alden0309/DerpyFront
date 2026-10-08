// Derp Coins for a line of lives in Derpy Conquest. The server pays this and
// the end screen shows it, so it's the whole rulebook. Totals land where the
// old governor's game did (it was deliberately tuned down): a short life
// pays a handful, a dynasty that rose high pays a few dozen.

import { LIFE_COINS } from "./LifeRules";
import type { Life } from "./Types";

export interface CoinResult {
  total: number;
  lines: { line: string; coins: number }[];
}

/** What a seat's line earned. `reached1776`: a character still living at the end. */
export function lifeCoins(life: Life, reached1776: boolean): CoinResult {
  const c = LIFE_COINS;
  const t = life.tally;
  if (t.days < c.minDays) return { total: 0, lines: [] };
  const lines = [
    { line: "Lived a life", coins: c.played },
    {
      line: `${Math.floor(t.days / 365)} years lived`,
      coins: Math.min(c.maxYears, Math.floor((t.days / 3650) * c.perTenYears)),
    },
    {
      line: "Rose in a trade",
      coins: Math.min(c.maxRank, t.topRank * c.perRank),
    },
    {
      line:
        t.topOffice >= 3
          ? "Governed"
          : t.topOffice === 2
            ? "Sat on a council"
            : "Sat in an assembly",
      coins: c.office[Math.min(3, t.topOffice)] ?? 0,
    },
    {
      line: "Renown",
      coins: Math.min(
        c.maxRenown,
        Math.floor((t.peakRenown / 10) * c.perTenRenown),
      ),
    },
    {
      line: `${t.generations} generation${t.generations === 1 ? "" : "s"}`,
      coins: Math.min(c.maxGenerations, (t.generations - 1) * c.perGeneration),
    },
    {
      line: `${t.children} children`,
      coins: Math.min(c.maxChildren, Math.floor(t.children * c.perChild)),
    },
    {
      line: "Battles won",
      coins: Math.min(c.maxBattles, t.battlesWon * c.perBattleWon),
    },
    { line: "A rising that won", coins: t.risingsWon > 0 ? c.risingWon : 0 },
    { line: "Went to Europe", coins: t.europe ? c.europe : 0 },
    { line: "Lived to see 1776", coins: reached1776 ? c.reached1776 : 0 },
  ].filter((l) => l.coins > 0);
  return { total: lines.reduce((n, l) => n + l.coins, 0), lines };
}
