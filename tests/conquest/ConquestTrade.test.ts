import { describe, expect, test } from "vitest";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { missionRoute } from "../../src/conquest/engine/Missions";
import {
  abandonCheck,
  alliesOf,
  canEnter,
  provincesOf,
  scoreOf,
  settlers,
  tributariesOf,
  warCheck,
  woodlotOutput,
} from "../../src/conquest/engine/Queries";
import { dealWillingness, orderQuote } from "../../src/conquest/engine/Trade";
import type {
  Army,
  GameEvent,
  GovernorPlan,
  PlayerSeat,
} from "../../src/conquest/engine/Types";

const map = AMERICAS;
const prov = (name: string) => {
  const i = map.provinces.findIndex((p) => p.name === name);
  if (i < 0) throw new Error(`no province ${name}`);
  return i;
};

const plan: GovernorPlan = {
  first: "Alden",
  family: "Drackley",
  female: false,
  age: "prime",
  stats: { dip: 7, mar: 5, ste: 8, int: 4, lea: 5 },
  traits: ["diligent"],
};

const seat = (power: string, id = "s1"): PlayerSeat => ({
  seat: id,
  name: id,
  power,
  governor: plan,
});

function quietGame(seats: PlayerSeat[] = [seat("england")]) {
  const g = ConquestGame.create(
    map,
    { endYear: 1680, difficulty: "normal", seed: 11 },
    seats,
  );
  g.aiEnabled = false;
  return g;
}

const key = (g: ConquestGame, k: string) =>
  g.state.nations.findIndex((n) => n.key === k);

function ticks(g: ConquestGame, days: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < days; i++) {
    g.tick();
    out.push(...(g.takeDelta().events ?? []));
  }
  return out;
}

function soldiers(g: ConquestGame, owner: number, p: number, men: number) {
  g.addArmy({
    id: g.nextId(),
    owner,
    prov: p,
    regs: [{ type: "regulars", men, morale: 1, home: -1 }],
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: 0,
    from: -1,
    commander: -1,
    supply: 1,
  } as Army);
}

describe("trading goods between nations", () => {
  test("a computer colony takes a fair deal and the goods change hands", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const fr = key(g, "france");
    s.nations[en].market.stock.timber = 100;
    s.nations[fr].market.stock.furs = 50;
    s.nations[fr].relations[en] = [
      { of: -1, why: "Old friends", value: 60, until: 0 },
    ];
    const terms = { give: { timber: 40 }, get: { furs: 5 }, gold: 0 };
    expect(dealWillingness(s, g.w, en, fr, terms).total).toBeGreaterThanOrEqual(
      0,
    );
    expect(g.command(en, { k: "deal", n: fr, terms })).toBeNull();
    expect(s.nations[en].market.stock.timber).toBe(60);
    expect(s.nations[en].market.stock.furs).toBe(5);
    expect(s.nations[fr].market.stock.timber).toBeGreaterThanOrEqual(40);
    const events = g.takeDelta().events ?? [];
    expect(events).toContainEqual(
      expect.objectContaining({ k: "deal", status: "done", n: en, with: fr }),
    );
  });

  test("a lopsided deal is turned down and nothing moves", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const fr = key(g, "france");
    s.nations[fr].market.stock.furs = 50;
    const before = s.nations[fr].market.stock.furs;
    const terms = { give: {}, get: { furs: 40 }, gold: 1 };
    expect(dealWillingness(s, g.w, en, fr, terms).total).toBeLessThan(0);
    expect(g.command(en, { k: "deal", n: fr, terms })).toBeNull();
    expect(s.nations[fr].market.stock.furs).toBe(before);
    expect(g.takeDelta().events).toContainEqual(
      expect.objectContaining({ k: "deal", status: "refused" }),
    );
  });

  test("you can't offer what you don't have, or trade with an enemy", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const fr = key(g, "france");
    s.nations[en].market.stock.guns = 3;
    expect(
      g.command(en, {
        k: "deal",
        n: fr,
        terms: { give: { guns: 10 }, get: {}, gold: -5 },
      }),
    ).toMatch(/only have 3/);
    g.command(en, { k: "war", n: fr });
    expect(
      g.command(en, {
        k: "deal",
        n: fr,
        terms: { give: {}, get: { grain: 1 }, gold: 5 },
      }),
    ).toMatch(/at war/);
  });

  test("natives trade only with neighbours, and value guns and tools highly", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const powhatan = key(g, "powhatan");
    const far = s.nations.findIndex(
      (n) => n.kind === "native" && n.key === "pueblo",
    );
    s.nations[en].market.stock.tools = 50;
    s.nations[powhatan].market.stock.furs = 20;
    const terms = { give: { tools: 6 }, get: { furs: 12 }, gold: 0 };
    expect(
      dealWillingness(s, g.w, en, powhatan, terms).total,
    ).toBeGreaterThanOrEqual(0);
    expect(g.command(en, { k: "deal", n: powhatan, terms })).toBeNull();
    expect(s.nations[en].market.stock.furs).toBe(12);
    s.nations[far].market.stock.furs = 20;
    expect(
      g.command(en, {
        k: "deal",
        n: far,
        terms: { ...terms, give: { tools: 1 } },
      }),
    ).toMatch(/border/);
  });

  test("another player gets an offer to answer, and the deal goes through when they agree", () => {
    const g = quietGame([seat("england", "a"), seat("france", "b")]);
    const s = g.state;
    const en = key(g, "england");
    const fr = key(g, "france");
    s.nations[en].market.stock.timber = 50;
    s.nations[fr].market.stock.cloth = 30;
    const terms = { give: { timber: 20 }, get: { cloth: 10 }, gold: 0 };
    expect(g.command(en, { k: "deal", n: fr, terms })).toBeNull();
    expect(s.deals).toHaveLength(1);
    expect(s.nations[en].market.stock.timber).toBe(50);
    expect(g.takeDelta().deals).toHaveLength(1);
    expect(
      g.command(fr, { k: "dealAnswer", deal: s.deals[0].id, yes: true }),
    ).toBeNull();
    expect(s.deals).toHaveLength(0);
    expect(s.nations[en].market.stock.cloth).toBeGreaterThanOrEqual(10);
    expect(s.nations[fr].market.stock.timber).toBeGreaterThanOrEqual(20);
  });
});

describe("buying from Europe", () => {
  test("gold is paid now and the goods land at the port a voyage later", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    s.nations[en].gold = 500;
    const before = s.nations[en].market.stock.tools;
    const port = s.nations[en].capital;
    const quote = orderQuote(g, en, { tools: 20 }, port);
    expect(quote.days).toBeGreaterThan(60);
    expect(g.command(en, { k: "order", goods: { tools: 20 } })).toBeNull();
    expect(s.nations[en].gold).toBe(500 - quote.gold);
    expect(s.nations[en].convoys.some((c) => c.ordered)).toBe(true);
    ticks(g, quote.days - 2);
    expect(s.nations[en].convoys.some((c) => c.ordered)).toBe(true);
    ticks(g, 3);
    expect(s.nations[en].convoys.some((c) => c.ordered)).toBe(false);
    expect(s.nations[en].market.stock.tools).toBeGreaterThan(before + 10);
  });

  test("an order has to fit a ship and the treasury", () => {
    const g = quietGame();
    const en = key(g, "england");
    g.state.nations[en].gold = 5;
    expect(g.command(en, { k: "order", goods: { guns: 5 } })).toMatch(/Costs/);
    g.state.nations[en].gold = 100000;
    expect(g.command(en, { k: "order", goods: { grain: 5000 } })).toMatch(
      /convoy holds/,
    );
  });
});

describe("the goods ledger", () => {
  test("each month records what was made, used, bought and shipped", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    s.nations[en].gold = 500;
    g.command(en, { k: "order", goods: { cloth: 10 } });
    ticks(g, 31);
    const flow = s.nations[en].market.flow;
    expect(flow.made.grain).toBeGreaterThan(0);
    expect(flow.used.grain).toBeGreaterThan(0);
    // Every settlement cuts a little timber.
    expect(flow.made.timber).toBeGreaterThan(0);
    expect(woodlotOutput(s, g.w, s.nations[en].capital).total).toBeGreaterThan(
      0,
    );
  });
});

describe("abandoning a settlement", () => {
  test("the settlers move to your other land and the province goes back to open country", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const bermuda = prov("Bermuda");
    expect(abandonCheck(s, map, en, s.nations[en].capital).ok).toBe(false);
    expect(abandonCheck(s, map, en, bermuda).ok).toBe(true);
    const leaving = settlers(s.provinces[bermuda]);
    const capBefore = settlers(s.provinces[s.nations[en].capital]);
    expect(g.command(en, { k: "abandon", p: bermuda })).toBeNull();
    expect(s.provinces[bermuda].owner).toBe(-1);
    expect(settlers(s.provinces[bermuda])).toBe(0);
    expect(settlers(s.provinces[s.nations[en].capital])).toBeGreaterThan(
      capBefore + leaving * 0.7,
    );
    expect(g.takeDelta().events).toContainEqual(
      expect.objectContaining({ k: "abandoned", n: en, p: bermuda }),
    );
  });
});

describe("native tributaries", () => {
  test("a strong colony makes a weak neighbour pay tribute; they fight beside it and can be released", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const pw = key(g, "powhatan");
    const fr = key(g, "france");
    // Without an army they laugh at you.
    expect(g.command(en, { k: "tribute", n: pw })).toBeNull();
    expect(s.nations[pw].overlord).toBe(-1);
    soldiers(g, en, s.nations[en].capital, 20000);
    s.nations[pw].relations[en] = [];
    expect(g.command(en, { k: "tribute", n: pw })).toBeNull();
    expect(s.nations[pw].overlord).toBe(en);
    expect(tributariesOf(s, en)).toEqual([pw]);
    expect(alliesOf(s, en)).toContain(pw);
    expect(canEnter(s, en, s.nations[pw].capital)).toBe(true);
    expect(warCheck(s, en, pw).ok).toBe(false);
    expect(scoreOf(s, g.w, en).parts.map((p) => p.label)).toContain(
      "1 tributary nations",
    );
    // A month of tribute.
    s.nations[pw].gold = 100;
    s.nations[pw].market.stock.furs = 30;
    const gold = s.nations[en].gold;
    ticks(g, 31);
    expect(s.nations[pw].gold).toBeLessThan(100);
    expect(s.nations[en].gold).not.toBe(gold);
    // Whoever attacks the overlord fights the tributary too.
    g.command(fr, { k: "war", n: en });
    expect(
      s.wars.some(
        (w) => (w.a === pw && w.b === fr) || (w.a === fr && w.b === pw),
      ),
    ).toBe(true);
    expect(g.command(en, { k: "release", n: pw })).toBeNull();
    expect(s.nations[pw].overlord).toBe(-1);
  });

  test("a beaten native nation can be made a tributary at the peace", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    const pw = key(g, "powhatan");
    g.command(en, { k: "war", n: pw });
    // England holds most of their land.
    for (const p of provincesOf(s, pw).slice(1)) s.provinces[p].occupier = en;
    s.wars[s.wars.length - 1].won = [6, 0];
    s.wars[s.wars.length - 1].start -= 365 * 3;
    const r = g.command(en, {
      k: "peace",
      n: pw,
      terms: { take: [], give: [], gold: 0, subjugate: true },
    });
    expect(r).toBeNull();
    expect(s.nations[pw].overlord).toBe(en);
    expect(
      s.wars.some(
        (w) => (w.a === en && w.b === pw) || (w.b === en && w.a === pw),
      ),
    ).toBe(false);
  });
});

describe("expedition routes", () => {
  test("over land when there's land, by boat to an island", () => {
    const toPamunkey = missionRoute(
      map,
      prov("Jamestown"),
      prov("Pamunkey"),
      "explore",
    );
    expect(toPamunkey.sea.every((x) => !x)).toBe(true);
    expect(toPamunkey.route[0]).toBe(prov("Jamestown"));
    expect(toPamunkey.route[toPamunkey.route.length - 1]).toBe(
      prov("Pamunkey"),
    );
    const toCuba = missionRoute(
      map,
      prov("St. Augustine"),
      prov("Havana"),
      "explore",
    );
    expect(toCuba.sea.some((x) => x)).toBe(true);
    // Each hop is between neighbours on land, or along a sea lane.
    toCuba.route.slice(1).forEach((p, i) => {
      const from = map.provinces[toCuba.route[i]];
      if (toCuba.sea[i]) expect(from.sea.some(([q]) => q === p)).toBe(true);
      else expect(from.nb.some(([q]) => q === p)).toBe(true);
    });
  });

  test("a party's journey follows its route", () => {
    const g = quietGame();
    const s = g.state;
    const en = key(g, "england");
    s.nations[en].gold = 500;
    const leader = s.nations[en].court[0];
    const target = prov("Monacan");
    s.nations[en].explored = s.nations[en].explored.filter((p) => p !== target);
    expect(g.command(en, { k: "expedition", c: leader, p: target })).toBeNull();
    const m = s.nations[en].missions[0];
    expect(m.route[0]).toBe(m.from);
    expect(m.route[m.route.length - 1]).toBe(target);
    expect(m.legs).toHaveLength(m.route.length - 1);
    const total = m.legs.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - (m.arrive - m.start))).toBeLessThan(1);
  });
});
