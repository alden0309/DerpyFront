import { describe, expect, test } from "vitest";
import { dateOf, dayOf, formatDate } from "../../src/conquest/engine/Calendar";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS } from "../../src/conquest/engine/Map";
import {
  armyMen,
  colonizeCheck,
  findPath,
  provincesOf,
} from "../../src/conquest/engine/Queries";
import {
  BUILDINGS,
  REGIMENTS,
  SIEGE_DAYS,
} from "../../src/conquest/engine/Rules";
import { GameState } from "../../src/conquest/engine/Types";

const map = AMERICAS;
const prov = (name: string) => {
  const i = map.provinces.findIndex((p) => p.name === name);
  if (i < 0) throw new Error(`no province ${name}`);
  return i;
};
const nationKey = (g: ConquestGame, key: string) =>
  g.state.nations.findIndex((n) => n.key === key);

function newGame(seats = [{ seat: "s1", name: "Alden", power: "england" }]) {
  return ConquestGame.create(
    map,
    { endYear: 1650, difficulty: "normal", seed: 42 },
    seats,
  );
}

function ticks(g: ConquestGame, days: number) {
  for (let i = 0; i < days; i++) g.tick();
}

/** Keeps the computer from acting so a test controls everything. */
function quietComputers(g: ConquestGame) {
  for (const n of g.state.nations) n.player ??= `frozen-${n.id}`;
}

describe("Derpy Conquest map", () => {
  test("has a few hundred named provinces that all connect somewhere", () => {
    expect(map.provinces.length).toBeGreaterThan(300);
    for (const p of map.provinces) {
      expect(p.nb.length + p.sea.length).toBeGreaterThan(0);
    }
    const ids = new Set(map.provinces.map((p) => p.id));
    expect(ids.size).toBe(map.provinces.length);
  });

  test("neighbours are mutual", () => {
    map.provinces.forEach((p, i) => {
      for (const [q] of p.nb) {
        expect(map.provinces[q].nb.some(([r]) => r === i)).toBe(true);
      }
    });
  });

  test("six powers start with their historical footholds", () => {
    expect(map.powers.map((p) => p.id)).toEqual([
      "england",
      "france",
      "spain",
      "portugal",
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
  test("seats players and gives everyone land, gold and an army", () => {
    const g = newGame();
    const s = g.state;
    const eng = nationKey(g, "england");
    expect(s.nations[eng].player).toBe("s1");
    expect(s.nations[eng].playerName).toBe("Alden");
    expect(s.provinces[prov("Jamestown")].owner).toBe(eng);
    expect(s.provinces[prov("Jamestown")].port).toBe(1);
    expect(s.provinces[prov("Jamestown")].fort).toBe(1);
    for (const n of s.nations) {
      expect(provincesOf(s, n.id).length).toBeGreaterThan(0);
      expect(s.armies.some((a) => a.owner === n.id)).toBe(true);
    }
    expect(s.provinces.filter((p) => p.owner === -1).length).toBeGreaterThan(
      200,
    );
    expect(s.prices.silver).toBeGreaterThan(s.prices.grain);
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
    ticks(a, 700);
    ticks(b, 700);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("settling", () => {
  test("founds a colony a short sail from Jamestown", () => {
    const g = newGame();
    quietComputers(g);
    const s = g.state;
    const eng = nationKey(g, "england");
    // The Powhatan hold everything around Jamestown, so settlers sail.
    expect(
      map.provinces[prov("Jamestown")].nb.every(
        ([q]) => s.provinces[q].owner >= 0,
      ),
    ).toBe(true);
    const target = prov("St. Mary's");
    const check = colonizeCheck(s, map, eng, target);
    expect(check.ok).toBe(true);
    const gold = s.nations[eng].gold;
    expect(g.command(eng, { k: "colonize", p: target })).toBeNull();
    expect(s.nations[eng].colonists).toBe(0);
    expect(s.nations[eng].gold).toBe(gold - (check.ok ? check.gold : 0));
    expect(g.command(eng, { k: "colonize", p: target })).not.toBeNull();
    ticks(g, check.ok ? check.days : 0);
    expect(s.provinces[target].owner).toBe(eng);
    expect(s.provinces[target].pop).toBeGreaterThan(0);
    expect(s.nations[eng].stats.coloniesFounded).toBe(1);
  });

  test("can't settle far inland away from your land", () => {
    const g = newGame();
    const eng = nationKey(g, "england");
    const check = colonizeCheck(g.state, map, eng, prov("Great Salt Lake"));
    expect(check.ok).toBe(false);
  });

  test("colonists arrive from home over time", () => {
    const g = newGame();
    quietComputers(g);
    const eng = nationKey(g, "england");
    const next = g.state.nations[eng].nextColonist;
    ticks(g, next);
    expect(g.state.nations[eng].colonists).toBe(2);
  });
});

describe("building and recruiting", () => {
  test("builds a farm, which takes its time", () => {
    const g = newGame();
    quietComputers(g);
    const eng = nationKey(g, "england");
    const p = prov("Jamestown");
    expect(g.command(eng, { k: "build", p, b: "farm" })).toBeNull();
    expect(g.command(eng, { k: "build", p, b: "fort" })).toMatch(
      /already being built/,
    );
    ticks(g, BUILDINGS.farm.days[0] - 1);
    expect(g.state.provinces[p].farm).toBe(0);
    ticks(g, 1);
    expect(g.state.provinces[p].farm).toBe(1);
  });

  test("raises a regiment that joins the army at home", () => {
    const g = newGame();
    quietComputers(g);
    const eng = nationKey(g, "england");
    const p = prov("Jamestown");
    const before = g.state.armies
      .filter((a) => a.owner === eng)
      .reduce((n, a) => n + a.regs.length, 0);
    expect(g.command(eng, { k: "recruit", p, t: "cav" })).toBeNull();
    expect(g.command(eng, { k: "recruit", p, t: "war" })).toMatch(
      /can't raise/,
    );
    ticks(g, REGIMENTS.cav.days);
    const after = g.state.armies.filter((a) => a.owner === eng);
    expect(after.reduce((n, a) => n + a.regs.length, 0)).toBe(before + 1);
    expect(after.length).toBe(1);
  });
});

describe("war", () => {
  function englandVsPowhatan() {
    const g = newGame();
    quietComputers(g);
    const s = g.state;
    const eng = nationKey(g, "england");
    const pow = nationKey(g, "powhatan");
    // Clear the warriors so the outcome doesn't depend on a battle.
    s.armies = s.armies.filter((a) => a.owner !== pow);
    return { g, s, eng, pow };
  }

  test("can't march into native land in peacetime", () => {
    const { g, s, eng } = englandVsPowhatan();
    const army = s.armies.find((a) => a.owner === eng)!;
    expect(findPath(s, map, eng, army.prov, prov("Pamunkey"), 1)).toBeNull();
    expect(
      g.command(eng, { k: "move", a: army.id, to: prov("Pamunkey") }),
    ).toMatch(/Can't get there/);
  });

  test("declares war, marches in, and takes the province by siege", () => {
    const { g, s, eng, pow } = englandVsPowhatan();
    expect(g.command(eng, { k: "war", n: pow })).toBeNull();
    expect(s.nations[pow].opinion[eng]).toBe(-100);
    const army = s.armies.find((a) => a.owner === eng)!;
    const target = prov("Pamunkey");
    expect(g.command(eng, { k: "move", a: army.id, to: target })).toBeNull();
    const route = findPath(s, map, eng, prov("Jamestown"), target, 1)!;
    ticks(g, route.days + 1);
    expect(army.prov).toBe(target);
    expect(s.provinces[target].siege?.by).toBe(eng);
    ticks(g, SIEGE_DAYS[0] + 1);
    expect(s.provinces[target].owner).toBe(eng);
    expect(s.provinces[target].pop).toBeGreaterThan(0);
    expect(s.nations[eng].stats.provincesConquered).toBe(1);
  });

  test("a battle gets a report and the loser retreats or is destroyed", () => {
    const g = newGame();
    quietComputers(g);
    const s = g.state;
    const eng = nationKey(g, "england");
    const pow = nationKey(g, "powhatan");
    g.command(eng, { k: "war", n: pow });
    const army = s.armies.find((a) => a.owner === eng)!;
    // Put a big English army next to the Powhatan warriors.
    army.regs = Array.from({ length: 6 }, () => ({
      type: "inf" as const,
      men: 1000,
      morale: 1,
    }));
    const warriors = s.armies.find((a) => a.owner === pow)!;
    g.command(eng, { k: "move", a: army.id, to: warriors.prov });
    let report;
    for (let i = 0; i < 120 && !report; i++) {
      g.tick();
      report = g.takeDelta().battles?.[0];
    }
    expect(report).toBeDefined();
    expect(report!.attacker.nations).toEqual([eng]);
    expect(report!.defender.nations).toEqual([pow]);
    expect(report!.rounds.length).toBeGreaterThan(0);
    expect(report!.winner).toBe(0);
    expect(report!.attacker.lost).toBeGreaterThan(0);
    expect(s.battles[s.battles.length - 1].id).toBe(report!.id);
    const left = s.armies.find((a) => a.id === warriors.id);
    expect(
      left === undefined || left.retreating || left.prov !== report!.prov,
    ).toBe(true);
  });

  test("natives burn the colonies they take", () => {
    const { g, s, eng, pow } = englandVsPowhatan();
    const jamestown = prov("Jamestown");
    g.command(pow, { k: "war", n: eng });
    s.armies = s.armies.filter((a) => a.owner !== eng);
    s.armies.push({
      id: 999,
      owner: pow,
      prov: jamestown,
      regs: [
        { type: "war", men: 1000, morale: 1 },
        { type: "war", men: 1000, morale: 1 },
      ],
      path: [],
      depart: -1,
      arrive: -1,
      sea: false,
      retreating: false,
      arrived: s.day,
      from: -1,
    });
    ticks(g, SIEGE_DAYS[1] + 2);
    expect(s.provinces[jamestown].owner).toBe(-1);
    expect(s.provinces[jamestown].pop).toBe(0);
  });

  test("the computer won't make peace straight away but will later", () => {
    const { g, s, eng, pow } = englandVsPowhatan();
    s.nations[pow].player = null;
    g.command(eng, { k: "war", n: pow });
    g.command(eng, { k: "peace", n: pow });
    expect(s.wars.length).toBe(1);
    ticks(g, 13 * 30);
    expect(g.command(eng, { k: "peace", n: pow })).toBeNull();
    expect(s.wars.length).toBe(0);
    expect(s.truces.length).toBe(1);
    expect(g.command(eng, { k: "war", n: pow })).toMatch(/truce/);
  });

  test("peace between players needs the other side to accept", () => {
    const g = newGame([
      { seat: "a", name: "Alden", power: "england" },
      { seat: "b", name: "Michael", power: "netherlands" },
    ]);
    quietComputers(g);
    const eng = nationKey(g, "england");
    const nl = nationKey(g, "netherlands");
    g.command(eng, { k: "war", n: nl });
    expect(g.command(eng, { k: "peace", n: nl })).toBeNull();
    expect(g.state.offers).toHaveLength(1);
    expect(g.command(nl, { k: "answer", n: eng, yes: true })).toBeNull();
    expect(g.state.wars).toHaveLength(0);
  });
});

describe("dealing with natives", () => {
  test("trades, gives gifts and buys land from friendly natives", () => {
    const g = newGame();
    quietComputers(g);
    const s = g.state;
    const eng = nationKey(g, "england");
    const pow = nationKey(g, "powhatan");
    s.nations[pow].opinion[eng] = -5;
    expect(g.command(eng, { k: "trade", n: pow })).toMatch(/trust/);
    expect(g.command(eng, { k: "gift", n: pow, gold: 25 })).toBeNull();
    expect(s.nations[pow].opinion[eng]).toBe(5);
    expect(g.command(eng, { k: "trade", n: pow })).toBeNull();
    expect(s.deals).toHaveLength(1);
    const gold = s.nations[eng].gold;
    ticks(g, 31);
    expect(s.nations[eng].ledger.trade).toBeGreaterThan(0);
    expect(s.nations[eng].gold).toBeGreaterThan(gold);

    s.nations[pow].opinion[eng] = 60;
    s.nations[eng].gold = 1000;
    const target = prov("Nansemond");
    expect(g.command(eng, { k: "buy", p: target })).toBeNull();
    expect(s.provinces[target].owner).toBe(eng);
    expect(s.nations[pow].opinion[eng]).toBeLessThan(60);
    expect(g.command(eng, { k: "buy", p: s.nations[pow].capital })).toMatch(
      /capital/,
    );
  });
});

describe("the whole game", () => {
  test("a player's copy kept up to date by deltas matches the server's", () => {
    const g = ConquestGame.create(
      map,
      { endYear: 1612, difficulty: "normal", seed: 99 },
      [],
    );
    const mirror: GameState = JSON.parse(JSON.stringify(g.state));
    while (!g.state.over) {
      g.tick();
      g.tick();
      applyDelta(mirror, JSON.parse(JSON.stringify(g.takeDelta())));
    }
    // The random state and id counter stay on the server.
    const strip = (st: GameState) =>
      JSON.stringify({ ...st, rng: 0, nextId: 0 });
    expect(strip(mirror)).toBe(strip(g.state));
  });

  test("computer players play a decade without breaking the rules", () => {
    const g = ConquestGame.create(
      map,
      { endYear: 1617, difficulty: "hard", seed: 5 },
      [],
    );
    while (!g.state.over) g.tick();
    const s = g.state;
    expect(s.winner).toBeGreaterThanOrEqual(0);
    expect(s.nations[s.winner].kind).toBe("power");
    const powers = s.nations.filter((n) => n.kind === "power");
    expect(
      powers.reduce((n, p) => n + p.stats.coloniesFounded, 0),
    ).toBeGreaterThan(30);
    for (const a of s.armies) {
      expect(armyMen(a)).toBeGreaterThan(0);
      expect(s.nations[a.owner].alive).toBe(true);
    }
    for (const p of s.provinces) {
      if (p.owner >= 0) expect(s.nations[p.owner].alive).toBe(true);
      expect(p.pop).toBeGreaterThanOrEqual(0);
    }
  });

  test("ends on the end date with the top score winning", () => {
    const g = newGame();
    quietComputers(g);
    g.state.endDay = 40;
    ticks(g, 45);
    expect(g.state.over).toBe(true);
    const ranked = g.ranking();
    expect(g.state.winner).toBe(ranked[0].id);
    expect(g.command(0, { k: "stop", a: 1 })).toMatch(/over/);
  });
});
