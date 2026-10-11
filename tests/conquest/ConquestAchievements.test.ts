// MAP (r12): achievements. Fifty-odd across every system, each a few Derp
// Coins; earned once in a game (and noted in the journal), at once when a
// command earns one, kept through a save; the native peoples' own paths;
// the long game.

import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_BY_KEY,
  ACHIEVEMENT_COINS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
  checkAchievements,
} from "../../src/conquest/engine/Achievements";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { lifeCoins } from "../../src/conquest/engine/Coins";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { lifeOf, plan, prov, ticks, world } from "./LifeUtil";

describe("achievements (MAP r12)", () => {
  test("fifty-odd, across every kind, each a few coins", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(60);
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(
      ACHIEVEMENTS.length,
    );
    for (const a of ACHIEVEMENTS) {
      expect(a.coins).toBeGreaterThanOrEqual(1);
      expect(a.coins).toBeLessThanOrEqual(5);
      expect(a.how).toMatch(/\.$/);
    }
    for (const g of ACHIEVEMENT_GROUPS)
      expect(ACHIEVEMENTS.some((a) => a.group === g.id)).toBe(true);
    // In keeping with a life's coins: all of them together are worth a few
    // good lives, not a fortune.
    expect(ACHIEVEMENT_COINS).toBeGreaterThan(80);
    expect(ACHIEVEMENT_COINS).toBeLessThan(200);
    for (const key of [
      "first-job",
      "promoted",
      "house",
      "married",
      "heir",
      "tongue",
      "letter",
      "local-office",
      "governor",
      "duel",
      "fortune",
      "expedition",
      "founder",
      "1776",
      "war-honours",
    ])
      expect(ACHIEVEMENT_BY_KEY.has(key), key).toBe(true);
  });

  test("your first work: earned on the first day, noted once in the journal", () => {
    const g = world();
    const life = lifeOf(g);
    expect(life.job).not.toBeNull();
    ticks(g, 1);
    expect(life.achieved?.["first-job"]).toBeLessThanOrEqual(g.s.day);
    const notes = () =>
      life.journal.filter((j) =>
        /^Achievement earned: An honest living\. /.test(j.text),
      ).length;
    expect(notes()).toBe(1);
    ticks(g, 30);
    expect(notes()).toBe(1);
  });

  test("a command that earns one earns it at once, even paused", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 500;
    life.area = "market";
    expect(life.achieved?.house).toBeUndefined();
    expect(
      g.lifeCommand("s1", { k: "act", place: "market", act: "house" }),
    ).toBeNull();
    expect(life.achieved?.house).toBe(g.s.day);
  });

  test("counts kept on the way: a day at sea earns your sea legs", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 50;
    expect(
      g.lifeCommand("s1", { k: "travel", to: prov("Bermuda"), bySea: true }),
    ).toBeNull();
    ticks(g, 6);
    expect(life.achCount?.sea ?? 0).toBeGreaterThan(0);
    expect(life.achieved?.["sea-legs"]).toBeDefined();
  });

  test("the peoples' own paths: war honours for a warrior", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "Pat",
          plan: plan({
            origin: "powhatan",
            home: prov("Pamunkey"),
            religion: "native",
            first: "Opechan",
            family: "of the Pamunkey",
            background: "warrior",
          }),
        },
      ],
    });
    const life = lifeOf(g);
    expect(life.job?.kind).toBe("warrior");
    life.job!.rank = 2;
    checkAchievements(g, life);
    expect(life.achieved?.["war-honours"]).toBeDefined();
  });

  test("the long game: alive in 1776", () => {
    const g = world();
    const life = lifeOf(g);
    g.s.day = dayOf(1776, 0, 1);
    checkAchievements(g, life);
    expect(life.achieved?.["1776"]).toBeDefined();
  });

  test("a dead character earns nothing more; the line's heir carries on", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    me.alive = false;
    expect(checkAchievements(g, life)).toEqual([]);
  });

  test("what's earned survives a save, and doesn't change a life's coins", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 2);
    const coins = lifeCoins(life, false).total;
    const saved = JSON.parse(JSON.stringify(g.state));
    const back = new ConquestGame(g.map, saved);
    const again = back.state.lives.find((l) => l.seat === "s1")!;
    expect(again.achieved).toEqual(life.achieved);
    expect(lifeCoins(again, false).total).toBe(coins);
  });
});
