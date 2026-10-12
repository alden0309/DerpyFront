// CHAIR (r16): the road to the governor's chair. The crown's commission and
// its term; the lieutenant governor; a petition for the governor's recall
// (its odds shown are its odds rolled); the house's address; a player who
// governs sees each and answers it; the capital's fall, the news, seats
// that lapse and following the government; presents for a council seat;
// the speaker's age; a place at court that says what it needs; a law clerk
// at the levee; marks of greatness; the road page; saves and the delta.

import { describe, expect, test } from "vitest";
import { chooseSpeaker } from "../../src/conquest/engine/Assembly";
import {
  answerRoll,
  recallRoll,
  renewRoll,
} from "../../src/conquest/engine/Chair";
import {
  addressAnswerOdds,
  addressCheck,
  addressDivision,
  chairOf,
  courtNeeds,
  infirmity,
  lieutenantOf,
  LT,
  PETITION,
  petitionCheck,
  recallOdds,
  renewOdds,
  roadView,
  TERM,
  whereabouts,
} from "../../src/conquest/engine/ChairCore";
import {
  SEAT_PRESENTS,
  seatPresents,
  speakerOk,
} from "../../src/conquest/engine/ChairRules";
import { kill } from "../../src/conquest/engine/Characters";
import {
  ensureCabinet,
  seatCouncillor,
  seekSeatCheck,
} from "../../src/conquest/engine/Council";
import { cede } from "../../src/conquest/engine/Crown";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  GREAT,
  greatCheck,
  legacyOf,
} from "../../src/conquest/engine/Grandeur";
import { actCheck } from "../../src/conquest/engine/LifeActs";
import {
  meOf,
  monthlyBudget,
  officesOf,
} from "../../src/conquest/engine/LifeQueries";
import { ownedHouse } from "../../src/conquest/engine/Property";
import { provincesOf, settlers } from "../../src/conquest/engine/Queries";
import type {
  Address,
  Character,
  GameState,
  Life,
  Nation,
  RecallPetition,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const england = (g: ConquestGame): Nation =>
  g.s.nations.find((n) => n.key === "england")!;
const meIn = (g: ConquestGame, seat = "s1"): Character =>
  meOf(g.s, lifeOf(g, seat))!;

/** Make a character this old (by moving their birthday). */
function age(g: ConquestGame, c: Character, years: number): void {
  g.char(c.id).born = g.s.day - years * 365 - 30;
}

/** A player of standing: renown and favour enough for any case. */
function grand(life: Life, renown = 120, favor = 60): void {
  life.renown = renown;
  life.favor = favor;
}

/** Run until a day of the round has passed (the chair's daily and monthly rounds). */
function untilMonth(g: ConquestGame): void {
  const start = g.s.day;
  while (g.s.day < start + 31) g.tick();
}

describe("CHAIR r16: the colony's own seats start filled", () => {
  for (const start of [1607, 1650, 1700] as const)
    test(`every colony's attorney, surveyor and speaker from ${start}`, () => {
      const g = world({ start });
      for (const n of g.s.nations) {
        if (!n.alive || n.kind !== "power") continue;
        const cab = g.s.power!.cabinets[n.id];
        expect(cab).toBeDefined();
        for (const seat of ["attorney", "surveyor"] as const) {
          const c = g.s.chars[cab[seat]];
          expect(c?.alive).toBe(true);
          expect(c.nation).toBe(n.id);
        }
        if (g.s.polities[n.id]?.assembly.length)
          expect(g.s.polities[n.id].assembly.includes(cab.speaker)).toBe(true);
      }
    });
});

describe("CHAIR r16: the crown's commission", () => {
  test("a governor holds it three to eight years; the crown renews it or names another", () => {
    const g = world({ seed: 11 });
    const n = england(g).id;
    const ch = chairOf(g.s, n)!;
    expect(ch).toBeDefined();
    expect(ch.ends).toBeGreaterThan(g.s.day);
    expect(ch.ends - ch.since).toBeGreaterThanOrEqual(TERM.min * 365);
    expect(ch.ends - ch.since).toBeLessThanOrEqual(TERM.max * 365);
    // Twenty-five years: the chair comes round, and no commission runs long.
    const govs = new Set<number>([england(g).ruler]);
    let longest = 0;
    for (let y = 0; y < 25; y++) {
      ticks(g, 365);
      const c = chairOf(g.s, n);
      if (c) longest = Math.max(longest, c.ends - c.since);
      govs.add(england(g).ruler);
    }
    expect(govs.size).toBeGreaterThanOrEqual(3);
    expect(longest).toBeLessThanOrEqual(
      (TERM.max + 3 * TERM.againMax) * 365 + 1,
    );
  }, 120_000);

  test("its renewal is rolled at exactly the odds shown", () => {
    const g = world({ seed: 5 });
    const n = england(g).id;
    const s = g.s;
    const nation = england(g);
    const ch = nation.chair!;
    let expected = 0;
    let got = 0;
    const d0 = s.day;
    for (let i = 0; i < 3000; i++) {
      s.day = d0 + i;
      nation.favor = 10 + (i % 9) * 10;
      ch.grievances = i % 3;
      ch.terms = 1 + (i % 2);
      const p = renewOdds(s, n).total;
      expect(p).toBeGreaterThanOrEqual(0.03);
      expect(p).toBeLessThanOrEqual(0.8);
      expected += p;
      if (renewRoll(s, n)) got++;
    }
    s.day = d0;
    const sd = Math.sqrt(expected);
    expect(Math.abs(got - expected)).toBeLessThan(3 * sd + 5);
  });

  test("a player governor is told before it ends; at its end he stays in the colony", () => {
    const g = world({ seed: 7 });
    const life = lifeOf(g);
    const me = meIn(g);
    const nation = england(g);
    const n = nation.id;
    g.nation(n).ruler = me.id;
    ticks(g, 2);
    const ch = chairOf(g.s, n)!;
    expect(ch.gov).toBe(me.id);
    expect(
      life.journal.some((j) =>
        /Your commission from the crown runs/.test(j.text),
      ),
    ).toBe(true);
    // Bring the end near; the scene comes ninety days before.
    ch.ends = g.s.day + 92;
    ticks(g, 3);
    expect(life.events.some((e) => e.key === "chair-term")).toBe(true);
    // The crown won't renew it (no odds), and names another.
    nation.favor = 0;
    ch.grievances = 3;
    for (const e of [...life.events])
      g.lifeCommand("s1", { k: "event", id: e.id, choice: 0 });
    ticks(g, 92);
    expect(england(g).ruler).not.toBe(me.id);
    expect(me.alive).toBe(true);
    expect(me.abroad).toBeFalsy();
    expect((life.chair?.lately ?? 0) > g.s.day).toBe(true);
    expect(england(g).court.includes(me.id)).toBe(true);
    expect(
      life.milestones.some((m) => /Served as governor of/.test(m.text)),
    ).toBe(true);
  });
});

describe("CHAIR r16: the lieutenant governor", () => {
  test("named when the governor grows old: offered to the best case, who then succeeds", () => {
    const g = world({ seed: 9 });
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 30);
    grand(life);
    const nation = england(g);
    const gov = g.s.chars[nation.ruler];
    expect(infirmity(g.s, g.w, gov)).toBeNull();
    age(g, gov, LT.age + 2);
    expect(infirmity(g.s, g.w, gov)).toMatch(/old/);
    untilMonth(g);
    const ev = life.events.find((e) => e.key === "chair-lt");
    expect(ev).toBeDefined();
    g.lifeCommand("s1", { k: "event", id: ev!.id, choice: 0 });
    expect(lieutenantOf(g.s, nation.id)).toBe(me.id);
    // Its fees are in the month's figure.
    expect(
      monthlyBudget(g.s, g.w, life).parts.some((p) =>
        /Lieutenant governor/.test(p.label),
      ),
    ).toBe(true);
    // The governor dies: the lieutenant governor succeeds.
    kill(g, g.char(gov.id), "a fever");
    expect(england(g).ruler).toBe(me.id);
    expect(lieutenantOf(g.s, nation.id)).toBe(-1);
    expect(
      life.journal.some((j) => /lieutenant governor succeeds/.test(j.text)),
    ).toBe(true);
  });

  test("with no player's case, one of the council is named, acts when he's laid up, and succeeds", () => {
    const g = world({ seed: 9 });
    const nation = england(g);
    const n = nation.id;
    const gov = g.s.chars[nation.ruler];
    age(g, gov, 70);
    untilMonth(g);
    const lt = lieutenantOf(g.s, n);
    expect(lt).toBeGreaterThanOrEqual(0);
    expect(lifeOf(g).c).not.toBe(lt);
    // Laid up: the lieutenant acts.
    const ch = chairOf(g.s, n)!;
    ch.laidUp = g.s.day + 60;
    untilMonth(g);
    expect((chairOf(g.s, n)!.acting ?? 0) > g.s.day).toBe(true);
    kill(g, g.char(gov.id), "old age");
    expect(england(g).ruler).toBe(lt);
  });
});

describe("CHAIR r16: a petition for the governor's recall", () => {
  test("the crown's answer is rolled at exactly the odds shown", () => {
    const g = world({ seed: 3 });
    const s = g.s;
    const nation = england(g);
    const n = nation.id;
    const ch = nation.chair!;
    const by = g.s.power!.cabinets[n].attorney;
    const pet: RecallPetition = {
      id: 1,
      by,
      since: s.day,
      sails: s.day,
      answer: s.day,
      stage: "sent",
      names: [],
      refused: [],
      court: 0,
      defence: 0,
    };
    let expected = 0;
    let got = 0;
    const d0 = s.day;
    for (let i = 0; i < 3000; i++) {
      s.day = d0 + i;
      pet.id = 1000 + i;
      nation.favor = (i * 7) % 100;
      ch.grievances = i % 4;
      pet.court = i % 3;
      const p = recallOdds(s, n, pet, by).total;
      expect(p).toBeGreaterThanOrEqual(0.03);
      expect(p).toBeLessThanOrEqual(0.85);
      expected += p;
      if (recallRoll(s, n, pet)) got++;
    }
    s.day = d0;
    expect(Math.abs(got - expected)).toBeLessThan(3 * Math.sqrt(expected) + 5);
  });

  test("got up by a councillor: the fee, names, friends at court, and the crown's answer", () => {
    const g = world({ seed: 13 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 30);
    grand(life, 60, 40);
    life.purse = 100;
    const nation = england(g);
    const n = nation.id;
    seatCouncillor(g, n, "treasurer", me.id, "for the test");
    const ch = chairOf(s, n)!;
    // In his first year the crown won't hear it.
    ch.since = s.day - 100;
    expect(petitionCheck(s, life).ok).toBe(false);
    ch.since = s.day - 800;
    ch.ends = s.day + 3000;
    expect(petitionCheck(s, life)).toEqual({ ok: true });
    const before = life.purse;
    expect(g.lifeCommand("s1", { k: "chair", act: "petition" })).toBeNull();
    expect(life.purse).toBeCloseTo(before - PETITION.fee, 5);
    const pet = chairOf(s, n)!.petition!;
    expect(pet.by).toBe(me.id);
    expect(pet.stage).toBe("gathering");
    // Its retainer is a line in the month's figure.
    expect(
      monthlyBudget(s, g.w, life).parts.some((p) =>
        /agent in London/.test(p.label),
      ),
    ).toBe(true);
    expect(g.lifeCommand("s1", { k: "chair", act: "names" })).toBeNull();
    expect(pet.names.length + pet.refused.length).toBeGreaterThan(0);
    // Asked lately: not again for three weeks.
    expect(g.lifeCommand("s1", { k: "chair", act: "names" })).toMatch(
      /Again in/,
    );
    const purse = life.purse;
    expect(g.lifeCommand("s1", { k: "chair", act: "court" })).toBeNull();
    expect(life.purse).toBeCloseTo(purse - PETITION.postage, 5);
    // It sails, and the answer comes.
    ticks(g, PETITION.gather + 1);
    const sent = chairOf(s, n)?.petition;
    expect(sent?.stage).toBe("sent");
    const gov = nation.ruler;
    ticks(g, PETITION.voyage + 1);
    const last = england(g).chair!.lastPetition!;
    expect(last.by).toBe(me.id);
    if (last.won) {
      expect(england(g).ruler).not.toBe(gov);
      expect(life.journal.some((j) => /the crown recalls/.test(j.text))).toBe(
        true,
      );
    } else {
      expect(england(g).ruler).toBe(gov);
      expect(life.chair?.refused).toBeGreaterThan(0);
      expect(life.ties[gov]).toBe("rival");
      expect(
        g.s.chars[gov].memories.some((m) => m.of === me.id && m.value <= -40),
      ).toBe(true);
    }
  });

  test("against a player who governs: he's told, answers it, and keeps his chair unless the crown says otherwise", () => {
    const g = world({
      seed: 21,
      plans: [
        {
          seat: "gov",
          name: "Gov",
          plan: plan({ first: "Edmund", family: "Jenings", age: 40 }),
        },
        {
          seat: "pet",
          name: "Pet",
          plan: plan({ first: "Nathaniel", family: "Bacon", age: 30 }),
        },
      ],
    });
    const s = g.s;
    const nation = england(g);
    const n = nation.id;
    const govLife = lifeOf(g, "gov");
    const petLife = lifeOf(g, "pet");
    const gov = meIn(g, "gov");
    g.nation(n).ruler = gov.id;
    ticks(g, 2);
    const ch = chairOf(s, n)!;
    ch.since = s.day - 800;
    ch.ends = s.day + 3000;
    grand(petLife, 60, 50);
    petLife.purse = 50;
    govLife.purse = 50;
    seatCouncillor(g, n, "treasurer", meIn(g, "pet").id, "for the test");
    // A colony the crown is cooling on: the petition stands a fair chance.
    nation.favor = 15;
    ch.grievances = 1;
    expect(g.lifeCommand("pet", { k: "chair", act: "petition" })).toBeNull();
    const ev = govLife.events.find((e) => e.key === "chair-petition");
    expect(ev).toBeDefined();
    // Nothing done to him yet: he governs, and answers it with letters.
    expect(england(g).ruler).toBe(gov.id);
    const pet = chairOf(s, n)!.petition!;
    const p0 = recallOdds(s, n, pet, pet.by).total;
    expect(
      g.lifeCommand("gov", { k: "event", id: ev!.id, choice: 1 }),
    ).toBeNull();
    expect(pet.defence).toBeGreaterThan(0);
    expect(recallOdds(s, n, pet, pet.by).total).toBeLessThan(p0);
    expect(
      petLife.journal.some((j) => /answered your petition/.test(j.text)),
    ).toBe(true);
    // The answer comes: either way, he's told, and stays alive in the colony.
    ticks(g, PETITION.gather + PETITION.voyage + 2);
    const last = england(g).chair!.lastPetition!;
    expect(gov.alive).toBe(true);
    expect(gov.abroad).toBeFalsy();
    if (last.won) {
      expect(england(g).ruler).not.toBe(gov.id);
      expect(
        govLife.journal.some((j) =>
          /recalled from the governorship/.test(j.text),
        ),
      ).toBe(true);
    } else {
      expect(england(g).ruler).toBe(gov.id);
      expect(govLife.journal.some((j) => /thrown out/.test(j.text))).toBe(true);
    }
  });
});

describe("CHAIR r16: the house's address", () => {
  function speaker(g: ConquestGame): { life: Life; me: Character; n: number } {
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 35);
    grand(life, 60, 30);
    const n = england(g).id;
    const pol = g.s.polities[n];
    pol.assembly = [...pol.assembly.slice(0, 5), me.id];
    ensureCabinet(g, n).speaker = me.id;
    return { life, me, n };
  }

  test("the speaker moves it; the house divides as the page said; the governor answers by the odds", () => {
    const g = world({ seed: 17 });
    const { life, me, n } = speaker(g);
    const s = g.s;
    england(g).tax = 2;
    expect(addressCheck(s, life, false, false).ok).toBe(false);
    expect(addressCheck(s, life, true, true)).toEqual({ ok: true });
    expect(
      g.lifeCommand("s1", {
        k: "chair",
        act: "address",
        salary: true,
        supply: true,
      }),
    ).toBeNull();
    const a = chairOf(s, n)!.address!;
    expect(a.stage).toBe("moved");
    ticks(g, 13);
    const forecast = addressDivision(
      s,
      n,
      me.id,
      true,
      true,
      Math.floor(a.day / 365),
    );
    ticks(g, 2);
    const done = chairOf(s, n)?.address;
    expect(done?.ayes).toBe(forecast.ayes);
    expect(done?.noes).toBe(forecast.noes);
    if (forecast.ayes > forecast.noes) {
      expect(done?.answer).toBeDefined();
      expect(chairOf(s, n)!.grievances).toBeGreaterThan(0);
      if (done?.answer === "hold") {
        expect((s.power!.cabinets[n].unpaid ?? 0) > s.day).toBe(true);
        expect(england(g).mods.some((m) => m.key === "supply-refused")).toBe(
          true,
        );
      } else
        expect(england(g).mods.some((m) => m.key === "supply-refused")).toBe(
          false,
        );
      if (done?.answer === "yield") expect(england(g).tax).toBe(1);
    } else expect(done?.stage).toBe("lost");
    // One a year.
    expect(addressCheck(s, life, true, false).ok).toBe(false);
  });

  test("the computer's governor answers at exactly the odds shown", () => {
    const g = world({ seed: 19 });
    const s = g.s;
    const n = england(g).id;
    const counts = { yield: 0, dissolve: 0, hold: 0 };
    const odds = addressAnswerOdds(s, n);
    const a = { id: 0 } as Address;
    for (let i = 0; i < 4000; i++) {
      a.id = 5000 + i;
      counts[answerRoll(s, n, a)]++;
    }
    for (const k of ["yield", "dissolve", "hold"] as const)
      expect(Math.abs(counts[k] / 4000 - odds[k])).toBeLessThan(0.03);
  });

  test("against a player who governs: his salary goes unpaid, and he chooses his answer", () => {
    const g = world({
      seed: 23,
      plans: [
        {
          seat: "s1",
          name: "Speaker",
          plan: plan({ first: "John", family: "Robinson", age: 35 }),
        },
        {
          seat: "gov",
          name: "Gov",
          plan: plan({ first: "Alexander", family: "Spotswood", age: 40 }),
        },
      ],
    });
    const s = g.s;
    const n = england(g).id;
    const gov = meIn(g, "gov");
    const govLife = lifeOf(g, "gov");
    g.nation(n).ruler = gov.id;
    ticks(g, 2);
    speaker(g);
    // A house that can't bear him: every member of the country party.
    for (const c of s.polities[n].assembly)
      ensureCabinet(g, n).faction[c] = "country";
    england(g).tax = 2;
    expect(
      g.lifeCommand("s1", {
        k: "chair",
        act: "address",
        salary: true,
        supply: false,
      }),
    ).toBeNull();
    ticks(g, ADDRESS_DAYS + 1);
    const a = chairOf(s, n)?.address;
    if (a?.stage === "carried") {
      expect(
        officesOf(s, gov.id).find((o) => o.kind === "governor")?.stipend,
      ).toBe(0);
      const ev = govLife.events.find((e) => e.key === "chair-address");
      expect(ev).toBeDefined();
      expect(
        g.lifeCommand("gov", { k: "event", id: ev!.id, choice: 1 }),
      ).toBeNull();
      expect(chairOf(s, n)!.address!.stage).toBe("yielded");
      expect(
        officesOf(s, gov.id).find((o) => o.kind === "governor")?.stipend,
      ).toBe(24);
      expect(england(g).tax).toBe(1);
    } else expect(a?.stage).toBe("lost");
  });
});

const ADDRESS_DAYS = 14;

describe("CHAIR r16: the capital falls", () => {
  test("the government goes to the biggest town left; everyone's told; seats lapse; the household can follow", () => {
    const g = world({ seed: 7 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 30);
    const nation = england(g);
    const n = nation.id;
    seatCouncillor(g, n, "treasurer", me.id, "for the test");
    const old = nation.capital;
    expect(life.home).toBe(old);
    const left = provincesOf(s, n).filter((p) => p !== old);
    const biggest = left.reduce((a, b) =>
      settlers(s.provinces[b]) > settlers(s.provinces[a]) ? b : a,
    );
    const france = s.nations.find((x) => x.key === "france")!;
    cede(g, old, france.id);
    expect(england(g).capital).toBe(biggest);
    const news = life.journal.find((j) => /has gone to/.test(j.text));
    expect(news?.text).toMatch(new RegExp(map.provinces[biggest].name));
    expect(news?.text).toMatch(/seat on the council stands/);
    expect(news?.text).toMatch(/lapse/);
    expect(life.events.some((e) => e.key === "chair-capital")).toBe(true);
    // Living under another flag: the seat lapses after three months.
    for (const e of [...life.events])
      g.lifeCommand("s1", { k: "event", id: e.id, choice: 0 });
    ticks(g, 89);
    expect(officesOf(s, me.id).some((o) => o.kind === "council")).toBe(true);
    ticks(g, 2);
    expect(officesOf(s, me.id).some((o) => o.kind === "council")).toBe(false);
    // Follow the government: travel there, and the household moves in.
    life.purse = Math.max(life.purse, 50);
    const err = g.lifeCommand("s1", { k: "chair", act: "follow" });
    expect(err).toBeNull();
    for (let i = 0; i < 200 && life.home !== england(g).capital; i++) g.tick();
    expect(life.home).toBe(england(g).capital);
    expect(
      life.journal.some((j) => /Your household is settled at/.test(j.text)),
    ).toBe(true);
  });
});

describe("CHAIR r16: small things", () => {
  test("a council seat expects presents to the governor's friends, on the button and paid", () => {
    const g = world({ seed: 7 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 30);
    grand(life, 200, 90);
    const n = england(g).id;
    expect(seatPresents(s, n, "treasurer")).toBe(SEAT_PRESENTS.treasurer);
    life.purse = 3;
    expect(seekSeatCheck(s, life, "surveyor")).toEqual({
      ok: false,
      why: `The governor's friends expect presents: ${SEAT_PRESENTS.surveyor} coins.`,
    });
    life.purse = 100;
    expect(seekSeatCheck(s, life, "surveyor").ok).toBe(true);
    // Empty it, so the case clears the bar.
    const cab = s.power!.cabinets[n];
    kill(g, g.char(cab.surveyor), "a fever");
    expect(
      g.lifeCommand("s1", { k: "power", act: "seek", seat: "surveyor" }),
    ).toBeNull();
    if (cab.surveyor === me.id)
      expect(life.purse).toBeCloseTo(100 - SEAT_PRESENTS.surveyor, 5);
    // Where a player governs, none are expected.
    g.nation(n).ruler = me.id;
    expect(seatPresents(s, n, "treasurer")).toBe(0);
  });

  test("the speaker's chair wants 21, and two years in the house first under 25", () => {
    const g = world({ seed: 7 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    const n = england(g).id;
    const pol = s.polities[n];
    pol.assembly = [me.id];
    grand(life, 300, 90);
    age(g, me, 20);
    expect(speakerOk(s, me.id).ok).toBe(false);
    chooseSpeaker(g, n);
    expect(s.power!.cabinets[n].speaker).not.toBe(me.id);
    age(g, me, 23);
    life.chair = { houseSince: s.day };
    expect(speakerOk(s, me.id).ok).toBe(false);
    life.chair = { houseSince: s.day - 2 * 365 - 1 };
    expect(speakerOk(s, me.id).ok).toBe(true);
    chooseSpeaker(g, n);
    expect(s.power!.cabinets[n].speaker).toBe(me.id);
    age(g, me, 30);
    life.chair = {};
    expect(speakerOk(s, me.id).ok).toBe(true);
    expect(g.lifeCommand("s1", { k: "power", act: "speaker" })).toMatch(
      /chair/,
    );
  });

  test("a place at court says what it needs before when; a law clerk attends the levee", () => {
    const g = world({
      seed: 7,
      plans: [{ seat: "s1", name: "A", plan: plan({ background: "lawyer" }) }],
    });
    const s = g.s;
    const life = lifeOf(g);
    life.renown = 0;
    life.cooldowns["act:court"] = s.day + 166;
    expect(actCheck(s, g.w, life, "governor", "court")).toEqual(
      courtNeeds(s, life),
    );
    expect(courtNeeds(s, life).ok).toBe(false);
    // A clerk at the governor's house.
    if (life.job?.place === "governor") {
      expect(actCheck(s, g.w, life, "governor", "respects").ok).toBe(true);
    }
    life.job = null;
    expect(actCheck(s, g.w, life, "governor", "respects")).toEqual({
      ok: false,
      why: "They don't let just anyone in (renown 5).",
    });
  });

  test("where the appointer is, and how far", () => {
    const g = world({
      seed: 7,
      plans: [
        { seat: "s1", name: "A", plan: plan({ home: prov("Jamestown") }) },
      ],
    });
    const s = g.s;
    const life = lifeOf(g);
    const gov = s.chars[england(g).ruler];
    const here = whereabouts(s, g.w, life, gov.id)!;
    expect(here.text).toMatch(/here at Jamestown, the capital/);
    life.prov = provincesOf(s, england(g).id).find((p) => p !== life.prov)!;
    const far = whereabouts(s, g.w, life, gov.id)!;
    expect(far.text).toMatch(
      /at Jamestown, the capital, about \d+ days? from here/,
    );
  });
});

describe("CHAIR r16: marks of greatness", () => {
  test("each costs what its button says, does what it says, and leaves a line in the story", () => {
    const g = world({ seed: 7 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 40);
    life.renown = 60;
    life.purse = 5000;
    for (const d of GREAT) {
      if (d.key === "portrait-spouse" || d.key === "portrait-family") continue;
      expect(greatCheck(s, g.w, life, d.key)).toEqual({ ok: true });
      const cost = d.cost(s, life);
      const purse = life.purse;
      const renown = life.renown;
      expect(
        g.lifeCommand("s1", { k: "chair", act: "great", key: d.key }),
      ).toBeNull();
      expect(life.purse).toBeCloseTo(purse - cost, 5);
      expect(life.renown).toBeGreaterThan(renown);
      expect(greatCheck(s, g.w, life, d.key).ok).toBe(false);
    }
    expect(ownedHouse(life, life.home)?.name).toBe(`${me.family} Hall`);
    expect(ownedHouse(life, life.home)?.level).toBe(4);
    expect(life.kit?.carriage).toBeDefined();
    const budget = monthlyBudget(s, g.w, life).parts.map((p) => p.label);
    expect(budget).toContain("Keep: the hall's gardens and grounds");
    expect(budget).toContain("Keep: the coach's four and the liveries");
    expect(legacyOf(s, g.w, life).length).toBe(GREAT.length - 2);
    expect(
      life.milestones.some(
        (m) => m.text === `Founded the ${me.family} Free School at Jamestown`,
      ),
    ).toBe(true);
    expect(england(g).mods.some((m) => m.key === `great:school:${me.id}`)).toBe(
      true,
    );
  });
});

describe("CHAIR r16: the road knows where you are", () => {
  test("steps tick off with their days, and 'you are here' moves on", () => {
    const g = world({ seed: 7 });
    const s = g.s;
    const life = lifeOf(g);
    const me = meIn(g);
    age(g, me, 30);
    life.renown = 0;
    life.purse = 0;
    let road = roadView(s, g.w, life);
    expect(road.find((x) => x.here)?.key).toBe("name");
    life.renown = 25;
    seatCouncillor(g, england(g).id, "treasurer", me.id, "for the test");
    untilMonth(g);
    road = roadView(s, g.w, life);
    expect(road.find((x) => x.key === "council")?.done).toBe(true);
    expect(road.find((x) => x.key === "council")?.day).toBeDefined();
    expect(road.find((x) => x.here)?.key).toBe("house");
    expect(road.find((x) => x.key === "governor")?.text).toMatch(
      /commission's end on/,
    );
  });
});

describe("CHAIR r16: saves, the delta, old saves, determinism", () => {
  test("the chair rides the delta and survives save and load; an old save gets its commissions", () => {
    const g = world({ seed: 29 });
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 400; i++) {
      g.tick();
      applyDelta(mine, g.takeDelta());
    }
    const n = england(g).id;
    expect(mine.nations[n].chair).toEqual(g.s.nations[n].chair);
    expect(mine.lives[0].chair).toEqual(g.s.lives[0].chair);
    const g2 = new ConquestGame(
      map,
      JSON.parse(JSON.stringify(g.s)) as GameState,
    );
    expect(g2.s.nations[n].chair).toEqual(g.s.nations[n].chair);
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const x of old.nations) delete x.chair;
    for (const l of old.lives) delete l.chair;
    const g3 = new ConquestGame(map, old);
    ticks(g3, 40);
    expect(chairOf(g3.s, n)).toBeDefined();
  });

  test("the same seed runs the same", () => {
    const a = world({ seed: 31 });
    const b = world({ seed: 31 });
    ticks(a, 900);
    ticks(b, 900);
    const n = england(a).id;
    expect(JSON.stringify(a.s.nations[n].chair)).toBe(
      JSON.stringify(b.s.nations[n].chair),
    );
    expect(a.s.nations[n].ruler).toBe(b.s.nations[n].ruler);
  });
});
