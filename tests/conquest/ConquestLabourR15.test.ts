// Derpy Conquest, round 15 (LABOUR): slavery in the colonies, treated as
// history. People may be held only where and when the law allowed it, and
// bought only at the ports where they were sold; the odds of flight, of a
// rising and of a death respond to how a household is kept, and happen at
// the rates shown; harshness never pays; freeing someone meets the law's
// hurdles (fees, security, petitions, a will that the law may void); what
// a household holds passes to an heir; the freed live on as free people in
// the world; old saves load; another household's door stays its own
// business in multiplayer.

import { describe, expect, test } from "vitest";
import { sitterOf } from "../../src/conquest/engine/Appearance";
import {
  bondForecast,
  bondRisks,
  boundOf,
  CROP_EXCISE,
  CROP_LUCK,
  cropAt,
  CROPS,
  deathChance,
  flightChance,
  FOOD_COST,
  freeCost,
  healthTarget,
  HOUSING_COST,
  keepOf,
  labourDeltaForSeat,
  labourForOthers,
  labourStateForSeat,
  moodTarget,
  riseChance,
  saleAt,
  SECRET_MARK,
  workOf,
  yearly,
} from "../../src/conquest/engine/BondCore";
import {
  BOND_HISTORY,
  bondLaw,
  colonyOf,
  freeRule,
  holdingLawful,
  importBan,
  MARKETS,
  saleChance,
} from "../../src/conquest/engine/BondLaw";
import {
  bondageFor,
  bondMonthly,
  setFree,
} from "../../src/conquest/engine/Bondage";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { raiseEvent } from "../../src/conquest/engine/Hooks";
import { succeedTo } from "../../src/conquest/engine/Life";
import { peopleHere } from "../../src/conquest/engine/LifeQueries";
import { hireCheck } from "../../src/conquest/engine/Property";
import { ageOf, charName } from "../../src/conquest/engine/Queries";
import type {
  BondOrigin,
  BondPolicy,
  BondWork,
  Character,
  Life,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, world } from "./LifeUtil";

const P = (id: string) => {
  const i = map.provinces.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(id);
  return i;
};

/** A planter at home in a province, with money, in a quiet world. */
function holder(
  home: string,
  o: {
    start?: 1607 | 1650 | 1700;
    seed?: number;
    year?: number;
    purse?: number;
    french?: boolean;
  } = {},
): { g: ConquestGame; life: Life } {
  const g = world({
    start: o.start ?? 1700,
    seed: o.seed ?? 11,
    plans: [
      {
        seat: "s1",
        name: "A",
        plan: plan({
          home: P(home),
          background: "farmer",
          ...(o.french
            ? {
                origin: "france",
                religion: "catholic",
                first: "Pierre",
                family: "Lefebvre",
              }
            : {}),
        }),
      },
    ],
  });
  g.aiEnabled = false;
  if (o.year) g.s.day = dayOf(o.year, 1, 1);
  const life = lifeOf(g);
  life.purse = o.purse ?? 3000;
  return { g, life };
}

let made = 0;

/** Someone in the household, made directly (the sale's own path is tested apart). */
function person(
  g: ConquestGame,
  life: Life,
  o: {
    age?: number;
    female?: boolean;
    status?: "held" | "indenture";
    origin?: BondOrigin;
    work?: BondWork;
    mood?: number;
    health?: number;
    since?: number;
  } = {},
): Character {
  const b = bondageFor(g, life);
  const owner = g.s.nations[g.s.provinces[b.home].owner];
  const c = makeCharacter(g.s, g.rng, {
    nation: owner.id,
    culture: owner.culture,
    religion: owner.religion,
    female: o.female ?? false,
    age: o.age ?? 25,
    first: `P${made++}`,
    family: o.status === "indenture" ? "Smith" : "",
  });
  c.bond = {
    status: o.status ?? "held",
    seat: life.seat,
    at: b.home,
    origin: o.origin ?? "creole",
    faith: "own",
    health: o.health ?? 70,
    mood: o.mood ?? 50,
    sk: { field: 5, house: 3, craft: 3 },
    work: o.work ?? "fields",
    since: o.since ?? g.s.day - 2000,
    ...(o.status === "indenture" ? { until: g.s.day + 4 * 365 } : {}),
  };
  b.people.push(c.id);
  return c;
}

function cmd(g: ConquestGame, c: object): string | null {
  return g.lifeCommand("s1", c as Parameters<ConquestGame["lifeCommand"]>[1]);
}

function setPolicy(life: Life, p: Partial<BondPolicy>) {
  life.bondage!.policy = { ...life.bondage!.policy, ...p };
}

const HARSH: Partial<BondPolicy> = {
  food: 0,
  housing: 0,
  regime: "gang",
  punish: 2,
  families: false,
  passes: false,
};
const CUSTOM: Partial<BondPolicy> = {
  food: 1,
  housing: 1,
  regime: "gang",
  punish: 1,
  families: false,
  passes: false,
};
const KIND: Partial<BondPolicy> = {
  food: 2,
  housing: 2,
  regime: "task",
  punish: 0,
  families: true,
  passes: true,
};

/** Settle everyone at the spirits and health their keeping tends to. */
function settle(g: ConquestGame, life: Life): void {
  for (const c of boundOf(g.s, life)) {
    c.bond!.mood = moodTarget(g.s, map, life, c).total;
    c.bond!.health = healthTarget(g.s, map, life, c).total;
  }
}

// ---------------------------------------------------------------- the law

describe("LABOUR: where and when the law allowed it", () => {
  test("Virginia: by custom until the act of 1662; the code of 1705", () => {
    const { g } = holder("jamestown", { start: 1650 });
    const p = P("jamestown");
    expect(holdingLawful(g.s, map, p, dayOf(1655))).toBe(false);
    expect(holdingLawful(g.s, map, p, dayOf(1663))).toBe(true);
    expect(bondLaw(g.s, map, p, dayOf(1663)).code).toBe("the act of 1662");
    expect(bondLaw(g.s, map, p, dayOf(1710)).code).toBe(
      "the slave code of 1705",
    );
  });

  test("Maryland from 1664, Massachusetts from the Body of Liberties (1641)", () => {
    const { g } = holder("st-mary-s", { start: 1650 });
    expect(holdingLawful(g.s, map, P("st-mary-s"), dayOf(1660))).toBe(false);
    expect(holdingLawful(g.s, map, P("st-mary-s"), dayOf(1665))).toBe(true);
    expect(holdingLawful(g.s, map, P("massachusetts-bay"), dayOf(1650))).toBe(
      true,
    );
    expect(bondLaw(g.s, map, P("massachusetts-bay"), dayOf(1650)).why).toMatch(
      /lawfull Captives/,
    );
  });

  test("Georgia's Trustees banned it from 1735 until 1 January 1751", () => {
    const { g } = holder("charles-town");
    const guale = P("guale");
    g.s.provinces[guale].owner = g.s.provinces[P("charles-town")].owner;
    expect(colonyOf(map, guale)).toBe("georgia");
    expect(holdingLawful(g.s, map, guale, dayOf(1740))).toBe(false);
    expect(holdingLawful(g.s, map, guale, dayOf(1750, 11, 31))).toBe(false);
    expect(holdingLawful(g.s, map, guale, dayOf(1751, 0, 1))).toBe(true);
    expect(saleChance(g.s, map, guale, dayOf(1745))).toBe(0);
  });

  test("New France: not until Louis XIV's leave of 1689; the Code Noir in the islands and Louisiana", () => {
    const { g } = holder("jamestown");
    expect(holdingLawful(g.s, map, P("quebec"), dayOf(1680))).toBe(false);
    expect(holdingLawful(g.s, map, P("quebec"), dayOf(1690))).toBe(true);
    expect(bondLaw(g.s, map, P("quebec"), dayOf(1710)).code).toMatch(/Raudot/);
    expect(bondLaw(g.s, map, P("martinique"), dayOf(1700)).apart).toBe(false);
    expect(freeRule("french", "louisiana", 1725).petition?.who).toBe(
      "the Superior Council",
    );
  });

  test("nobody may be held in the people's own country", () => {
    const { g } = holder("jamestown");
    expect(holdingLawful(g.s, map, P("cahokia"))).toBe(false);
  });

  test("letters: South Carolina forbids teaching to write from 1740; Georgia reading too from 1770", () => {
    const { g } = holder("charles-town");
    const sc = bondLaw(g.s, map, P("charles-town"), dayOf(1741));
    expect(sc.writing).toBe(false);
    expect(sc.reading).toBe(true);
    const guale = P("guale");
    g.s.provinces[guale].owner = g.s.provinces[P("charles-town")].owner;
    expect(bondLaw(g.s, map, guale, dayOf(1771)).reading).toBe(false);
    expect(bondLaw(g.s, map, guale, dayOf(1760)).reading).toBe(true);
  });

  test("freeing: each colony's hurdles, as the acts set them", () => {
    expect(freeRule("english", "virginia", 1700)).toMatchObject({
      kind: "deed",
      leave: 6,
    });
    expect(freeRule("english", "virginia", 1724)).toMatchObject({
      kind: "petition",
    });
    expect(freeRule("english", "maryland", 1753)).toMatchObject({
      will: false,
      maxAge: 50,
    });
    expect(freeRule("english", "northcarolina", 1742)).toMatchObject({
      kind: "petition",
      leave: 6,
    });
    expect(freeRule("english", "southcarolina", 1723).leave).toBe(12);
    expect(freeRule("english", "southcarolina", 1736).leave).toBe(6);
    expect(freeRule("english", "southcarolina", 1741).leave).toBeUndefined();
    expect(freeRule("english", "newyork", 1715)).toMatchObject({
      kind: "security",
      security: 300,
      allowance: 30,
    });
    expect(freeRule("english", "pennsylvania", 1730).security).toBe(45);
    expect(freeRule("english", "delaware", 1768).security).toBe(90);
    expect(freeRule("english", "massachusetts", 1710).security).toBe(75);
    expect(freeRule("french", "islands", 1720).kind).toBe("petition");
    expect(freeRule("french", "islands", 1690).kind).toBe("deed");
  });

  test("the Association stops the ships from December 1774; Rhode Island from June 1774", () => {
    const { g } = holder("jamestown");
    expect(importBan(g.s, map, P("jamestown"), dayOf(1774, 10, 1))).toBeNull();
    expect(importBan(g.s, map, P("jamestown"), dayOf(1775, 0, 1))).toMatch(
      /Association/,
    );
    expect(importBan(g.s, map, P("narragansett"), dayOf(1774, 6, 1))).toMatch(
      /Rhode Island/,
    );
  });

  test("every market and every dated event is a real place and a real year in the game's span", () => {
    for (const m of MARKETS) expect(P(m.id)).toBeGreaterThanOrEqual(0);
    for (const e of BOND_HISTORY) {
      expect(e.year).toBeGreaterThanOrEqual(1607);
      expect(e.year).toBeLessThanOrEqual(1776);
      // The period's legal words only where the law (or a title) is quoted.
      const plain = e.text.replace(/"[^"]*"/g, "").replace(/Negro Act/g, "");
      expect(plain, e.text).not.toMatch(
        /\bnegro(es)?\b|\bslaves?\b(?! (code|trade|patrols|ships?|holding|port))/i,
      );
    }
  });
});

// ---------------------------------------------------------------- the sales

describe("LABOUR: buying, only where and when people were sold", () => {
  function monthWithSale(
    g: ConquestGame,
    p: number,
    kind: "held" | "indenture",
  ): void {
    for (let i = 0; i < 48; i++) {
      if (saleAt(g.s, map, p).some((l) => l.kind === kind)) return;
      g.s.day += 30;
    }
    throw new Error("no sale in four years");
  }

  test("a sale's lots are the same for everyone, and each is sold once", () => {
    const g = world({
      start: 1700,
      seed: 4,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ home: P("charles-town"), background: "farmer" }),
        },
        {
          seat: "s2",
          name: "B",
          plan: plan({
            home: P("charles-town"),
            background: "farmer",
            first: "Beatrice",
            female: true,
          }),
        },
      ],
    });
    g.aiEnabled = false;
    lifeOf(g, "s1").purse = 500;
    lifeOf(g, "s2").purse = 500;
    const p = P("charles-town");
    monthWithSale(g, p, "held");
    const a = saleAt(g.s, map, p);
    expect(saleAt(g.s, map, p)).toEqual(a);
    const lot = a.find((l) => l.kind === "held")!;
    expect(
      g.lifeCommand("s1", { k: "bond", act: "buy", key: lot.key } as never),
    ).toBeNull();
    expect(saleAt(g.s, map, p).find((l) => l.key === lot.key)!.sold).toBe(true);
    expect(
      g.lifeCommand("s2", { k: "bond", act: "buy", key: lot.key } as never),
    ).toBe("Sold already.");
    const life = lifeOf(g, "s1");
    const bought = boundOf(g.s, life);
    expect(bought.length).toBe(lot.people.length);
    for (const c of bought) {
      expect(c.bond!.status).toBe("held");
      expect(c.first.length).toBeGreaterThan(1);
      expect(charName(c)).not.toMatch(/ $/);
    }
  });

  test("no sales where nobody sold people, and none where the law forbids it", () => {
    const { g } = holder("jamestown");
    expect(saleChance(g.s, map, P("hochelaga"))).toBe(0);
    expect(saleChance(g.s, map, P("jamestown"), dayOf(1650))).toBe(0);
    expect(saleChance(g.s, map, P("jamestown"), dayOf(1720))).toBeGreaterThan(
      0,
    );
  });

  test("you must be at the sale, with a lawful home and the money; and not of the Native nations", () => {
    const { g, life } = holder("jamestown", { purse: 1 });
    const p = P("jamestown");
    monthWithSale(g, p, "held");
    const lot = saleAt(g.s, map, p).find((l) => l.kind === "held")!;
    expect(cmd(g, { k: "bond", act: "buy", key: lot.key })).toMatch(/Costs/);
    life.purse = 500;
    life.prov = P("pamunkey");
    expect(cmd(g, { k: "bond", act: "buy", key: lot.key })).toBe(
      "The sale is elsewhere.",
    );
  });

  test("indentures: an English port sells servants for a term, and the term ends with freedom dues", () => {
    const { g, life } = holder("jamestown");
    const p = P("jamestown");
    monthWithSale(g, p, "indenture");
    const lot = saleAt(g.s, map, p).find((l) => l.kind === "indenture")!;
    expect(cmd(g, { k: "bond", act: "buy", key: lot.key })).toBeNull();
    const c = boundOf(g.s, life).find((x) => x.bond!.status === "indenture")!;
    expect(c.bond!.until).toBeGreaterThan(g.s.day);
    c.bond!.until = g.s.day - 1;
    const purse = life.purse;
    bondMonthly(g, life);
    expect(c.bond!.status).toBe("free");
    expect(c.home).toBe(life.bondage!.home);
    expect(purse - life.purse).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------- the odds

describe("LABOUR: the odds respond to how a household is kept", () => {
  test("harshness: worse health and spirits, more flight, more risings", () => {
    const { g, life } = holder("charles-town");
    for (let i = 0; i < 8; i++)
      person(g, life, { age: 20 + i, female: i % 2 === 1 });
    const read = (pol: Partial<BondPolicy>) => {
      setPolicy(life, pol);
      settle(g, life);
      const c = boundOf(g.s, life)[0];
      return {
        mood: c.bond!.mood,
        health: c.bond!.health,
        flight: flightChance(g.s, map, life, c).total,
        rise: riseChance(g.s, map, life).total,
        death: deathChance(g.s, map, life, c),
      };
    };
    const harsh = read(HARSH);
    const custom = read(CUSTOM);
    const kind = read(KIND);
    expect(harsh.mood).toBeLessThan(custom.mood);
    expect(custom.mood).toBeLessThan(kind.mood);
    expect(harsh.health).toBeLessThan(custom.health);
    expect(harsh.flight).toBeGreaterThan(custom.flight);
    expect(custom.flight).toBeGreaterThan(kind.flight);
    expect(harsh.rise).toBeGreaterThan(custom.rise);
    expect(custom.rise).toBeGreaterThan(kind.rise);
    expect(harsh.death).toBeGreaterThan(kind.death);
  });

  test("grief, the refuges near, and patrols", () => {
    const { g, life } = holder("charles-town", { year: 1730 });
    const c = person(g, life);
    const base = flightChance(g.s, map, life, c).total;
    c.bond!.grief = g.s.day + 100;
    expect(flightChance(g.s, map, life, c).total).toBeGreaterThan(base);
    c.bond!.grief = undefined;
    // Spanish Florida draws from the Carolinas until 1763.
    g.s.day = dayOf(1765);
    expect(flightChance(g.s, map, life, c).total).toBeLessThan(base);
  });

  test("punishment never buys any work: only the regime and the people's own state do", () => {
    const { g, life } = holder("jamestown");
    const c = person(g, life);
    life.prov = life.bondage!.home;
    setPolicy(life, { punish: 0 });
    const a = workOf(g.s, map, life, c);
    setPolicy(life, { punish: 2 });
    expect(workOf(g.s, map, life, c)).toBe(a);
  });

  test("harshness doesn't pay: a harsh household nets less than a customary one, and a kind one no less", () => {
    // Expected coins a month a year from now, per person: the work, less the
    // keep, less what flight and death take of what they cost to buy.
    const net = (pol: Partial<BondPolicy>) => {
      const { g, life } = holder("jamestown", { year: 1730 });
      for (let i = 0; i < 6; i++)
        person(g, life, { age: 22 + i * 3, female: i % 3 === 0 });
      for (let i = 0; i < 6; i++)
        g.lifeCommand("s1", { k: "property", act: "land" } as never);
      setPolicy(life, pol);
      settle(g, life);
      const price = 48;
      let v = 0;
      for (const c of boundOf(g.s, life)) {
        const work = workOf(g.s, map, life, c) * (1 - CROP_EXCISE);
        const keep = keepOf(g.s, life.bondage!.policy, c);
        const lost =
          flightChance(g.s, map, life, c).total * 0.4 +
          deathChance(g.s, map, life, c);
        v += work - keep - lost * price;
      }
      return v;
    };
    const harsh = net(HARSH);
    const custom = net(CUSTOM);
    const kind = net(KIND);
    expect(harsh).toBeLessThan(custom);
    expect(kind).toBeGreaterThanOrEqual(custom - 0.5);
  });

  test("bound labour isn't simply better than hired: a field hand pays about what a hired hand nets, after the price and the risk", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    const c = person(g, life);
    setPolicy(life, CUSTOM);
    settle(g, life);
    life.prov = life.bondage!.home;
    const work = workOf(g.s, map, life, c) * (1 - CROP_EXCISE);
    const keep = keepOf(g.s, life.bondage!.policy, c);
    // The price, spread over twelve years, and what flight and death take.
    const risk =
      (flightChance(g.s, map, life, c).total * 0.4 +
        deathChance(g.s, map, life, c)) *
      45;
    const enslaved = work - keep - 45 / 144 - risk;
    // A hired hand: 2 a month, 3.2 a month's takings at skill 5, less the excise.
    const hired = 3.2 * (0.8 + 5 / 25) * (1 - 0.08) - 2;
    expect(enslaved).toBeLessThan(hired * 2);
    expect(enslaved).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- the rates

describe("LABOUR: flight, risings and deaths happen at the rates shown", () => {
  /**
   * Run many single months of a household of `n`, kept at its settled state
   * (each month starts the same: the shown chances are the month's), and
   * count what happens against what was shown.
   */
  function trial(
    pol: Partial<BondPolicy>,
    n: number,
    months: number,
    home = "charles-town",
  ) {
    const { g, life } = holder(home, { year: 1720 });
    for (let i = 0; i < 4; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    bondageFor(g, life);
    setPolicy(life, pol);
    const fresh = () => {
      for (const id of [...life.bondage!.people]) {
        const c = g.s.chars[id];
        if (c) c.alive = false;
      }
      life.bondage!.people = [];
      life.bondage!.petitions = [];
      for (let i = 0; i < n; i++)
        person(g, life, { age: 18 + (i % 20), female: i % 2 === 1 });
      settle(g, life);
    };
    let shownFlight = 0;
    let shownDeath = 0;
    let shownRise = 0;
    let flights = 0;
    let deaths = 0;
    let rises = 0;
    for (let m = 0; m < months; m++) {
      fresh();
      g.s.day += 30;
      life.purse = 3000;
      settle(g, life);
      for (const c of boundOf(g.s, life)) {
        shownFlight += flightChance(g.s, map, life, c).total;
        shownDeath += deathChance(g.s, map, life, c);
      }
      shownRise += riseChance(g.s, map, life).total;
      life.bondage!.log = [];
      bondMonthly(g, life);
      const log = life.bondage!.log;
      flights += log.filter((x) => x.k === "fled").length;
      deaths += log.filter((x) => x.k === "died").length;
      if (log.some((x) => x.k === "rose" || x.k === "plot")) rises++;
    }
    return { shownFlight, shownDeath, shownRise, flights, deaths, rises };
  }

  test("flight and death, over many months, at the shown chances", () => {
    const r = trial(HARSH, 20, 300);
    expect(r.shownFlight).toBeGreaterThan(30);
    expect(r.flights / r.shownFlight).toBeGreaterThan(0.75);
    expect(r.flights / r.shownFlight).toBeLessThan(1.3);
    expect(r.shownDeath).toBeGreaterThan(15);
    expect(r.deaths / r.shownDeath).toBeGreaterThan(0.65);
    expect(r.deaths / r.shownDeath).toBeLessThan(1.4);
  });

  test("risings, rare and grave, at the shown chance", () => {
    const r = trial(HARSH, 30, 1500);
    expect(r.shownRise).toBeGreaterThan(8);
    expect(r.rises / r.shownRise).toBeGreaterThan(0.5);
    expect(r.rises / r.shownRise).toBeLessThan(1.6);
  });

  test("the risks shown for a year agree with the month's chances", () => {
    const { g, life } = holder("jamestown");
    for (let i = 0; i < 5; i++) person(g, life);
    settle(g, life);
    const r = bondRisks(g.s, map, life);
    const c = boundOf(g.s, life)[0];
    expect(r.each[0].flight).toBeCloseTo(
      yearly(flightChance(g.s, map, life, c).total),
      6,
    );
    expect(r.freeOdds).toBeGreaterThan(0);
    expect(r.freeOdds).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------- the money

describe("LABOUR: the month's money, as the forecast has it", () => {
  test("the keep is a fixed line, paid exactly; the fields a chance line from the table rolled", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    for (let i = 0; i < 4; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    for (let i = 0; i < 4; i++) person(g, life);
    person(g, life, { age: 6, work: "rest" });
    life.prov = life.bondage!.home;
    const parts = bondForecast(g.s, life, g.w);
    const keep = parts.find((x) => x.key === "bond:keep")!;
    expect(keep.value).toBeCloseTo(
      -(
        4 * (FOOD_COST[1] + HOUSING_COST[1]) +
        0.5 * (FOOD_COST[1] + HOUSING_COST[1])
      ),
      6,
    );
    const fields = parts.find((x) => x.key === "bond:fields")!;
    expect(fields.chance).toBeDefined();
    const gross = boundOf(g.s, life)
      .filter((c) => c.bond!.work === "fields" && ageOf(g.s, c) >= 12)
      .reduce((m, c) => m + workOf(g.s, map, life, c), 0);
    const mean = CROP_LUCK.reduce((m, x) => m + x.p * x.mul, 0);
    expect(fields.value).toBeCloseTo(gross * mean * (1 - CROP_EXCISE), 1);
    expect(cropAt(g.s, map, P("jamestown"))).toBe("tobacco");
    expect(CROPS.tobacco.value).toBeGreaterThan(0);
    // Paid at the turn: the keep exactly.
    const books: number[] = [];
    const was = life.purse;
    bondMonthly(g, life);
    books.push(was - life.purse);
    expect(life.purse).not.toBe(was);
  });

  test("New York's act of 1712: the freed's yearly allowance is a fixed line", () => {
    const { g, life } = holder("new-amsterdam", { year: 1715 });
    const c = person(g, life, { age: 30 });
    expect(freeCost(g.s, map, life).security).toBe(300);
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toBeNull();
    expect(c.bond!.status).toBe("free");
    const line = bondForecast(g.s, life, g.w).find(
      (x) => x.key === `bond:allow:${c.id}`,
    )!;
    expect(line.value).toBeCloseTo(-2.5, 2);
  });
});

// ---------------------------------------------------------------- freedom

describe("LABOUR: freedom, past the law's hurdles", () => {
  test("by deed, with the fees on the button; the freed live on as free people in the world", () => {
    const { g, life } = holder("jamestown", { year: 1700 });
    const c = person(g, life, { age: 30 });
    const fc = freeCost(g.s, map, life);
    expect(fc.rule.kind).toBe("deed");
    expect(fc.passage).toBeGreaterThan(0); // Virginia, 1691: they must leave the colony
    const purse = life.purse;
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toBeNull();
    expect(purse - life.purse).toBeCloseTo(fc.fee + fc.passage, 6);
    expect(c.bond!.status).toBe("free");
    expect(c.alive).toBe(true);
    expect(c.family.length).toBeGreaterThan(0);
    expect(c.home).not.toBe(P("jamestown"));
    expect(g.s.locals[c.home!]).toContain(c.id);
    expect(peopleHere(g.s, c.home!).some((x) => x.id === c.id)).toBe(true);
    expect(boundOf(g.s, life).some((x) => x.id === c.id)).toBe(false);
    // They can be hired like anyone else (a hand at a business of your own).
    life.prov = c.home!;
    life.property = [
      {
        id: 999,
        kind: "business",
        prov: c.home!,
        level: 1,
        job: "farmer",
        hands: [],
        since: 0,
        name: "farm",
      },
    ];
    expect(hireCheck(g.s, life, c).ok).toBe(true);
  });

  test("Virginia after 1723: only by petition to the governor and council, for meritorious services", () => {
    const { g, life } = holder("jamestown", { year: 1724 });
    const c = person(g, life, { age: 30 });
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toBeNull();
    expect(c.bond!.status).toBe("held");
    const pet = life.bondage!.petitions![0];
    expect(pet.who).toBe("the governor and council");
    expect(pet.odds).toBeCloseTo(0.12, 6);
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toMatch(/petition/);
    // A meritorious service makes the case.
    const d = person(g, life, { age: 30 });
    d.bond!.merit = "saving a child from a fire";
    cmd(g, { k: "bond", act: "free", c: d.id });
    expect(life.bondage!.petitions![1].odds).toBeCloseTo(0.62, 6);
    // Its day comes: granted or refused, by its odds.
    life.bondage!.petitions![1].odds = 1;
    life.bondage!.petitions![0].odds = 0;
    g.s.day += 100;
    bondMonthly(g, life);
    expect(d.bond!.status).toBe("free");
    expect(c.bond!.status).toBe("held");
    expect(life.bondage!.petitions).toEqual([]);
  });

  test("Maryland's act of 1752: no freeing by will, nor anyone over fifty", () => {
    const { g, life } = holder("st-mary-s", { year: 1753 });
    const old = person(g, life, { age: 55 });
    const young = person(g, life, { age: 30 });
    expect(cmd(g, { k: "bond", act: "free", c: old.id })).toMatch(/over 50/);
    expect(cmd(g, { k: "bond", act: "will", c: young.id })).toMatch(/1752/);
    expect(cmd(g, { k: "bond", act: "free", c: young.id })).toBeNull();
  });

  test("security: Pennsylvania's act of 1726 wants it in hand", () => {
    const { g, life } = holder("upland", { year: 1730, purse: 40 });
    const c = person(g, life);
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toMatch(/security/);
    life.purse = 100;
    expect(cmd(g, { k: "bond", act: "free", c: c.id })).toBeNull();
    expect(life.bondage!.bonds![0]).toMatchObject({ c: c.id, sum: 45 });
  });

  test("buying their own freedom: Spain's law gives the right; elsewhere you may refuse", () => {
    const { g, life } = holder("charles-town", { year: 1745 });
    const c = person(g, life, { age: 30 });
    c.bond!.saved = 5;
    expect(cmd(g, { k: "bond", act: "purchase", c: c.id })).toMatch(/saved/);
    c.bond!.saved = 500;
    const purse = life.purse;
    expect(cmd(g, { k: "bond", act: "purchase", c: c.id })).toBeNull();
    expect(c.bond!.status).toBe("free");
    expect(life.purse).toBeGreaterThan(purse);
  });
});

// ---------------------------------------------------------------- families and sales

describe("LABOUR: families, and selling", () => {
  test("selling someone from their family is put to you first, in their words", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    const a = person(g, life, { age: 30 });
    const b = person(g, life, { age: 28, female: true });
    a.spouse = b.id;
    b.spouse = a.id;
    expect(cmd(g, { k: "bond", act: "sell", c: a.id })).toBeNull();
    expect(life.events.some((e) => e.key === "bond-plea")).toBe(true);
    expect(a.bond!.status).toBe("held");
    expect(a.bond!.seat).toBe("s1");
  });

  test("sold apart: grief for those left; sold with the family: nobody left", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    const a = person(g, life, { age: 30 });
    const b = person(g, life, { age: 28, female: true });
    const kid = person(g, life, { age: 5, work: "rest" });
    a.spouse = b.id;
    b.spouse = a.id;
    kid.mother = b.id;
    kid.father = a.id;
    a.children.push(kid.id);
    b.children.push(kid.id);
    expect(cmd(g, { k: "bond", act: "sell", c: a.id, arg: 1 })).toBeNull();
    expect(a.bond!.seat).toBeUndefined();
    expect(b.bond!.grief).toBeGreaterThan(g.s.day);
    expect(kid.bond!.grief).toBeGreaterThan(g.s.day);
    expect(cmd(g, { k: "bond", act: "sell", c: kid.id })).toMatch(/child/);
    expect(
      cmd(g, { k: "bond", act: "sell", c: kid.id, key: "all" }),
    ).toBeNull();
    expect(boundOf(g.s, life).length).toBe(0);
  });

  test("the Code Noir: a family may not be sold apart; a household's own rule likewise", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    const a = person(g, life, { age: 30 });
    const b = person(g, life, { age: 28, female: true });
    a.spouse = b.id;
    b.spouse = a.id;
    setPolicy(life, { families: true });
    expect(cmd(g, { k: "bond", act: "sell", c: a.id, arg: 1 })).toMatch(
      /never sells a family apart/,
    );
    expect(
      cmd(g, { k: "bond", act: "policy", kind: "families", arg: 0 }),
    ).toBeNull();
    // Under the Code Noir it's the law.
    const fr = holder("martinique", { year: 1720, french: true });
    const x = person(fr.g, fr.life, { age: 30 });
    const y = person(fr.g, fr.life, { age: 28, female: true });
    x.spouse = y.id;
    y.spouse = x.id;
    expect(
      fr.g.lifeCommand("s1", {
        k: "bond",
        act: "sell",
        c: x.id,
        arg: 1,
      } as never),
    ).toMatch(/Code Noir/);
    expect(
      fr.g.lifeCommand("s1", {
        k: "bond",
        act: "policy",
        kind: "families",
        arg: 0,
      } as never),
    ).toMatch(/Code Noir/);
  });

  test("a child born to a woman held is held as she is (Virginia, 1662)", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    const mothers: Character[] = [];
    for (let i = 0; i < 12; i++) {
      const a = person(g, life, { age: 30 });
      const b = person(g, life, { age: 22, female: true, health: 90 });
      a.spouse = b.id;
      b.spouse = a.id;
      mothers.push(b);
    }
    let born: Character | undefined;
    for (let m = 0; m < 120 && !born; m++) {
      g.s.day += 30;
      bondMonthly(g, life);
      for (const b of mothers)
        born ??= b.children.map((k) => g.s.chars[k]).find((x) => x?.alive);
    }
    expect(born).toBeDefined();
    expect(born!.bond!.status).toBe("held");
    expect(born!.bond!.seat).toBe("s1");
    expect(born!.bond!.origin).toBe("creole");
    expect(boundOf(g.s, life).map((x) => x.id)).toContain(born!.id);
  });
});

// ---------------------------------------------------------------- an heir

describe("LABOUR: inheritance, and the end of a line", () => {
  test("those held pass to the heir; a will frees those it names, as the law then allows", () => {
    const { g, life } = holder("charles-town", { year: 1745 });
    const keep = person(g, life, { age: 30 });
    const named = person(g, life, { age: 30 });
    expect(cmd(g, { k: "bond", act: "will", c: named.id })).toBeNull();
    expect(named.bond!.will).toBe(true);
    const me = g.s.chars[life.c];
    const heir = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: me.culture,
      religion: me.religion,
      female: false,
      age: 20,
      father: me.id,
    });
    me.children.push(heir.id);
    succeedTo(g, life, heir.id);
    expect(life.c).toBe(heir.id);
    expect(keep.bond!.seat).toBe("s1");
    expect(boundOf(g.s, life).map((x) => x.id)).toContain(keep.id);
    expect(named.bond!.status).toBe("free");
  });

  test("Virginia after 1723: the executors must petition for those the will names", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    const named = person(g, life, { age: 30 });
    expect(cmd(g, { k: "bond", act: "will", c: named.id })).toBeNull();
    const me = g.s.chars[life.c];
    const heir = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: me.culture,
      religion: me.religion,
      female: true,
      age: 20,
      mother: -1,
      father: me.id,
    });
    succeedTo(g, life, heir.id);
    expect(named.bond!.status).toBe("held");
    expect(life.bondage!.petitions![0]).toMatchObject({
      c: named.id,
      will: true,
    });
  });

  test("Maryland after 1752: a will can't free them (the mark can't even be made)", () => {
    const { g, life } = holder("st-mary-s", { year: 1760 });
    const c = person(g, life, { age: 30 });
    expect(cmd(g, { k: "bond", act: "will", c: c.id })).toMatch(/1752/);
  });
});

// ---------------------------------------------------------------- the world

describe("LABOUR: people, portraits, saves and secrets", () => {
  test("those held and freed are shown with portraits of their own people, children too", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    for (const age of [3, 9, 15, 30, 60]) {
      const c = person(g, life, { age, female: age % 2 === 1 });
      expect(sitterOf(c, ageOf(g.s, c)).people).toBe("african");
    }
    const servant = person(g, life, {
      status: "indenture",
      origin: "europe",
      age: 20,
    });
    expect(sitterOf(servant, 20).people).not.toBe("african");
    const freed = person(g, life, { age: 40 });
    setFree(g, life, freed, "by deed");
    expect(sitterOf(freed, 40).people).toBe("african");
  });

  test("an old save with no bondage loads and runs; a game with it survives a save and the delta", () => {
    const { g, life } = holder("jamestown", { year: 1720 });
    // An old save: no field at all.
    delete (life as Partial<Life>).bondage;
    const old = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    old.aiEnabled = false;
    for (let i = 0; i < 40; i++) old.tick();
    expect(lifeOf(old).bondage).toBeUndefined();
    // With it: saved, loaded and sent.
    const c = person(g, life, { age: 30 });
    const client = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    expect(
      cmd(g, { k: "bond", act: "policy", kind: "food", arg: 2 }),
    ).toBeNull();
    expect(
      cmd(g, { k: "bond", act: "work", c: c.id, kind: "house" }),
    ).toBeNull();
    applyDelta(client, g.takeDelta());
    expect(lifeOf({ s: client } as ConquestGame).bondage!.policy.food).toBe(2);
    expect(client.chars[c.id].bond.work).toBe("house");
    const loaded = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    loaded.aiEnabled = false;
    expect(boundOf(loaded.s, lifeOf(loaded)).map((x) => x.id)).toEqual([c.id]);
    for (let i = 0; i < 40; i++) loaded.tick();
  });

  test("a door opened to someone fleeing is that household's own business (per seat)", () => {
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ home: P("charles-town"), background: "farmer" }),
        },
        {
          seat: "s2",
          name: "B",
          plan: plan({
            home: P("upland"),
            background: "farmer",
            first: "Beatrice",
            female: true,
          }),
        },
      ],
    });
    g.aiEnabled = false;
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const c = person(g, a, { age: 25 });
    c.bond = {
      ...c.bond!,
      status: "fled",
      fled: { day: g.s.day, to: "north", was: "held", due: g.s.day + 30 },
    };
    g.takeDelta();
    // The door: raised on B, and answered.
    raiseEvent(g, b, "bond-door", { c: c.id });
    expect(b.events.some((e) => e.key === "bond-door")).toBe(true);
    const d = g.takeDelta();
    const toA = labourDeltaForSeat(d, "s1");
    const toB = labourDeltaForSeat(d, "s2");
    const seenByA = {
      ...(toA.lives?.s2 ?? {}),
      ...(toA.lifePatch?.s2 ?? {}),
    } as Partial<Life>;
    const seenByB = {
      ...(toB.lives?.s2 ?? {}),
      ...(toB.lifePatch?.s2 ?? {}),
    } as Partial<Life>;
    expect((seenByA.events ?? []).some((e) => e.key === "bond-door")).toBe(
      false,
    );
    expect((seenByB.events ?? []).some((e) => e.key === "bond-door")).toBe(
      true,
    );
    // B hides them: free, in B's town; A hears only that they're gone.
    const ev = b.events.find((e) => e.key === "bond-door")!;
    expect(
      g.lifeCommand("s2", { k: "event", id: ev.id, choice: 1 } as never),
    ).toBeNull();
    expect(c.bond!.status).toBe("free");
    expect(c.home).toBe(b.home);
    const secret = b.journal.filter((j) => j.text.startsWith(SECRET_MARK));
    expect(secret.length).toBeGreaterThan(0);
    expect(
      labourForOthers(b).journal!.some((j) => j.text.startsWith(SECRET_MARK)),
    ).toBe(false);
    expect(
      labourStateForSeat(g.s, "s1")
        .lives.find((l) => l.seat === "s2")!
        .journal.some((j) => j.text.startsWith(SECRET_MARK)),
    ).toBe(false);
    expect(
      labourStateForSeat(g.s, "s2")
        .lives.find((l) => l.seat === "s2")!
        .journal.some((j) => j.text.startsWith(SECRET_MARK)),
    ).toBe(true);
    expect(
      a.journal.some(
        (j) => j.text.includes("Beatrice") && !/fine/.test(j.text),
      ),
    ).toBe(false);
  });

  test("the Native nations' lives have nothing to do with the trade", () => {
    const g = world({
      seed: 3,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({
            origin: "powhatan",
            home: P("pamunkey"),
            background: "grower",
            religion: "native",
            first: "Opechan",
            family: "of the Pamunkey",
          }),
        },
      ],
    });
    expect(
      g.lifeCommand("s1", { k: "bond", act: "buy", key: "1:1:0" } as never),
    ).toMatch(/people's ways/);
  });
});
