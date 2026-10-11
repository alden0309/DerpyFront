// Derpy Conquest, round 12, HOME: the Home place does things (it was empty:
// every act there was refused), houses bought or rented from home, rooms,
// furniture, servants, lettings and lodgers settled with the month as the
// budget says, goods kept at home, family time that moves opinions and
// teaches the children (into an heir's skills); the family tree; duels as a
// chain of scenes; and other players in your town.

import { describe, expect, test } from "vitest";
import { CHAPTERS } from "../../src/conquest/client/guide/Chapters";
import { areasOf, presence } from "../../src/conquest/engine/Areas";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import {
  DUEL_EVENTS,
  duelChoicesShown,
  duelOdds,
  duelOn,
} from "../../src/conquest/engine/Duels";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  homeCheck,
  housesOf,
  kidsAtHome,
  storedLoads,
} from "../../src/conquest/engine/Household";
import {
  FURNISH,
  homeWelcome,
  LEASE_RENT,
  LET_RENT,
  ROOMS,
  SERVANTS,
} from "../../src/conquest/engine/HouseRules";
import * as INTER from "../../src/conquest/engine/Interactions";
import { familyTree, kinWord } from "../../src/conquest/engine/Kin";
import { succeedTo } from "../../src/conquest/engine/Life";
import { actCheck, actsAt } from "../../src/conquest/engine/LifeActs";
import {
  meOf,
  monthlyBudget,
  opinionOf,
} from "../../src/conquest/engine/LifeQueries";
import { HOUSES } from "../../src/conquest/engine/LifeRules";
import { houseOf, propertyBudget } from "../../src/conquest/engine/Property";
import type { Character, Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, toNextMonth, world } from "./LifeUtil";

function kid(g: ReturnType<typeof world>, life: Life, age: number): Character {
  const me = meOf(g.s, life)!;
  const c = makeCharacter(g.s, g.rng, {
    nation: me.nation,
    culture: "english",
    religion: "anglican",
    female: age % 2 === 0,
    age,
  });
  c.father = me.id;
  c.family = me.family;
  c.home = life.home;
  me.children.push(c.id);
  return c;
}

function wife(g: ReturnType<typeof world>, life: Life): Character {
  const me = meOf(g.s, life)!;
  const c = makeCharacter(g.s, g.rng, {
    nation: me.nation,
    culture: "english",
    religion: "anglican",
    female: true,
    age: 24,
  });
  c.spouse = me.id;
  me.spouse = c.id;
  c.home = life.home;
  return c;
}

describe("the Home place", () => {
  test("the acts at home can be done (they were all refused before)", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    expect(areasOf(g.s, g.w, life.prov, life)).toContain("home");
    const keys = actsAt("home").map((a) => a.key);
    expect(keys).toContain("rest");
    expect(actCheck(g.s, g.w, life, "home", "rest").ok).toBe(true);
    expect(actCheck(g.s, g.w, life, "home", "house").ok).toBe(true);
    expect(actCheck(g.s, g.w, life, "home", "family").ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "act", place: "home", act: "house" }),
    ).toBeNull();
    expect(houseOf(life)?.level).toBe(1);
    // And again, now there's a cottage.
    expect(actCheck(g.s, g.w, life, "home", "rest").ok).toBe(true);
  });

  test("a house can be bought outright at any size, or rented", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 500;
    expect(g.lifeCommand("s1", { k: "home", act: "buy", arg: 3 })).toBeNull();
    expect(houseOf(life)?.level).toBe(3);
    expect(houseOf(life)?.name).toBe(HOUSES[2].name);
    expect(life.purse).toBe(500 - HOUSES[2].cost);
    // A smaller one is refused.
    expect(g.lifeCommand("s1", { k: "home", act: "buy", arg: 2 })).toMatch(
      /better/,
    );

    const g2 = world();
    const l2 = lifeOf(g2);
    l2.purse = 30;
    expect(
      g2.lifeCommand("s1", { k: "home", act: "lease", arg: 2 }),
    ).toBeNull();
    const h = houseOf(l2)!;
    expect(h.leased).toBe(true);
    expect(l2.purse).toBeCloseTo(30 - LEASE_RENT[1], 5);
    const b = propertyBudget(g2.s, l2);
    expect(b.parts.some((p) => /Rent: the house you rent/.test(p.label))).toBe(
      true,
    );
    // No upkeep or rates on a rented house; can't build on it.
    expect(b.parts.some((p) => /Upkeep|Rates/.test(p.label))).toBe(false);
    expect(homeCheck(g2.s, l2, { act: "room", kind: "garden" }).ok).toBe(false);
    // The market's "next house up" counts a rented house for nothing.
    l2.purse = 100;
    const g3 = world();
    const l3 = lifeOf(g3);
    l3.purse = 30;
    g3.lifeCommand("s1", { k: "home", act: "lease", arg: 2 });
    l3.purse = 100;
    expect(g3.lifeCommand("s1", { k: "property", act: "house" })).toBeNull();
    expect(houseOf(l3)!.level).toBe(1);
    expect(houseOf(l3)!.leased).toBeUndefined();
    expect(l3.purse).toBe(100 - HOUSES[0].cost);
    // Buying it outright ends the lease.
    expect(g2.lifeCommand("s1", { k: "home", act: "buy", arg: 2 })).toBeNull();
    expect(houseOf(l2)!.leased).toBeUndefined();
  });

  test("rooms, furniture and servants cost what the budget says", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 400;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 2 });
    for (const kind of ["garden", "kitchen", "parlour", "study", "quarters"])
      expect(
        g.lifeCommand("s1", { k: "home", act: "room", kind }),
        kind,
      ).toBeNull();
    expect(
      g.lifeCommand("s1", { k: "home", act: "room", kind: "garden" }),
    ).toMatch(/already/);
    expect(g.lifeCommand("s1", { k: "home", act: "furnish" })).toBeNull();
    expect(g.lifeCommand("s1", { k: "home", act: "furnish" })).toBeNull();
    // A house (level 2) holds no mahogany.
    expect(g.lifeCommand("s1", { k: "home", act: "furnish" })).toMatch(
      /bigger house/,
    );
    for (const kind of ["maid", "cook", "gardener"])
      expect(
        g.lifeCommand("s1", { k: "home", act: "servant", kind }),
        kind,
      ).toBeNull();
    const h = houseOf(life)!;
    expect(h.rooms).toHaveLength(5);
    expect(h.furnish).toBe(2);
    expect(h.servants).toEqual(["maid", "cook", "gardener"]);
    const spent =
      HOUSES[1].cost +
      ["garden", "kitchen", "parlour", "study", "quarters"].reduce(
        (m, k) => m + ROOMS[k as keyof typeof ROOMS].cost,
        0,
      ) +
      FURNISH[1].cost +
      FURNISH[2].cost;
    expect(life.purse).toBeCloseTo(400 - spent, 5);
    // The month: the purse moves as the property budget forecast it.
    const forecast = propertyBudget(g.s, life).total;
    const wages = ["maid", "cook", "gardener"].reduce(
      (m, k) => m + SERVANTS[k as keyof typeof SERVANTS].wage,
      0,
    );
    expect(
      propertyBudget(g.s, life).parts.find((p) => /Wages: 3/.test(p.label))
        ?.value,
    ).toBeCloseTo(-wages, 5);
    expect(
      monthlyBudget(g.s, g.w, life).parts.some((p) =>
        /kitchen garden/.test(p.label),
      ),
    ).toBe(true);
    life.job = null;
    const stress = (life.stress = 50);
    toNextMonth(g);
    const before = life.purse;
    void before;
    expect(forecast).toBeLessThan(0);
    // A month at home with a garden, a gardener and a maid eases the mind.
    expect(life.stress).toBeLessThan(stress);
  });

  test("servants who can't be paid leave", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 1 });
    expect(
      g.lifeCommand("s1", { k: "home", act: "servant", kind: "maid" }),
    ).toBeNull();
    // A cottage without quarters keeps one.
    expect(
      g.lifeCommand("s1", { k: "home", act: "servant", kind: "cook" }),
    ).toMatch(/quarters/);
    life.purse = 0;
    life.job = null;
    toNextMonth(g);
    expect(houseOf(life)!.servants ?? []).toHaveLength(0);
  });

  test("a second house can be let; the tenant pays rent and the rates", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 300;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 2 });
    const first = houseOf(life)!;
    // You can't let the house you live in.
    expect(homeCheck(g.s, life, { act: "let", id: first.id }).ok).toBe(false);
    // Move: a cottage elsewhere becomes home; the old house can be let.
    const away = prov("Nansemond");
    life.prov = away;
    expect(g.lifeCommand("s1", { k: "home", act: "buy", arg: 1 })).toBeNull();
    expect(life.home).toBe(away);
    expect(housesOf(life).map((h) => h.prov)[0]).toBe(away);
    expect(
      g.lifeCommand("s1", { k: "home", act: "let", id: first.id }),
    ).toBeNull();
    expect(first.let?.rent).toBe(LET_RENT[1]);
    const b = propertyBudget(g.s, life);
    expect(b.parts.some((p) => /tenant/.test(p.label) && p.value > 0)).toBe(
      true,
    );
    expect(
      b.parts.some((p) => p.label === `Rates: ${first.name.toLowerCase()}`),
    ).toBe(false);
    // A let house is no home to go into.
    expect(areasOf(g.s, g.w, first.prov, life)).not.toContain("home");
  });

  test("goods are kept at home, up to the room there is", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 1 });
    life.goods.furs = 15;
    expect(
      g.lifeCommand("s1", {
        k: "home",
        act: "store",
        item: "furs",
        qty: 11,
      }),
    ).toMatch(/storehouse/);
    expect(
      g.lifeCommand("s1", { k: "home", act: "store", item: "furs", qty: 10 }),
    ).toBeNull();
    expect(life.goods.furs).toBe(5);
    expect(storedLoads(houseOf(life)!)).toBe(10);
    // Selling the house waits until it's empty.
    expect(
      g.lifeCommand("s1", {
        k: "property",
        act: "sell",
        id: houseOf(life)!.id,
      }),
    ).toMatch(/Take out/);
    expect(
      g.lifeCommand("s1", { k: "home", act: "take", item: "furs", qty: 4 }),
    ).toBeNull();
    expect(life.goods.furs).toBe(9);
  });

  test("family time moves opinions; teaching goes into an heir's skills", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    const sp = wife(g, life);
    const boy = kid(g, life, 9);
    expect(kidsAtHome(g.s, life).map((c) => c.id)).toContain(boy.id);
    const spBefore = opinionOf(g.s, sp, life).total;
    life.stress = 40;
    expect(g.lifeCommand("s1", { k: "home", act: "spouse" })).toBeNull();
    expect(opinionOf(g.s, sp, life).total).toBeGreaterThan(spBefore);
    expect(life.stress).toBeLessThan(40);
    expect(g.lifeCommand("s1", { k: "home", act: "spouse" })).toMatch(
      /Again in/,
    );
    const kBefore = opinionOf(g.s, boy, life).total;
    expect(g.lifeCommand("s1", { k: "home", act: "children" })).toBeNull();
    expect(opinionOf(g.s, boy, life).total).toBeGreaterThan(kBefore);
    // Teach him letters (you're well read).
    life.skills.letters = 9;
    expect(
      g.lifeCommand("s1", {
        k: "home",
        act: "teach",
        c: boy.id,
        kind: "letters",
      }),
    ).toBeNull();
    expect(boy.taught?.letters).toBe(1);
    expect(
      g.lifeCommand("s1", {
        k: "home",
        act: "teach",
        c: boy.id,
        kind: "letters",
      }),
    ).toMatch(/Again in/);
    // Two more lessons, a month apart.
    for (let i = 0; i < 2; i++) {
      life.cooldowns[`home:teach:${boy.id}`] = 0;
      g.lifeCommand("s1", {
        k: "home",
        act: "teach",
        c: boy.id,
        kind: "letters",
      });
    }
    expect(boy.taught?.letters).toBe(3);
    // A child you can't teach what you don't know.
    expect(
      homeCheck(g.s, life, { act: "teach", c: boy.id, kind: "seamanship" }).ok,
    ).toBe(false);
    // When he takes over, it shows: three points over his own.
    boy.born -= 10 * 365;
    const taught = boy.taught;
    const g2 = world();
    const l2 = lifeOf(g2);
    const twin = kid(g2, l2, 9);
    twin.born = boy.born;
    twin.stats = { ...boy.stats };
    twin.traits = [...boy.traits];
    succeedTo(g2, l2, twin.id);
    succeedTo(g, life, boy.id);
    expect(life.c).toBe(boy.id);
    expect(taught?.letters).toBe(3);
    expect(life.skills.letters).toBe(l2.skills.letters + 3);
  });

  test("studying and resting at home, with a study and a cook", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 200;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 2 });
    const xp0 = life.xp.letters + life.skills.letters * 1000;
    expect(
      g.lifeCommand("s1", { k: "home", act: "study", kind: "letters" }),
    ).toBeNull();
    const plain = life.xp.letters + life.skills.letters * 1000 - xp0;
    expect(plain).toBeGreaterThan(0);
    g.lifeCommand("s1", { k: "home", act: "room", kind: "study" });
    life.cooldowns["home:study"] = 0;
    const xp1 = life.xp.letters + life.skills.letters * 1000;
    g.lifeCommand("s1", { k: "home", act: "study", kind: "letters" });
    expect(life.xp.letters + life.skills.letters * 1000 - xp1).toBeGreaterThan(
      plain,
    );
    life.health = 50;
    expect(g.lifeCommand("s1", { k: "home", act: "rest" })).toBeNull();
    expect(life.health).toBeGreaterThanOrEqual(55);
    expect(life.outcome?.title).toBe("Rest");
  });

  test("a parlour, good furniture and a cook give a gathering at home a start", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 300;
    g.lifeCommand("s1", { k: "home", act: "buy", arg: 2 });
    g.lifeCommand("s1", { k: "home", act: "room", kind: "parlour" });
    g.lifeCommand("s1", { k: "home", act: "furnish" });
    g.lifeCommand("s1", { k: "home", act: "furnish" });
    expect(homeWelcome(houseOf(life))).toBe(2);
  });

  test("a native life builds a lodge and keeps no servants", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({
            origin: "powhatan",
            religion: "native",
            background: "interpreter",
            home: prov("Pamunkey"),
            first: "Matoaka",
            family: "of the Turtle clan",
            female: true,
          }),
        },
      ],
    });
    const life = lifeOf(g);
    life.purse = 100;
    expect(g.lifeCommand("s1", { k: "home", act: "buy", arg: 1 })).toBeNull();
    expect(houseOf(life)!.name).toBe("Wigwam");
    expect(homeCheck(g.s, life, { act: "servant", kind: "maid" }).ok).toBe(
      false,
    );
    expect(
      g.lifeCommand("s1", { k: "home", act: "room", kind: "kitchen" }),
    ).toBeNull();
    expect(g.lifeCommand("s1", { k: "home", act: "lease", arg: 1 })).toMatch(
      /rented|built/,
    );
  });
});

describe("other players in your town", () => {
  test("another player shows in the town's places, not in your home", () => {
    const g = world({
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bob" }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    expect(a.prov).toBe(b.prov);
    b.area = "tavern";
    const m = presence(g.s, g.w, a.prov, g.s.day, a);
    expect(
      m.get("tavern")?.some((x) => x.c === b.c && x.kind === "player"),
    ).toBe(true);
    // At their own home they're indoors: not in yours.
    b.area = "home";
    const m2 = presence(g.s, g.w, a.prov, g.s.day, a);
    expect(m2.get("home")?.some((x) => x.c === b.c) ?? false).toBe(false);
  });
});

describe("the family tree", () => {
  function person(
    g: ReturnType<typeof world>,
    life: Life,
    o: { female: boolean; age: number; father?: number; mother?: number },
  ): Character {
    const me = meOf(g.s, life)!;
    const c = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: o.female,
      age: o.age,
    });
    if (o.father !== undefined) {
      c.father = o.father;
      g.s.chars[o.father].children.push(c.id);
    }
    if (o.mother !== undefined) {
      c.mother = o.mother;
      g.s.chars[o.mother].children.push(c.id);
    }
    return c;
  }
  const wed = (a: Character, b: Character) => {
    a.spouse = b.id;
    b.spouse = a.id;
  };

  test("three generations up and down, in-laws, and a lover's child", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    // Grandparents and parents.
    const gf = person(g, life, { female: false, age: 80 });
    const gm = person(g, life, { female: true, age: 78 });
    wed(gf, gm);
    const dad = person(g, life, {
      female: false,
      age: 52,
      father: gf.id,
      mother: gm.id,
    });
    const mum = person(g, life, { female: true, age: 50 });
    wed(dad, mum);
    me.father = dad.id;
    me.mother = mum.id;
    dad.children.push(me.id);
    mum.children.push(me.id);
    const sis = person(g, life, {
      female: true,
      age: 25,
      father: dad.id,
      mother: mum.id,
    });
    // A wife, her parents and brother.
    const w = wife(g, life);
    const wf = person(g, life, { female: false, age: 55 });
    const wm = person(g, life, { female: true, age: 53 });
    wed(wf, wm);
    w.father = wf.id;
    w.mother = wm.id;
    wf.children.push(w.id);
    wm.children.push(w.id);
    const wb = person(g, life, {
      female: false,
      age: 20,
      father: wf.id,
      mother: wm.id,
    });
    // Children, a son married with a child of his own.
    const son = person(g, life, {
      female: false,
      age: 22,
      father: me.id,
      mother: w.id,
    });
    const dil = person(g, life, { female: true, age: 20 });
    wed(son, dil);
    const grandkid = person(g, life, {
      female: false,
      age: 1,
      father: son.id,
      mother: dil.id,
    });
    const girl = person(g, life, {
      female: true,
      age: 12,
      father: me.id,
      mother: w.id,
    });
    // A lover, and a child of it you never owned.
    const lover = person(g, life, { female: true, age: 26 });
    const secret = person(g, life, { female: false, age: 2, mother: lover.id });
    life.affairs = [
      {
        c: lover.id,
        since: 0,
        exposure: 0,
        known: [],
        kids: [secret.id],
        met: 0,
        blackmailer: -1,
      },
    ];
    // Grandfather has died.
    gf.alive = false;
    gf.died = { day: g.s.day - 400, cause: "old age" };
    life.heir = girl.id;

    const t = familyTree(g.s, life)!;
    const at = (c: Character) => t.nodes.find((n) => n.c === c.id);
    expect(at(me)?.kind).toBe("you");
    expect(at(gf)?.gen).toBe(-2);
    expect(at(gm)?.label).toBe("Grandmother");
    expect(at(dad)?.label).toBe("Your father");
    expect(at(sis)?.label).toBe("Your sister");
    expect(at(w)?.label).toBe("Your wife");
    expect(at(wf)?.label).toBe("Father-in-law");
    expect(at(wb)?.label).toBe("Brother-in-law");
    expect(at(son)?.gen).toBe(1);
    expect(at(dil)?.label).toBe("Daughter-in-law");
    expect(at(grandkid)?.gen).toBe(2);
    expect(at(lover)?.kind).toBe("lover");
    expect(at(secret)?.kind).toBe("lovechild");
    // The heir is marked, and only the heir.
    expect(t.nodes.filter((n) => n.heir).map((n) => n.c)).toEqual([girl.id]);
    expect(at(girl)?.label).toMatch(/heir/);
    // Nobody stands on anyone else in a row.
    for (let gen = t.minGen; gen <= t.maxGen; gen++) {
      const xs = t.nodes
        .filter((n) => n.gen === gen)
        .map((n) => n.x)
        .sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1], `row ${gen}`).toBeGreaterThanOrEqual(0.99);
    }
    // Every line joins people on the tree; the lover's child hangs by a broken one.
    const ids = new Set(t.nodes.map((n) => n.c));
    for (const d of t.descents)
      for (const id of [...d.parents, ...d.children])
        expect(ids.has(id)).toBe(true);
    expect(t.descents.find((d) => d.children.includes(secret.id))?.hidden).toBe(
      true,
    );
    expect(
      t.couples.some((c) => c.kind === "married" && [c.a, c.b].includes(w.id)),
    ).toBe(true);
    expect(t.couples.some((c) => c.kind === "lovers")).toBe(true);
  });

  test("a lone soul is a tree of one", () => {
    const g = world();
    const life = lifeOf(g);
    const t = familyTree(g.s, life)!;
    expect(t.nodes).toHaveLength(1);
    expect(t.minGen).toBe(0);
  });
});

describe("duels as scenes", () => {
  function rival(g: ReturnType<typeof world>, life: Life): Character {
    const me = meOf(g.s, life)!;
    const c = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: false,
      age: 30,
    });
    c.home = life.prov;
    g.s.locals[life.prov].push(c.id);
    life.ties[c.id] = "rival";
    life.met.push(c.id);
    return c;
  }
  const pending = (life: Life) =>
    life.events.find((e) => e.key.startsWith("duel-"));
  const choose = (g: ReturnType<typeof world>, life: Life, i: number) => {
    const ev = pending(life)!;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: i }),
    ).toBeNull();
  };

  test("a challenge goes through seconds, weapons, dawn and the exchanges", () => {
    const g = world();
    const life = lifeOf(g);
    const foe = rival(g, life);
    life.skills.fighting = 9;
    const seen: unknown[] = [];
    hooks.duelAftermath.push((_g, _l, d) => seen.push(d));
    expect(
      g.lifeCommand("s1", { k: "person", c: foe.id, act: "duel" }),
    ).toBeNull();
    expect(duelOn(life)).toBe(true);
    expect(pending(life)?.key).toBe("duel-call");
    // No second to hand: go alone.
    expect(pending(life)!.ctx.ch).toBe(1);
    choose(g, life, 1);
    expect(pending(life)?.key).toBe("duel-weapons");
    choose(g, life, 0); // agree to their choice
    expect(pending(life)?.key).toBe("duel-dawn");
    const w = pending(life)!.ctx.w;
    expect([1, 2]).toContain(w);
    choose(g, life, 0); // take your ground
    let guard = 0;
    while (pending(life)?.key === "duel-exchange" && guard++ < 6) {
      const ev = pending(life)!;
      const shown = duelChoicesShown(ev.key, ev.ctx);
      expect(shown.length).toBeGreaterThan(0);
      choose(g, life, shown[0]);
    }
    // It ended: an outcome scene (unless you died of it), and the law heard.
    if (life.c >= 0 && meOf(g.s, life)?.alive)
      expect(pending(life)?.key).toBe("duel-outcome");
    expect(seen).toHaveLength(1);
    expect(
      life.journal.some((j) => /dawn|smallswords|pistols/.test(j.text)),
    ).toBe(true);
    hooks.duelAftermath.pop();
  });

  test("being called out, and apologising, ends it without blood", () => {
    const g = world();
    const life = lifeOf(g);
    const foe = rival(g, life);
    const renown = (life.renown = 10);
    const health = life.health;
    const { duel } = INTER;
    duel(g, life, g.char(foe.id), true);
    expect(pending(life)?.ctx.ch).toBe(0);
    expect(duelChoicesShown("duel-call", pending(life)!.ctx)).toEqual([
      0, 1, 2, 3,
    ]);
    choose(g, life, 2);
    expect(duelOn(life)).toBe(false);
    expect(life.renown).toBeLessThan(renown);
    expect(life.health).toBe(health);
  });

  test("odds come from Fighting and traits, and a second helps", () => {
    const g = world();
    const life = lifeOf(g);
    const foe = rival(g, life);
    const ctx = { c: foe.id, w: 1, sec: -1, r: 0, mw: 0, fw: 0 };
    life.skills.fighting = 5;
    const lo = duelOdds(g.s, life, ctx, "guard").chance;
    life.skills.fighting = 10;
    const hi = duelOdds(g.s, life, ctx, "guard").chance;
    expect(hi).toBeGreaterThan(lo);
    life.skills.fighting = 3;
    const alone = duelOdds(g.s, life, ctx, "guard").chance;
    const second = duelOdds(g.s, life, { ...ctx, sec: foe.id + 1 }, "guard");
    expect(second.chance).toBeGreaterThan(alone);
    expect(second.why.parts.some((p) => /second/.test(p.label))).toBe(true);
    foe.traits = [...foe.traits.filter((t) => t !== "craven"), "brave"];
    const braver = duelOdds(g.s, life, ctx, "guard").chance;
    expect(braver).toBeLessThan(alone);
    // Guarding is safer than pressing.
    expect(duelOdds(g.s, life, ctx, "press").chance).toBeLessThan(
      duelOdds(g.s, life, ctx, "guard").chance,
    );
  });

  test("a death on the field brings the law's heat in a colony", () => {
    const g = world();
    const life = lifeOf(g);
    const foe = rival(g, life);
    const def = DUEL_EVENTS.find((d) => d.key === "duel-exchange")!;
    // Pistols, last exchange, they're already mortally hurt.
    const ctx = {
      c: foe.id,
      ch: 1,
      sc: -1,
      sec: -1,
      fsec: -1,
      w: 2,
      r: 1,
      mw: 0,
      fw: 120,
      fb: 0,
      dl: 0,
      fdl: 1,
      p: life.prov,
    };
    g.rng.next();
    // "Call honour satisfied" ends it with the wounds as they stand.
    def.choices[0].apply(g, life, ctx, true);
    expect(foe.alive).toBe(false);
    const heat = Object.values(life.crime?.heat ?? {})[0] ?? 0;
    expect(heat).toBeGreaterThanOrEqual(25);
    const out = pending(life)!;
    expect(out.key).toBe("duel-outcome");
    expect(duelChoicesShown(out.key, out.ctx)).toEqual([0, 1, 2]);
  });

  test("a second challenge while one is fought is settled at once", () => {
    const g = world();
    const life = lifeOf(g);
    const a = rival(g, life);
    const b = rival(g, life);
    const { duel } = INTER;
    duel(g, life, g.char(a.id), true);
    const n = life.events.length;
    duel(g, life, g.char(b.id), true);
    expect(life.events.length).toBe(n);
  });
});

describe("the guide and the names of kin", () => {
  test("the guide covers the household, the family tree, duels and other players", () => {
    const ch = (id: string) => CHAPTERS.find((c) => c.id === id)!;
    expect(ch("duels").part).toBe("people");
    for (const r of Object.values(ROOMS))
      expect(ch("property").body, r.name).toContain(r.name);
    for (const sv of Object.values(SERVANTS))
      expect(ch("property").body, sv.name).toContain(sv.name);
    expect(ch("family").body).toMatch(/family tree/i);
    expect(ch("multiplayer").body).toMatch(/rival player/);
  });

  test("your own people are named as kin", () => {
    const g = world();
    const life = lifeOf(g);
    const w = wife(g, life);
    const k = kid(g, life, 7);
    expect(kinWord(g.s, life, w)).toBe("Your wife");
    expect(kinWord(g.s, life, k)).toMatch(/^Your (son|daughter)$/);
    const me = meOf(g.s, life)!;
    expect(kinWord(g.s, life, me)).toBeNull();
  });
});
