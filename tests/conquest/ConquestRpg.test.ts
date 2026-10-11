// Derpy Conquest, round two of the life game: one job at a time and getting
// hired, the places of a province and who is in them, interactions that say
// whether they'll be accepted and why, scenes' outcomes, players asking each
// other, property, ambitions, ties, travellers and rumours.

import { describe, expect, test } from "vitest";
import { ambitionCheck, AMBITIONS } from "../../src/conquest/engine/Ambitions";
import { areasOf, presence, presentAt } from "../../src/conquest/engine/Areas";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import { seedLocals } from "../../src/conquest/engine/Folk";
import {
  interactionMenu,
  interactionView,
} from "../../src/conquest/engine/Interactions";
import { actCheck, ACTS } from "../../src/conquest/engine/LifeActs";
import { setTie } from "../../src/conquest/engine/LifeCore";
import {
  answerLifeEvent,
  LIFE_EVENTS,
  raiseLifeEvent,
} from "../../src/conquest/engine/LifeEvents";
import {
  meOf,
  monthlyBudget,
  peopleHere,
  wageOf,
} from "../../src/conquest/engine/LifeQueries";
import {
  AWAY_DAYS,
  HOUSES,
  JOBS,
  LAND_LOT,
  WORK_DAYS,
} from "../../src/conquest/engine/LifeRules";
import { movementOf } from "../../src/conquest/engine/Movements";
import { houseOf, landOf } from "../../src/conquest/engine/Property";
import { ageOf } from "../../src/conquest/engine/Queries";
import { heardHere, rumour } from "../../src/conquest/engine/Rumours";
import { TALES } from "../../src/conquest/engine/Tales";
import { spawnToward } from "../../src/conquest/engine/Travellers";
import type { Character, Life } from "../../src/conquest/engine/Types";
import { employersIn } from "../../src/conquest/engine/Work";
import { lifeOf, plan, prov, ticks, world } from "./LifeUtil";

function sergeantOf(g: ReturnType<typeof world>, life: Life): Character {
  return employersIn(g.s, g.w, life.prov).find((e) => e.c.role === "sergeant")!
    .c;
}

describe("one job", () => {
  test("no casual work anywhere: the day's labour is gone", () => {
    expect(ACTS.some((a) => a.key === "labour" || a.key === "deeds")).toBe(
      false,
    );
  });

  test("a background's first job comes from someone who hires", () => {
    const g = world();
    const life = lifeOf(g);
    expect(life.job?.kind).toBe("farmer");
    expect(g.s.chars[life.job!.employer]?.role).toBe("planter");
    expect(life.job!.own).toBeFalsy();
  });

  test("hiring is an interaction: accept or refuse, with the reasons", () => {
    const g = world();
    const life = lifeOf(g);
    const sgt = sergeantOf(g, life);
    // Employed: you can't even ask.
    const busy = interactionView(g.s, g.w, life, sgt.id, "work", 0);
    expect(busy.check.ok).toBe(false);
    expect(g.lifeCommand("s1", { k: "quit" })).toBeNull();
    const v = interactionView(g.s, g.w, life, sgt.id, "work", 0);
    expect(v.check.ok).toBe(true);
    expect(v.mode).toBe("accept");
    expect(v.accept!.parts.length).toBeGreaterThan(1);
    expect(v.will).toBe(v.accept!.total > 0);
    // A foreigner is turned away, and is told why.
    const pat = world({
      plans: [
        {
          seat: "s1",
          name: "Pat",
          plan: plan({
            origin: "france",
            home: prov("Quebec"),
            religion: "catholic",
            background: "gentry",
          }),
        },
      ],
    });
    const fl = lifeOf(pat);
    // Walk them to Jamestown's fort, by magic.
    fl.prov = prov("Jamestown");
    seedLocals(pat, fl.prov);
    const sgt2 = sergeantOf(pat, fl);
    const no = interactionView(pat.s, pat.w, fl, sgt2.id, "work", 0);
    expect(no.will).toBe(false);
    expect(no.accept!.parts.some((p) => /serve here/.test(p.label))).toBe(true);
    expect(
      pat.lifeCommand("s1", { k: "person", c: sgt2.id, act: "work" }),
    ).toBeNull();
    expect(fl.job).toBeNull();
    expect(fl.outcome?.ok).toBe(false);
    expect(fl.outcome?.lines.join(" ")).toMatch(/says no/);
  });

  test("wages are paid by the days worked; away too long and the place is gone", () => {
    const g = world();
    const life = lifeOf(g);
    const job = life.job!;
    const full = JOBS[job.kind].ranks[job.rank].wage;
    job.worked = WORK_DAYS / 2;
    expect(wageOf(g.s, g.w, life, true)).toBeCloseTo(full / 2, 1);
    job.worked = WORK_DAYS + 5;
    expect(wageOf(g.s, g.w, life, true)).toBe(full);
    // Gone travelling for good.
    life.purse = 200;
    const far = prov("Massachusetts Bay");
    expect(g.lifeCommand("s1", { k: "travel", to: far })).toBeNull();
    for (let d = 0; d < AWAY_DAYS + 30 && life.job; d++) ticks(g, 1);
    expect(life.job).toBeNull();
    expect(life.journal.some((j) => /lost it/.test(j.text))).toBe(true);
  });

  test("promotion is asked of your master, who weighs it up", () => {
    const g = world();
    const life = lifeOf(g);
    const boss = g.s.chars[life.job!.employer];
    // Farming's next rung is bought: your master can't give it.
    const v = interactionView(g.s, g.w, life, boss.id, "promote");
    expect(v.check.ok).toBe(true);
    expect(v.will).toBe(false);
    expect(v.accept!.parts.some((p) => /bought/.test(p.label))).toBe(true);
    // A soldier's corporal's stripe is earned.
    g.lifeCommand("s1", { k: "quit" });
    g.lifeCommand("s1", { k: "job", place: "fort", job: "soldier" });
    const sgt = g.s.chars[life.job!.employer];
    const early = interactionView(g.s, g.w, life, sgt.id, "promote");
    expect(early.will).toBe(false);
    life.job!.months = 20;
    life.skills.fighting = 12;
    life.skills.leadership = 8;
    sgt.memories.push({ of: life.c, why: "Likes you", value: 40, until: 0 });
    const ready = interactionView(g.s, g.w, life, sgt.id, "promote");
    expect(ready.will).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: sgt.id, act: "promote" }),
    ).toBeNull();
    expect(life.job!.rank).toBe(1);
  });

  test("buying into the trade makes it your own business", () => {
    const g = world();
    const life = lifeOf(g);
    life.job!.months = 20;
    life.skills.farming = 10;
    life.purse = 80;
    expect(
      g.lifeCommand("s1", { k: "act", place: "fields", act: "buy" }),
    ).toBeNull();
    expect(life.job!.own).toBe(true);
    expect(life.job!.employer).toBe(-1);
    expect(
      life.property?.some((p) => p.kind === "business" && p.job === "farmer"),
    ).toBe(true);
  });

  test("anyone can set their own traplines", () => {
    const g = world({
      plans: [{ seat: "s1", name: "A", plan: plan({ background: "gentry" }) }],
    });
    const life = lifeOf(g);
    expect(life.job).toBeNull();
    const woods = areasOf(g.s, g.w, life.prov, life).includes("woods");
    if (!woods) return;
    expect(
      g.lifeCommand("s1", { k: "act", place: "woods", act: "traplines" }),
    ).toBeNull();
    expect(life.job?.kind).toBe("trapper");
    expect(life.job?.own).toBe(true);
  });
});

describe("areas and who is in them", () => {
  test("every person of the province is somewhere or at home, and it's the same everywhere", () => {
    const g = world();
    const life = lifeOf(g);
    const p = life.prov;
    const a = presence(g.s, g.w, p, g.s.day, life);
    const b = presence(JSON.parse(JSON.stringify(g.s)), g.w, p, g.s.day, life);
    expect([...a.entries()].map(([k, v]) => [k, v.map((x) => x.c)])).toEqual(
      [...b.entries()].map(([k, v]) => [k, v.map((x) => x.c)]),
    );
    const listed = [...a.values()].flat();
    expect(listed.length).toBeGreaterThan(4);
    expect(new Set(listed.map((x) => x.c)).size).toBe(listed.length);
    const here = new Set(peopleHere(g.s, p, life).map((c) => c.id));
    for (const x of listed) expect(here.has(x.c)).toBe(true);
    expect(a.get("home")).toBeDefined();
  });

  test("the innkeeper keeps the bar; Sunday fills the church", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const p = life.prov;
    const keeper = (g.s.locals[p] ?? []).find(
      (id) => g.s.chars[id]?.role === "innkeeper",
    )!;
    let atBar = 0;
    let sunday = 0;
    let weekday = 0;
    for (let d = 0; d < 28; d++) {
      const day = g.s.day + d;
      if (
        presentAt(g.s, g.w, p, "tavern", day, life).some((x) => x.c === keeper)
      )
        atBar++;
      const church = presentAt(g.s, g.w, p, "church", day, life).length;
      if (day % 7 === 0) sunday += church;
      else weekday += church;
    }
    expect(atBar).toBeGreaterThan(20);
    expect(sunday / 4).toBeGreaterThan(weekday / 24);
  });

  test("lists change from day to day", () => {
    const g = world();
    const life = lifeOf(g);
    const sig = (day: number) =>
      JSON.stringify(
        [...presence(g.s, g.w, life.prov, day, life)].map(([k, v]) => [
          k,
          v.map((x) => x.c),
        ]),
      );
    const days = new Set(Array.from({ length: 6 }, (_, i) => sig(g.s.day + i)));
    expect(days.size).toBeGreaterThan(1);
  });

  test("people keep to a routine for days at a time: a place changes a few at a time", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const where = (day: number) => {
      const m = new Map<number, string>();
      for (const [k, v] of presence(g.s, g.w, life.prov, day, life))
        for (const x of v) m.set(x.c, k);
      return m;
    };
    let moved = 0;
    let stayed = 0;
    for (let d = 0; d < 42; d++) {
      const day = g.s.day + d;
      // Sundays (and the Monday after) send everyone to church and back.
      if (day % 7 === 0 || day % 7 === 1) continue;
      const a = where(day - 1);
      const b = where(day);
      for (const [c, area] of b)
        if (a.has(c)) {
          if (a.get(c) === area) stayed++;
          else moved++;
        }
    }
    expect(stayed + moved).toBeGreaterThan(100);
    // Most people are where they were yesterday; some have moved on.
    expect(moved / (stayed + moved)).toBeLessThan(0.3);
    expect(moved).toBeGreaterThan(0);
  });

  test("going in somewhere, and other players see you there", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bea", female: true }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    expect(g.lifeCommand("s1", { k: "enter", area: "church" })).toBeNull();
    expect(a.area).toBe("church");
    const seen = presentAt(g.s, g.w, a.prov, "church", g.s.day, b);
    expect(seen.find((x) => x.c === a.c)?.kind).toBe("player");
    expect(
      g.lifeCommand("s1", { k: "enter", area: "councilfire" }),
    ).toBeTruthy();
  });

  test("travellers come from other towns, stop where players are, and go home", () => {
    const g = world();
    const life = lifeOf(g);
    const t = spawnToward(g, life.prov);
    expect(t).not.toBeNull();
    const c = t!.c;
    ticks(g, 60);
    const stopped = (g.s.travellers ?? []).find((x) => x.c === c);
    // Arrived, and seen in the province (or already gone home again).
    if (stopped && stopped.depart < 0 && stopped.prov === life.prov)
      expect(peopleHere(g.s, life.prov, life).some((x) => x.id === c)).toBe(
        true,
      );
    ticks(g, 200);
    expect((g.s.travellers ?? []).length).toBeGreaterThan(0);
  });
});

describe("interactions and scenes", () => {
  test("each interaction says how it'll go", () => {
    const g = world();
    const life = lifeOf(g);
    const c = peopleHere(g.s, life.prov, life).find(
      (x) => x.role === "innkeeper",
    )!;
    const menu = interactionMenu(g.s, g.w, life, c.id);
    const befriend = menu.find((m) => m.act === "befriend")!;
    expect(befriend.view.mode).toBe("accept");
    expect(
      befriend.view.accept?.parts.some((p) => /think of you/.test(p.label)),
    ).toBe(true);
    const flatter = menu.find((m) => m.act === "flatter")!;
    expect(flatter.view.chance).toBeGreaterThan(0);
    expect(menu.some((m) => m.act === "work")).toBe(true);
  });

  test("acts and interactions leave an outcome for the scene", () => {
    const g = world();
    const life = lifeOf(g);
    expect(
      g.lifeCommand("s1", { k: "act", place: "tavern", act: "drink" }),
    ).toBeNull();
    const o = life.outcome!;
    expect(o.n).toBe(1);
    expect(o.scene).toBe("tavern");
    expect(o.title).toMatch(/Drink/);
    expect(life.area).toBe("tavern");
    const c = peopleHere(g.s, life.prov, life)[0];
    expect(
      g.lifeCommand("s1", { k: "person", c: c.id, act: "talk" }),
    ).toBeNull();
    expect(life.outcome!.n).toBe(2);
    expect(life.outcome!.c).toBe(c.id);
    expect(life.outcome!.lines.length).toBeGreaterThan(0);
  });

  test("events carry their scene and who's in it", () => {
    expect(LIFE_EVENTS.length).toBeGreaterThanOrEqual(150);
    const g = world();
    const life = lifeOf(g);
    for (let i = 0; i < 400 && life.events.length === 0; i++) ticks(g, 1);
    const ev = life.events[0];
    expect(ev).toBeDefined();
    expect(typeof ev.scene).toBe("string");
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(life.outcome?.kind).toBe("event");
  });

  test("every event is well-formed, and the new ones can be told and answered", () => {
    expect(new Set(LIFE_EVENTS.map((e) => e.key)).size).toBe(
      LIFE_EVENTS.length,
    );
    for (const def of LIFE_EVENTS)
      expect(def.choices.length, def.key).toBeGreaterThan(0);
    const told = new Set<string>();
    const lives: NonNullable<Parameters<typeof plan>[0]>[] = [
      {},
      { background: "soldier", home: prov("Massachusetts Bay") },
      { background: "trapper", female: true, first: "Hannah" },
      { background: "sailor", home: prov("Massachusetts Bay") },
      { background: "preacher", home: prov("Massachusetts Bay") },
      { background: "physician", traits: ["educated"] },
      { background: "gentry", age: 40 },
      { background: "craftsman", home: prov("Massachusetts Bay") },
      {
        origin: "powhatan",
        home: prov("Pamunkey"),
        religion: "native",
        background: "warrior",
        first: "Opechan",
        family: "of the Wolf clan",
      },
    ];
    for (const p of lives) {
      const g = world({
        start: p.origin === "powhatan" ? undefined : 1650,
        plans: [{ seat: "s1", name: "A", plan: plan(p) }],
      });
      const life = lifeOf(g);
      // Give the life some of everything the tales hang on: a house, land,
      // money, and a friend, a rival, a lover and a mentor in town.
      life.purse = 200;
      g.lifeCommand("s1", { k: "property", act: "house" });
      g.lifeCommand("s1", { k: "property", act: "land" });
      const town = peopleHere(g.s, life.prov, life).filter(
        (c) => c.id !== life.c && !life.ties[c.id],
      );
      (["friend", "rival", "lover", "mentor"] as const).forEach((t, i) => {
        if (town[i]) setTie(g, life, town[i].id, t);
      });
      const areas = areasOf(g.s, g.w, life.prov, life);
      for (let m = 0; m < 14 && life.c >= 0; m++) {
        ticks(g, 30);
        life.purse = Math.max(life.purse, 40);
        life.area = areas[m % areas.length];
        for (const def of TALES) {
          if (def.pool === "raised" || life.c < 0) continue;
          const ctx = def.when ? def.when(g, life) : {};
          if (!ctx) continue;
          life.events = [];
          raiseLifeEvent(g, life, def.key, ctx);
          const ev = life.events[0];
          expect(ev?.key, def.key).toBe(def.key);
          expect(ev.body.length, def.key).toBeGreaterThan(30);
          expect(ev.body, def.key).not.toMatch(/undefined|NaN|\$\{/);
          for (const c of ev.choices)
            expect(c.tip, def.key).not.toMatch(/undefined|NaN|\$\{/);
          const pick = def.choices.findIndex(
            (c) => !c.blocked?.(g, life, ev.ctx),
          );
          expect(answerLifeEvent(g, life, ev.id, Math.max(0, pick))).toBeNull();
          told.add(def.key);
        }
      }
    }
    // Most of the new tales come to one of these lives within a year.
    expect(told.size).toBeGreaterThan(TALES.length / 2);
  }, 30_000);

  test("players ask each other: a scene to accept or refuse, and an answer back", () => {
    const g = world({
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bea", female: true }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const v = interactionView(g.s, g.w, a, b.c, "befriend");
    expect(v.player).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "befriend" }),
    ).toBeNull();
    const ask = b.events.find((e) => e.key === "p2p-befriend")!;
    expect(ask).toBeDefined();
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "befriend" }),
    ).toMatch(/Again|answered/);
    expect(
      g.lifeCommand("s2", { k: "event", id: ask.id, choice: 0 }),
    ).toBeNull();
    expect(a.ties[b.c]).toBe("friend");
    expect(b.ties[a.c]).toBe("friend");
    expect(a.events.some((e) => e.key === "p2p-reply")).toBe(true);
    // A proposal refused by silence.
    a.purse = 50;
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "propose" }),
    ).toBeNull();
    const prop = b.events.find((e) => e.key === "p2p-propose")!;
    expect(
      g.lifeCommand("s2", { k: "event", id: prop.id, choice: 1 }),
    ).toBeNull();
    expect(meOf(g.s, a)!.spouse).toBe(-1);
  });

  test("a duel between players, and trading goods", () => {
    const g = world({
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bob" }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    a.goods.furs = 4;
    b.purse = 40;
    expect(
      g.lifeCommand("s1", {
        k: "person",
        c: b.c,
        act: "trade",
        good: "furs",
        qty: 4,
        arg: 12,
      }),
    ).toBeNull();
    const offer = b.events.find((e) => e.key === "p2p-trade")!;
    expect(
      g.lifeCommand("s2", { k: "event", id: offer.id, choice: 0 }),
    ).toBeNull();
    expect(b.goods.furs).toBe(4);
    expect(a.goods.furs ?? 0).toBe(0);
    expect(b.purse).toBeCloseTo(28, 0);
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "duel" }),
    ).toBeNull();
    const duel = b.events.find((e) => e.key === "p2p-duel")!;
    const before = a.health + b.health;
    expect(
      g.lifeCommand("s2", { k: "event", id: duel.id, choice: 0 }),
    ).toBeNull();
    expect(a.health + b.health).toBeLessThan(before);
  });
});

describe("property", () => {
  test("nobody buys a house while marching with the army", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    life.job!.army = 0;
    expect(g.lifeCommand("s1", { k: "property", act: "house" })).toMatch(
      /army/,
    );
    expect(g.lifeCommand("s1", { k: "property", act: "land" })).toMatch(/army/);
  });

  test("a house of your own moves the household, and costs upkeep", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    expect(g.lifeCommand("s1", { k: "property", act: "house" })).toBeNull();
    expect(houseOf(life)?.level).toBe(1);
    expect(life.purse).toBe(100 - HOUSES[0].cost);
    expect(g.lifeCommand("s1", { k: "property", act: "house" })).toBeNull();
    expect(houseOf(life)?.level).toBe(2);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => /Upkeep/.test(p.label))).toBe(true);
  });

  test("land pays rents", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    expect(g.lifeCommand("s1", { k: "property", act: "land" })).toBeNull();
    expect(landOf(life)?.level).toBe(1);
    expect(life.purse).toBe(100 - LAND_LOT.cost);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => /Rents/.test(p.label) && p.value > 0)).toBe(
      true,
    );
  });

  test("hands are hired, paid and bring takings", () => {
    const g = world();
    const life = lifeOf(g);
    life.job!.months = 20;
    life.skills.farming = 10;
    life.purse = 200;
    g.lifeCommand("s1", { k: "act", place: "fields", act: "buy" });
    const worker = makeCharacter(g.s, g.rng, {
      nation: meOf(g.s, life)!.nation,
      culture: "english",
      religion: "anglican",
      female: false,
      age: 24,
    });
    worker.home = life.prov;
    g.s.locals[life.prov].push(worker.id);
    const v = interactionView(g.s, g.w, life, worker.id, "hire");
    expect(v.check.ok).toBe(true);
    expect(v.will).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: worker.id, act: "hire" }),
    ).toBeNull();
    const biz = life.property!.find((p) => p.kind === "business")!;
    expect(biz.hands).toContain(worker.id);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => /Wages/.test(p.label))).toBe(true);
    expect(b.parts.some((p) => /Takings/.test(p.label))).toBe(true);
    // They show up for work.
    let seen = 0;
    for (let d = 0; d < 10; d++)
      if (
        presentAt(g.s, g.w, life.prov, "fields", g.s.day + d, life).some(
          (x) => x.c === worker.id,
        )
      )
        seen++;
    expect(seen).toBeGreaterThan(4);
  });
});

describe("courting and outcomes", () => {
  test("an admirer becomes a sweetheart, who asks; a wedding follows", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const her = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 21,
    });
    her.home = life.prov;
    g.s.locals[life.prov].push(her.id);
    life.events = [];
    raiseLifeEvent(g, life, "admirer", { c: her.id });
    const ev = life.events.find((e) => e.key === "admirer")!;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(life.ties[her.id]).toBe("lover");
    // She asks, by the churchyard wall.
    const asks = TALES.find((t) => t.key === "sweetheart-asks")!;
    const ctx = asks.when!(g, life)!;
    expect(ctx.c).toBe(her.id);
    life.purse = 20;
    raiseLifeEvent(g, life, "sweetheart-asks", ctx);
    const q = life.events.find((e) => e.key === "sweetheart-asks")!;
    expect(q.scene).toBe("church");
    expect(g.lifeCommand("s1", { k: "event", id: q.id, choice: 0 })).toBeNull();
    expect(me.spouse).toBe(her.id);
    expect(life.ties[her.id]).toBeUndefined();
    // The scene says what was chosen and what it cost.
    expect(life.outcome?.choice).toMatch(/Marry/);
    expect(life.outcome?.fx?.some((f) => /coins/.test(f))).toBe(true);
  });

  test("an outcome lists what changed", () => {
    const g = world();
    const life = lifeOf(g);
    life.stress = 50;
    life.events = [];
    raiseLifeEvent(g, life, "rising-victory", { m: -1 });
    const ev = life.events[0];
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(life.outcome?.choice).toBe("Drink to it");
    expect(life.outcome?.fx).toContain("\u221220 stress");
  });

  test("what simply happens doesn't happen again for years", () => {
    const g = world();
    const life = lifeOf(g);
    life.events = [];
    raiseLifeEvent(g, life, "fortune-teller");
    expect(
      life.cooldowns["ev:fortune-teller"] - g.s.day,
    ).toBeGreaterThanOrEqual(1000);
  });
});

describe("ambitions and ties", () => {
  test("an ambition is set, followed and fulfilled", () => {
    const g = world();
    const life = lifeOf(g);
    expect(ambitionCheck(g.s, life, "fortune").ok).toBe(true);
    expect(g.lifeCommand("s1", { k: "ambition", key: "fortune" })).toBeNull();
    expect(life.ambition?.key).toBe("fortune");
    const renown = life.renown;
    life.purse += 150;
    ticks(g, 35);
    expect(life.ambition).toBeNull();
    expect(life.ambitionsDone).toContain("fortune");
    expect(life.renown).toBeGreaterThan(renown);
    expect(Object.keys(AMBITIONS).length).toBeGreaterThanOrEqual(10);
  });

  test("a mentor teaches every month", () => {
    const g = world();
    const life = lifeOf(g);
    const minister = peopleHere(g.s, life.prov, life).find(
      (c) => c.role === "preacher",
    );
    if (!minister) return;
    life.skills.faith = 1;
    minister.memories.push({
      of: life.c,
      why: "Fond of you",
      value: 60,
      until: 0,
    });
    const v = interactionView(g.s, g.w, life, minister.id, "mentor");
    expect(v.check.ok).toBe(true);
    expect(v.will).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: minister.id, act: "mentor" }),
    ).toBeNull();
    expect(life.ties[minister.id]).toBe("mentor");
    const xp = life.xp.faith + life.skills.faith * 100;
    ticks(g, 62);
    expect(life.xp.faith + life.skills.faith * 100).toBeGreaterThan(xp);
  });
});

describe("rumours", () => {
  test("talk spreads outward at a rider's pace", () => {
    const g = world();
    const here = prov("Jamestown");
    const far = prov("Massachusetts Bay");
    rumour(g, here, "Somebody's cow is in the churchyard again.");
    expect(heardHere(g.s, g.map, here).length).toBe(1);
    expect(heardHere(g.s, g.map, far).length).toBe(0);
    ticks(g, 40);
    expect(heardHere(g.s, g.map, far).some((r) => /cow/.test(r.text))).toBe(
      true,
    );
  });

  test("a player's wedding is talked about", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const bride = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 20,
    });
    bride.home = life.prov;
    g.s.locals[life.prov].push(bride.id);
    bride.memories.push({
      of: me.id,
      why: "Sweet on you",
      value: 90,
      until: 0,
    });
    life.purse = 30;
    expect(
      g.lifeCommand("s1", { k: "person", c: bride.id, act: "propose" }),
    ).toBeNull();
    expect(
      heardHere(g.s, g.map, life.prov).some((r) => /married/.test(r.text)),
    ).toBe(true);
    void actCheck;
  });
});

describe("risings", () => {
  test("when a cause rises, its sworn take up the standard and the rest must choose", () => {
    const g = world({
      start: 1700,
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bea", female: true }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    a.renown = 30;
    expect(
      g.lifeCommand("s1", {
        k: "movement",
        act: "found",
        goal: "overthrow",
        name: "The Jamestown Association",
      }),
    ).toBeNull();
    const m = movementOf(g.s, a.c)!;
    m.support = 80;
    for (const c of peopleHere(g.s, a.prov, a).slice(0, 3))
      m.members.push(c.id);
    a.events = [];
    b.events = [];
    expect(g.lifeCommand("s1", { k: "movement", act: "rise" })).toBeNull();
    expect(a.events.some((e) => e.key === "rising-standard")).toBe(true);
    const call = b.events.find((e) => e.key === "rising-call")!;
    expect(call).toBeDefined();
    expect(call.scene).toBe("rising");
    expect(
      heardHere(g.s, g.map, a.prov).some((r) => /risen in arms/.test(r.text)),
    ).toBe(true);
    // Unanswered, she'd keep her head down; she takes up a musket.
    expect(call.choices[0].label).toMatch(/keep your head down/);
    expect(
      g.lifeCommand("s2", { k: "event", id: call.id, choice: 1 }),
    ).toBeNull();
    expect(m.members).toContain(b.c);
  });
});

describe("governing", () => {
  test("a governor passes laws, builds public works and appoints the council", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const n = me.nation;
    const nation = g.s.nations[n];
    nation.ruler = me.id;
    const gov = (lever: Parameters<typeof g.lifeCommand>[1] & { k: "gov" }) =>
      g.lifeCommand("s1", lever);
    // A law: in force as a lasting modifier, and the assembly needs a rest.
    expect(
      gov({ k: "gov", lever: { l: "law", law: "toleration", on: true } }),
    ).toBeNull();
    expect(nation.laws).toContain("toleration");
    expect(nation.mods.some((m) => m.key === "law:toleration")).toBe(true);
    expect(
      gov({ k: "gov", lever: { l: "law", law: "sabbath", on: true } }),
    ).toMatch(/won't sit/);
    // Native customs aren't for a colony; laws that clash can't stand together.
    life.cooldowns["gov:law"] = 0;
    expect(
      gov({ k: "gov", lever: { l: "law", law: "mothers", on: true } }),
    ).toMatch(/isn't for your people/);
    expect(
      gov({ k: "gov", lever: { l: "law", law: "licensing", on: true } }),
    ).toBeNull();
    life.cooldowns["gov:law"] = 0;
    expect(
      gov({ k: "gov", lever: { l: "law", law: "freepress", on: true } }),
    ).toMatch(/can't stand/);
    expect(
      gov({ k: "gov", lever: { l: "law", law: "toleration", on: false } }),
    ).toBeNull();
    expect(nation.mods.some((m) => m.key === "law:toleration")).toBe(false);
    // A public work, paid from the treasury.
    nation.gold = 100;
    expect(
      gov({
        k: "gov",
        lever: { l: "project", key: "granary", p: nation.capital },
      }),
    ).toBeNull();
    expect(nation.gold).toBe(40);
    expect(nation.mods.some((m) => m.key === "project:granary")).toBe(true);
    expect(
      gov({
        k: "gov",
        lever: { l: "project", key: "college", p: nation.capital },
      }),
    ).toMatch(/150/);
    // An appointment from among the court: the old treasurer steps down.
    const c = peopleHere(g.s, life.prov, life).find(
      (x) =>
        x.nation === n &&
        ageOf(g.s, x) >= 18 &&
        !Object.values(nation.council).includes(x.id),
    )!;
    nation.court.push(c.id);
    const old = nation.council.treasurer;
    expect(
      gov({ k: "gov", lever: { l: "appoint", seat: "treasurer", c: c.id } }),
    ).toBeNull();
    expect(nation.council.treasurer).toBe(c.id);
    if (old >= 0) expect(nation.court).toContain(old);
  });
});

describe("army command", () => {
  test("a commander raises volunteers, splits the army and merges it again", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const a = g.s.armies.find((x) => x.owner === me.nation)!;
    expect(a).toBeDefined();
    a.commander = me.id;
    a.depart = -1;
    a.path = [];
    life.prov = a.prov;
    g.s.provinces[a.prov].occupier = -1;
    expect(g.lifeCommand("s1", { k: "army", act: "assault" })).toMatch(
      /besieging/,
    );
    life.purse = 5;
    expect(g.lifeCommand("s1", { k: "army", act: "recruit" })).toMatch(/coins/);
    life.purse = 100;
    const regs = a.regs.length;
    if (g.s.provinces[a.prov].owner === a.owner) {
      expect(g.lifeCommand("s1", { k: "army", act: "recruit" })).toBeNull();
      expect(a.regs.length).toBe(regs + 1);
      expect(g.lifeCommand("s1", { k: "army", act: "recruit" })).toMatch(
        /drained/,
      );
    }
    while (a.regs.length < 2)
      a.regs.push({ type: "militia", men: 500, morale: 0.7, home: a.prov });
    const before = g.s.armies.filter((x) => x.owner === a.owner).length;
    expect(g.lifeCommand("s1", { k: "army", act: "split" })).toBeNull();
    const after = g.s.armies.filter((x) => x.owner === a.owner);
    expect(after.length).toBe(before + 1);
    const other = after.find(
      (x) => x.id !== a.id && x.prov === a.prov && x.commander !== me.id,
    )!;
    expect(
      g.lifeCommand("s1", { k: "army", act: "merge", b: other.id }),
    ).toBeNull();
    expect(g.s.armies.filter((x) => x.owner === a.owner).length).toBe(before);
  });
});
