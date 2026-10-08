import { describe, expect, test } from "vitest";
import { fightBattle } from "../../src/conquest/engine/Battle";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS, kmBetween } from "../../src/conquest/engine/Map";
import {
  isExplored,
  leaderFlags,
  missionCheck,
  missionLeaders,
} from "../../src/conquest/engine/Missions";
import { provincesOf } from "../../src/conquest/engine/Queries";
import { EXPEDITION, OUTPOST } from "../../src/conquest/engine/Rules";
import type {
  Army,
  GameEvent,
  GovernorPlan,
  PlayerSeat,
  Regiment,
} from "../../src/conquest/engine/Types";

const map = AMERICAS;

const plan: GovernorPlan = {
  first: "Alden",
  family: "Drackley",
  female: false,
  age: "prime",
  stats: { dip: 7, mar: 5, ste: 8, int: 4, lea: 5 },
  traits: ["diligent"],
};

const seat = (power: string): PlayerSeat => ({
  seat: "s1",
  name: "Alden",
  power,
  governor: plan,
});

function quietGame(power = "england", seed = 42) {
  const g = ConquestGame.create(
    map,
    { endYear: 1650, difficulty: "normal", seed },
    [seat(power)],
  );
  g.aiEnabled = false;
  return g;
}

const nationKey = (g: ConquestGame, key: string) =>
  g.state.nations.findIndex((n) => n.key === key);

/** Run until `done` says so, answering any letter with its first choice. */
function runUntil(
  g: ConquestGame,
  n: number,
  done: () => boolean,
  max = 400,
): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < max && !done(); i++) {
    g.tick();
    for (const e of g.state.nations[n].events)
      g.command(n, { k: "event", id: e.id, choice: 0 });
    seen.push(...(g.takeDelta().events ?? []));
  }
  return seen;
}

function army(
  g: ConquestGame,
  owner: number,
  p: number,
  regs: Regiment[],
): Army {
  return {
    id: g.nextId(),
    owner,
    prov: p,
    regs,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: 0,
    from: -1,
    commander: -1,
    supply: 1,
  } as Army;
}

describe("expeditions", () => {
  test("a colony starts knowing only the land near it", () => {
    const g = quietGame();
    const s = g.state;
    const en = nationKey(g, "england");
    const unknown = s.provinces.filter((_, p) => !isExplored(s, en, p));
    expect(unknown.length).toBeGreaterThan(s.provinces.length / 2);
    for (const p of provincesOf(s, en)) expect(isExplored(s, en, p)).toBe(true);
    // Natives know their own world.
    const native = s.nations.findIndex((n) => n.kind === "native");
    expect(s.provinces.every((_, p) => isExplored(s, native, p))).toBe(true);
  });

  test("an expedition costs gold, travels, surveys and comes home", () => {
    const g = quietGame();
    const s = g.state;
    const en = nationKey(g, "england");
    const leader = missionLeaders(s, en)[0];
    expect(leader).toBeDefined();
    // The nearest unknown province in range.
    const home = s.nations[en].capital;
    const target = s.provinces
      .map((_, p) => p)
      .filter((p) => !isExplored(s, en, p))
      .sort((a, b) => kmBetween(map, home, a) - kmBetween(map, home, b))
      .find((p) => missionCheck(s, g.w, en, leader.id, p, "explore").ok);
    expect(target).toBeDefined();
    const gold = s.nations[en].gold;
    expect(
      g.command(en, { k: "expedition", c: leader.id, p: target! }),
    ).toBeNull();
    expect(s.nations[en].gold).toBe(gold - EXPEDITION.gold);
    expect(s.nations[en].missions).toHaveLength(1);
    // The same person can't go twice.
    expect(missionLeaders(s, en).some((c) => c.id === leader.id)).toBe(false);

    const events = runUntil(g, en, () => s.nations[en].missions.length === 0);
    const mine = events.filter(
      (e): e is Extract<GameEvent, { k: "mission" }> =>
        e.k === "mission" && e.n === en,
    );
    expect(mine.length).toBeGreaterThan(0);
    const last = mine[mine.length - 1];
    if (mine.some((e) => e.result === "done")) {
      expect(isExplored(s, en, target!)).toBe(true);
      expect(last.result).toBe("back");
    } else {
      // Lost on the way: nothing learned.
      expect(last.result).toBe("lost");
    }
  });

  test("the picker flags what helps and hurts on the trail", () => {
    const g = quietGame();
    const s = g.state;
    const en = nationKey(g, "england");
    const c = missionLeaders(s, en)[0];
    c.traits = ["robust", "lazy"];
    c.stats.lea = 12;
    const flags = leaderFlags(s, c);
    expect(flags.find((f) => f.text.startsWith("Robust"))?.good).toBe(true);
    expect(flags.find((f) => f.text.startsWith("Lazy"))?.good).toBe(false);
    expect(flags.some((f) => f.good && f.text.startsWith("Learning"))).toBe(
      true,
    );
  });

  test("computer powers send expeditions of their own", () => {
    const g = ConquestGame.create(
      map,
      { endYear: 1650, difficulty: "normal", seed: 9 },
      [],
    );
    const s = g.state;
    const before = s.nations.map((n) => n.explored.length);
    let sent = 0;
    for (let i = 0; i < 540; i++) {
      g.tick();
      sent += (g.takeDelta().events ?? []).filter(
        (e) => e.k === "mission",
      ).length;
    }
    expect(sent).toBeGreaterThan(0);
    expect(
      s.nations.some(
        (n, i) => n.kind === "power" && n.explored.length > before[i],
      ),
    ).toBe(true);
  });
});

describe("outposts", () => {
  test("a party raises an outpost, and defenders fight behind it", () => {
    const g = quietGame();
    const s = g.state;
    const en = nationKey(g, "england");
    const nation = s.nations[en];
    nation.gold = 1000;
    nation.market.stock.timber = 100;
    nation.market.stock.tools = 100;
    const target = nation.capital;
    const leader = missionLeaders(s, en)[0];
    expect(g.command(en, { k: "outpost", c: leader.id, p: target })).toBeNull();
    expect(nation.gold).toBe(1000 - OUTPOST.gold);
    expect(nation.market.stock.timber).toBe(100 - OUTPOST.goods.timber!);
    // Only one outpost per place, even while the first is on its way.
    const other = missionLeaders(s, en)[0];
    if (other)
      expect(missionCheck(s, g.w, en, other.id, target, "outpost").ok).toBe(
        false,
      );

    runUntil(g, en, () => s.provinces[target].outpost !== null);
    expect(s.provinces[target].outpost?.by).toBe(en);

    const es = nationKey(g, "spain");
    const { report } = fightBattle(
      g,
      target,
      [
        army(g, es, target, [
          { type: "regulars", men: 3000, morale: 1, home: -1 },
        ]),
      ],
      [
        army(g, en, target, [
          { type: "militia", men: 3000, morale: 1, home: -1 },
        ]),
      ],
    );
    expect(report.defender.factors.map((f) => f.label)).toContain(
      "Behind the outpost's palisade",
    );
  });
});

describe("natives against horse and cannon", () => {
  test("warriors facing dragoons and guns lose heart; against militia they don't", () => {
    const g = quietGame("spain");
    const s = g.state;
    const es = nationKey(g, "spain");
    const native = s.nations.findIndex((n) => n.kind === "native" && n.alive);
    const plain = s.provinces.findIndex(
      (pr, p) => map.provinces[p].terrain === "plains" && !pr.b.fort,
    );
    const warriors = () => [
      army(g, native, plain, [
        { type: "warriors", men: 4000, morale: 1, home: -1 },
      ]),
    ];
    const shock = fightBattle(
      g,
      plain,
      [
        army(g, es, plain, [
          { type: "dragoons", men: 1000, morale: 1, home: -1 },
          { type: "artillery", men: 500, morale: 1, home: -1 },
          { type: "regulars", men: 1500, morale: 1, home: -1 },
        ]),
      ],
      warriors(),
    ).report;
    const penalty = shock.defender.factors.find(
      (f) => f.label === "Facing horse and cannon",
    );
    expect(penalty).toBeDefined();
    expect(penalty!.value).toBeLessThan(0.8);

    const foot = fightBattle(
      g,
      plain,
      [
        army(g, es, plain, [
          { type: "militia", men: 3000, morale: 1, home: -1 },
        ]),
      ],
      warriors(),
    ).report;
    expect(
      foot.defender.factors.some((f) => f.label === "Facing horse and cannon"),
    ).toBe(false);
  });
});
