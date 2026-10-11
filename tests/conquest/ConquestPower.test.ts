// POWER (r12): one political office at a time; real powers for the county
// offices; the governor's council (seats, claims, portfolios, votes,
// proclamations); the assembly's bills; trials as scenes (a player
// defendant, a player justice, a witch); newspapers; and that all of it
// saves, loads, travels in deltas and runs the same twice.

import { describe, expect, test } from "vitest";
import { billCheck, BILLS } from "../../src/conquest/engine/Assembly";
import { powerCheck, POWERS } from "../../src/conquest/engine/Authority";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import {
  councilAdvice,
  councillors,
  ensureCabinet,
  favourOf,
  seatClaim,
  seatCouncillor,
} from "../../src/conquest/engine/Council";
import {
  seatHolderId,
  seatTitleOf,
} from "../../src/conquest/engine/CouncilTitles";
import { jail } from "../../src/conquest/engine/Crime";
import { watchStrength } from "../../src/conquest/engine/CrimeQueries";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { meOf, officesOf } from "../../src/conquest/engine/LifeQueries";
import {
  eligible,
  ensureOffices,
  giveOffice,
  OFFICES,
} from "../../src/conquest/engine/Offices";
import { giveUpWarning, postsOf } from "../../src/conquest/engine/OneOffice";
import { swayOf } from "../../src/conquest/engine/PowerCore";
import {
  libelSuit,
  paperOf,
  pieceTargets,
  readPapers,
} from "../../src/conquest/engine/Press";
import { openTrial, trialById } from "../../src/conquest/engine/Trials";
import type {
  Character,
  GameState,
  Life,
  LocalOffice,
  Movement,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, ticks, toNextMonth, world, YEAR } from "./LifeUtil";

function like(g: ConquestGame, life: Life, c: Character, v = 60): void {
  g.char(c.id).memories.push({ of: life.c, why: "Test", value: v, until: 0 });
}

const office = (g: ConquestGame, life: Life, key: LocalOffice["key"]) =>
  ensureOffices(g, life.prov).find((o) => o.key === key)!;

/** Answer whatever scene is up, by choice index (or the first allowed). */
function answer(
  g: ConquestGame,
  life: Life,
  key: string,
  pick = 0,
): string | null {
  const ev = life.events.find((e) => e.key === key);
  if (!ev)
    return `no ${key} (have ${life.events.map((e) => e.key).join(", ")})`;
  const err = g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: pick });
  if (!err) return null;
  return g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: 0 });
}

function journalHas(life: Life, re: RegExp): boolean {
  return life.journal.some((j) => re.test(j.text));
}

function strong(life: Life): void {
  life.renown = 70;
  life.favor = 40;
  life.purse = 300;
  for (const k of Object.keys(life.skills) as (keyof Life["skills"])[])
    life.skills[k] = 14;
}

describe("one political office at a time", () => {
  test("winning a poll resigns the office you held, with a warning first and a journal line after", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 32 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const constable = office(g, life, "constable");
    giveOffice(g, constable, life.c, "for the test");
    expect(constable.holder).toBe(life.c);
    const burgess = office(g, life, "burgess");
    // The warning before you stand.
    expect(
      giveUpWarning(g.s, g.w, life.c, {
        kind: "local",
        n: burgess.nation,
        o: burgess,
      }),
    ).toMatch(/one office at a time.*Constable/i);
    burgess.election = g.s.day + 30;
    expect(
      g.lifeCommand("s1", { k: "society", act: "stand", id: burgess.id }),
    ).toBeNull();
    for (let i = 0; i < 3 && burgess.holder !== life.c; i++) toNextMonth(g);
    expect(burgess.holder).toBe(life.c);
    expect(constable.holder).not.toBe(life.c);
    expect(journalHas(life, /no longer Constable.*one office at a time/i)).toBe(
      true,
    );
    // One post now (the burgess's seat in the house is part of it).
    expect(postsOf(g.s, life.c).length).toBe(1);
  });

  test("anyone holding several (an old save) keeps the best on the next tick", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 32 }) }],
    });
    const life = lifeOf(g);
    const constable = office(g, life, "constable");
    const justice = office(g, life, "justice");
    constable.holder = life.c;
    justice.holder = life.c;
    const pol = g.s.polities[meOf(g.s, life)!.nation];
    pol.assembly = [...pol.assembly, life.c];
    expect(postsOf(g.s, life.c).length).toBe(3);
    ticks(g, 1);
    const posts = postsOf(g.s, life.c);
    expect(posts.length).toBe(1);
    // The assembly outranks the county offices.
    expect(posts[0].kind).toBe("assembly");
    expect(constable.holder).not.toBe(life.c);
    expect(justice.holder).not.toBe(life.c);
  });

  test("a governor holds no other office; work and military rank don't count", () => {
    const g = world({
      start: 1650,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ age: 40, background: "soldier" }),
        },
      ],
    });
    const life = lifeOf(g);
    strong(life);
    const n = meOf(g.s, life)!.nation;
    const constable = office(g, life, "constable");
    expect(life.job).toBeTruthy();
    // A soldier by trade may still be constable.
    expect(eligible(g.s, life, { ...constable, holder: -1 }).ok).toBe(true);
    g.nation(n).ruler = life.c;
    const why = eligible(g.s, life, { ...constable, holder: -1 });
    expect(why.ok).toBe(false);
    if (!why.ok) expect(why.why).toMatch(/governor holds no other office/);
  });
});

describe("real authority in the counties", () => {
  test("a constable's patrol sharpens the watch; a sheriff's levy fills the treasury", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 32 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const constable = office(g, life, "constable");
    giveOffice(g, constable, life.c, "test");
    const before = watchStrength(g.s, g.w, life.prov).total;
    expect(powerCheck(g.s, g.w, life, constable, "patrol").ok).toBe(true);
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "use",
        id: constable.id,
        key: "patrol",
      }),
    ).toBeNull();
    expect(
      g.s.provinces[life.prov].mods.some((m) => m.key === "power:patrol"),
    ).toBe(true);
    expect(watchStrength(g.s, g.w, life.prov).total).toBeGreaterThan(before);
    // Once in a while, not every day.
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "use",
        id: constable.id,
        key: "patrol",
      }),
    ).toMatch(/Again in/);
    // Every office with powers has them in its period's words.
    for (const k of Object.keys(POWERS))
      expect(OFFICES[k as LocalOffice["key"]]).toBeTruthy();

    const sheriff = office(g, life, "sheriff");
    giveOffice(g, sheriff, life.c, "test");
    expect(constable.holder).not.toBe(life.c);
    const n = sheriff.nation;
    const gold = g.s.nations[n].gold;
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "use",
        id: sheriff.id,
        key: "levy",
      }),
    ).toBeNull();
    const pr = g.s.provinces[life.prov];
    expect(
      g.s.nations[n].gold > gold ||
        pr.mods.some((m) => m.label === "The levy resisted"),
    ).toBe(true);
  });

  test("a justice dismisses the constable (in their gift); a selectman's resolution moves a cause", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 32 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const justice = office(g, life, "justice");
    giveOffice(g, justice, life.c, "test");
    const constable = office(g, life, "constable");
    toNextMonth(g);
    if (constable.holder < 0) {
      const c = ensureOffices(g, life.prov);
      void c;
    }
    if (constable.holder >= 0 && constable.holder !== life.c) {
      const was = constable.holder;
      expect(
        g.lifeCommand("s1", { k: "power", act: "dismiss", id: constable.id }),
      ).toBeNull();
      expect(constable.holder).toBe(-1);
      expect(
        g.s.chars[was].memories.some((m) => /Dismissed me/.test(m.why)),
      ).toBe(true);
    }
    // A cause stirring in the county.
    const n = justice.nation;
    const m: Movement = {
      id: g.nextId(),
      key: "own",
      name: "The Friends of the County",
      goal: "reform",
      against: n,
      people: -1,
      region: [life.prov],
      founded: g.s.day,
      leader: -1,
      members: [],
      support: 20,
      arms: 0,
      status: "brewing",
      rebels: -1,
      rose: -1,
      ended: -1,
      due: -1,
      fades: g.s.day + 3000,
      text: "Reform.",
    };
    g.s.movements.push(m);
    const sel = ensureOffices(g, life.prov).find((o) => o.key === "selectman");
    if (sel) {
      giveOffice(g, sel, life.c, "test");
      expect(
        g.lifeCommand("s1", {
          k: "power",
          act: "use",
          id: sel.id,
          key: "resolve",
          c: m.id,
          side: 1,
        }),
      ).toBeNull();
      expect(m.support).toBe(23);
    }
  });
});

describe("the governor's council", () => {
  test("eight seats with colonial titles; the colony's own seats are filled", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const n = meOf(g.s, life)!.nation;
    toNextMonth(g);
    const cab = g.s.power!.cabinets[n];
    expect(cab).toBeTruthy();
    expect(cab.attorney).toBeGreaterThanOrEqual(0);
    expect(cab.surveyor).toBeGreaterThanOrEqual(0);
    expect(seatTitleOf(g.s.nations[n], "treasurer")).toMatch(
      /Receiver-general|Treasurer/,
    );
    expect(
      seatTitleOf({ ...g.s.nations[n], culture: "french" }, "treasurer"),
    ).toBe("Intendant");
    expect(
      seatTitleOf({ ...g.s.nations[n], culture: "spanish" }, "chaplain"),
    ).toMatch(/Santo Oficio/);
    expect(councillors(g.s, n).length).toBeGreaterThanOrEqual(6);
  });

  test("a seat is reached by claim: renown, favour, the governor's regard; taking it resigns your county office", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const me = meOf(g.s, life)!;
    const n = me.nation;
    const nation = g.s.nations[n];
    life.prov = nation.capital;
    const gov = g.s.chars[nation.ruler];
    like(g, life, gov, 80);
    const constable = office(g, life, "constable");
    giveOffice(g, constable, life.c, "test");
    const cab = ensureCabinet(g, n);
    cab.attorney = -1;
    const claim = seatClaim(g.s, life, n, "attorney");
    expect(claim.total).toBeGreaterThan(25);
    expect(claim.parts.some((p) => /Renown/.test(p.label))).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "power", act: "seek", seat: "attorney" }),
    ).toBeNull();
    expect(seatHolderId(g.s, n, "attorney")).toBe(life.c);
    expect(constable.holder).not.toBe(life.c);
    expect(
      officesOf(g.s, life.c).some((o) => /Attorney general/.test(o.label)),
    ).toBe(true);
    // A seat's power: the attorney drafts the colony's laws.
    expect(
      g.lifeCommand("s1", { k: "power", act: "seat", key: "draft" }),
    ).toBeNull();
    expect(g.s.nations[n].mods.some((m) => m.key === "council:draft")).toBe(
      true,
    );
    expect(favourOf(g.s, n, life.c)).toBeGreaterThan(30);
  });

  test("a measure put to the council is voted on and carried or lost", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const n = meOf(g.s, life)!.nation;
    life.prov = g.s.nations[n].capital;
    toNextMonth(g);
    seatCouncillor(g, n, "treasurer", life.c, "for the test");
    expect(
      g.lifeCommand("s1", { k: "power", act: "seat", key: "customs" }),
    ).toBeNull();
    const m = g.s.power!.cabinets[n].matters.find((x) => x.key === "customs")!;
    expect(m.status).toBe("open");
    expect(Object.keys(m.votes).length).toBeGreaterThan(2);
    ticks(g, 40);
    const after = g.s.power!.cabinets[n].matters.find((x) => x.id === m.id)!;
    expect(after.status).not.toBe("open");
    expect(
      journalHas(life, /council (carries|throws out) farm out the customs/i),
    ).toBe(true);
  });

  test("a governor appoints and dismisses, proclaims with the council's advice", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 40 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const n = meOf(g.s, life)!.nation;
    toNextMonth(g);
    g.nation(n).ruler = life.c;
    const before = g.s.nations[n].mods.length;
    expect(
      g.lifeCommand("s1", { k: "power", act: "proclaim", key: "thanksgiving" }),
    ).toBeNull();
    expect(g.s.nations[n].mods.length).toBeGreaterThan(before);
    expect(g.s.nations[n].mods.some((m) => m.key === "proc:thanks")).toBe(true);
    const advice = councilAdvice(g.s, n, "war", life.c);
    expect(advice.votes.length).toBeGreaterThan(0);
    const att = seatHolderId(g.s, n, "attorney");
    expect(att).toBeGreaterThanOrEqual(0);
    expect(
      g.lifeCommand("s1", { k: "power", act: "unseat", seat: "attorney" }),
    ).toBeNull();
    expect(seatHolderId(g.s, n, "attorney")).toBe(-1);
    const pick = makeCharacter(g.s, g.rng, {
      nation: n,
      culture: "english",
      religion: "anglican",
      age: 40,
      female: false,
    });
    g.nation(n).court.push(pick.id);
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "appoint",
        seat: "attorney",
        c: pick.id,
      }),
    ).toBeNull();
    expect(seatHolderId(g.s, n, "attorney")).toBe(pick.id);
  });
});

describe("the assembly", () => {
  test("a burgess's bill: the house divides, then the governor assents or vetoes", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const n = meOf(g.s, life)!.nation;
    const burgess = office(g, life, "burgess");
    giveOffice(g, burgess, life.c, "test");
    const pol = g.s.polities[n];
    pol.assembly = [...pol.assembly, life.c];
    expect(billCheck(g.s, life, n, "wolves").ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "power", act: "bill", key: "wolves" }),
    ).toBeNull();
    expect(billCheck(g.s, life, n, "wolves").ok).toBe(false);
    const bill = g.s.power!.cabinets[n].bills.find((b) => b.key === "wolves")!;
    expect(bill.stage).toBe("house");
    ticks(g, 60);
    const b = g.s.power!.cabinets[n].bills.find((x) => x.id === bill.id)!;
    expect(["law", "vetoed", "lost"]).toContain(b.stage);
    if (b.stage === "law")
      expect(
        g.s.provinces[life.prov].mods.some((m) => m.key === "bill:wolves"),
      ).toBe(true);
    expect(Object.keys(BILLS).length).toBeGreaterThanOrEqual(7);
  });
});

describe("trials as scenes", () => {
  test("taken up for a crime: the charge, the witnesses, the plea, the jury, the verdict", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 30 }) }],
    });
    const life = lifeOf(g);
    life.purse = 200;
    const n = meOf(g.s, life)!.nation;
    jail(g, life, "stealing a horse", 2, n);
    life.crime!.jail!.until = g.s.day;
    ticks(g, 1);
    const t = g.s.power!.trials.find((x) => x.defendant === life.c)!;
    expect(t).toBeTruthy();
    expect(t.kind).toBe("crime");
    expect(
      life.events.some(
        (e) => e.key === "trial-charge" && e.scene === "courtroom",
      ),
    ).toBe(true);
    expect(answer(g, life, "trial-charge", 0)).toBeNull(); // counsel
    expect(trialById(g.s, t.id)!.counsel).toBe(true);
    expect(answer(g, life, "trial-witness", 1)).toBeNull(); // cross-examine
    expect(answer(g, life, "trial-plea", 0)).toBeNull(); // not guilty
    expect(answer(g, life, "trial-jury", 1)).toBeNull(); // counsel speaks
    const done = trialById(g.s, t.id)!;
    expect(done.stage).toBe(5);
    expect(done.verdict).toBeTruthy();
    expect(answer(g, life, "trial-end", 0)).toBeNull();
    expect(trialById(g.s, t.id)!.done).toBe(true);
    if (done.verdict === "acquitted")
      expect(life.crime?.jail ?? null).toBeNull();
    else expect(life.crime!.record.length).toBeGreaterThan(0);
  });

  test("a justice presides: the county's case comes to the bench, and the justice decides", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const justice = office(g, life, "justice");
    giveOffice(g, justice, life.c, "test");
    const folk = g.s.locals[life.prov]
      .map((id) => g.s.chars[id])
      .filter((c) => c?.alive && c.id !== life.c);
    const t = openTrial(g, {
      kind: "accused",
      defendant: folk[0].id,
      accuser: folk[1].id,
      p: life.prov,
      nation: justice.nation,
      charge: "stealing a hog",
      grade: 1,
    });
    expect(t.judge).toBe(life.c);
    // The computer plays the parties: the case reaches the bench at once.
    expect(t.stage).toBe(4);
    expect(answer(g, life, "trial-bench", 1)).toBeNull(); // guilty, in mercy
    const done = trialById(g.s, t.id)!;
    expect(done.verdict).toBe("guilty");
    expect(done.done).toBe(true);
    expect(answer(g, life, "trial-end", 0)).toBeNull();
  });

  test("a witch confesses and is spared the rope", () => {
    const g = world({
      start: 1650,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ age: 38, female: true, first: "Mary" }),
        },
      ],
    });
    const life = lifeOf(g);
    life.renown = 30;
    const n = meOf(g.s, life)!.nation;
    const accuser = g.s.locals[life.prov]
      .map((id) => g.s.chars[id])
      .find((c) => c?.alive && c.id !== life.c)!;
    const t = openTrial(g, {
      kind: "witchcraft",
      defendant: life.c,
      accuser: accuser.id,
      p: life.prov,
      nation: n,
      charge: "witchcraft",
      grade: 4,
    });
    expect(answer(g, life, "trial-charge", 1)).toBeNull();
    expect(answer(g, life, "trial-witness", 3)).toBeNull();
    expect(answer(g, life, "trial-plea-witch", 1)).toBeNull(); // confess
    const done = trialById(g.s, t.id)!;
    expect(done.verdict).toBe("guilty");
    expect(done.sentence).toMatch(/spared the rope/);
    const renown = life.renown;
    expect(answer(g, life, "trial-end", 0)).toBeNull();
    expect(meOf(g.s, life)!.alive).toBe(true);
    expect(life.renown).toBeLessThan(renown);
  });
});

describe("newspapers", () => {
  function pressWorld(): { g: ConquestGame; life: Life; n: number } {
    const g = world({
      start: 1700,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const n = meOf(g.s, life)!.nation;
    g.s.day = YEAR(1730);
    life.prov = g.s.nations[n].capital;
    return { g, life, n };
  }

  test("found a paper, print for a candidate and against a cause, and the gazette reads it", () => {
    const { g, life, n } = pressWorld();
    expect(
      g.lifeCommand("s1", { k: "power", act: "found", stance: "independent" }),
    ).toBeNull();
    const x = paperOf(g.s, life.c)!;
    expect(x).toBeTruthy();
    expect(x.p).toBe(life.prov);
    const targets = pieceTargets(g.s, life, "c");
    expect(targets.length).toBeGreaterThan(0);
    const who = targets[0].id;
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "print",
        on: "c",
        c: who,
        side: 1,
      }),
    ).toBeNull();
    expect(swayOf(g.s, who)).toBeGreaterThan(0);
    expect(x.printed.length).toBe(1);
    // The talk spreads from the paper's town.
    expect((g.s.rumours ?? []).some((r) => r.text.startsWith(x.name))).toBe(
      true,
    );
    // Another piece wants a writer (one a month without).
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "print",
        on: "c",
        c: who,
        side: 1,
      }),
    ).toMatch(/issue is full/);
    readPapers(g, life);
    expect(journalHas(life, new RegExp(`In ${x.name}`))).toBe(true);
    void n;
  });

  test("a libel suit puts the printer on trial, where the truth may be pleaded", () => {
    const { g, life } = pressWorld();
    expect(
      g.lifeCommand("s1", { k: "power", act: "found", stance: "country" }),
    ).toBeNull();
    const x = paperOf(g.s, life.c)!;
    const npc = g.s.locals[life.prov]
      .map((id) => g.s.chars[id])
      .find((c) => c?.alive && c.id !== life.c)!;
    libelSuit(g, x, npc.id);
    const t = g.s.power!.trials.find(
      (y) => y.defendant === life.c && y.kind === "libel",
    )!;
    expect(t).toBeTruthy();
    expect(answer(g, life, "trial-charge", 1)).toBeNull();
    expect(answer(g, life, "trial-witness", 3)).toBeNull();
    expect(life.events.some((e) => e.key === "trial-plea-print")).toBe(true);
    expect(answer(g, life, "trial-plea-print", 1)).toBeNull(); // the truth
    expect(trialById(g.s, t.id)!.plea).toBe("truth");
  });
});

describe("saving, deltas, determinism", () => {
  function busyWorld(seed: number): ConquestGame {
    const g = world({
      start: 1650,
      seed,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 35 }) }],
    });
    const life = lifeOf(g);
    strong(life);
    const justice = office(g, life, "justice");
    giveOffice(g, justice, life.c, "test");
    return g;
  }

  test("the state survives a save and load, and deltas carry it to players", () => {
    const g = busyWorld(11);
    const client: GameState = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    ticks(g, 70);
    applyDelta(client, g.takeDelta());
    expect(client.power?.cabinets).toEqual(g.s.power?.cabinets);
    expect(client.power?.trials).toEqual(g.s.power?.trials);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    ticks(g2, 30);
    expect(g2.s.power?.cabinets).toBeTruthy();
    // An old save without any of it still loads and runs.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete old.power;
    const g3 = new ConquestGame(map, old);
    ticks(g3, 40);
    expect(g3.s.power).toBeTruthy();
  });

  test("the same seed runs the same", () => {
    const a = busyWorld(5);
    const b = busyWorld(5);
    ticks(a, 200);
    ticks(b, 200);
    expect(JSON.stringify(a.s.power)).toBe(JSON.stringify(b.s.power));
  });
});
