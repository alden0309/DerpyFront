// SITE (r19): a little more Derp Coins. Every line of a Conquest life's pay,
// and every achievement, went up by about a fifth: amounts of 3 or more by at
// least 1, rates by 20% with each line rounded down. These pin the amounts.

import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_COINS,
  ACHIEVEMENTS,
} from "../../src/conquest/engine/Achievements";
import { lifeCoins } from "../../src/conquest/engine/Coins";
import { LIFE_COINS } from "../../src/conquest/engine/LifeRules";
import type { Life, LifeTally } from "../../src/conquest/engine/Types";

function lifeWith(t: Partial<LifeTally>): Life {
  const tally: LifeTally = {
    days: 0,
    jobs: 0,
    promotions: 0,
    topRank: 0,
    topOffice: 0,
    peakRenown: 0,
    peakPurse: 0,
    earned: 0,
    children: 0,
    marriages: 0,
    battles: 0,
    battlesWon: 0,
    wounds: 0,
    events: 0,
    generations: 1,
    takeovers: 0,
    provinces: 0,
    risings: 0,
    risingsWon: 0,
    elections: 0,
    europe: null,
    ...t,
  };
  return { tally } as unknown as Life;
}

describe("Derp Coins for a Conquest life (SITE r19)", () => {
  test("the rulebook's amounts", () => {
    expect(LIFE_COINS).toMatchObject({
      minDays: 730,
      played: 6,
      maxYears: 14,
      maxRank: 17,
      office: [0, 5, 10, 18],
      maxRenown: 14,
      perGeneration: 4,
      maxGenerations: 14,
      maxChildren: 6,
      maxBattles: 12,
      risingWon: 10,
      europe: 7,
      reached1776: 6,
    });
  });

  test("a dynasty that rose high: 98 (it was 83)", () => {
    const life = lifeWith({
      days: 60 * 365,
      topRank: 5,
      topOffice: 3,
      peakRenown: 90,
      generations: 3,
      children: 6,
      battlesWon: 4,
      risingsWon: 1,
      europe: "fortune",
    });
    const r = lifeCoins(life, true);
    expect(Object.fromEntries(r.lines.map((l) => [l.line, l.coins]))).toEqual({
      "Lived a life": 6,
      "60 years lived": 14,
      "Rose in a trade": 12,
      Governed: 18,
      Renown: 10,
      "3 generations": 8,
      "6 children": 3,
      "Battles won": 4,
      "A rising that won": 10,
      "Went to Europe": 7,
      "Lived to see 1776": 6,
    });
    expect(r.total).toBe(98);
  });

  test("a short life: 9 (it was 8); under two years, nothing", () => {
    const short = lifeWith({ days: 3 * 365, topRank: 1, peakRenown: 15 });
    expect(lifeCoins(short, false).total).toBe(9);
    expect(lifeCoins(lifeWith({ days: 700 }), true).total).toBe(0);
  });

  test("small lines still round down, so nothing is paid in fractions", () => {
    const life = lifeWith({
      days: 13 * 365,
      topRank: 3,
      peakRenown: 37,
      children: 3,
      battlesWon: 3,
    });
    for (const l of lifeCoins(life, false).lines)
      expect(Number.isInteger(l.coins)).toBe(true);
  });

  test("achievements: 3 or more went up by one; all together 187 (they were 160)", () => {
    const counts = new Map<number, number>();
    for (const a of ACHIEVEMENTS)
      counts.set(a.coins, (counts.get(a.coins) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([1, 2, 4, 5, 6]);
    expect(ACHIEVEMENT_COINS).toBe(187);
  });
});
