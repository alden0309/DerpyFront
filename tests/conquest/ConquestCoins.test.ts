// SITE (r19): a little more Derp Coins. Every line of a Conquest life's pay,
// and every achievement, went up by about a fifth: amounts of 3 or more by at
// least 1, rates by 20% with each line rounded down. These pin the amounts.
// LEGACY (r21): the line's coins about doubled again (and are paid as they're
// reached, held to the time played: ConquestCoinsR21 and ConquestPayR21).

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

describe("Derp Coins for a Conquest life (SITE r19, LEGACY r21)", () => {
  test("the rulebook's amounts", () => {
    expect(LIFE_COINS).toMatchObject({
      minDays: 730,
      played: 12,
      perTenYears: 5,
      maxYears: 28,
      perRank: 5,
      maxRank: 35,
      office: [0, 10, 20, 36],
      perTenRenown: 2.5,
      maxRenown: 28,
      perGeneration: 8,
      maxGenerations: 28,
      perChild: 1.2,
      maxChildren: 12,
      perBattleWon: 2.5,
      maxBattles: 25,
      risingWon: 20,
      europe: 14,
      reached1776: 12,
    });
  });

  test("a dynasty that rose high: 202 (it was 83, then 98)", () => {
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
      "Lived a life": 12,
      "60 years lived": 28,
      "Rose in a trade": 25,
      Governed: 36,
      Renown: 22,
      "3 generations": 16,
      "6 children": 7,
      "Battles won": 10,
      "A rising that won": 20,
      "Went to Europe": 14,
      "Lived to see 1776": 12,
    });
    expect(r.total).toBe(202);
  });

  test("a short life: 21 (it was 8, then 9); under two years, nothing", () => {
    const short = lifeWith({ days: 3 * 365, topRank: 1, peakRenown: 15 });
    expect(lifeCoins(short, false).total).toBe(21);
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
