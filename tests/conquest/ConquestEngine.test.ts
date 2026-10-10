import { describe, expect, test } from "vitest";
import { fightBattle } from "../../src/conquest/engine/Battle";
import { dateOf, dayOf, formatDate } from "../../src/conquest/engine/Calendar";
import { kill, makeCharacter } from "../../src/conquest/engine/Characters";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS } from "../../src/conquest/engine/Map";
import {
  adminCapacity,
  classSize,
  colonizeCheck,
  favorTarget,
  provincesOf,
  relationOf,
  rulerOf,
  settlers,
  taxShare,
  unrestOf,
} from "../../src/conquest/engine/Queries";
import { COLONY_SETTLERS, REGIMENTS } from "../../src/conquest/engine/Rules";
import type {
  Army,
  Breakdown,
  GameState,
  Regiment,
} from "../../src/conquest/engine/Types";
import { nationGame, seat } from "./NationUtil";

const map = AMERICAS;
const prov = (name: string) => {
  const i = map.provinces.findIndex((p) => p.name === name);
  if (i < 0) throw new Error(`no province ${name}`);
  return i;
};

function newGame(power = "england", seed = 42, endYear = 1650) {
  return nationGame({ endYear, difficulty: "normal", seed }, [seat(power)]);
}

/** A game where the computer nations don't act, so a test controls things. */
function quietGame(power = "england") {
  const g = newGame(power);
  g.aiEnabled = false;
  return g;
}

const nationKey = (g: ConquestGame, key: string) =>
  g.state.nations.findIndex((n) => n.key === key);

function ticks(g: ConquestGame, days: number) {
  for (let i = 0; i < days; i++) g.tick();
}

/** A breakdown's total is what its parts add (and multiply) up to. */
function expectExplained(
  b: Breakdown,
  min: number,
  max: number,
  slack: number,
) {
  let t = 0;
  for (const p of b.parts) t = p.mul ? t * p.value : t + p.value;
  t = Math.max(min, Math.min(max, t));
  expect(Math.abs(b.total - t)).toBeLessThanOrEqual(slack);
}

function army(
  g: ConquestGame,
  owner: number,
  p: number,
  regs: Regiment[],
  extra: Partial<Army> = {},
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
    ...extra,
  };
}

describe("Derpy Conquest map", () => {
  test("has a few hundred named provinces that all connect somewhere", () => {
    expect(map.provinces.length).toBeGreaterThan(300);
    // North and Central America and the islands: nothing south of Panama.
    for (const p of map.provinces) expect(p.lat).toBeGreaterThan(7);
    for (const p of map.provinces) {
      // Land off the board (Alaska) connects nowhere, on purpose.
      if (p.closed) continue;
      expect(p.nb.length + p.sea.length).toBeGreaterThan(0);
    }
    expect(new Set(map.provinces.map((p) => p.id)).size).toBe(
      map.provinces.length,
    );
  });

  test("neighbours are mutual", () => {
    map.provinces.forEach((p, i) => {
      for (const [q] of p.nb) {
        expect(map.provinces[q].nb.some(([r]) => r === i)).toBe(true);
      }
    });
  });

  test("five powers start with their historical footholds", () => {
    expect(map.powers.map((p) => p.id)).toEqual([
      "england",
      "france",
      "spain",
      "netherlands",
      "sweden",
    ]);
    expect(map.provinces[map.powers[0].provinces[0]].name).toBe("Jamestown");
    expect(map.provinces[map.powers[1].provinces[0]].name).toBe("Quebec");
  });
});

describe("calendar", () => {
  test("day 0 is 1 January 1607 and days round-trip", () => {
    expect(formatDate(0)).toBe("1 January 1607");
    expect(dateOf(dayOf(1650))).toEqual({ year: 1650, month: 0, day: 1 });
    expect(dateOf(dayOf(1612, 4, 14))).toEqual({
      year: 1612,
      month: 4,
      day: 14,
    });
  });
});

describe("starting a game", () => {
  test("every nation is the computer's, with a governor and a council", () => {
    const g = nationGame({ endYear: 1650, difficulty: "normal", seed: 42 });
    const s = g.state;
    const eng = nationKey(g, "england");
    const n = s.nations[eng];
    expect(n.player).toBeNull();
    expect(rulerOf(s, eng)?.alive).toBe(true);
    for (const c of Object.values(n.council))
      expect(s.chars[c]?.alive).toBe(true);
    expect(s.lives).toEqual([]);
    expect(s.polities[eng].assembly.length).toBeGreaterThan(0);
  });

  test("powers, native nations and the crowns behind them all take part", () => {
    const s = newGame().state;
    const kinds = (k: string) => s.nations.filter((n) => n.kind === k).length;
    expect(kinds("power")).toBe(5);
    expect(kinds("crown")).toBe(5);
    expect(kinds("native")).toBeGreaterThan(20);
    for (const n of s.nations.filter((x) => x.kind !== "crown")) {
      expect(provincesOf(s, n.id).length).toBeGreaterThan(0);
      expect(rulerOf(s, n.id)?.alive).toBe(true);
    }
    for (const n of s.nations.filter((x) => x.kind === "power")) {
      expect(s.provinces[n.capital].owner).toBe(n.id);
      expect(settlers(s.provinces[n.capital])).toBeGreaterThan(0);
    }
    // The Dutch and Spanish are already at war in Europe.
    const nl = s.nations.findIndex((n) => n.key === "netherlands");
    const es = s.nations.findIndex((n) => n.key === "spain");
    expect(
      s.wars.some(
        (w) => (w.a === nl && w.b === es) || (w.a === es && w.b === nl),
      ),
    ).toBe(true);
  });

  test("the same seed plays out the same way", () => {
    const a = ConquestGame.create(
      map,
      { endYear: 1650, difficulty: "hard", seed: 7 },
      [],
    );
    const b = ConquestGame.create(
      map,
      { endYear: 1650, difficulty: "hard", seed: 7 },
      [],
    );
    ticks(a, 400);
    ticks(b, 400);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("every number explains itself", () => {
  test("totals are exactly what their listed causes add up to", () => {
    const g = newGame("spain");
    ticks(g, 70);
    const s = g.state;
    for (const n of s.nations.filter((x) => x.kind === "power")) {
      expectExplained(favorTarget(s, g.w, n.id), 0, 100, 0.5);
      expectExplained(taxShare(s, g.w, n.id), 0, Infinity, 0.001);
      expectExplained(adminCapacity(s, n.id), 1, Infinity, 0.5);
      for (const other of s.nations
        .filter((x) => x.kind === "native")
        .slice(0, 5)) {
        expectExplained(relationOf(s, g.w, other.id, n.id), -100, 100, 0.5);
      }
    }
    for (let p = 0; p < s.provinces.length; p++) {
      if (s.provinces[p].owner >= 0)
        expectExplained(unrestOf(s, g.w, p), 0, 100, 0.5);
    }
  });

  test("a month in, the treasury's ledger lists where the money came from", () => {
    const g = quietGame("spain");
    ticks(g, 32);
    const n = g.state.nations[nationKey(g, "spain")];
    expect(n.ledger.income.length).toBeGreaterThan(0);
    const net =
      n.ledger.income.reduce((m, l) => m + l.value, 0) -
      n.ledger.spending.reduce((m, l) => m + l.value, 0);
    expect(n.ledger.net).toBeCloseTo(net, 0);
  });
});

describe("settling", () => {
  test("a colony takes settlers from a neighbour or a port, and takes time", () => {
    const g = quietGame("spain");
    const s = g.state;
    const es = nationKey(g, "spain");
    s.nations[es].gold = 1000;
    const target = s.provinces.findIndex(
      (pr, p) => pr.owner === -1 && colonizeCheck(s, g.w, es, p).ok,
    );
    expect(target).toBeGreaterThanOrEqual(0);
    const check = colonizeCheck(s, g.w, es, target);
    if (!check.ok) throw new Error(check.why);
    const before = settlers(s.provinces[check.source!]);
    expect(g.command(es, { k: "colonize", p: target })).toBeNull();
    expect(settlers(s.provinces[check.source!])).toBeCloseTo(
      before - COLONY_SETTLERS,
      0,
    );
    expect(s.provinces[target].owner).toBe(-1);
    ticks(g, check.days! + 1);
    expect(s.provinces[target].owner).toBe(es);
    expect(settlers(s.provinces[target])).toBeGreaterThan(
      COLONY_SETTLERS * 0.8,
    );
  });

  test("can't settle land somebody owns", () => {
    const g = quietGame();
    const eng = nationKey(g, "england");
    const theirs = g.state.provinces.findIndex(
      (p) => p.owner >= 0 && p.owner !== eng,
    );
    expect(g.command(eng, { k: "colonize", p: theirs })).toMatch(
      /already owns/,
    );
  });
});

describe("war", () => {
  test("soldiers are drafted from the laborers, who stop working", () => {
    const g = quietGame("spain");
    const s = g.state;
    const es = nationKey(g, "spain");
    const havana = prov("Havana");
    s.nations[es].gold = 500;
    const before = classSize(s.provinces[havana], "laborers");
    expect(g.command(es, { k: "recruit", p: havana, t: "militia" })).toBeNull();
    expect(classSize(s.provinces[havana], "laborers")).toBeCloseTo(
      before - REGIMENTS.militia.men,
      0,
    );
    expect(g.command(es, { k: "recruit", p: havana, t: "warriors" })).toMatch(
      /can't raise/,
    );
    const armiesBefore = s.armies.filter(
      (a) => a.owner === es && a.prov === havana,
    ).length;
    ticks(g, REGIMENTS.militia.days + 1);
    const here = s.armies.filter((a) => a.owner === es && a.prov === havana);
    expect(here.length).toBeGreaterThanOrEqual(Math.max(1, armiesBefore));
    expect(here.some((a) => a.regs.some((r) => r.type === "militia"))).toBe(
      true,
    );
  });

  test("15,000 tired, hungry men lose to 10,000 fresh ones dug in on a hill", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = quietGame("spain");
      const s = g.state;
      s.rng = seed;
      const es = nationKey(g, "spain");
      const eng = nationKey(g, "england");
      const hill = s.provinces.findIndex(
        (_, p) => map.provinces[p].terrain === "hills",
      );
      s.provinces[hill].owner = es;
      s.provinces[hill].occupier = -1;
      s.provinces[hill].b.fort = 2;
      const attackers = [
        army(
          g,
          eng,
          hill,
          [{ type: "militia", men: 15000, morale: 0.35, home: -1 }],
          { supply: 0.2 },
        ),
      ];
      const defenders = [
        army(
          g,
          es,
          hill,
          [{ type: "regulars", men: 10000, morale: 1, home: -1 }],
          {
            commander: s.nations[es].council.marshal,
          },
        ),
      ];
      const { report } = fightBattle(g, hill, attackers, defenders);
      expect(report.winner).toBe(1);
      const labels = (side: typeof report.attacker) =>
        side.factors.map((f) => f.label);
      expect(labels(report.defender)).toContain("Fort (level 2)");
      expect(labels(report.attacker)).toContain("Supplies 20%");
      expect(report.luck.length).toBeGreaterThan(0);
    }
  });

  test("but the same 15,000 fed and rested win in the open", () => {
    for (const seed of [1, 2, 3]) {
      const g = quietGame("spain");
      const s = g.state;
      s.rng = seed;
      const es = nationKey(g, "spain");
      const eng = nationKey(g, "england");
      const plain = s.provinces.findIndex(
        (pr, p) => map.provinces[p].terrain === "plains" && !pr.b.fort,
      );
      const attackers = [
        army(
          g,
          eng,
          plain,
          [{ type: "regulars", men: 15000, morale: 1, home: -1 }],
          {
            commander: s.nations[eng].council.marshal,
          },
        ),
      ];
      const defenders = [
        army(g, es, plain, [
          { type: "militia", men: 10000, morale: 0.8, home: -1 },
        ]),
      ];
      expect(fightBattle(g, plain, attackers, defenders).report.winner).toBe(0);
    }
  });

  test("holding a province isn't owning it: that takes a peace", () => {
    const g = quietGame("spain");
    const s = g.state;
    const es = nationKey(g, "spain");
    // A native province next to Spanish land.
    let from = -1;
    let target = -1;
    for (const p of provincesOf(s, es)) {
      for (const [q] of map.provinces[p].nb) {
        const owner = s.provinces[q].owner;
        if (owner >= 0 && s.nations[owner].kind === "native") {
          from = p;
          target = q;
        }
      }
      if (target >= 0) break;
    }
    expect(target).toBeGreaterThanOrEqual(0);
    const natives = s.provinces[target].owner;
    expect(g.command(es, { k: "move", a: -5, to: target })).toMatch(
      /Not your army/,
    );
    expect(g.command(es, { k: "war", n: natives })).toBeNull();
    const big = army(
      g,
      es,
      from,
      Array.from({ length: 40 }, () => ({
        type: "regulars" as const,
        men: 100,
        morale: 1,
        home: -1,
      })),
    );
    g.addArmy(big);
    expect(g.command(es, { k: "move", a: big.id, to: target })).toBeNull();
    for (let i = 0; i < 400 && s.provinces[target].occupier !== es; i++)
      g.tick();
    expect(s.provinces[target].occupier).toBe(es);
    expect(s.provinces[target].owner).toBe(natives);
    expect(provincesOf(s, es)).not.toContain(target);
  });
});

describe("the governor's life", () => {
  test("the crown appoints a crown colony's next governor; an independent colony's passes to the heir", () => {
    const g = quietGame();
    const s = g.state;
    const eng = nationKey(g, "england");
    const n = s.nations[eng];
    const withChild = () => {
      const gov = rulerOf(s, eng)!;
      const child = makeCharacter(s, g.rng, {
        nation: eng,
        culture: n.culture,
        religion: n.religion,
        age: 19,
        female: true,
        father: gov.id,
      });
      gov.children.push(child.id);
      return { gov, child };
    };
    const first = withChild();
    kill(g, first.gov, "a fever");
    expect(first.gov.alive).toBe(false);
    expect(s.nations[eng].ruler).not.toBe(first.child.id);
    expect(s.nations[eng].ruler).toBeGreaterThanOrEqual(0);
    n.independent = true;
    const second = withChild();
    kill(g, second.gov, "a fever");
    expect(s.nations[eng].ruler).toBe(second.child.id);
  });

  test("with no heir, the crown appoints someone from the council", () => {
    const g = quietGame();
    const s = g.state;
    const eng = nationKey(g, "england");
    const gov = rulerOf(s, eng)!;
    gov.children = [];
    const council = Object.values(s.nations[eng].council);
    kill(g, gov, "a fever");
    expect(council).toContain(s.nations[eng].ruler);
    expect(Object.values(s.nations[eng].council)).not.toContain(
      s.nations[eng].ruler,
    );
  });
});

describe("the crown", () => {
  test("favor follows the money sent home", () => {
    const g = quietGame();
    const s = g.state;
    const eng = nationKey(g, "england");
    expect(g.command(eng, { k: "remit", share: 0 })).toBeNull();
    const stingy = favorTarget(s, g.w, eng).total;
    expect(g.command(eng, { k: "remit", share: 0.3 })).toBeNull();
    const loyal = favorTarget(s, g.w, eng).total;
    expect(loyal).toBeGreaterThan(stingy);
    expect(g.command(eng, { k: "remit", share: 0.9 })).toMatch(/50%/);
    expect(g.command(eng, { k: "independence" })).toMatch(/autonomy/i);
  });
});

describe("the whole game", () => {
  test("a player's copy kept up to date by deltas matches the server's", () => {
    const g = newGame("france", 11);
    const copy = JSON.parse(JSON.stringify(g.state)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 400; i++) {
      g.tick();
      applyDelta(copy, JSON.parse(JSON.stringify(g.takeDelta())));
    }
    // Open country's people are only sent when they change by a good number,
    // and the dice and id counters stay on the server.
    const strip = (x: GameState) => ({
      ...x,
      rng: 0,
      nextId: 0,
      battles: [],
      provinces: x.provinces.map((pr) =>
        pr.owner < 0 ? { ...pr, pops: [] } : pr,
      ),
    });
    expect(JSON.stringify(strip(copy))).toBe(JSON.stringify(strip(g.state)));
  });

  test("computer players run a decade without breaking anything", () => {
    const g = ConquestGame.create(
      map,
      { endYear: 1650, difficulty: "hard", seed: 3 },
      [],
    );
    ticks(g, 365 * 10);
    const s = g.state;
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "number" && !Number.isFinite(v)) bad.push(path);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(s, "state");
    expect(bad.slice(0, 5)).toEqual([]);
    for (const pr of s.provinces) {
      for (const pop of pr.pops) expect(pop.size).toBeGreaterThanOrEqual(0);
      if (pr.owner >= 0) expect(s.nations[pr.owner].alive).toBe(true);
    }
    for (const a of s.armies) expect(s.nations[a.owner].alive).toBe(true);
    for (const w of s.wars)
      expect(s.nations[w.a].alive && s.nations[w.b].alive).toBe(true);
    // The colonies grew.
    for (const n of s.nations.filter((x) => x.kind === "power" && x.alive)) {
      expect(provincesOf(s, n.id).length).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  test("ends on the end date with the top score winning", () => {
    const g = newGame("england", 5, 1609);
    ticks(g, 800);
    expect(g.state.over).toBe(true);
    expect(g.state.day).toBe(dayOf(1609));
    expect(g.state.winner).toBe(g.ranking()[0].id);
  });
});
