// Derpy Conquest, round 13, EDU: sending the children to a dame school, a
// grammar school, a tutor, a convent or a mission; binding them apprentice
// by indenture to a real master of a town in one of the game's own trades;
// college at home or abroad, opening in its real year, gated by Latin and
// paid month by month, with classmates who go on through life; the native
// peoples' own ways; what it all leaves an heir; computer families doing the
// same; and the state surviving a save.

import { describe, expect, test } from "vitest";
import { CHAPTERS } from "../../src/conquest/client/guide/Chapters";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import {
  apprenticeCounts,
  callingOffers,
  callingsFor,
  childSkill,
  collegeOffers,
  computerFamilies,
  eduBudget,
  eduChipText,
  eduOffer,
  eduStatus,
  lettersOf,
  masterTemper,
  pathOffers,
  pickEvent,
  provByName,
  schoolOffers,
  successorOf,
} from "../../src/conquest/engine/Edu";
import {
  CALLINGS,
  COLLEGE_BY_KEY,
  COLLEGES,
  COURSES,
  eduStartRank,
  PATHS,
  SCHOOLS,
} from "../../src/conquest/engine/EduData";
import { EDU_EVENTS } from "../../src/conquest/engine/EduEvents";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { raiseEvent } from "../../src/conquest/engine/Hooks";
import { kidsAtHome } from "../../src/conquest/engine/Household";
import { succeedTo } from "../../src/conquest/engine/Life";
import {
  answerLifeEvent,
  LIFE_EVENTS,
} from "../../src/conquest/engine/LifeEvents";
import {
  familyAtHome,
  meOf,
  monthlyBudget,
  startRank,
} from "../../src/conquest/engine/LifeQueries";
import { JOBS, roleJobs, ROLES } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { ageOf } from "../../src/conquest/engine/Queries";
import type {
  Character,
  GameState,
  Life,
  Religion,
} from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, toNextMonth, world } from "./LifeUtil";

type G = ReturnType<typeof world>;

function kid(
  g: G,
  life: Life,
  age: number,
  female = false,
  religion: Religion = "anglican",
): Character {
  const me = meOf(g.s, life)!;
  const c = makeCharacter(g.s, g.rng, {
    nation: me.nation,
    culture: g.s.nations[me.nation].culture,
    religion,
    female,
    age,
  });
  c.father = me.id;
  c.family = me.family;
  c.home = life.home;
  me.children.push(c.id);
  return c;
}

/** Jump the calendar (for what opens in which year); the world stays as it was. */
function setYear(g: G, year: number): void {
  g.s.day = dayOf(year, 2, 10);
}

describe("the data: real places, real years, the game's own trades", () => {
  test("every school, mission and college is on the map", () => {
    for (const d of SCHOOLS)
      for (const p of d.places ?? [])
        expect(
          provByName(AMERICAS, p.prov),
          `${d.key} ${p.prov}`,
        ).toBeGreaterThanOrEqual(0);
    for (const c of COLLEGES)
      if (c.prov)
        expect(provByName(AMERICAS, c.prov), c.key).toBeGreaterThanOrEqual(0);
  });

  test("the colleges open in their real years", () => {
    const years: Record<string, number> = {
      harvard: 1636,
      indian: 1655,
      wm: 1693,
      yale: 1701,
      nj: 1746,
      kings: 1754,
      philadelphia: 1755,
      ri: 1764,
      queens: 1766,
      dartmouth: 1769,
      mexico: 1551,
    };
    for (const [k, y] of Object.entries(years))
      expect(COLLEGE_BY_KEY.get(k)?.from, k).toBe(y);
    // Abroad as asked: Oxford, Cambridge, Edinburgh, Leiden, Paris,
    // Salamanca, Uppsala, the Jesuit colleges, and San Marcos at Lima.
    for (const k of [
      "oxford",
      "cambridge",
      "edinburgh",
      "leiden",
      "paris",
      "salamanca",
      "uppsala",
      "lafleche",
      "stomer",
      "lima",
    ])
      expect(COLLEGE_BY_KEY.get(k)?.prov, k).toBeNull();
  });

  test("every trade leads to one of the game's own ladders, with masters who hire for it", () => {
    for (const c of CALLINGS) {
      if (c.job) expect(JOBS[c.job], c.key).toBeDefined();
      for (const r of c.roles) expect(ROLES[r], `${c.key} ${r}`).toBeDefined();
      if (!c.mistress && c.job)
        expect(
          c.roles.some((r) => roleJobs(r).includes(c.job!)),
          c.key,
        ).toBe(true);
      expect(c.years).toBeGreaterThanOrEqual(5);
      expect(c.years).toBeLessThanOrEqual(7);
    }
    for (const p of PATHS) if (p.job) expect(JOBS[p.job], p.key).toBeDefined();
    // The girls' trades of the time are there, and taught by women.
    for (const k of [
      "mantua",
      "milliner",
      "seamstress",
      "midwife",
      "housewifery",
    ]) {
      const c = CALLINGS.find((x) => x.key === k)!;
      expect(c.sex).toBe("girls");
      expect(c.mistress).toBe(true);
    }
  });
});

describe("school", () => {
  test("a dame school for a little one, the grammar school for a boy, needlework for a girl", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 50;
    const small = kid(g, life, 6);
    const boy = kid(g, life, 9);
    const girl = kid(g, life, 9, true);
    const ok = (c: Character, key: string) =>
      schoolOffers(g.s, g.w, life, c).find((o) => o.key === key)!.check.ok;
    expect(ok(small, "dame")).toBe(true);
    expect(ok(small, "grammar")).toBe(false);
    expect(ok(boy, "grammar")).toBe(true);
    expect(ok(girl, "grammar")).toBe(false);
    expect(ok(girl, "needle")).toBe(true);
    // Girls have their own schools; no convent for a Protestant family.
    expect(
      schoolOffers(g.s, g.w, life, girl).some((o) => o.key === "convent"),
    ).toBe(false);
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "school",
        c: boy.id,
        key: "grammar",
      }),
    ).toBeNull();
    expect(boy.edu?.now?.kind).toBe("school");
    expect(boy.edu?.now?.away).toBe(false);
    // It's a line in the month's budget, and it's paid.
    const line = eduBudget(g.s, life)[0];
    expect(line.label).toMatch(/School: .*grammar school/);
    expect(line.value).toBeCloseTo(-0.4);
    expect(
      monthlyBudget(g.s, g.w, life).parts.some((p) => p.label === line.label),
    ).toBe(true);
    const before = lettersOf(g.s, boy);
    for (let m = 0; m < 24; m++) toNextMonth(g);
    expect(boy.edu!.pts.letters!).toBeGreaterThan(1);
    expect(lettersOf(g.s, boy)).toBeGreaterThan(before);
  });

  test("a tutor at home, at a tutor's price", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 40;
    const c = kid(g, life, 8, true);
    expect(
      g.lifeCommand("s1", { k: "edu", act: "school", c: c.id, key: "tutor" }),
    ).toBeNull();
    expect(c.edu?.now?.fee).toBeCloseTo(1.2);
    expect(eduChipText(c)).toBe("With a tutor");
    // At home, so still at home.
    expect(kidsAtHome(g.s, life).some((k) => k.id === c.id)).toBe(true);
  });

  test("Catholic girls board with the Ursulines; boys go to the Jesuits", () => {
    const g = world({
      start: 1700,
      plans: [
        {
          seat: "s1",
          name: "Pat",
          plan: plan({
            origin: "france",
            home: prov("Quebec"),
            religion: "catholic",
            first: "Pierre",
            family: "Lefebvre",
            background: "trapper",
            age: 36,
          }),
        },
      ],
    });
    const life = lifeOf(g);
    life.purse = 50;
    const girl = kid(g, life, 8, true, "catholic");
    const boy = kid(g, life, 9, false, "catholic");
    const convent = schoolOffers(g.s, g.w, life, girl).find(
      (o) => o.key === "convent",
    )!;
    expect(convent.check.ok).toBe(true);
    expect(convent.where).toMatch(/Ursulines/);
    expect(convent.away).toBe(true);
    const jesuit = schoolOffers(g.s, g.w, life, boy).find(
      (o) => o.key === "jesuit",
    )!;
    expect(jesuit.check.ok).toBe(true);
    expect(jesuit.where).toMatch(/Jesuit college at Quebec/);
    // No Latin grammar school in New France: the Jesuits are it.
    expect(
      schoolOffers(g.s, g.w, life, boy).find((o) => o.key === "grammar")!.check
        .ok,
    ).toBe(false);
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "school",
        c: girl.id,
        key: "convent",
      }),
    ).toBeNull();
    expect(familyAtHome(g.s, life).some((c) => c.id === girl.id)).toBe(false);
  });
});

describe("apprenticeship", () => {
  test("bound by indenture to a real master of the town, in one of the game's trades", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 13);
    expect(callingsFor(boy).some((c) => c.key === "mantua")).toBe(false);
    const offers = callingOffers(g.s, g.w, life, boy, "cooper");
    expect(offers.length).toBeGreaterThan(0);
    const o = offers.find((x) => x.check.ok)!;
    const master = g.s.chars[o.by];
    expect(master.role).toBe("master");
    expect(g.s.locals[o.at]).toContain(master.id);
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "bind",
        c: boy.id,
        key: "cooper",
        by: master.id,
      }),
    ).toBeNull();
    expect(life.purse).toBeCloseTo(purse - 3);
    const now = boy.edu!.now!;
    expect(now.kind).toBe("apprentice");
    expect(now.by).toBe(master.id);
    expect(Math.round((now.until - now.since) / 365)).toBe(7);
    // He lives with his master now.
    expect(now.away).toBe(true);
    expect(familyAtHome(g.s, life).some((c) => c.id === boy.id)).toBe(false);
    expect(kidsAtHome(g.s, life).some((c) => c.id === boy.id)).toBe(false);
    expect(apprenticeCounts(g.s).get(master.id)).toBe(1);
    // No fee a month: the master keeps him.
    expect(eduBudget(g.s, life)).toEqual([]);
    // The term served: a journeyman, taken on a rung up.
    for (let m = 0; m < 6; m++) toNextMonth(g);
    expect(boy.edu!.pts.craft!).toBeGreaterThan(0);
    boy.edu!.now!.until = g.s.day + 1;
    toNextMonth(g);
    expect(boy.edu!.now).toBeNull();
    expect(boy.edu!.papers).toContain("cooper");
    expect(boy.edu!.past[0].done).toBe(true);
    expect(eduStartRank(boy.edu, "cooper")).toBe(1);
    expect(eduChipText(boy)).toBe("Journeyman cooper");
  });

  test("girls are bound to a mistress: mantua-maker, milliner, seamstress, midwife, housewifery", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const girl = kid(g, life, 13, true);
    const keys = callingsFor(girl).map((c) => c.key);
    for (const k of [
      "mantua",
      "milliner",
      "seamstress",
      "midwife",
      "housewifery",
    ])
      expect(keys).toContain(k);
    expect(keys).not.toContain("smith");
    const o = callingOffers(g.s, g.w, life, girl, "mantua").find(
      (x) => x.check.ok,
    )!;
    expect(g.s.chars[o.by].female).toBe(true);
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "bind",
        c: girl.id,
        key: "mantua",
        by: o.by,
      }),
    ).toBeNull();
    expect(girl.edu!.now!.until - girl.edu!.now!.since).toBe(5 * 365);
    // A boy can't be bound to a mantua-maker.
    const boy = kid(g, life, 13);
    expect(
      eduOffer(g.s, g.w, life, {
        act: "bind",
        c: boy.id,
        key: "mantua",
        by: o.by,
      }).check.ok,
    ).toBe(false);
  });

  test("the learned trades want letters and a premium", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 10;
    const boy = kid(g, life, 13);
    boy.taught = { letters: 0 };
    const o = callingOffers(g.s, g.w, life, boy, "merchant")[0];
    expect(o.once).toBe(30);
    expect(o.check.ok).toBe(false);
  });

  test("a hard master and a good one: their name in town and how the child fares", () => {
    const g = world({ start: 1700 });
    const m = makeCharacter(g.s, g.rng, {
      nation: 0,
      culture: "english",
      religion: "anglican",
      age: 40,
      traits: ["cruel", "greedy"],
    });
    const n = makeCharacter(g.s, g.rng, {
      nation: 0,
      culture: "english",
      religion: "anglican",
      age: 40,
      traits: ["just", "generous"],
    });
    expect(masterTemper(m)).toBe(-2);
    expect(masterTemper(n)).toBe(2);
    const c = makeCharacter(g.s, g.rng, {
      nation: 0,
      culture: "english",
      religion: "anglican",
      age: 14,
    });
    const hard = {
      kind: "apprentice" as const,
      key: "cooper",
      at: 0,
      by: m.id,
      since: 0,
      until: 9999,
      away: true,
      fee: 0,
      mood: -2,
    };
    expect(pickEvent(g.s, hard, c, 14, 0.01, 0.5)).toBe("edu-harsh");
    expect(pickEvent(g.s, hard, c, 14, 0.5, 0.01)).toBe("edu-runaway");
    expect(pickEvent(g.s, { ...hard, mood: 2 }, c, 14, 0.99, 0.5)).toBe(
      "edu-good",
    );
    expect(pickEvent(g.s, { ...hard, mood: 0 }, c, 14, 0.5, 0.5)).toBeNull();
  });

  test("the master dies: the indenture is assigned to the widow (an event, answered)", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 13);
    const o = callingOffers(g.s, g.w, life, boy, "cooper").find(
      (x) => x.check.ok,
    )!;
    g.lifeCommand("s1", {
      k: "edu",
      act: "bind",
      c: boy.id,
      key: "cooper",
      by: o.by,
    });
    const master = g.s.chars[o.by];
    // Give him a widow-to-be.
    const wife = makeCharacter(g.s, g.rng, {
      nation: master.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 38,
    });
    master.spouse = wife.id;
    wife.spouse = master.id;
    wife.home = master.home;
    master.alive = false;
    master.died = { day: g.s.day, cause: "a fever" };
    wife.spouse = -1;
    expect(successorOf(g.s, g.w, boy)?.id).toBe(wife.id);
    life.events = [];
    toNextMonth(g);
    const ev = life.events.find((e) => e.key === "edu-master")!;
    expect(ev).toBeDefined();
    expect(answerLifeEvent(g, life, ev.id, 0)).toBeNull();
    expect(boy.edu!.now!.by).toBe(wife.id);
  });

  test("a hard master's apprentice can be fetched home (the event's choice)", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 13);
    const o = callingOffers(g.s, g.w, life, boy, "cooper").find(
      (x) => x.check.ok,
    )!;
    g.lifeCommand("s1", {
      k: "edu",
      act: "bind",
      c: boy.id,
      key: "cooper",
      by: o.by,
    });
    life.events = [];
    const raise = EDU_EVENTS.find((e) => e.key === "edu-harsh")!;
    expect(raise.choices.length).toBe(3);
    // Raised as the month would raise it.
    raiseEvent(g, life, "edu-harsh", { c: boy.id, m: o.by });
    const ev = life.events.find((e) => e.key === "edu-harsh")!;
    expect(ev.title).toMatch(/hard master/);
    expect(answerLifeEvent(g, life, ev.id, 1)).toBeNull();
    expect(boy.edu!.now).toBeNull();
    expect(boy.edu!.past[0].done).toBe(false);
  });
});

describe("college", () => {
  function scholar(g: G, life: Life, age = 15): Character {
    const c = kid(g, life, age);
    c.taught = { letters: 4 };
    c.edu = { now: null, past: [], pts: { letters: 4 } };
    return c;
  }

  test("each opens in its year; Latin is tested; no women; a test of religion", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = scholar(g, life);
    const offer = (key: string) =>
      collegeOffers(g.s, g.w, life, boy).find((o) => o.key === key);
    expect(offer("harvard")!.check.ok).toBe(true);
    expect(offer("wm")!.check.ok).toBe(true);
    // Yale is coming; the College of New Jersey isn't on anyone's mind yet.
    expect(offer("yale")!.check.ok).toBe(false);
    expect(offer("yale")!.needs[0].label).toMatch(/1701/);
    expect(offer("nj")).toBeUndefined();
    setYear(g, 1750);
    const later = scholar(g, life);
    const offer2 = (key: string) =>
      collegeOffers(g.s, g.w, life, later).find((o) => o.key === key);
    expect(offer2("yale")!.check.ok).toBe(true);
    expect(offer2("nj")!.check.ok).toBe(true);
    expect(offer2("kings")!.check.ok).toBe(false);
    setYear(g, 1700);
    // Without his Latin he isn't admitted.
    const dunce = kid(g, life, 15);
    dunce.stats.lea = 2;
    expect(lettersOf(g.s, dunce)).toBeLessThan(5);
    expect(
      collegeOffers(g.s, g.w, life, dunce).find((o) => o.key === "harvard")!
        .check,
    ).toMatchObject({ ok: false });
    // No college took women.
    const girl = scholar(g, life);
    girl.female = true;
    expect(collegeOffers(g.s, g.w, life, girl).every((o) => !o.check.ok)).toBe(
      true,
    );
    // Oxford wants an Anglican; a Puritan can't take a Cambridge degree after 1662.
    const puritan = scholar(g, life);
    puritan.religion = "puritan";
    expect(
      collegeOffers(g.s, g.w, life, puritan).find((o) => o.key === "oxford"),
    ).toBeUndefined();
    expect(
      collegeOffers(g.s, g.w, life, puritan).find((o) => o.key === "cambridge")!
        .check.ok,
    ).toBe(false);
    expect(
      collegeOffers(g.s, g.w, life, puritan).find((o) => o.key === "harvard")!
        .check.ok,
    ).toBe(true);
  });

  test("admitted: the bills by the month, classmates who are real people, a degree at the end", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = scholar(g, life);
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "college",
        c: boy.id,
        key: "harvard",
        rank: 1,
        course: "divinity",
      }),
    ).toBeNull();
    const now = boy.edu!.now!;
    expect(now.course).toBe("divinity");
    expect(now.fee).toBeCloseTo(2.5);
    expect(Math.round((now.until - now.since) / 365)).toBe(4);
    const mates = boy.edu!.mates!;
    expect(mates.length).toBeGreaterThanOrEqual(3);
    for (const id of mates) {
      const m = g.s.chars[id];
      expect(m.alive).toBe(true);
      expect(m.home).toBeDefined();
      expect(m.memories.some((x) => x.of === boy.id)).toBe(true);
    }
    expect(eduBudget(g.s, life)[0].label).toMatch(/College: .* at Harvard/);
    expect(eduStatus(g.s, g.map, boy)!.chip).toBe("At Harvard");
    // Months pass: he learns, and the bills are paid.
    const purse = life.purse;
    for (let m = 0; m < 3; m++) toNextMonth(g);
    expect(life.purse).toBeLessThan(purse);
    expect(boy.edu!.pts.faith!).toBeGreaterThan(0);
    // Commencement.
    boy.edu!.now!.until = g.s.day + 1;
    const renown = life.renown;
    toNextMonth(g);
    expect(boy.edu!.degree).toBe("harvard");
    expect(boy.traits).toContain("educated");
    expect(life.renown).toBeGreaterThan(renown - 1);
    // The door into the pulpit: a curate, and a rung up anywhere learned.
    expect(eduStartRank(boy.edu, "preacher")).toBe(2);
    expect(eduStartRank(boy.edu, "law")).toBe(1);
    expect(eduStartRank(boy.edu, "cooper")).toBe(0);
  });

  test("abroad: the passage paid, and the college is over the sea", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = scholar(g, life, 16);
    boy.taught = { letters: 4 };
    boy.edu!.pts.letters = 6;
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "college",
        c: boy.id,
        key: "oxford",
        rank: 2,
        course: "law",
      }),
    ).toBeNull();
    expect(life.purse).toBeCloseTo(purse - 25);
    expect(boy.edu!.now!.at).toBe(-1);
    expect(boy.edu!.now!.fee).toBeCloseTo(12);
  });
});

describe("the native peoples' own ways", () => {
  function nativeWorld(): G {
    return world({
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({
            origin: "powhatan",
            religion: "native",
            background: "hunter",
            home: prov("Pamunkey"),
            first: "Opechan",
            family: "of the Deer clan",
            age: 34,
          }),
        },
      ],
    });
  }

  test("learning from the elders, the hunt, the healer: real teachers of the village", () => {
    const g = nativeWorld();
    const life = lifeOf(g);
    const boy = kid(g, life, 10, false, "native");
    const paths = pathOffers(g.s, g.w, life, boy);
    expect(paths.map((p) => p.key)).toEqual(PATHS.map((p) => p.key));
    const hunt = paths.find((p) => p.key === "hunt")!;
    expect(hunt.check.ok).toBe(true);
    expect(g.s.chars[hunt.by].role).toMatch(/hunter|warleader/);
    expect(paths.find((p) => p.key === "grower")!.check.ok).toBe(false); // the women's fields
    expect(
      g.lifeCommand("s1", { k: "edu", act: "path", c: boy.id, key: "hunt" }),
    ).toBeNull();
    expect(boy.edu!.now!.fee).toBe(0);
    // Colonists' trades aren't theirs.
    const teen = kid(g, life, 13, false, "native");
    expect(
      callingOffers(g.s, g.w, life, teen, "cooper").every((o) => !o.check.ok),
    ).toBe(true);
  });

  test("a mission school where and when there was one; the Indian College at Harvard", () => {
    const g = nativeWorld();
    const life = lifeOf(g);
    const at = (y: number) => {
      setYear(g, y);
      const girl = kid(g, life, 9, true, "native");
      return schoolOffers(g.s, g.w, life, girl).find(
        (o) => o.key === "mission",
      )!;
    };
    expect(at(1610).check.ok).toBe(false);
    const brafferton = at(1725);
    expect(brafferton.check.ok).toBe(true);
    expect(brafferton.where).toMatch(/Brafferton/);
    // Colonists' schools are not for them; Harvard's Indian College is.
    const girl = kid(g, life, 9, true, "native");
    expect(
      schoolOffers(g.s, g.w, life, girl).some((o) => o.key === "grammar"),
    ).toBe(false);
    setYear(g, 1660);
    const boy = kid(g, life, 16, false, "native");
    boy.edu = { now: null, past: [], pts: { letters: 5 } };
    const cols = collegeOffers(g.s, g.w, life, boy).map((o) => o.key);
    expect(cols).toContain("indian");
    expect(cols).not.toContain("oxford");
  });
});

describe("heirs", () => {
  test("a son at college comes home as heir, keeps his learning and his friends", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = kid(g, life, 18);
    boy.edu = { now: null, past: [], pts: { letters: 5 } };
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "college",
        c: boy.id,
        key: "wm",
        rank: 1,
        course: "arts",
      }),
    ).toBeNull();
    for (let m = 0; m < 4; m++) toNextMonth(g);
    // Three years and more in: the degree is granted.
    const now = boy.edu!.now!;
    now.since = g.s.day - Math.round(3.3 * 365);
    now.until = now.since + 4 * 365;
    const mates = boy.edu!.mates!;
    succeedTo(g, life, boy.id);
    expect(life.c).toBe(boy.id);
    expect(boy.edu!.now).toBeNull();
    expect(boy.edu!.degree).toBe("wm");
    expect(boy.traits).toContain("educated");
    expect(life.prov).toBe(life.home);
    // His letters are in his skills; his classmates are people he knows.
    expect(life.skills.letters).toBeGreaterThanOrEqual(8);
    for (const id of mates) expect(life.met).toContain(id);
    expect(Object.values(life.ties)).toContain("friend");
  });

  test("an apprentice nearly out of his time comes home a journeyman, and takes work as one", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 19);
    boy.born -= 0;
    const o = callingOffers(g.s, g.w, life, boy, "cooper").find((x) =>
      x.needs.every((n) => n.met || /Aged/.test(n.label)),
    )!;
    // Bound at 13, six years ago.
    boy.edu = {
      now: {
        kind: "apprentice",
        key: "cooper",
        at: life.home,
        by: o.by,
        since: g.s.day - 6 * 365,
        until: g.s.day + 365,
        away: true,
        fee: 0,
        mood: 0,
        seat: "s1",
        got: 0.85,
      },
      past: [],
      pts: { craft: 5, trade: 1.3 },
    };
    succeedTo(g, life, boy.id);
    expect(boy.edu!.papers).toContain("cooper");
    expect(life.skills.craft).toBeGreaterThanOrEqual(6);
    expect(startRank(g.s, life, "cooper")).toBe(1);
    expect(life.job?.kind).toBe("cooper");
    expect(life.job?.rank).toBe(1);
    expect(life.job?.employer).toBe(o.by);
  });

  test("a little one away at school when you die comes home", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 10);
    g.lifeCommand("s1", { k: "edu", act: "school", c: boy.id, key: "grammar" });
    succeedTo(g, life, boy.id);
    expect(boy.edu!.now).toBeNull();
    expect(boy.edu!.past[0].why).toMatch(/head the family/);
  });
});

describe("computer families", () => {
  test("they school and apprentice their own children, at no cost to anyone", () => {
    const g = world({ start: 1700, seed: 3 });
    // Grow the town's families a little.
    const s = g.s;
    for (const id of [...(s.locals[prov("Jamestown")] ?? [])]) {
      const c = s.chars[id];
      if (c.spouse < 0 || c.female) continue;
      for (const age of [5, 9, 13, 14]) {
        const k = makeCharacter(s, g.rng, {
          nation: c.nation,
          culture: c.culture,
          religion: c.religion,
          age,
          female: age === 9,
        });
        k.father = c.id;
        k.home = c.home;
        c.children.push(k.id);
      }
    }
    let started = 0;
    for (let y = 0; y < 4; y++) {
      computerFamilies(g);
      started = Object.values(s.chars).filter((c) => c.edu).length;
      if (started > 4) break;
      s.day += 365;
    }
    expect(started).toBeGreaterThan(0);
    const pupils = Object.values(s.chars).filter((c) => c.edu?.now);
    for (const c of pupils) {
      expect(c.edu!.now!.fee).toBe(0);
      expect(c.edu!.now!.seat).toBeUndefined();
      if (c.edu!.now!.kind === "apprentice")
        expect(s.chars[c.edu!.now!.by].alive).toBe(true);
    }
  });
});

describe("letters, bills and the save", () => {
  test("a child away writes home; the letter comes from where they are", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = kid(g, life, 15);
    boy.edu = { now: null, past: [], pts: { letters: 5 } };
    g.lifeCommand("s1", {
      k: "edu",
      act: "college",
      c: boy.id,
      key: "harvard",
      rank: 1,
      course: "arts",
    });
    for (let m = 0; m < 9; m++) toNextMonth(g);
    const letters = (life.post ?? []).filter(
      (l) => l.from === boy.id && l.kind === "news",
    );
    expect(letters.length).toBeGreaterThan(0);
    expect(letters[0].origin).toBe(prov("Massachusetts Bay"));
    expect(letters[0].text).toMatch(/Honoured/);
  });

  test("three months of bills unpaid and they're sent home", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 20;
    const c = kid(g, life, 8);
    g.lifeCommand("s1", { k: "edu", act: "school", c: c.id, key: "tutor" });
    for (let m = 0; m < 5; m++) {
      life.purse = -5;
      toNextMonth(g);
    }
    expect(c.edu!.now).toBeNull();
    expect(c.edu!.past[0].why).toMatch(/unpaid/);
  });

  test("it all survives a save and a load, and goes out to the players", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 400;
    const boy = kid(g, life, 13);
    const o = callingOffers(g.s, g.w, life, boy, "cooper").find(
      (x) => x.check.ok,
    )!;
    g.takeDelta();
    g.lifeCommand("s1", {
      k: "edu",
      act: "bind",
      c: boy.id,
      key: "cooper",
      by: o.by,
    });
    const d = g.takeDelta();
    expect(d.chars?.[boy.id]?.edu?.now?.kind).toBe("apprentice");
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(AMERICAS, saved);
    expect(g2.s.chars[boy.id].edu?.now?.by).toBe(o.by);
    for (let m = 0; m < 2; m++) toNextMonth(g2 as G);
    expect(g2.s.chars[boy.id].edu!.pts.craft!).toBeGreaterThan(0);
    // An old save, with no schooling anywhere, loads and runs.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const c of Object.values(old.chars)) delete c.edu;
    const g3 = new ConquestGame(AMERICAS, old);
    toNextMonth(g3 as G);
    expect(
      childSkill(g3.s, g3.s.chars[boy.id], "craft"),
    ).toBeGreaterThanOrEqual(0);
  });

  test("the old question of what's to become of them leaves a child already placed alone", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 60;
    const boy = kid(g, life, 13);
    const def = LIFE_EVENTS.find((e) => e.key === "child-trade")!;
    expect(def.when!(g, life)).toEqual({ c: boy.id });
    const o = callingOffers(g.s, g.w, life, boy, "cooper").find(
      (x) => x.check.ok,
    )!;
    g.lifeCommand("s1", {
      k: "edu",
      act: "bind",
      c: boy.id,
      key: "cooper",
      by: o.by,
    });
    expect(def.when!(g, life)).toBeNull();
    expect(ageOf(g.s, boy)).toBe(13);
  });
});

describe("the guide", () => {
  test("a chapter on children's schooling, from the rules", () => {
    const ch = CHAPTERS.find((c) => c.id === "schooling")!;
    expect(ch.title).toBe("Children: school, apprenticeship and college");
    for (const c of COLLEGES) expect(ch.body, c.key).toContain(c.name);
    for (const c of CALLINGS) expect(ch.body, c.key).toContain(c.name);
    for (const c of Object.values(COURSES)) expect(ch.body).toContain(c.name);
  });
});
