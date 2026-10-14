// SITE (r19): a little more Derp Coins. Every line of a Conquest life's pay,
// and every achievement, went up by about a fifth: amounts of 3 or more by at
// least 1, rates by 20% with each line rounded down. These pin the amounts.
// LEGACY (r21): the line's coins about doubled again, and are paid as they're
// reached, held to the time played (the rules below; through the rooms
// server: tests/server/ConquestPayR21).

import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_COINS,
  ACHIEVEMENTS,
} from "../../src/conquest/engine/Achievements";
import {
  countsAtTable,
  lifeCoins,
  lineCap,
  linesDue,
  timeCoins,
} from "../../src/conquest/engine/Coins";
import { LIFE_COINS, PLAY_PAY } from "../../src/conquest/engine/LifeRules";
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

// LEGACY (r21): pay as you play, counted in real time.
describe("Derp Coins as you play (LEGACY r21)", () => {
  test("time at the table: 2.5 coins a minute, 150 an hour; never negative", () => {
    expect(PLAY_PAY.perMinute).toBe(2.5);
    expect(timeCoins(60)).toBe(2.5);
    expect(timeCoins(3600)).toBe(150);
    expect(timeCoins(-30)).toBe(0);
  });

  test("the line's coins are held to 60 for each hour at the table", () => {
    expect(lineCap(3600)).toBe(PLAY_PAY.linesPerHour);
    expect(lineCap(1800)).toBe(30);
    expect(lineCap(59)).toBe(0);
    const life = lifeWith({ days: 30 * 365, topRank: 4, peakRenown: 60 });
    const total = lifeCoins(life, false).total;
    expect(total).toBeGreaterThan(60);
    // Half an hour played, 10 paid already: 20 due, the rest held.
    expect(linesDue(life, 1800, 10)).toEqual({
      total,
      cap: 30,
      paid: 10,
      due: 20,
      held: total - 30,
    });
    // Time enough: all of it, and nothing held; paid already, nothing due.
    expect(linesDue(life, 10 * 3600, 0)).toMatchObject({ due: total, held: 0 });
    expect(linesDue(life, 10 * 3600, total)).toMatchObject({
      due: 0,
      held: 0,
    });
    // At the end, living to see 1776 too (still held to the time).
    expect(linesDue(life, 10 * 3600, 0, true).total).toBe(
      total + LIFE_COINS.reached1776,
    );
  });

  test("a moment counts while you play: living, a choice of your own lately, and not a long stop", () => {
    const min = 60_000;
    const playing = {
      living: true,
      sinceChoice: min,
      paused: false,
      pausedFor: 0,
    };
    expect(countsAtTable(playing)).toBe(true);
    expect(countsAtTable({ ...playing, living: false })).toBe(false);
    expect(
      countsAtTable({ ...playing, sinceChoice: PLAY_PAY.idleMinutes * min }),
    ).toBe(true);
    expect(
      countsAtTable({
        ...playing,
        sinceChoice: PLAY_PAY.idleMinutes * min + 1,
      }),
    ).toBe(false);
    expect(countsAtTable({ ...playing, sinceChoice: Infinity })).toBe(false);
    expect(
      countsAtTable({
        ...playing,
        paused: true,
        pausedFor: PLAY_PAY.pausedMinutes * min,
      }),
    ).toBe(true);
    expect(
      countsAtTable({
        ...playing,
        paused: true,
        pausedFor: PLAY_PAY.pausedMinutes * min + 1,
      }),
    ).toBe(false);
  });
});
