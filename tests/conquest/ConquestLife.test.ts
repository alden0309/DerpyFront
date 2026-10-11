import { describe, expect, test } from "vitest";
import { dayOf } from "../../src/conquest/engine/Calendar";
import {
  birth,
  kill,
  makeCharacter,
  marry,
} from "../../src/conquest/engine/Characters";
import { lifeCoins } from "../../src/conquest/engine/Coins";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { homeChoices, planProblem } from "../../src/conquest/engine/Life";
import { actCheck } from "../../src/conquest/engine/LifeActs";
import { raiseLifeEvent } from "../../src/conquest/engine/LifeEvents";
import {
  heirOf,
  isPlayed,
  meOf,
  officesOf,
  opinionOf,
  peopleHere,
  placesIn,
  promotionView,
  travelRoute,
} from "../../src/conquest/engine/LifeQueries";
import { EUROPE_FORTUNE } from "../../src/conquest/engine/LifeRules";
import { movementOf } from "../../src/conquest/engine/Movements";
import { ageOf } from "../../src/conquest/engine/Queries";
import type { GameState } from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("making a character", () => {
  test("a sensible plan is accepted, and the budgets are firm", () => {
    const g = world({ plans: [] });
    expect(planProblem(g.s, plan())).toBeNull();
    expect(planProblem(g.s, plan({ first: "" }))).toMatch(/First name/);
    expect(planProblem(g.s, plan({ age: 12 }))).toMatch(/Age/);
    expect(
      planProblem(g.s, plan({ skills: { persuasion: 9, trade: 9 } })),
    ).toMatch(/skills cost more/);
    expect(
      planProblem(
        g.s,
        plan({ stats: { dip: 12, mar: 12, ste: 5, int: 5, lea: 5 } }),
      ),
    ).toMatch(/attributes cost more/);
    expect(planProblem(g.s, plan({ traits: ["brave", "craven"] }))).toMatch(
      /don't go together/,
    );
    expect(
      planProblem(g.s, plan({ traits: ["charming", "educated"] })),
    ).toMatch(/flaw/);
    expect(
      planProblem(g.s, plan({ traits: ["charming", "educated", "lazy"] })),
    ).toBeNull();
    // A colonist can't be a warrior, nor begin in a native village.
    expect(planProblem(g.s, plan({ background: "warrior" }))).toMatch(
      /native peoples/,
    );
    expect(planProblem(g.s, plan({ home: prov("Pamunkey") }))).toMatch(/home/);
    // A Powhatan grower begins in a Powhatan village.
    expect(
      planProblem(
        g.s,
        plan({
          origin: "powhatan",
          home: prov("Pamunkey"),
          religion: "native",
          background: "grower",
          first: "Matoaka",
          family: "of the Turtle clan",
          female: true,
        }),
      ),
    ).toBeNull();
    // Only places that exist in the start year: no New Amsterdam for England in 1607.
    expect(planProblem(g.s, plan({ home: prov("New Amsterdam") }))).toMatch(
      /home/,
    );
  });

  test("a new life begins at home with its background's work", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    expect(me.first).toBe("Alden");
    expect(ageOf(g.s, me)).toBe(22);
    expect(life.prov).toBe(prov("Jamestown"));
    expect(life.job?.kind).toBe("farmer");
    expect(life.skills.farming).toBeGreaterThanOrEqual(6);
    expect(isPlayed(g.s, me.id)).toBe(true);
    // The people of Jamestown have come to be.
    expect(g.s.locals[prov("Jamestown")]?.length).toBeGreaterThan(2);
    expect(peopleHere(g.s, life.prov, life).length).toBeGreaterThan(3);
    expect(life.milestones[0].kind).toBe("born");
  });
});

describe("travel", () => {
  test("over land day by day, paying for the road", () => {
    const g = world();
    const life = lifeOf(g);
    const to = prov("Pamunkey");
    const route = travelRoute(g.s, map, life.prov, to, false)!;
    expect(route.path[route.path.length - 1]).toBe(to);
    const purse = life.purse;
    expect(g.lifeCommand("s1", { k: "travel", to })).toBeNull();
    expect(life.travel).not.toBeNull();
    expect(life.purse).toBeLessThan(purse);
    ticks(g, route.days + 2);
    expect(life.travel).toBeNull();
    expect(life.prov).toBe(to);
    expect(life.visited).toContain(to);
    expect(g.s.locals[to]).toBeDefined();
  });

  test("by sea from a port to an island", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 50;
    const to = prov("Bermuda");
    expect(travelRoute(g.s, map, life.prov, to, false)).toBeNull();
    const sea = travelRoute(g.s, map, life.prov, to, true)!;
    expect(sea.sea.some(Boolean)).toBe(true);
    expect(g.lifeCommand("s1", { k: "travel", to, bySea: true })).toBeNull();
    ticks(g, sea.days + 3);
    expect(life.prov).toBe(to);
  });
});

describe("work", () => {
  test("wages come monthly, skills grow, and promotion follows", () => {
    const g = world();
    const life = lifeOf(g);
    const start = life.purse;
    const xp = life.xp.farming + life.skills.farming * 1000;
    ticks(g, 40);
    expect(life.tally.earned).toBeGreaterThan(0);
    void start;
    expect(life.xp.farming + life.skills.farming * 1000).toBeGreaterThan(xp);
    // Yeoman is bought: land of your own.
    life.job!.months = 20;
    life.skills.farming = 10;
    const view = promotionView(g.s, life);
    expect(view.next?.title).toBe("Yeoman");
    expect(view.next?.buy).toBeDefined();
    life.purse = 60;
    expect(
      g.lifeCommand("s1", { k: "act", place: "fields", act: "buy" }),
    ).toBeNull();
    expect(life.job!.rank).toBe(1);
    // Freeholder comes by merit, in time.
    life.job!.months = 30;
    life.renown = 10;
    for (let i = 0; i < 24 && life.job!.rank < 2; i++) ticks(g, 31);
    expect(life.job!.rank).toBe(2);
    expect(life.tally.promotions).toBeGreaterThanOrEqual(2);
  });

  test("one job: hand in your notice, then ask to be taken on", () => {
    const g = world();
    const life = lifeOf(g);
    expect(placesIn(g.s, g.w, life.prov)).toContain("fort");
    expect(life.job?.kind).toBe("farmer");
    expect(
      g.lifeCommand("s1", { k: "job", place: "fort", job: "soldier" }),
    ).toMatch(/hand in your notice/);
    expect(g.lifeCommand("s1", { k: "quit" })).toBeNull();
    expect(
      g.lifeCommand("s1", { k: "job", place: "fort", job: "soldier" }),
    ).toBeNull();
    expect(life.job?.kind).toBe("soldier");
    expect(g.s.chars[life.job!.employer]?.role).toBe("sergeant");
    expect(
      g.lifeCommand("s1", { k: "job", place: "press", job: "newsman" }),
    ).toMatch(/nobody here|no such place|notice/i);
  });

  test("acts have cooldowns and costs; no casual work anywhere", () => {
    const g = world();
    const life = lifeOf(g);
    expect(actCheck(g.s, g.w, life, "fields", "labour").ok).toBe(false);
    expect(
      g.lifeCommand("s1", { k: "act", place: "tavern", act: "drink" }),
    ).toBeNull();
    expect(actCheck(g.s, g.w, life, "tavern", "drink").ok).toBe(false);
  });
});

describe("people", () => {
  test("opinions come with reasons; talk and gifts move them", () => {
    const g = world();
    const life = lifeOf(g);
    const c = peopleHere(g.s, life.prov, life).find(
      (x) => !isPlayed(g.s, x.id),
    )!;
    const before = opinionOf(g.s, c, life).total;
    life.purse = 30;
    expect(
      g.lifeCommand("s1", { k: "person", c: c.id, act: "gift", arg: 10 }),
    ).toBeNull();
    const after = opinionOf(g.s, c, life);
    expect(after.total).toBeGreaterThan(before);
    expect(after.parts.some((p) => p.label === "A generous gift")).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: c.id, act: "gift", arg: 10 }),
    ).toMatch(/Again/);
  });

  test("courting and marriage: the spouse moves in and children come", () => {
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
      value: 60,
      until: 0,
    });
    life.purse = 30;
    expect(
      g.lifeCommand("s1", { k: "person", c: bride.id, act: "propose" }),
    ).toBeNull();
    expect(me.spouse).toBe(bride.id);
    expect(bride.home).toBe(life.home);
    expect(bride.family).toBe("Drackley");
    expect(life.tally.marriages).toBe(1);
    // A few years on, there are usually children (a 30% chance a year).
    for (let i = 0; i < 12 && me.children.length === 0; i++) ticks(g, 365);
    expect(me.children.length).toBeGreaterThan(0);
    expect(life.tally.children).toBe(me.children.length);
  }, 30_000);
});

describe("death and the line", () => {
  test("the eldest child carries on, with the purse and a little of the name", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const wife = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 25,
    });
    marry(g.s, me, wife);
    const kid = birth(g.s, g.rng, me, wife, 18);
    life.purse = 90;
    life.renown = 40;
    kill(g, me, "a fall from a horse");
    expect(life.c).toBe(kid.id);
    expect(life.line).toEqual([me.id, kid.id]);
    expect(life.watching).toBe(false);
    expect(life.purse).toBeCloseTo(60, 0);
    expect(life.renown).toBeCloseTo(14, 0);
    expect(life.tally.generations).toBe(2);
    expect(life.milestones.some((m) => m.kind === "heir")).toBe(true);
  });

  test("with no heir the player watches, then takes over someone", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    kill(g, me, "the flux");
    expect(life.watching).toBe(true);
    expect(life.c).toBe(-1);
    expect(life.ended?.why).toMatch(/no heir/);
    expect(g.lifeCommand("s1", { k: "travel", to: 0 })).toMatch(/watching/);
    const someone = peopleHere(g.s, prov("Jamestown")).find(
      (c) => ageOf(g.s, c) >= 16 && !isPlayed(g.s, c.id),
    )!;
    expect(g.lifeCommand("s1", { k: "takeover", c: someone.id })).toBeNull();
    expect(life.c).toBe(someone.id);
    expect(life.watching).toBe(false);
    expect(life.tally.takeovers).toBe(1);
  });

  test("a watching player may begin a new character in the running world", () => {
    const g = world();
    const life = lifeOf(g);
    kill(g, meOf(g.s, life)!, "a fever");
    ticks(g, 200);
    expect(g.beginLife("s1", "Alden", plan({ first: "Ezra" }))).toBeNull();
    expect(meOf(g.s, life)!.first).toBe("Ezra");
    expect(life.line.length).toBe(2);
  });

  test("drop-in: a player joins a world that's been running for years", () => {
    const g = world({ plans: [] });
    ticks(g, 800);
    expect(g.s.lives.length).toBe(0);
    const home = homeChoices(g.s, "england")[0];
    expect(g.beginLife("late", "Pat", plan({ home }))).toBeNull();
    expect(lifeOf(g, "late").c).toBeGreaterThan(0);
    expect(lifeOf(g, "late").prov).toBe(home);
    expect(g.beginLife("late", "Pat", plan({ home }))).toMatch(/already/);
  });
});

describe("politics", () => {
  test("standing for the assembly and winning the election", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    expect(g.lifeCommand("s1", { k: "stand" })).toMatch(/freeholders|renown/);
    life.renown = 40;
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    life.campaign!.points = 200;
    const pol = g.s.polities[me.nation];
    g.s.day = pol.election - 1;
    g.tick();
    g.tick();
    for (let i = 0; i < 40 && !pol.assembly.includes(me.id); i++) g.tick();
    expect(pol.assembly).toContain(me.id);
    expect(officesOf(g.s, me.id).some((o) => o.kind === "assembly")).toBe(true);
    expect(life.tally.topOffice).toBeGreaterThanOrEqual(1);
  });

  test("the crown appoints a player of standing when the governorship falls empty", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    me.born -= 15 * 365;
    life.renown = 80;
    life.favor = 40;
    const n = g.s.nations[me.nation];
    const gov = g.s.chars[n.ruler];
    gov.children = [];
    kill(g, gov, "an apoplexy");
    expect(n.ruler).toBe(me.id);
    expect(life.tally.topOffice).toBe(3);
    // The governor's levers.
    expect(
      g.lifeCommand("s1", { k: "gov", lever: { l: "tax", level: 0 } }),
    ).toBeNull();
    expect(n.tax).toBe(0);
  });
});

describe("movements", () => {
  test("found a movement, grow it, rise: a rebel host goes to war", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    expect(
      g.lifeCommand("s1", { k: "movement", act: "found", goal: "overthrow" }),
    ).toMatch(/renown/);
    life.renown = 30;
    expect(
      g.lifeCommand("s1", {
        k: "movement",
        act: "found",
        goal: "overthrow",
        name: "The Jamestown Association",
      }),
    ).toBeNull();
    const m = movementOf(g.s, me.id)!;
    expect(m.name).toBe("The Jamestown Association");
    expect(g.lifeCommand("s1", { k: "movement", act: "rise" })).toMatch(
      /support/,
    );
    m.support = 80;
    for (const c of peopleHere(g.s, life.prov, life).slice(0, 3))
      m.members.push(c.id);
    const nations = g.s.nations.length;
    expect(g.lifeCommand("s1", { k: "movement", act: "rise" })).toBeNull();
    expect(m.status).toBe("risen");
    expect(g.s.nations.length).toBe(nations + 1);
    const rebels = g.s.nations[m.rebels];
    expect(rebels.kind).toBe("rebels");
    expect(
      g.s.wars.some(
        (w) =>
          (w.a === m.rebels && w.b === me.nation) ||
          (w.b === m.rebels && w.a === me.nation),
      ),
    ).toBe(true);
    const army = g.s.armies.find((a) => a.owner === m.rebels)!;
    expect(army.commander).toBe(me.id);
    // The player marches it.
    const target = g.s.nations[me.nation].capital;
    if (target !== army.prov)
      expect(g.lifeCommand("s1", { k: "march", to: target })).toBeNull();
    ticks(g, 365 * 3);
    expect(["risen", "won", "crushed", "faded"]).toContain(m.status);
  });

  test("history's movements appear when their time comes", () => {
    const g = world({ start: 1650 });
    g.s.day = dayOf(1674, 7);
    g.tick();
    for (let i = 0; i < 40; i++) g.tick();
    const bacon = g.s.movements.find((m) => m.key === "bacon");
    expect(bacon).toBeDefined();
    expect(g.s.chars[bacon!.leader].family).toBe("Bacon");
  });
});

describe("Europe", () => {
  test("sailing with an heir left behind: the heir carries on", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const wife = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 25,
    });
    marry(g.s, me, wife);
    const kid = birth(g.s, g.rng, me, wife, 17);
    life.purse = EUROPE_FORTUNE + 50;
    expect(g.lifeCommand("s1", { k: "europe", takeHeir: false })).toBeNull();
    expect(me.abroad).toBe(true);
    expect(life.c).toBe(kid.id);
    expect(life.tally.europe).toBe("fortune");
  });

  test("taking the family ends the story", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = EUROPE_FORTUNE + 50;
    expect(g.lifeCommand("s1", { k: "europe", takeHeir: true })).toBeNull();
    expect(life.watching).toBe(true);
    expect(life.ended?.why).toMatch(/Europe/);
  });

  test("too poor to go without an invitation", () => {
    const g = world();
    expect(g.lifeCommand("s1", { k: "europe", takeHeir: false })).toMatch(
      /coins/,
    );
  });
});

describe("events", () => {
  test("an event waits for a choice, and the choice does what it says", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 20;
    raiseLifeEvent(g, life, "seditious-libel", { m: -1 });
    expect(life.events.length).toBe(1);
    const ev = life.events[0];
    expect(ev.choices.length).toBe(3);
    expect(ev.choices[1].label).toMatch(/Letters \d+%/);
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 2 }),
    ).toBeNull();
    expect(life.events.length).toBe(0);
    expect(life.purse).toBe(12);
  });
});

describe("the end of the world", () => {
  test("1776 ends it for everyone, and the line is paid", () => {
    const g = world({ start: 1700, seed: 3 });
    const life = lifeOf(g);
    life.tally.days = 3000;
    life.tally.topRank = 3;
    g.s.day = g.s.endDay - 2;
    meOf(g.s, life)!.born = g.s.day - 40 * 365;
    ticks(g, 5);
    expect(g.s.over).toBe(true);
    expect(life.milestones.some((m) => m.kind === "end")).toBe(true);
    const coins = lifeCoins(life, true);
    expect(coins.total).toBeGreaterThan(10);
    expect(coins.total).toBeLessThan(150);
    expect(
      lifeCoins({ ...life, tally: { ...life.tally, days: 100 } }, true).total,
    ).toBe(0);
  });
});

describe("the same world everywhere", () => {
  test("a player's copy kept by deltas matches the server's", () => {
    const g = world({ start: 1650 });
    const copy: GameState = clone(g.s);
    g.takeDelta();
    const life = lifeOf(g);
    for (let day = 0; day < 400; day++) {
      g.tick();
      if (day === 3)
        g.lifeCommand("s1", { k: "act", place: "tavern", act: "drink" });
      if (day === 10)
        g.lifeCommand("s1", { k: "travel", to: prov("Pamunkey") });
      applyDelta(copy, g.takeDelta());
    }
    expect(copy.lives).toEqual(g.s.lives);
    expect(copy.locals).toEqual(g.s.locals);
    expect(copy.movements).toEqual(g.s.movements);
    expect(copy.chars[life.c]).toEqual(g.s.chars[life.c]);
  });

  test("the same seed plays out the same way", () => {
    const a = world({ seed: 99 });
    const b = world({ seed: 99 });
    ticks(a, 500);
    ticks(b, 500);
    expect(JSON.stringify(a.s.lives)).toBe(JSON.stringify(b.s.lives));
    expect(a.s.rng).toBe(b.s.rng);
  });
});

void ConquestGame;
void heirOf;
