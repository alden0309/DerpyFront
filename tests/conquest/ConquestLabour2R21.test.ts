// Derpy Conquest, round 21 (LABOUR2): bondage in businesses and trade, told
// as history, as LABOUR r15 told it. An overseer (his nature, his pay, your
// orders; harshness never pays, shares never beat wages, and what he's worth
// is minding the place while you're away); those of the household set to
// work at a business of yours (they live there, among its hands, drawing no
// wage but their keep, at every risk the household runs, and no better than
// a hired hand once the price and the risk are reckoned, as Franklin
// reckoned it in 1751); a house in the trade between the colonies (each
// colony's duties act by act, the crown's ports and the bans, named people
// with their families and shipmates, the odds shown are the odds rolled,
// families parted at the sale unless sold together, what people thought of
// it by the decade, the period's own voices); and the plumbing: shown where
// they live and work, nobody courts or hires them, saves and deltas, the
// world's luck untouched, the same game twice the same.

import { describe, expect, test } from "vitest";
import { presence } from "../../src/conquest/engine/Areas";
import { bondageFor } from "../../src/conquest/engine/Bondage";
import {
  ACRES_EACH,
  acresAt,
  AWAY_FACTOR,
  bondForecast,
  boundOf,
  CROP_EXCISE,
  deathChance,
  flightChance,
  healthTarget,
  keepOf,
  moodTarget,
  riseChance,
  seatSalt,
  workExpected,
  workOf,
} from "../../src/conquest/engine/BondCore";
import {
  houseOf,
  houseOutlook,
  nextManifest,
} from "../../src/conquest/engine/BondTrade";
import { handCount, propertyView } from "../../src/conquest/engine/Business";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { familyOf } from "../../src/conquest/engine/EventPacing";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { personCheck } from "../../src/conquest/engine/Interactions";
import {
  l2dice,
  overseerMonth,
  tidyBusinesses,
} from "../../src/conquest/engine/Labour2";
import {
  bizWorkCheck,
  handWays,
  hireOverseerCheck,
  overseerCandidates,
  overseerPlan,
  overseerWage,
} from "../../src/conquest/engine/Labour2Core";
import {
  LABOUR2_EVENTS,
  labour2Quiet,
} from "../../src/conquest/engine/Labour2Events";
import {
  atBusiness,
  BIZ_FLIGHT,
  bizEff,
  MANNERS,
  MOST_SHARES,
  overseerMind,
  overseerOf,
  overseerParts,
  overseerSkillX,
  RESTRAINT,
  shareOf,
  sharesAsked,
  underOverseer,
} from "../../src/conquest/engine/Labour2Rules";
import { ledgerForecast } from "../../src/conquest/engine/Ledger";
import { setFlow } from "../../src/conquest/engine/LedgerCore";
import type { LifeEventDef } from "../../src/conquest/engine/LifeEvents";
import { opinionOf, type Check } from "../../src/conquest/engine/LifeQueries";
import {
  BUSINESS_HANDS,
  HAND_TAKINGS,
} from "../../src/conquest/engine/LifeRules";
import { ageOf } from "../../src/conquest/engine/Queries";
import { Rng } from "../../src/conquest/engine/Rng";
import {
  FOOD,
  manifestFor,
  PART,
  PART_OLDER,
  passageModel,
  RISE_AWAY,
  rollPassage,
  routeCheck,
  saleModel,
  SIZES,
  voyageOutlook,
  type TradeRoute,
} from "../../src/conquest/engine/TradeCore";
import {
  buyAt,
  importDuty,
  localCoins,
  newOnly,
  sellAt,
} from "../../src/conquest/engine/TradeLaw";
import { REP_LINGERS, tradeStanding } from "../../src/conquest/engine/TradeRep";
import type {
  BondPolicy,
  BondWork,
  Character,
  Life,
  Overseer,
  OverseerManner,
  Property,
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
  o: { seed?: number; year?: number; purse?: number; french?: boolean } = {},
): { g: ConquestGame; life: Life } {
  const g = world({
    start: 1700,
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
  if (o.year) g.s.day = dayOf(o.year, 1, 2);
  const life = lifeOf(g);
  life.purse = o.purse ?? 3000;
  return { g, life };
}

let made = 0;

/** Someone in the household, made directly. */
function person(
  g: ConquestGame,
  life: Life,
  o: {
    age?: number;
    female?: boolean;
    work?: BondWork;
    mood?: number;
    health?: number;
    field?: number;
    craft?: number;
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
    first: `Q${made++}`,
    family: "",
  });
  c.bond = {
    status: "held",
    seat: life.seat,
    at: b.home,
    origin: "creole",
    faith: "own",
    health: o.health ?? 70,
    mood: o.mood ?? 50,
    sk: { field: o.field ?? 5, house: 3, craft: o.craft ?? 3 },
    work: o.work ?? "fields",
    since: g.s.day - 2000,
  };
  b.people.push(c.id);
  return c;
}

/** Why a check fails ("" when it passes). */
const why = (c: Check): string => (c.ok ? "" : c.why);

function cmd(g: ConquestGame, c: object, seat = "s1"): string | null {
  return g.lifeCommand(seat, c as Parameters<ConquestGame["lifeCommand"]>[1]);
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

function setPolicy(life: Life, p: Partial<BondPolicy>) {
  life.bondage!.policy = { ...life.bondage!.policy, ...p };
}

/** Settle everyone at the spirits and health their keeping tends to. */
function settle(g: ConquestGame, life: Life): void {
  for (let k = 0; k < 3; k++)
    for (const c of boundOf(g.s, life)) {
      c.bond!.mood = moodTarget(g.s, map, life, c).total;
      c.bond!.health = healthTarget(g.s, map, life, c).total;
    }
}

let bizId = 900;

/** A business of the household's at a town. */
function business(
  life: Life,
  home: number,
  o: { level?: number; job?: Property["job"]; hands?: number[] } = {},
): Property {
  const pr: Property = {
    id: bizId++,
    kind: "business",
    prov: home,
    level: o.level ?? 2,
    job: o.job ?? "craftsman",
    hands: o.hands ?? [],
    since: 0,
    name: "Shop",
  };
  life.property = [...(life.property ?? []), pr];
  return pr;
}

/** An overseer of the household, set directly (the hiring is tested apart). */
function giveOverseer(
  g: ConquestGame,
  life: Life,
  o: Partial<Overseer> & { manner: OverseerManner },
): Overseer {
  const b = life.bondage!;
  const owner = g.s.nations[g.s.provinces[b.home].owner];
  const c = makeCharacter(g.s, g.rng, {
    nation: owner.id,
    culture: owner.culture,
    religion: owner.religion,
    female: false,
    age: 35,
    first: "Edward",
    family: "Violet",
  });
  b.overseer = {
    c: c.id,
    skill: 8,
    pay: "wage",
    wage: overseerWage(8, false),
    shares: 1,
    since: g.s.day,
    orders: { work: "keep", rule: "his", report: true },
    ...o,
  };
  return b.overseer;
}

// ---------------------------------------------------------------- an overseer

describe("LABOUR2: an overseer", () => {
  test("three men for hire at the household's home each month, the same for everyone; nobody held, nobody to oversee", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    bondageFor(g, life);
    const none = overseerCandidates(g.s, map, life);
    expect(hireOverseerCheck(g.s, life, none[0]).ok).toBe(false);
    expect(why(hireOverseerCheck(g.s, life, none[0]))).toMatch(/holds no one/);
    for (let i = 0; i < 4; i++) person(g, life);
    const a = overseerCandidates(g.s, map, life);
    expect(a).toHaveLength(3);
    expect(overseerCandidates(g.s, map, life)).toEqual(a);
    for (const x of a) {
      expect(Object.keys(MANNERS)).toContain(x.manner);
      expect(x.wage).toBe(overseerWage(x.skill, false));
      expect(x.first.length).toBeGreaterThan(0);
    }
    // The Lowcountry paid its overseers more.
    expect(overseerWage(8, true)).toBeGreaterThan(overseerWage(8, false));
  });

  test("taken on for wages: a man of the town, whose wages are a fixed line, paid as forecast", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 4; i++) person(g, life);
    const cand = overseerCandidates(g.s, map, life)[0];
    expect(cmd(g, { k: "bond2", act: "hire", c: 0, pay: "wage" })).toBeNull();
    const o = overseerOf(g.s, life)!;
    expect(o.wage).toBe(cand.wage);
    expect(o.manner).toBe(cand.manner);
    const man = g.s.chars[o.c];
    expect(man.alive).toBe(true);
    expect(man.role).toBe("labourer");
    expect(g.s.locals[life.bondage!.home]).toContain(man.id);
    // Twice in a month: he's taken another place.
    expect(cmd(g, { k: "bond2", act: "hire", c: 0, pay: "wage" })).toMatch(
      /already|another place/,
    );
    const fc = ledgerForecast(g.s, g.w, life);
    expect(fc.lines.find((l) => l.key === "bond:overseer")!.value).toBe(
      -o.wage,
    );
    const was = life.purse;
    setFlow(g, null);
    overseerMonth(g, life);
    expect(was - life.purse).toBeCloseTo(o.wage, 6);
    expect(life.books!.lines.find((l) => l.k === "bond:overseer")!.v).toBe(
      -o.wage,
    );
  });

  test("shares: as many as come to his wages by the fields' expected crop, at most six; never fewer", () => {
    expect(sharesAsked(3, 8, 15.6)).toBe(2);
    expect(shareOf(2, 8) * 15.6).toBeGreaterThanOrEqual(3);
    expect(sharesAsked(3, 2, 2.5)).toBe(0);
    expect(sharesAsked(3, 0, 10)).toBe(0);
    expect(sharesAsked(3, 30, 10)).toBe(0);
    for (const [w, n, crop] of [
      [2.5, 3, 6],
      [3, 6, 11],
      [3.6, 12, 25],
      [2, 20, 40],
    ]) {
      const k = sharesAsked(w, n, crop);
      if (!k) continue;
      expect(k).toBeLessThanOrEqual(MOST_SHARES);
      expect(shareOf(k, n) * crop).toBeGreaterThanOrEqual(w - 1e-9);
      if (k > 1) expect(shareOf(k - 1, n) * crop).toBeLessThan(w);
    }
    // In a household: each man's shares come to his wages at least.
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 8; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    for (let i = 0; i < 8; i++) person(g, life, { age: 22 + i * 3 });
    settle(g, life);
    const crop = workExpected(g.s, map, life).fields * (1 - CROP_EXCISE);
    for (const x of overseerCandidates(g.s, map, life)) {
      expect(x.shares).toBeGreaterThan(0);
      expect(shareOf(x.shares, 8) * crop).toBeGreaterThanOrEqual(x.wage - 1e-9);
    }
    // Too small a crop: he won't take shares.
    const small = holder("jamestown", { year: 1730 });
    person(small.g, small.life, { age: 60, work: "house" });
    const c0 = overseerCandidates(small.g.s, map, small.life)[0];
    expect(c0.shares).toBe(0);
    expect(why(hireOverseerCheck(small.g.s, small.life, c0, "share"))).toMatch(
      /too small a crop/,
    );
  });

  test("harshness never pays: at the same pay a hard man nets least, under any keeping, at home or away; shares never beat wages", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 8; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    for (let i = 0; i < 8; i++)
      person(g, life, { age: 22 + i * 3, female: i % 3 === 0 });
    const b = life.bondage!;
    const away = P("massachusetts-bay");
    // Expected coins a month for the household: the crop (less his shares),
    // less the keep, his wages, and what flight and death take of a price.
    const net = (
      pol: Partial<BondPolicy>,
      ov: {
        manner: OverseerManner;
        pay: "wage" | "share";
        rule?: "his" | "restraint";
      } | null,
      abroad: boolean,
    ) => {
      setPolicy(life, pol);
      b.overseer = null;
      life.prov = b.home;
      settle(g, life);
      const crop0 = workExpected(g.s, map, life).fields * (1 - CROP_EXCISE);
      if (ov) {
        const wage = overseerWage(8, false);
        giveOverseer(g, life, {
          manner: ov.manner,
          pay: ov.pay,
          wage,
          shares: sharesAsked(wage, 8, crop0),
          orders: { work: "keep", rule: ov.rule ?? "his", report: true },
        });
      }
      life.prov = abroad ? away : b.home;
      settle(g, life);
      const o = overseerOf(g.s, life);
      const cut = o?.pay === "share" ? shareOf(o.shares, 8) : 0;
      let v = 0;
      for (const c of boundOf(g.s, life)) {
        v += workOf(g.s, map, life, c) * (1 - CROP_EXCISE) * (1 - cut);
        v -= keepOf(g.s, b.policy, c);
        v -=
          (flightChance(g.s, map, life, c).total * 0.4 +
            deathChance(g.s, map, life, c)) *
          48;
      }
      return v - (o?.pay === "wage" ? o.wage : 0);
    };
    for (const pol of [HARSH, CUSTOM, KIND])
      for (const abroad of [false, true])
        for (const pay of ["wage", "share"] as const) {
          const hard = net(pol, { manner: "hard", pay }, abroad);
          const steady = net(pol, { manner: "steady", pay }, abroad);
          const fair = net(pol, { manner: "fair", pay }, abroad);
          const held = net(
            pol,
            { manner: "hard", pay, rule: "restraint" },
            abroad,
          );
          expect(hard).toBeLessThan(steady);
          expect(steady).toBeLessThanOrEqual(fair + 0.05);
          expect(held).toBeGreaterThan(hard);
          if (pay === "share")
            for (const manner of ["hard", "steady", "fair"] as const)
              expect(net(pol, { manner, pay: "share" }, abroad)).toBeLessThan(
                net(pol, { manner, pay: "wage" }, abroad),
              );
        }
    // What he's worth is minding the place while you're away, kept as custom
    // keeps or better; a household kept harshly gains nothing from any of them.
    for (const pol of [CUSTOM, KIND])
      expect(net(pol, { manner: "fair", pay: "wage" }, true)).toBeGreaterThan(
        net(pol, null, true),
      );
    for (const manner of ["hard", "steady", "fair"] as const)
      expect(net(HARSH, { manner, pay: "wage" }, true)).toBeLessThan(
        net(HARSH, null, true),
      );
  });

  test("minding while you're away: his skill's share of the work, against three-quarters with nobody", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 2; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    const c = person(g, life);
    const b = life.bondage!;
    life.prov = b.home;
    const home = workOf(g.s, map, life, c);
    life.prov = P("massachusetts-bay");
    expect(workOf(g.s, map, life, c) / home).toBeCloseTo(AWAY_FACTOR, 6);
    giveOverseer(g, life, { manner: "fair", skill: 12 });
    expect(workOf(g.s, map, life, c) / home).toBeCloseTo(
      overseerMind(12) * overseerSkillX(12),
      6,
    );
    expect(overseerMind(12)).toBeGreaterThan(AWAY_FACTOR);
    expect(overseerMind(0)).toBeGreaterThan(AWAY_FACTOR);
  });

  test("his orders: restraint halves his harshness and his drive; shares make him drive them; a new bargain once in six months", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 6; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    for (let i = 0; i < 6; i++) person(g, life);
    settle(g, life);
    const o = giveOverseer(g, life, { manner: "hard", shares: 2 });
    const his = overseerParts(o);
    expect(his.mood[0][1]).toBe(MANNERS.hard.mood);
    expect(his.drive).toBe(MANNERS.hard.drive);
    expect(
      cmd(g, { k: "bond2", act: "orders", orders: { rule: "restraint" } }),
    ).toBeNull();
    const held = overseerParts(overseerOf(g.s, life)!);
    expect(held.mood[0][1]).toBe(Math.round(MANNERS.hard.mood * RESTRAINT));
    expect(held.drive).toBeCloseTo(1 + (MANNERS.hard.drive - 1) * RESTRAINT, 9);
    expect(cmd(g, { k: "bond2", act: "pay", pay: "share" })).toBeNull();
    const share = overseerParts(overseerOf(g.s, life)!);
    expect(share.mood.length).toBe(2);
    expect(cmd(g, { k: "bond2", act: "pay", pay: "wage" })).toMatch(
      /new bargain/,
    );
    // The household's month: his shares are a chance line from the fields' own
    // (and the fields are in the month's forecast, on the land really held).
    const fc = ledgerForecast(g.s, g.w, life);
    expect(
      fc.lines.find((l) => l.key === "bond:fields")?.value,
    ).toBeGreaterThan(0);
    const line = fc.lines.find((l) => l.key === "bond:overseer")!;
    expect(line.value).toBeLessThan(0);
    expect(line.chance).toBeDefined();
  });

  test("he sets the work: the fields while there are acres, a business of yours in the town, the house for two, rest for the young and the ill; never another town", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 2; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    const b = bondageFor(g, life);
    const room = Math.floor(acresAt(life, b.home) / ACRES_EACH);
    expect(room).toBeGreaterThan(0);
    const strong = Array.from({ length: room }, (_, i) =>
      person(g, life, { field: 9 - (i % 3), work: "rest" }),
    );
    const child = person(g, life, { age: 8, work: "fields" });
    const ill = person(g, life, { health: 20, work: "fields" });
    const smith = person(g, life, { craft: 6, field: 1, work: "rest" });
    const cook = person(g, life, { field: 1, craft: 1, work: "rest" });
    const here = business(life, b.home, { level: 1 });
    const there = business(life, P("new-amsterdam"), { level: 1 });
    const plan = overseerPlan(g.s, map, life);
    const workOfPlan = (c: Character) => plan.find((x) => x.c === c.id)!;
    expect(workOfPlan(child).work).toBe("rest");
    expect(workOfPlan(ill).work).toBe("rest");
    // The best field hands get the fields, as many as there are acres for.
    expect(
      plan
        .filter((x) => x.work === "fields")
        .map((x) => x.c)
        .sort(),
    ).toEqual(strong.map((c) => c.id).sort());
    expect(workOfPlan(smith)).toMatchObject({ work: "biz", biz: here.id });
    expect(plan.some((x) => x.biz === there.id)).toBe(false);
    expect(workOfPlan(cook).work).toBe("house");
    // Kept as you set it: nothing moves.
    giveOverseer(g, life, { manner: "steady" });
    overseerMonth(g, life);
    expect(smith.bond!.work).toBe("rest");
    // Given leave to set it: he does.
    expect(
      cmd(g, { k: "bond2", act: "orders", orders: { work: "assign" } }),
    ).toBeNull();
    overseerMonth(g, life);
    expect(smith.bond!.work).toBe("biz");
    expect(here.biz?.bound).toContain(smith.id);
    expect(child.bond!.work).toBe("rest");
    expect(life.journal.some((j) => /sets the work/.test(j.text))).toBe(true);
    // He never has charge of those at a business.
    expect(underOverseer(g.s, life, smith)).toBeUndefined();
    expect(underOverseer(g.s, life, strong[0])).toBeDefined();
  });

  test("two months unpaid and he leaves; let go, he stays a man of the town", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 3; i++) person(g, life);
    const o = giveOverseer(g, life, { manner: "steady" });
    life.purse = 0;
    overseerMonth(g, life);
    expect(overseerOf(g.s, life)?.owed).toBe(1);
    overseerMonth(g, life);
    expect(overseerOf(g.s, life)).toBeUndefined();
    expect(life.journal.some((j) => /two months unpaid/.test(j.text))).toBe(
      true,
    );
    life.purse = 500;
    const o2 = giveOverseer(g, life, { manner: "fair" });
    expect(cmd(g, { k: "bond2", act: "dismiss" })).toBeNull();
    expect(life.bondage!.overseer).toBeNull();
    expect(g.s.chars[o2.c].alive).toBe(true);
    expect(g.s.chars[o.c].alive).toBe(true);
  });
});

// ---------------------------------------------------------------- at a business

describe("LABOUR2: those held, at a business of yours", () => {
  test("who may go: fourteen and over, well enough, where the law allows them to be held, while there's a place", () => {
    const { g, life } = holder("charles-town", { year: 1740 });
    const b = bondageFor(g, life);
    const pr = business(life, b.home, { level: 1 });
    expect(
      why(bizWorkCheck(g.s, map, life, person(g, life, { age: 12 }), pr)),
    ).toMatch(/fourteen|14/);
    expect(
      why(bizWorkCheck(g.s, map, life, person(g, life, { health: 20 }), pr)),
    ).toMatch(/ill/);
    const a = person(g, life);
    expect(bizWorkCheck(g.s, map, life, a, pr).ok).toBe(true);
    // Georgia's Trustees allowed nobody to be held there until 1751.
    const guale = P("guale");
    g.s.provinces[guale].owner = g.s.provinces[b.home].owner;
    const ga = business(life, guale, { level: 1 });
    expect(why(bizWorkCheck(g.s, map, life, a, ga))).toMatch(/doesn't allow/);
    // A full place.
    for (let i = 0; i < BUSINESS_HANDS[1]; i++) {
      const x = person(g, life);
      expect(cmd(g, { k: "bond2", act: "biz", c: x.id, id: pr.id })).toBeNull();
    }
    expect(why(bizWorkCheck(g.s, map, life, a, pr))).toMatch(/full/);
  });

  test("set to work there: they live there among its hands, with no wage but their keep; away from their family, they're parted and grieve", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    const b = bondageFor(g, life);
    const ny = P("new-amsterdam");
    const pr = business(life, ny, { level: 2 });
    const man = person(g, life, { age: 30, work: "house" });
    const wife = person(g, life, { age: 28, female: true, work: "house" });
    man.spouse = wife.id;
    wife.spouse = man.id;
    expect(cmd(g, { k: "bond2", act: "biz", c: man.id, id: pr.id })).toBeNull();
    expect(man.bond).toMatchObject({ work: "biz", biz: pr.id, at: ny });
    expect(atBusiness(man)).toBe(true);
    expect(pr.biz!.bound).toEqual([man.id]);
    expect(handCount(pr)).toBe(1);
    expect(man.bond!.grief).toBeGreaterThan(g.s.day);
    expect(wife.bond!.grief).toBeGreaterThan(g.s.day);
    expect(life.journal.some((j) => /away from/.test(j.text))).toBe(true);
    // The household keeps the one at home; the business keeps him.
    const keep = bondForecast(g.s, life, g.w).find(
      (x) => x.key === "bond:keep",
    )!;
    expect(keep.label).toMatch(/1 in your household/);
    const v = propertyView(g.s, life, pr);
    expect(v.bound).toBeCloseTo(keepOf(g.s, b.policy, man), 2);
    expect(v.wages).toBe(0);
    expect(v.input.bound?.eff).toBeCloseTo(bizEff(man.bond!), 2);
    expect(v.profit).toBeCloseTo(
      v.takings - v.wages - v.upkeep - v.excise - v.staff - v.bound,
      2,
    );
    // Shown where he works.
    const where = [...presence(g.s, g.w, ny).values()].flat();
    const seen = where.find((x) => x.c === man.id);
    expect(seen?.kind).toBe("bound");
    expect(seen?.doing).toMatch(/at work/);
    // Brought home.
    expect(cmd(g, { k: "bond2", act: "biz", c: man.id, id: -1 })).toBeNull();
    expect(man.bond).toMatchObject({ work: "rest", at: b.home });
    expect(man.bond!.biz).toBeUndefined();
    expect(pr.biz?.bound).toBeUndefined();
  });

  test("every risk the household runs, and more chances to go in a town", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    const b = bondageFor(g, life);
    const pr = business(life, b.home, { level: 2 });
    const c = person(g, life, { age: 25, work: "house" });
    settle(g, life);
    const f0 = flightChance(g.s, map, life, c).total;
    const d0 = deathChance(g.s, map, life, c);
    expect(cmd(g, { k: "bond2", act: "biz", c: c.id, id: pr.id })).toBeNull();
    c.bond!.mood = 50;
    c.bond!.grief = undefined;
    const back = { ...c, bond: { ...c.bond!, work: "house" as BondWork } };
    delete back.bond.biz;
    expect(flightChance(g.s, map, life, c).total).toBeCloseTo(
      flightChance(g.s, map, life, back).total * BIZ_FLIGHT,
      4,
    );
    expect(f0).toBeGreaterThan(0);
    expect(deathChance(g.s, map, life, c)).toBeGreaterThan(0);
    expect(d0).toBeGreaterThan(0);
  });

  test("no better than a hired hand once the price and the risk are reckoned (Franklin, 1751): kept well about the same, by custom less, harshly far less", () => {
    const { g, life } = holder("jamestown", { year: 1740 });
    const b = bondageFor(g, life);
    const pr = business(life, b.home, { level: 2 });
    for (const craft of [3, 8]) {
      const c = person(g, life, { age: 25, craft, work: "rest" });
      expect(cmd(g, { k: "bond2", act: "biz", c: c.id, id: pr.id })).toBeNull();
      const at = (pol: Partial<BondPolicy>) => {
        setPolicy(life, pol);
        settle(g, life);
        return handWays(g.s, map, life, pr, HAND_TAKINGS, c);
      };
      const harsh = at(HARSH);
      const custom = at(CUSTOM);
      const kind = at(KIND);
      expect(harsh.bound!.net).toBeLessThan(custom.bound!.net);
      expect(custom.bound!.net).toBeLessThan(kind.bound!.net);
      expect(custom.bound!.net).toBeLessThan(custom.hired.net);
      expect(Math.abs(kind.bound!.net - kind.hired.net)).toBeLessThan(0.35);
      // The same person's price, however they're kept.
      expect(harsh.price).toBe(kind.price);
      cmd(g, { k: "bond2", act: "biz", c: c.id, id: -1 });
    }
  });

  test("anyone gone from the household comes off the books; a business gone sends them home", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    const b = bondageFor(g, life);
    const pr = business(life, b.home, { level: 2 });
    const a = person(g, life);
    const c = person(g, life);
    cmd(g, { k: "bond2", act: "biz", c: a.id, id: pr.id });
    cmd(g, { k: "bond2", act: "biz", c: c.id, id: pr.id });
    a.alive = false;
    tidyBusinesses(g, life);
    expect(pr.biz!.bound).toEqual([c.id]);
    life.property = (life.property ?? []).filter((x) => x.id !== pr.id);
    tidyBusinesses(g, life);
    expect(c.bond!.work).toBe("rest");
    expect(c.bond!.at).toBe(b.home);
  });
});

// ---------------------------------------------------------------- the law of the trade

describe("LABOUR2: a house in the trade, under the law", () => {
  test("only between ports of your own crown where people were sold, lawful at both ends", () => {
    const { g } = holder("charles-town", { year: 1730 });
    expect(buyAt(g.s, map, "english", P("jamaica")).ok).toBe(true);
    expect(sellAt(g.s, map, "english", P("charles-town")).ok).toBe(true);
    expect(sellAt(g.s, map, "english", P("havana")).why).toMatch(/asiento/);
    expect(buyAt(g.s, map, "english", P("martinique")).ok).toBe(false);
    expect(sellAt(g.s, map, "english", P("cahokia")).ok).toBe(false);
    // Louisiana's trade was the Company of the Indies' alone until 1731.
    g.s.provinces[P("bayogoula")].owner = g.s.provinces[P("martinique")].owner;
    expect(
      sellAt(g.s, map, "french", P("bayogoula"), dayOf(1725, 5, 1)).why,
    ).toMatch(/Company of the Indies/);
    // The Association: no more brought in from 1 December 1774; the islands still took them.
    const jan75 = dayOf(1775, 0, 10);
    expect(sellAt(g.s, map, "english", P("jamestown"), jan75).ok).toBe(false);
    expect(sellAt(g.s, map, "english", P("jamaica"), jan75).ok).toBe(true);
    g.s.day = jan75;
    expect(
      routeCheck(g.s, map, "english", {
        from: P("jamaica"),
        to: P("jamestown"),
        size: 12,
      }).why,
    ).toMatch(/Association/);
  });

  test("each colony's duty, act by act, in its own money (Du Bois, Appendix A; Turner for Pennsylvania)", () => {
    const on = { price: 50, fresh: true, age: 25 };
    const duty = (
      col: Parameters<typeof importDuty>[0],
      y: number,
      m = 6,
      o = on,
    ) => importDuty(col, "english", y, m, o);
    // Virginia: 20s. a head from 1699; a share of the price from 1732.
    expect(duty("virginia", 1705).coins).toBeCloseTo(
      localCoins("virginia", 1705, 1),
      2,
    );
    expect(duty("virginia", 1728).coins).toBe(0);
    expect(duty("virginia", 1735).coins).toBeCloseTo(2.5, 2);
    expect(duty("virginia", 1757).coins).toBeCloseTo(10, 2);
    expect(duty("virginia", 1757).prohibitive).toBe(true);
    expect(duty("virginia", 1759, 1).coins).toBeCloseTo(15, 2);
    expect(duty("virginia", 1765).coins).toBeCloseTo(5, 2);
    // South Carolina: prohibitive after Stono and from 1766 to 1768; £50 on the seasoned; by age and height.
    expect(duty("southcarolina", 1742).prohibitive).toBe(true);
    expect(duty("southcarolina", 1767).prohibitive).toBe(true);
    expect(duty("southcarolina", 1752).prohibitive).toBe(false);
    expect(duty("southcarolina", 1752).coins).toBeCloseTo(
      localCoins("southcarolina", 1752, 10),
      2,
    );
    expect(
      duty("southcarolina", 1752, 6, { price: 50, fresh: false, age: 25 })
        .coins,
    ).toBeCloseTo(localCoins("southcarolina", 1752, 60), 2);
    expect(
      duty("southcarolina", 1752, 6, { price: 12, fresh: true, age: 6 }).coins,
    ).toBeCloseTo(localCoins("southcarolina", 1752, 2.5), 2);
    expect(
      duty("southcarolina", 1725, 6, { price: 12, fresh: true, age: 6 }).coins,
    ).toBeCloseTo(localCoins("southcarolina", 1725, 5), 2);
    // Pennsylvania: the £20 of 1712, disallowed; £2 for a generation; £20 again from 1773.
    expect(duty("pennsylvania", 1712, 8).prohibitive).toBe(true);
    expect(duty("pennsylvania", 1740).coins).toBeCloseTo(
      localCoins("pennsylvania", 1740, 2),
      2,
    );
    expect(duty("pennsylvania", 1774).prohibitive).toBe(true);
    // New England and New York.
    expect(duty("massachusetts", 1710).coins).toBeCloseTo(
      localCoins("massachusetts", 1710, 4),
      2,
    );
    expect(duty("rhodeisland", 1720).coins).toBeGreaterThan(0);
    expect(duty("rhodeisland", 1740).coins).toBe(0);
    expect(duty("newyork", 1720).coins).toBeGreaterThan(0);
    // Every part names its act and its year; no other crown's in the sources.
    for (const col of [
      "virginia",
      "maryland",
      "southcarolina",
      "pennsylvania",
      "newjersey",
      "newyork",
      "massachusetts",
      "rhodeisland",
    ] as const)
      for (let y = 1700; y <= 1775; y += 3)
        for (const part of duty(col, y).parts)
          expect(part.law, `${col} ${y}`).toMatch(/1[67]\d\d/);
    expect(importDuty("louisiana", "french", 1750, 6, on).coins).toBe(0);
    // A factor buying for Charles Town buys only new arrivals.
    const { g } = holder("charles-town", { year: 1752 });
    expect(newOnly(g.s, map, P("charles-town"))).toBe(true);
    expect(newOnly(g.s, map, P("jamestown"))).toBe(false);
  });
});

// ---------------------------------------------------------------- the people, the passage, the sale

describe("LABOUR2: a house in the trade: the people, the passage, the sale", () => {
  test("the factor's people are named, with mothers and children, husbands and wives, sisters, brothers and shipmates; the same for everyone, different for each house", () => {
    const { g, life } = holder("charles-town", { year: 1752 });
    const day = g.s.day;
    const a = manifestFor(g.s, map, P("jamaica"), day, 24, 1);
    expect(a).toHaveLength(24);
    expect(manifestFor(g.s, map, P("jamaica"), day, 24, 1)).toEqual(a);
    expect(
      manifestFor(g.s, map, P("jamaica"), day, 24, 2).map((x) => x.n),
    ).not.toEqual(a.map((x) => x.n));
    const pairs: Record<string, string> = {
      child: "mother",
      mother: "child",
      wife: "husband",
      husband: "wife",
      shipmate: "shipmate",
    };
    for (const [i, p] of a.entries()) {
      expect(p.n.length).toBeGreaterThan(0);
      expect(p.paid).toBeGreaterThan(0);
      if (p.kin === undefined) continue;
      expect(a[p.kin].kin).toBe(i);
      if (pairs[p.rel!]) expect(a[p.kin].rel).toBe(pairs[p.rel!]);
    }
    expect(a.some((p) => p.kin !== undefined)).toBe(true);
    // Only new arrivals for a port that taxes the seasoned heavily.
    expect(
      manifestFor(g.s, map, P("jamaica"), day, 40, 3, true).every(
        (p) => p.fresh,
      ),
    ).toBe(true);
    const r: TradeRoute = {
      from: P("jamaica"),
      to: P("charles-town"),
      size: 12,
      food: 1,
      together: false,
    };
    expect(nextManifest(g.s, g.w, life, r).every((p) => p.fresh)).toBe(true);
    expect(seatSalt("s1")).not.toBe(seatSalt("s2"));
  });

  test("the odds shown are the odds rolled: deaths and risings over many passages", () => {
    const { g } = holder("charles-town", { year: 1752 });
    const r: TradeRoute = {
      from: P("jamaica"),
      to: P("charles-town"),
      size: 40,
      food: 0,
      together: false,
    };
    const people = manifestFor(g.s, map, r.from, g.s.day, r.size, 5);
    const pm = passageModel(g.s, g.w, r, people);
    const shownDeaths = pm.q.reduce((m, q) => m + q, 0);
    let deaths = 0;
    let rises = 0;
    let away = 0;
    const N = 20000;
    const rng = new Rng({ rng: 12345 });
    for (let i = 0; i < N; i++) {
      const x = rollPassage(rng, pm);
      deaths += x.dead.filter(Boolean).length;
      if (x.rose) rises++;
      if (x.away) away++;
    }
    expect(deaths / N / shownDeaths).toBeGreaterThan(0.95);
    expect(deaths / N / shownDeaths).toBeLessThan(1.05);
    expect(rises / N).toBeCloseTo(pm.rise, 2);
    expect(away / Math.max(1, rises)).toBeGreaterThan(RISE_AWAY - 0.05);
    expect(away / Math.max(1, rises)).toBeLessThan(RISE_AWAY + 0.05);
    // Scant provisions: more deaths and more risings.
    const ample = passageModel(g.s, g.w, { ...r, food: 2 }, people);
    expect(ample.q[0]).toBeLessThan(pm.q[0]);
    expect(ample.rise).toBeLessThan(pm.rise);
    expect(FOOD[0].death).toBeGreaterThan(FOOD[2].death);
    // The outlook's outcomes cover everything that can happen.
    const o = voyageOutlook(g.s, g.w, undefined, r, people, 3);
    expect(o.view.outcomes.reduce((m, x) => m + x.p, 0)).toBeCloseTo(1, 3);
    expect(o.deaths).toBeCloseTo(shownDeaths, 1);
  });

  test("sold to whoever bids most, families are likely parted; sold together, never", () => {
    const { g } = holder("charles-town", { year: 1752 });
    const r: TradeRoute = {
      from: P("jamaica"),
      to: P("charles-town"),
      size: 40,
      food: 1,
      together: false,
    };
    const people = manifestFor(g.s, map, r.from, g.s.day, r.size, 9);
    const sm = saleModel(g.s, map, undefined, r, people);
    for (const [i, p] of people.entries()) {
      if (p.kin === undefined) expect(sm.part[i]).toBe(0);
      else if (p.rel === "wife" || p.rel === "husband")
        expect(sm.part[i]).toBe(PART.wife);
      else if (p.rel === "shipmate") expect(sm.part[i]).toBe(PART.shipmate);
      else if (p.rel === "mother" || p.rel === "child") {
        const kid = p.rel === "mother" ? p : people[p.kin];
        expect(sm.part[i]).toBe(kid.a >= 8 ? PART_OLDER : PART.mother);
      }
    }
    const together = saleModel(
      g.s,
      map,
      undefined,
      { ...r, together: true },
      people,
    );
    expect(together.part.every((x) => x === 0)).toBe(true);
    expect(together.price.reduce((m, v) => m + v, 0)).toBeLessThan(
      sm.price.reduce((m, v) => m + v, 0),
    );
  });
});

// ---------------------------------------------------------------- a voyage

/** Tick until a test holds, or a limit. */
function until(g: ConquestGame, f: () => boolean, max = 200): void {
  for (let i = 0; i < max && !f(); i++) g.tick();
}

function trading(year = 1752, seed = 11) {
  const { g, life } = holder("charles-town", { year, seed });
  const route = {
    from: P("jamaica"),
    to: P("charles-town"),
    size: 12,
    food: 1 as const,
    together: false,
    every: 3,
  };
  return { g, life, route };
}

describe("LABOUR2: a voyage, from the counting room to the sale", () => {
  test("set up, sailed, landed and sold: every name with what became of them, and the money under the house's own line", () => {
    const { g, life, route } = trading();
    const purse = life.purse;
    expect(cmd(g, { k: "bond2", act: "found", route })).toBeNull();
    const h = houseOf(life)!;
    expect(h.name).toMatch(/& Company/);
    expect(purse - life.purse).toBe(15);
    expect(life.books!.lines.find((l) => l.k === "bond:trade")!.v).toBe(-15);
    expect(
      ledgerForecast(g.s, g.w, life).lines.some((l) => l.key === "bond:trade"),
    ).toBe(true);
    // The same people the page showed.
    const shown = nextManifest(g.s, g.w, life).map((p) => p.n);
    until(g, () => !!h.voyage);
    const v = h.voyage!;
    expect(v.people.map((p) => p.n)).toEqual(shown);
    expect(life.books!.lines.find((l) => l.k === "bond:trade")!.v).toBeCloseTo(
      -15 - v.cost,
      1,
    );
    // Landed; a family's plea, if a family is aboard: left to the factor.
    until(g, () => v.landed !== undefined || !h.voyage);
    const plea = life.events.find((e) => e.key === "bond-tr-plea");
    if (plea) expect(cmd(g, { k: "event", id: plea.id, choice: 2 })).toBeNull();
    until(g, () => !h.voyage, 120);
    expect(h.voyage).toBeNull();
    expect(h.past).toHaveLength(1);
    const done = h.past[0];
    for (const p of done.people) expect(p.fate).toBeDefined();
    const t = h.totals;
    expect(t.voyages).toBe(1);
    expect(t.carried).toBe(12);
    expect(t.died + t.sold + t.free + t.taken).toBe(12);
    for (const p of done.people.filter((x) => x.fate === "sold")) {
      expect(p.to).toBeTruthy();
      expect(p.got).toBeGreaterThan(0);
    }
    expect(done.log.length).toBeGreaterThan(2);
    if (t.sold) expect(h.glut?.[route.to]).toBeGreaterThan(0);
    expect(life.journal.some((j) => j.text.includes(h.name))).toBe(true);
  }, 60_000);

  test("a family's plea: taken into your own household, together, as people of the household", () => {
    // Find a voyage with a family aboard (the manifest is known beforehand).
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { g, life, route } = trading(1752, seed);
      const people = nextManifest(g.s, g.w, life, route);
      if (!people.some((p) => p.kin !== undefined && p.rel !== "shipmate"))
        continue;
      expect(cmd(g, { k: "bond2", act: "found", route })).toBeNull();
      const h = houseOf(life)!;
      until(g, () => !!h.voyage);
      const v = h.voyage!;
      until(g, () => v.landed !== undefined || !h.voyage);
      const plea = life.events.find((e) => e.key === "bond-tr-plea");
      if (!plea) continue; // a death or a rising took them
      const { i, j } = plea.ctx as { i: number; j: number };
      expect(cmd(g, { k: "event", id: plea.id, choice: 1 })).toBeNull();
      expect(v.people[i].fate).toBe("kept");
      expect(v.people[j].fate).toBe("kept");
      const held = boundOf(g.s, life);
      const a = held.find((c) => c.first === v.people[i].n)!;
      const b = held.find((c) => c.first === v.people[j].n)!;
      expect(a && b).toBeTruthy();
      const linked =
        a.spouse === b.id || b.mother === a.id || a.mother === b.id;
      if (v.people[i].rel !== "sister" && v.people[i].rel !== "brother")
        expect(linked).toBe(true);
      expect(a.bond!.at).toBe(life.bondage!.home);
      until(g, () => !h.voyage, 120);
      expect(h.totals.parted % 2).toBe(0);
      return;
    }
    throw new Error("no voyage with a family aboard");
  }, 120_000);

  test("sold together, as one lot each: nobody parted", () => {
    const { g, life, route } = trading(1752, 13);
    expect(
      cmd(g, { k: "bond2", act: "found", route: { ...route, together: true } }),
    ).toBeNull();
    const h = houseOf(life)!;
    until(g, () => !!h.voyage);
    until(g, () => !h.voyage, 200);
    expect(h.totals.parted).toBe(0);
    expect(h.past[0].people.every((p) => !p.parted)).toBe(true);
  }, 60_000);

  test("wound up: at once in port, or when the voyage at sea is done; its name lingers, at half, for three years", () => {
    const { g, life, route } = trading(1752, 14);
    expect(cmd(g, { k: "bond2", act: "found", route })).toBeNull();
    const h = houseOf(life)!;
    until(g, () => !!h.voyage);
    expect(cmd(g, { k: "bond2", act: "close" })).toBeNull();
    expect(h.ending).toBeDefined();
    expect(houseOf(life)).toBeDefined();
    expect(cmd(g, { k: "bond2", act: "on" })).toMatch(/wound up/);
    until(g, () => !h.voyage, 200);
    expect(h.closed).toBeDefined();
    expect(houseOf(life)).toBeUndefined();
    // What a minister thinks of it, now and three years on.
    const owner = g.s.nations[g.s.provinces[life.home].owner];
    const minister = makeCharacter(g.s, g.rng, {
      nation: owner.id,
      culture: owner.culture,
      religion: owner.religion,
      female: false,
      age: 50,
      first: "Josiah",
      family: "Cotton",
    });
    minister.role = "preacher";
    const part = () =>
      opinionOf(g.s, minister, life).parts.find((x) =>
        /Deals in people/.test(x.label),
      )?.value ?? 0;
    expect(part()).toBeLessThan(0);
    g.s.day += REP_LINGERS * 365 + 5;
    expect(part()).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------- what people thought

describe("LABOUR2: what people thought of a house in the trade", () => {
  test("the conscientious more set against it each decade; the Friends' colonies before the rest; its own world thought it business until the 1760s", () => {
    const years = [1730, 1750, 1760, 1770, 1774];
    const c = years.map((y) => tradeStanding(y, "virginia").conscience);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]);
    for (const y of years)
      expect(tradeStanding(y, "pennsylvania").others).toBeLessThanOrEqual(
        tradeStanding(y, "virginia").others,
      );
    expect(tradeStanding(1730, "virginia").trade).toBeGreaterThan(0);
    expect(tradeStanding(1770, "virginia").trade).toBe(0);
    expect(tradeStanding(1774, "virginia").others).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------- the scenes

const BY_KEY = new Map(LABOUR2_EVENTS.map((e) => [e.key, e]));
const VOICES = [
  "bond-tr-sewall",
  "bond-tr-pillar",
  "bond-tr-friends",
  "bond-tr-laurens",
  "bond-tr-benezet",
  "bond-tr-hopkins",
  "bond-tr-burgesses",
  "bond-tr-defence",
  "bond-tr-rush",
  "bond-tr-committee",
];

const labelOf = (
  g: ConquestGame,
  life: Life,
  ch: LifeEventDef["choices"][number],
) => (typeof ch.label === "function" ? ch.label(g, life, {}) : ch.label);

describe("LABOUR2: the scenes and the period's voices", () => {
  test("every scene is placed and paced: drawn ones say where, every one in a family, the raised ones answer themselves quietly", () => {
    const quiet = labour2Quiet();
    for (const e of LABOUR2_EVENTS) {
      expect(familyOf(e.key, e.pool), e.key).toBeDefined();
      if (e.pool === "any") expect(e.where, e.key).toBeDefined();
      else expect(quiet[e.key], e.key).toBeDefined();
    }
  });

  test("the voices come only to a house in the trade, where and when they were heard", () => {
    const { g, life } = holder("upland", { year: 1773 });
    const rush = BY_KEY.get("bond-tr-rush")!;
    const laurens = BY_KEY.get("bond-tr-laurens")!;
    expect(rush.when!(g, life)).toBeNull();
    life.bondTrade = {
      name: "Drackley & Company",
      founded: g.s.day,
      law: "english",
      col: "pennsylvania",
      from: P("jamaica"),
      to: P("upland"),
      size: 12,
      every: 3,
      food: 1,
      together: false,
      on: true,
      next: g.s.day + 30,
      voyage: null,
      past: [],
      totals: {
        voyages: 0,
        carried: 0,
        died: 0,
        sold: 0,
        parted: 0,
        free: 0,
        rose: 0,
        taken: 0,
        net: 0,
      },
    };
    expect(rush.when!(g, life)).not.toBeNull();
    expect(laurens.when!(g, life)).toBeNull();
    g.s.day = dayOf(1764, 3, 1);
    life.bondTrade.col = "southcarolina";
    life.bondTrade.to = P("charles-town");
    expect(laurens.when!(g, life)).not.toBeNull();
  });

  test("each voice against the trade lets you give it up; nothing pays you for siding with it", () => {
    for (const key of [
      "bond-tr-sewall",
      "bond-tr-laurens",
      "bond-tr-benezet",
      "bond-tr-hopkins",
      "bond-tr-burgesses",
      "bond-tr-rush",
    ]) {
      const { g, life, route } = trading(1752, 21);
      expect(cmd(g, { k: "bond2", act: "found", route })).toBeNull();
      const e = BY_KEY.get(key)!;
      const i = e.choices.findIndex((ch) =>
        /give (the trade|it) up|do as he did|house will stop|stop your own/i.test(
          labelOf(g, life, ch),
        ),
      );
      expect(i, key).toBeGreaterThanOrEqual(0);
      const renown = life.renown;
      e.choices[i].apply(g, life, {}, false);
      expect(houseOf(life), key).toBeUndefined();
      expect(life.renown).toBeGreaterThanOrEqual(renown);
    }
    // Siding with the trade earns no relief from the arguments against it.
    for (const key of VOICES) {
      const { g, life, route } = trading(1752, 22);
      cmd(g, { k: "bond2", act: "found", route });
      const e = BY_KEY.get(key)!;
      for (const ch of e.choices) {
        const label = labelOf(g, life, ch);
        if (!/meddler|counting room|Nisbet|correspondents/i.test(label))
          continue;
        const stress = life.stress;
        ch.apply(g, life, {}, false);
        expect(life.stress, `${key}: ${label}`).toBeGreaterThanOrEqual(stress);
      }
    }
  });

  test("word from the quarters about a hard man: order him to restraint, let him go, or let it stand", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    const c = person(g, life);
    person(g, life);
    giveOverseer(g, life, { manner: "hard" });
    const e = BY_KEY.get("bond-ov-word")!;
    const body =
      typeof e.body === "function" ? e.body(g, life, { c: c.id }) : e.body;
    expect(body).toContain("Edward Violet");
    e.choices[0].apply(g, life, { c: c.id }, false);
    expect(overseerOf(g.s, life)!.orders.rule).toBe("restraint");
    e.choices[1].apply(g, life, { c: c.id }, false);
    expect(overseerOf(g.s, life)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- the plumbing

describe("LABOUR2: in their places, saves, the world's luck", () => {
  test("those held are shown where they live and work; nobody courts, hires or bargains with them", () => {
    const { g, life } = holder("jamestown", { year: 1730 });
    for (let i = 0; i < 2; i++)
      g.lifeCommand("s1", { k: "property", act: "land" } as never);
    const c = person(g, life, { work: "fields" });
    const kid = person(g, life, { age: 2, work: "rest" });
    g.s.day = dayOf(1730, 2, 3);
    if (((g.s.day % 7) + 7) % 7 === 0) g.s.day++;
    const here = [
      ...presence(g.s, g.w, life.bondage!.home, g.s.day, life).values(),
    ].flat();
    expect(here.find((x) => x.c === c.id)?.kind).toBe("bound");
    expect(here.some((x) => x.c === kid.id)).toBe(false);
    for (const act of ["court", "hire", "talk", "tryst", "work"] as const)
      expect(personCheck(g.s, life, c.id, act).ok, act).toBe(false);
  });

  test("an old save loads and runs; an overseer, a business's people and a house survive a save and the delta", () => {
    const { g, life, route } = trading(1752, 31);
    // An old save: none of it.
    const old = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    old.aiEnabled = false;
    for (let i = 0; i < 40; i++) old.tick();
    expect(lifeOf(old).bondTrade).toBeUndefined();
    // With it.
    for (let i = 0; i < 3; i++) person(g, life);
    const c = person(g, life);
    const pr = business(life, life.bondage!.home, { level: 2 });
    const client = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    expect(cmd(g, { k: "bond2", act: "hire", c: 1, pay: "wage" })).toBeNull();
    expect(cmd(g, { k: "bond2", act: "biz", c: c.id, id: pr.id })).toBeNull();
    expect(cmd(g, { k: "bond2", act: "found", route })).toBeNull();
    applyDelta(client, g.takeDelta());
    const seen = lifeOf({ s: client } as ConquestGame);
    expect(seen.bondage!.overseer?.c).toBe(life.bondage!.overseer!.c);
    expect(seen.bondTrade?.name).toBe(life.bondTrade!.name);
    expect(client.chars[c.id].bond.work).toBe("biz");
    expect(seen.property!.find((x) => x.id === pr.id)!.biz!.bound).toEqual([
      c.id,
    ]);
    const loaded = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    loaded.aiEnabled = false;
    for (let i = 0; i < 40; i++) loaded.tick();
    expect(houseOf(lifeOf(loaded))).toBeDefined();
  }, 60_000);

  test("LABOUR2 rolls on its own dice: looking at the trade or an overseer moves nobody's luck", () => {
    const { g, life, route } = trading(1752, 41);
    for (let i = 0; i < 4; i++) person(g, life);
    const was = JSON.stringify(g.s.rng);
    overseerCandidates(g.s, map, life);
    nextManifest(g.s, g.w, life, route);
    houseOutlook(g.s, g.w, life, route, 3);
    l2dice(g.s, 5).next();
    riseChance(g.s, map, life);
    expect(JSON.stringify(g.s.rng)).toBe(was);
  });

  test("the same game twice: the same voyages, the same names, the same fates", () => {
    const run = () => {
      const { g, life, route } = trading(1752, 51);
      cmd(g, { k: "bond2", act: "found", route });
      for (let i = 0; i < 90; i++) g.tick();
      return JSON.stringify(life.bondTrade);
    };
    expect(run()).toBe(run());
  }, 60_000);

  test("sizes are the trade's own: a few aboard, or a few dozen", () => {
    expect(SIZES[0]).toBeGreaterThanOrEqual(6);
    expect(SIZES[SIZES.length - 1]).toBeLessThanOrEqual(40);
    void ageOf;
  });
});
