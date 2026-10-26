// DFX (r26): Random history's pick and "Random nations" in a lobby. The
// pick is a random scenario, then a random nation in it, each as likely,
// never one under the size floor (sizes.json, checked here against the
// starting land the game lays out), and a reroll is a different pick. The
// lobby deal seats everyone on a free nation, mixed across the sides, or
// the host's friends together on one.

import { dealScenarioSeats } from "@openfront/engine-lib/scenario/ScenarioConfig";
import {
  allScenarioData,
  isPlayable,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { describe, expect, it } from "vitest";
import sizesFile from "../../resources/scenarios/sizes.json";
import { allScenarioSizes } from "../../scripts/scenario-sizes";
import {
  dealRandomNations,
  eligibleNations,
  eligibleScenarios,
  isEligible,
  minLandFor,
  nationLand,
  NEUTRAL_MIN_SHARE,
  pickRandomHistory,
  type Rand,
  SIDE_MIN_SHARE,
  sideLand,
} from "../../src/client/scenario/RandomHistory";

/** mulberry32: a seeded random for the statistical checks. */
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random that answers these values in turn. */
function queue(...values: number[]): Rand {
  return () => {
    const v = values.shift();
    if (v === undefined) throw new Error("asked for more than expected");
    return v;
  };
}

describe("each nation's starting land (sizes.json)", () => {
  it("is what the game lays out (run scripts/scenario-sizes.ts if not)", () => {
    expect(sizesFile).toEqual(allScenarioSizes());
  }, 60_000);

  it("covers every scenario and nation", () => {
    for (const d of allScenarioData())
      for (const n of d.nations)
        expect(nationLand(d.id, n.key), `${d.id}/${n.key}`).toBeGreaterThan(0);
  });
});

describe("the size floor", () => {
  it("a side's nation needs its share of the sides' land; a neutral, more", () => {
    const d = scenarioData("europe1939")!;
    const poland = d.nations.find((n) => n.key === "poland")!;
    const spain = d.nations.find((n) => n.key === "spain")!;
    expect(minLandFor(d, poland)).toBeCloseTo(sideLand(d) * SIDE_MIN_SHARE);
    expect(minLandFor(d, spain)).toBeCloseTo(sideLand(d) * NEUTRAL_MIN_SHARE);
    const keys = eligibleNations(d).map((n) => n.key);
    // The great powers and the sizeable middle; not the small ones.
    for (const k of ["germany", "poland", "france", "soviet_union", "italy"])
      expect(keys).toContain(k);
    for (const k of ["slovakia", "belgium", "netherlands", "luxembourg"])
      expect(keys).not.toContain(k);
    // Neutrals only if sizeable: Sweden and Turkey, not Ireland or Spain.
    expect(keys).toContain("sweden");
    expect(keys).toContain("turkey");
    expect(keys).not.toContain("ireland");
    expect(keys).not.toContain("spain");
  });

  it("1776: no Rhode Island or Delaware; the Continental Army has its two", () => {
    const c = eligibleNations(scenarioData("colonies1776")!).map((n) => n.key);
    expect(c).toContain("virginia");
    expect(c).toContain("great_britain");
    expect(c).not.toContain("rhode_island");
    expect(c).not.toContain("delaware");
    expect(c).not.toContain("mohican");
    const ca = eligibleNations(scenarioData("continental1776")!).map(
      (n) => n.key,
    );
    expect(ca).toContain("united_colonies");
    expect(ca).toContain("great_britain");
  });

  it("every scenario has nations to deal, and each dealt one is over its floor", () => {
    expect(eligibleScenarios().map((d) => d.id)).toEqual(
      allScenarioData().map((d) => d.id),
    );
    for (const d of allScenarioData()) {
      for (const n of d.nations) {
        const over =
          isPlayable(n) && nationLand(d.id, n.key) >= minLandFor(d, n);
        expect(isEligible(d, n), `${d.id}/${n.key}`).toBe(over);
      }
    }
  });
});

describe("the pick", () => {
  it("is uniform: each scenario as likely, then each of its nations", () => {
    const scenarios = eligibleScenarios();
    // Every value of the two draws lands on one pick, each scenario on an
    // equal stretch of the first and each of its nations of the second.
    const seen = new Map<string, number>();
    scenarios.forEach((d, i) => {
      const nations = eligibleNations(d);
      nations.forEach((n, j) => {
        const pick = pickRandomHistory(
          queue((i + 0.5) / scenarios.length, (j + 0.5) / nations.length),
        );
        expect(pick).toEqual({ id: d.id, nation: n.key });
        seen.set(`${pick.id}/${pick.nation}`, 1);
      });
      // The stretch's ends land on the first and last nation.
      expect(
        pickRandomHistory(queue((i + 1e-9) / scenarios.length, 0)).nation,
      ).toBe(nations[0].key);
      expect(
        pickRandomHistory(queue((i + 0.999) / scenarios.length, 0.9999)).nation,
      ).toBe(nations[nations.length - 1].key);
    });
    const total = scenarios.reduce((n, d) => n + eligibleNations(d).length, 0);
    expect(seen.size).toBe(total);
  });

  it("over many picks: scenarios and nations come up evenly, never under the floor", () => {
    const rand = seeded(26);
    const scenarios = eligibleScenarios();
    const N = 45_000;
    const byScenario = new Map<string, number>();
    const byNation = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const p = pickRandomHistory(rand);
      const d = scenarioData(p.id)!;
      const n = d.nations.find((x) => x.key === p.nation)!;
      expect(isEligible(d, n)).toBe(true);
      byScenario.set(p.id, (byScenario.get(p.id) ?? 0) + 1);
      byNation.set(
        `${p.id}/${p.nation}`,
        (byNation.get(`${p.id}/${p.nation}`) ?? 0) + 1,
      );
    }
    const per = N / scenarios.length;
    for (const d of scenarios) {
      expect(Math.abs(byScenario.get(d.id)! - per) / per).toBeLessThan(0.06);
      const nations = eligibleNations(d);
      const each = per / nations.length;
      for (const n of nations) {
        const got = byNation.get(`${d.id}/${n.key}`) ?? 0;
        // Within five standard deviations of what's expected.
        expect(Math.abs(got - each)).toBeLessThan(5 * Math.sqrt(each) + 2);
      }
    }
  });

  it("Reroll: a different pick, even when the draw would repeat it", () => {
    const first = pickRandomHistory(queue(0, 0));
    const again = pickRandomHistory(queue(0, 0, 0.5, 0.5), first);
    expect(again).not.toEqual(first);
    const rand = seeded(7);
    let p = pickRandomHistory(rand);
    for (let i = 0; i < 500; i++) {
      const next = pickRandomHistory(rand, p);
      expect(next).not.toEqual(p);
      p = next;
    }
  });
});

describe("Random nations in a lobby", () => {
  const europe = scenarioData("europe1939")!;
  const sideOf = (key: string) =>
    europe.nations.find((n) => n.key === key)!.side;

  it("deals every player a free nation, mixed across the sides", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const players = ["p1", "p2", "p3", "p4", "p5", "p6"];
      const seats = dealRandomNations(europe, players, { rand: seeded(seed) });
      const holders = Object.values(seats);
      expect(new Set(holders).size).toBe(players.length);
      expect([...holders].sort()).toEqual([...players].sort());
      for (const key of Object.keys(seats)) {
        const n = europe.nations.find((x) => x.key === key)!;
        expect(isEligible(europe, n)).toBe(true);
      }
      // Three a side.
      const axis = Object.keys(seats).filter((k) => sideOf(k) === "Axis");
      expect(axis).toHaveLength(3);
      // The server takes it as it is.
      expect(dealScenarioSeats(europe, seats, new Set(players))).toEqual({
        seats,
      });
    }
  });

  it("is random: different deals come out", () => {
    const deals = new Set<string>();
    for (let seed = 1; seed <= 20; seed++)
      deals.add(
        JSON.stringify(
          dealRandomNations(europe, ["a", "b"], { rand: seeded(seed) }),
        ),
      );
    expect(deals.size).toBeGreaterThan(10);
  });

  it("Keep friends on one side: the host's friends together, everyone else mixed", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const friends = new Set(["host", "pat", "gary"]);
      const players = ["host", "x1", "pat", "x2", "gary", "x3", "x4"];
      const seats = dealRandomNations(europe, players, {
        friends,
        keepTogether: true,
        rand: seeded(seed),
      });
      expect(Object.values(seats).sort()).toEqual([...players].sort());
      const sideOfPlayer = (p: string) =>
        sideOf(Object.keys(seats).find((k) => seats[k] === p)!);
      const friendSides = new Set([...friends].map(sideOfPlayer));
      expect(friendSides.size).toBe(1);
      // The rest fill the other side first: 3 friends there, 4 others here
      // (3 on the other side, then one at random).
      const theirs = [...friendSides][0];
      const others = ["x1", "x2", "x3", "x4"].map(sideOfPlayer);
      expect(others.filter((s) => s !== theirs).length).toBeGreaterThanOrEqual(
        3,
      );
    }
    // Unticked, friends are dealt like anyone (they end up apart sometimes).
    let apart = false;
    for (let seed = 1; seed <= 40 && !apart; seed++) {
      const seats = dealRandomNations(europe, ["host", "pat"], {
        friends: new Set(["host", "pat"]),
        keepTogether: false,
        rand: seeded(seed),
      });
      const sides = Object.keys(seats).map(sideOf);
      apart = sides[0] !== sides[1];
    }
    expect(apart).toBe(true);
  });

  it("more players than big nations: smaller ones, then neutrals", () => {
    const ca = scenarioData("continental1776")!;
    const seats = dealRandomNations(ca, ["a", "b", "c", "d"], {
      rand: seeded(3),
    });
    const keys = Object.keys(seats);
    expect(keys).toHaveLength(4);
    expect(keys).toContain("united_colonies");
    expect(keys).toContain("great_britain");
    // The sides are full: sizeable neutrals first.
    for (const k of keys.filter(
      (k) => !["united_colonies", "great_britain"].includes(k),
    )) {
      const n = ca.nations.find((x) => x.key === k)!;
      expect(n.side).toBeNull();
      expect(isEligible(ca, n)).toBe(true);
    }
  });

  it("the server refuses a deal that isn't fair", () => {
    const present = new Set(["a", "b"]);
    expect(
      dealScenarioSeats(europe, { germany: "a", poland: "b" }, present),
    ).toEqual({ seats: { germany: "a", poland: "b" } });
    expect(dealScenarioSeats(europe, { narnia: "a" }, present)).toEqual({
      error: "no such nation",
    });
    expect(
      dealScenarioSeats(europe, { germany: "a", poland: "zz" }, present),
    ).toEqual({ error: "no such player" });
    expect(
      dealScenarioSeats(europe, { germany: "a", poland: "a" }, present),
    ).toEqual({ error: "a player in two seats" });
    expect(dealScenarioSeats(europe, { germany: "a" }, present)).toEqual({
      error: "a player left out",
    });
  });
});
