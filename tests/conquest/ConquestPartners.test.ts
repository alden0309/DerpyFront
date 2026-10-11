// PARTNERS (r13): business partnerships. Articles of copartnership put to a
// computer character (who signs or refuses, with reasons) or to another
// player (who signs, refuses or sends back terms of their own, in person
// or by post); the monthly books, divided exactly by share; decisions put
// to the partners and voted on; a second set of books found out and taken
// to law; heirs, bankrupts, a ship lost; winding up; and that it all
// saves, loads, travels in deltas, and pools money without printing it.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { kill, makeCharacter } from "../../src/conquest/engine/Characters";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  buyoutPrice,
  firmMonth,
  firmMonthView,
  loseShip,
  windingUpShares,
} from "../../src/conquest/engine/Firms";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  lifeOfSeat,
  meOf,
  monthlyBudget,
  peopleHere,
} from "../../src/conquest/engine/LifeQueries";
import {
  BUSINESS_UPKEEP,
  EXCISE,
  HAND_TAKINGS,
  HAND_WAGE,
} from "../../src/conquest/engine/LifeRules";
import { AMERICAS, worldOf } from "../../src/conquest/engine/Map";
import {
  articlesAcceptance,
  fairShares,
  holdChoices,
  suggestTerms,
  termsCheck,
} from "../../src/conquest/engine/Partners";
import {
  bizCost,
  firmsOf,
  firmsWith,
  offersOf,
  partnerIn,
} from "../../src/conquest/engine/PartnersCore";
import { power, trialsOf } from "../../src/conquest/engine/PowerCore";
import type {
  Character,
  Firm,
  FirmTerms,
  GameDelta,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

const JT = prov("Jamestown");

function one(seed = 7): { g: ConquestGame; life: Life } {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk" }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  life.purse = 300;
  return { g, life };
}

function two(o: { far?: boolean; seed?: number } = {}) {
  const g = world({
    start: 1700,
    seed: o.seed ?? 9,
    plans: [
      {
        seat: "a",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk" }),
      },
      {
        seat: "b",
        name: "Bea",
        plan: plan({
          home: o.far ? prov("Plymouth") : JT,
          first: "Beatrice",
          family: "Cole",
          female: true,
          background: "clerk",
        }),
      },
    ],
  });
  g.aiEnabled = false;
  const a = lifeOf(g, "a");
  const b = lifeOf(g, "b");
  a.purse = 300;
  b.purse = 300;
  return { g, a, b };
}

/** Someone in town with a business of their own trade. */
function npcWithTrade(g: ConquestGame, life: Life, role = "innkeeper") {
  const c = peopleHere(g.s, life.prov, life).find((x) => x.role === role);
  if (!c) throw new Error(`no ${role} here`);
  return c;
}

function like(g: ConquestGame, life: Life, c: Character, v = 40): void {
  g.char(c.id).memories.push({ of: life.c, why: "Test", value: v, until: 0 });
}

/** Buy into an innkeeper's inn on fair terms (they manage it). */
function innFirm(g: ConquestGame, life: Life): Firm {
  const c = npcWithTrade(g, life);
  like(g, life, c);
  const ch = holdChoices(g.s, g.w, life, c).find((x) =>
    x.key.startsWith("theirs"),
  )!;
  const t = suggestTerms(g.s, g.w, life, c, ch);
  const err = g.lifeCommand(life.seat, {
    k: "partners",
    act: "propose",
    terms: t,
  });
  expect(err).toBeNull();
  const f = firmsWith(g.s, life.c)[0];
  expect(f).toBeTruthy();
  return f;
}

const sumShares = (f: Firm) =>
  Math.round(f.partners.reduce((m, p) => m + p.share, 0) * 10) / 10;

describe("going into partnership with a computer character", () => {
  test("the choices: their business, a new one founded together, cargoes", () => {
    const { g, life } = one();
    const c = npcWithTrade(g, life);
    const list = holdChoices(g.s, g.w, life, c);
    expect(
      list.some((x) => x.key === "theirs:-1" && x.job === "innkeeper"),
    ).toBe(true);
    expect(list.some((x) => x.key === "found:innkeeper")).toBe(true);
    expect(list.some((x) => x.key === "venture")).toBe(true);
    // The fair shares lean to whoever brings more and does the work.
    const t = suggestTerms(
      g.s,
      g.w,
      life,
      c,
      list.find((x) => x.key === "theirs:-1")!,
    );
    const [mine, theirs] = fairShares(g.s, t);
    expect(mine + theirs).toBe(100);
    expect(theirs).toBeGreaterThan(mine);
    expect(t.sides[1].role).toBe("managing");
  });

  test("fair terms are signed there and then: the money goes in, the inn comes in, the news goes round", () => {
    const { g, life } = one();
    const before = life.purse;
    const f = innFirm(g, life);
    const me = partnerIn(f, life.c)!;
    expect(f.biz?.job).toBe("innkeeper");
    expect(f.status).toBe("trading");
    expect(sumShares(f)).toBe(100);
    expect(life.purse).toBe(before - me.capital);
    expect(f.chest).toBe(me.capital);
    expect(f.name).toMatch(/ & /);
    expect(life.outcome?.ok).toBe(true);
    expect(
      life.journal.some((j) => /sign articles of copartnership/.test(j.text)),
    ).toBe(true);
    expect((g.s.rumours ?? []).some((r) => r.text.includes(f.name))).toBe(true);
  });

  test("lopsided terms are refused, with the reasons", () => {
    const { g, life } = one();
    const c = npcWithTrade(g, life);
    const ch = holdChoices(g.s, g.w, life, c).find(
      (x) => x.key === "theirs:-1",
    )!;
    const t = suggestTerms(g.s, g.w, life, c, ch);
    t.sides[0].share = 90;
    t.sides[1].share = 10;
    t.sides[0].cap = 0;
    const b = articlesAcceptance(g.s, t, c, life);
    expect(b.total).toBeLessThanOrEqual(0);
    expect(b.parts.some((p) => /terms favour you/.test(p.label))).toBe(true);
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    expect(firmsOf(g.s)).toHaveLength(0);
    expect(offersOf(g.s)[0].status).toBe("refused");
    expect(life.outcome?.ok).toBe(false);
    expect(life.journal.some((j) => /won't sign/.test(j.text))).toBe(true);
    expect(life.purse).toBe(purse);
  });

  test("a lawyer draws them up for a fee, and the firm remembers whose they were", () => {
    const { g, life } = one();
    const c = npcWithTrade(g, life);
    like(g, life, c);
    const lawyer = makeCharacter(g.s, g.rng, {
      nation: meOf(g.s, life)!.nation,
      culture: "english",
      religion: "anglican",
      female: false,
      age: 40,
    });
    lawyer.role = "lawyer";
    lawyer.home = JT;
    g.s.locals[JT].push(lawyer.id);
    const t = suggestTerms(
      g.s,
      g.w,
      life,
      c,
      holdChoices(g.s, g.w, life, c).find((x) => x.key === "theirs:-1")!,
    );
    t.lawyer = lawyer.id;
    const before = life.purse;
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(f.drafted).toBe(life.c);
    expect(before - life.purse).toBe(t.sides[0].cap + 6);
  });

  test("checks: shares make a hundred, one manages, you can afford it, they're here", () => {
    const { g, life } = one();
    const c = npcWithTrade(g, life);
    const ch = holdChoices(g.s, g.w, life, c).find(
      (x) => x.key === "theirs:-1",
    )!;
    const base = suggestTerms(g.s, g.w, life, c, ch);
    const bad = (f: (t: FirmTerms) => void) => {
      const t = JSON.parse(JSON.stringify(base)) as FirmTerms;
      f(t);
      return termsCheck(g.s, g.w, life, t, false);
    };
    expect(bad((t) => (t.sides[0].share = 60)).ok).toBe(false);
    expect(bad((t) => (t.sides[0].role = "managing")).ok).toBe(false);
    expect(bad((t) => (t.sides[0].cap = 900)).ok).toBe(false);
    life.travel = {
      dest: 0,
      path: [0],
      sea: [false],
      depart: 0,
      arrive: 9e9,
      cost: 0,
    };
    expect(termsCheck(g.s, g.w, life, base, false).ok).toBe(false);
  });
});

describe("the books", () => {
  test("a firm makes exactly what the same business would make for one owner", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    const v = firmMonthView(g.s, f);
    const hands = f.biz!.hands;
    // The sums of a business of one's own (Property.ts), with the managing
    // partner's skill: takings by the hand, wages, upkeep, excise.
    expect(v.minding).toBe(true);
    expect(v.takings).toBeCloseTo(
      Math.round(HAND_TAKINGS * (0.8 + v.skill / 25) * hands * 10) / 10,
      2,
    );
    expect(v.wages).toBe(hands * HAND_WAGE);
    expect(v.upkeep).toBe(BUSINESS_UPKEEP[f.biz!.level]);
    expect(v.excise).toBeCloseTo(v.takings * EXCISE, 2);
    expect(v.profit).toBeCloseTo(v.takings - v.wages - v.upkeep - v.excise, 2);
    // Nobody minding it, it takes what an absent owner's would.
    const away = firmMonthView(g.s, {
      ...f,
      prov: prov("Plymouth"),
    });
    expect(away.minding).toBe(false);
  });

  test("the profit is divided by share every month, and every coin is accounted for", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    const me = partnerIn(f, life.c)!;
    let chest = f.chest;
    for (let m = 0; m < 12; m++) {
      const drawn = f.partners.map((p) => p.drawn);
      toNextMonth(g);
      const b = f.books[f.books.length - 1];
      const paid = f.partners.reduce((s, p, i) => s + p.drawn - drawn[i], 0);
      if (b.profit > 0) {
        expect(paid).toBeCloseTo(b.profit, 1);
        expect(me.drawn - drawn[f.partners.indexOf(me)]).toBeCloseTo(
          (b.profit * me.share) / 100,
          1,
        );
      }
      // The chest moves only by what wasn't divided.
      expect(f.chest).toBeCloseTo(
        chest + b.takings - b.costs - Math.max(0, paid),
        1,
      );
      chest = f.chest;
    }
    expect(f.books.length).toBe(12);
  });

  test("a loss comes out of the chest, and when that's empty it's called from the partners", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    f.chest = 0;
    // The town in the enemy's hands: no takings, wages and rent still due.
    g.s.provinces[f.prov].occupier = 1;
    const purse = life.purse;
    const p = firmMonth(g, f);
    expect(p).toBeLessThan(0);
    const share = partnerIn(f, life.c)!.share;
    expect(purse - life.purse).toBeCloseTo((-p * share) / 100, 1);
    expect(f.chest).toBeCloseTo(0, 1);
    expect(
      life.journal.some((j) => /called from your purse/.test(j.text)),
    ).toBe(true);
  });

  test("your share shows in the month's forecast (Estate › Purse)", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => p.label.includes(f.name))).toBe(true);
  });

  test("a newspaper in partnership: its owner shares out the profit by share", () => {
    const { g, life } = one();
    const me = meOf(g.s, life)!;
    const ps = power(g);
    ps.papers.push({
      id: g.nextId(),
      name: "The Virginia Courant",
      owner: me.id,
      p: JT,
      nation: me.nation,
      founded: g.s.day,
      stance: "independent",
      writers: [],
      readers: 700,
      credit: 60,
      licensed: true,
      next: [],
      printed: [],
      issued: g.s.day,
      income: 0,
    });
    const c = npcWithTrade(g, life, "merchant");
    like(g, life, c, 60);
    const ch = holdChoices(g.s, g.w, life, c).find((x) => x.hold === "paper")!;
    expect(ch).toBeTruthy();
    const t = suggestTerms(g.s, g.w, life, c, ch);
    expect(t.sides[0].role).toBe("managing");
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(f.hold).toBe("paper");
    ps.papers[0].income = 6;
    const purse = life.purse;
    expect(firmMonth(g, f)).toBe(6);
    const theirs = 100 - partnerIn(f, life.c)!.share;
    expect(purse - life.purse).toBeCloseTo((6 * theirs) / 100, 2);
  });

  test("pooling capital: two can set up what one alone couldn't", () => {
    const { g, life } = one();
    life.purse = 70;
    const c = npcWithTrade(g, life, "merchant");
    like(g, life, c, 60);
    const ch = holdChoices(g.s, g.w, life, c).find(
      (x) => x.key === "found:shopkeeper",
    )!;
    const t = suggestTerms(g.s, g.w, life, c, ch, 2);
    const cost = bizCost("shopkeeper", 2);
    expect(life.purse).toBeLessThan(cost);
    t.sides[0].cap = 60;
    t.sides[1].cap = 30;
    expect(termsCheck(g.s, g.w, life, t, false)).toEqual({ ok: true });
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(f?.biz?.level).toBe(2);
    expect(f.chest).toBe(90 - cost);
  });
});

describe("between players", () => {
  test("a counter-offer goes back and forth in person, then the articles are signed", () => {
    const { g, a, b } = two();
    const bc = meOf(g.s, b)!;
    const ch = holdChoices(g.s, g.w, a, bc).find(
      (x) => x.key === "found:innkeeper",
    )!;
    const t = suggestTerms(g.s, g.w, a, bc, ch, 1);
    t.sides[0].cap = 30;
    t.sides[1].cap = 20;
    t.sides[0].share = 70;
    t.sides[1].share = 30;
    expect(
      g.lifeCommand("a", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const ev = b.events.find((e) => e.key === "p2p-articles");
    expect(ev).toBeTruthy();
    const o = offersOf(g.s)[0];
    // Beatrice wants more of it.
    expect(
      g.lifeCommand("b", {
        k: "partners",
        act: "counter",
        id: o.id,
        share: 50,
        mine: 20,
        theirs: 30,
      }),
    ).toBeNull();
    expect(b.events.some((e) => e.key === "p2p-articles")).toBe(false);
    expect(
      a.events.some((e) => e.key === "p2p-articles" && e.ctx.c === b.c),
    ).toBe(true);
    expect(o.from).toBe(b.c);
    expect(o.round).toBe(1);
    const pa = a.purse;
    const pb = b.purse;
    expect(
      g.lifeCommand("a", { k: "partners", act: "sign", id: o.id }),
    ).toBeNull();
    const f = firmsWith(g.s, a.c)[0];
    expect(f).toBeTruthy();
    expect(partnerIn(f, a.c)!.share).toBe(50);
    expect(pa - a.purse).toBe(30);
    expect(pb - b.purse).toBe(20);
    expect(a.events.some((e) => e.key === "p2p-articles")).toBe(false);
    expect(b.journal.some((j) => /has signed the articles/.test(j.text))).toBe(
      true,
    );
  });

  test("by post to another colony: the articles travel, are answered, and the news comes back", () => {
    const { g, a, b } = two({ far: true });
    const bc = meOf(g.s, b)!;
    const ch = holdChoices(g.s, g.w, a, bc).find((x) => x.key === "venture")!;
    const t = suggestTerms(g.s, g.w, a, bc, ch);
    expect(termsCheck(g.s, g.w, a, t, false).ok).toBe(false);
    expect(
      g.lifeCommand("a", {
        k: "partners",
        act: "propose",
        terms: t,
        post: true,
      }),
    ).toBeNull();
    const o = offersOf(g.s)[0];
    expect(o.status).toBe("post");
    let days = 0;
    while (!b.events.some((e) => e.key === "p2p-articles") && days++ < 200)
      g.tick();
    expect(days).toBeLessThan(200);
    expect(o.status).toBe("open");
    expect((b.post ?? []).some((l) => l.kind === "articles")).toBe(true);
    // She answers by the scene's own choice: sign.
    const ev = b.events.find((e) => e.key === "p2p-articles")!;
    expect(g.lifeCommand("b", { k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(firmsWith(g.s, a.c)).toHaveLength(1);
    days = 0;
    while (
      !a.journal.some((j) => /has signed the articles/.test(j.text)) &&
      days++ < 200
    )
      g.tick();
    expect(days).toBeLessThan(200);
  });

  test("by post to a computer character far off: their answer comes back by post, then the firm is made", () => {
    const { g, a } = two({ far: true });
    const far = prov("Plymouth");
    const c =
      (g.s.locals[far] ?? [])
        .map((id) => g.s.chars[id])
        .find((x) => x?.role === "merchant") ??
      makeCharacter(g.s, g.rng, {
        nation: meOf(g.s, a)!.nation,
        culture: "english",
        religion: "anglican",
        female: false,
        age: 45,
      });
    c.role ??= "merchant";
    c.home = far;
    a.met.push(c.id);
    like(g, a, c, 60);
    const ch = holdChoices(g.s, g.w, a, c).find((x) => x.key === "venture")!;
    const t = suggestTerms(g.s, g.w, a, c, ch);
    expect(
      g.lifeCommand("a", {
        k: "partners",
        act: "propose",
        terms: t,
        post: true,
      }),
    ).toBeNull();
    const o = offersOf(g.s)[0];
    let days = 0;
    while (
      o.status !== "signed" &&
      o.status !== "refused" &&
      o.status !== "lapsed" &&
      days++ < 300
    )
      g.tick();
    expect(o.status).toBe("signed");
    expect(firmsWith(g.s, a.c)[0]?.hold).toBe("venture");
    const reply = (a.post ?? []).find((l) => l.kind === "reply");
    expect(reply?.answer?.why.parts.length).toBeGreaterThan(2);
  });

  test("a matter put to two players: one asks, the other votes in a scene", () => {
    const { g, a, b } = two();
    const bc = meOf(g.s, b)!;
    const t = suggestTerms(
      g.s,
      g.w,
      a,
      bc,
      holdChoices(g.s, g.w, a, bc).find((x) => x.key === "venture")!,
    );
    t.sides[0].share = 50;
    t.sides[1].share = 50;
    t.sides[0].cap = 40;
    t.sides[1].cap = 40;
    g.lifeCommand("a", { k: "partners", act: "propose", terms: t });
    g.lifeCommand("b", { k: "partners", act: "sign", id: offersOf(g.s)[0].id });
    const f = firmsWith(g.s, a.c)[0];
    expect(
      g.lifeCommand("a", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "goods",
        arg: 20,
      }),
    ).toBeNull();
    const d = f.decisions[0];
    expect(d.status).toBe("open");
    const ev = b.events.find((e) => e.key === "p2p-firmvote")!;
    expect(ev).toBeTruthy();
    expect(g.lifeCommand("b", { k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(d.status).toBe("carried");
    expect(f.cargo?.stake).toBe(20);
    expect(f.chest).toBe(60);
    // Not answered: it's lost when the time's up (half isn't a majority).
    g.lifeCommand("a", {
      k: "partners",
      act: "decide",
      id: f.id,
      key: "loan",
      arg: 20,
    });
    const d2 = f.decisions[1];
    ticks(g, 31);
    expect(d2.status).toBe("lost");
    expect(b.events.some((e) => e.key === "p2p-firmvote")).toBe(false);
  });
});

describe("matters put to the partners", () => {
  test("the greater part in interest carries it; a computer partner votes by its interests, with reasons", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    f.chest = 60;
    const mine = partnerIn(f, life.c)!;
    expect(mine.share).toBeLessThan(50);
    expect(
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "repay",
      }),
    ).toMatch(/owes nothing/);
    expect(
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "loan",
        arg: 20,
      }),
    ).toBeNull();
    const d = f.decisions[0];
    const npc = f.partners.find((p) => p.c !== life.c)!;
    expect(d.votes[npc.c]).toBeDefined();
    expect(d.why?.[npc.c]).toBeTruthy();
    expect(d.status).not.toBe("open");
  });

  test("all together: one no and it's lost", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    f.rule = "unanimous";
    f.chest = 100;
    const npc = f.partners.find((p) => p.c !== life.c)!;
    g.char(npc.c).traits = [];
    g.s.wars.push({
      a: g.s.provinces[f.prov].owner,
      b: 1,
      by: 1,
      start: g.s.day,
      why: "Test",
      won: [0, 0],
      lost: [0, 0],
      europe: false,
    });
    g.lifeCommand("s1", {
      k: "partners",
      act: "decide",
      id: f.id,
      key: "goods",
      arg: 20,
    });
    const d = f.decisions[0];
    expect(d.votes[npc.c]).toBe(-1);
    expect(d.why?.[npc.c]).toMatch(/Privateers/);
    expect(d.status).toBe("lost");
    expect(f.cargo).toBeNull();
  });

  test("a new partner comes in: their capital into the chest, everyone's share shrinks to make room", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    f.rule = "majority";
    const me = partnerIn(f, life.c)!;
    me.share = 60;
    f.partners.find((p) => p !== me)!.share = 40;
    const m = npcWithTrade(g, life, "merchant");
    like(g, life, m, 60);
    const chest = f.chest;
    expect(
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "admit",
        c: m.id,
        arg: 20,
        cap: 40,
      }),
    ).toBeNull();
    expect(f.decisions[0].status).toBe("carried");
    const o = offersOf(g.s).find((x) => x.firm === f.id)!;
    expect(o).toBeTruthy();
    expect(o.status).toBe("signed");
    expect(partnerIn(f, m.id)?.share).toBe(20);
    expect(me.share).toBe(48);
    expect(sumShares(f)).toBe(100);
    expect(f.chest).toBe(chest + 40);
  });

  test("a partner is bought out at a fair price, and the last partner keeps the business", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    const npc = f.partners.find((p) => p.c !== life.c)!;
    life.purse = 999;
    // Make the computer partner glad to sell.
    g.char(npc.c).traits.push("greedy");
    const price = buyoutPrice(g.s, f, npc.c);
    const chest = f.chest;
    expect(price).toBeGreaterThan(npc.capital);
    expect(
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "buyout",
        c: npc.c,
      }),
    ).toBeNull();
    const d = f.decisions[0];
    expect(d.status).toBe("carried");
    // The price paid, and the chest is the last partner's.
    expect(life.purse).toBeCloseTo(999 - price + chest, 1);
    expect(f.status).toBe("dissolved");
    expect(
      (life.property ?? []).some(
        (p) => p.kind === "business" && p.job === "innkeeper",
      ),
    ).toBe(true);
  });

  test("selling up winds the firm up: debts first, capital back, the rest by share", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    f.chest = 120;
    f.debt = 20;
    const shares = windingUpShares(g.s, f);
    const pool = 120 - 20 + 42.5;
    const total = [...shares.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(pool, 1);
    const me = partnerIn(f, life.c)!;
    const mine = shares.get(life.c)!;
    const capTotal = f.partners.reduce((m, p) => m + p.capital, 0);
    expect(mine).toBeCloseTo(
      me.capital + ((pool - capTotal) * me.share) / 100,
      1,
    );
    const purse = life.purse;
    // The innkeeper won't want to sell a paying inn; force it as the majority.
    me.share = 60;
    f.partners.find((p) => p !== me)!.share = 40;
    expect(
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "sell",
      }),
    ).toBeNull();
    expect(f.status).toBe("dissolved");
    expect(life.purse).toBeGreaterThan(purse);
  });
});

describe("when things go wrong", () => {
  test("a managing partner's second set of books: their pocket fills, the chest doesn't, and the law comes", () => {
    const { g, life } = one(21);
    const c = npcWithTrade(g, life, "merchant");
    like(g, life, c, 60);
    // Alden founds a store and keeps the books; the merchant is honest.
    g.char(c.id).traits = ["honest"];
    const ch = holdChoices(g.s, g.w, life, c).find(
      (x) => x.key === "found:shopkeeper",
    )!;
    const t = suggestTerms(g.s, g.w, life, c, ch, 1);
    t.sides[0].cap = 40;
    t.sides[1].cap = 20;
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(partnerIn(f, life.c)!.role).toBe("managing");
    expect(
      g.lifeCommand("s1", { k: "partners", act: "books", id: f.id, yes: true }),
    ).toBeNull();
    const me = partnerIn(f, life.c)!;
    let months = 0;
    while (!(me.caught ?? 0) && months++ < 120) toNextMonth(g);
    expect(me.skim ?? 0).toBeGreaterThan(0);
    expect(me.caught).toBeGreaterThan(0);
    // An honest partner goes straight to law.
    const suit = trialsOf(g.s).find(
      (x) => x.defendant === life.c && x.kind === "debt",
    );
    expect(suit?.charge).toMatch(/out of its books/);
    expect(f.suit?.trial).toBe(suit?.id);
  });

  test("a computer partner's second set of books, found by a player: the scene, and the law", () => {
    const { g, life } = one(5);
    const f = innFirm(g, life);
    const npc = f.partners.find((p) => p.c !== life.c)!;
    npc.cooking = true;
    life.skills.trade = 14;
    life.skills.letters = 14;
    let months = 0;
    while (!life.events.some((e) => e.key === "pa-embezzle") && months++ < 120)
      toNextMonth(g);
    const ev = life.events.find((e) => e.key === "pa-embezzle")!;
    expect(ev).toBeTruthy();
    expect(ev.ctx.sum).toBeGreaterThan(0);
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 2 }),
    ).toBeNull();
    const t = trialsOf(g.s).find((x) => x.defendant === npc.c);
    expect(t?.accuser).toBe(life.c);
  });

  test("a partner dies: the share passes to their heir, and the others are told", () => {
    const { g, a, b } = two();
    const bc = meOf(g.s, b)!;
    const t = suggestTerms(
      g.s,
      g.w,
      a,
      bc,
      holdChoices(g.s, g.w, a, bc).find((x) => x.key === "venture")!,
    );
    g.lifeCommand("a", { k: "partners", act: "propose", terms: t });
    g.lifeCommand("b", { k: "partners", act: "sign", id: offersOf(g.s)[0].id });
    const f = firmsWith(g.s, a.c)[0];
    // Beatrice's grown son is her heir.
    const son = makeCharacter(g.s, g.rng, {
      nation: bc.nation,
      culture: "english",
      religion: "anglican",
      female: false,
      age: 20,
    });
    son.mother = bc.id;
    son.family = bc.family;
    bc.children.push(son.id);
    son.home = b.home;
    const share = partnerIn(f, bc.id)!.share;
    kill(g, g.char(bc.id), "a fever");
    ticks(g, 2);
    const heir = b.c;
    expect(heir).not.toBe(bc.id);
    expect(partnerIn(f, heir)?.share).toBe(share);
    expect(a.events.some((e) => e.key === "pa-heir")).toBe(true);
  });

  test("a computer partner dies with no heir: the share goes to the rest", () => {
    const { g, life } = one();
    const f = innFirm(g, life);
    const npc = f.partners.find((p) => p.c !== life.c)!;
    const c = g.s.chars[npc.c];
    for (const k of c.children) g.s.chars[k].alive = false;
    if (c.spouse >= 0) g.s.chars[c.spouse].alive = false;
    kill(g, g.char(c.id), "old age");
    ticks(g, 2);
    // Only Alden left: the inn is his.
    expect(f.status).toBe("dissolved");
    expect((life.property ?? []).some((p) => p.job === "innkeeper")).toBe(true);
  });

  test("a bankrupt partner's share is seized: the other player may buy it", () => {
    const { g, a, b } = two();
    const bc = meOf(g.s, b)!;
    const t = suggestTerms(
      g.s,
      g.w,
      a,
      bc,
      holdChoices(g.s, g.w, a, bc).find((x) => x.key === "venture")!,
    );
    t.sides[0].cap = 40;
    t.sides[1].cap = 40;
    g.lifeCommand("a", { k: "partners", act: "propose", terms: t });
    g.lifeCommand("b", { k: "partners", act: "sign", id: offersOf(g.s)[0].id });
    const f = firmsWith(g.s, a.c)[0];
    b.purse = -60;
    toNextMonth(g);
    expect(f.seized?.c).toBe(b.c);
    const ev = a.events.find((e) => e.key === "pa-creditors")!;
    expect(ev).toBeTruthy();
    const pa = a.purse;
    expect(g.lifeCommand("a", { k: "event", id: ev.id, choice: 1 })).toBeNull();
    // Alden is the only partner now: it's his alone.
    expect(f.status).toBe("dissolved");
    expect(a.purse).toBeLessThan(pa + 80);
  });

  test("a ship taken in wartime: the firm is left with its chest, and may fit out another", () => {
    const { g, life } = one();
    const c = npcWithTrade(g, life, "captain");
    like(g, life, c, 60);
    const ch = holdChoices(g.s, g.w, life, c).find(
      (x) => x.key === "theirs:-1",
    )!;
    const t = suggestTerms(g.s, g.w, life, c, ch);
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(f.biz?.job).toBe("sailor");
    loseShip(g, f);
    expect(f.biz).toBeNull();
    expect(f.lost?.job).toBe("sailor");
    expect(life.events.some((e) => e.key === "pa-ship")).toBe(true);
    f.chest = 200;
    life.purse = 500;
    const ev = life.events.find((e) => e.key === "pa-ship")!;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 1 }),
    ).toBeNull();
    const d = f.decisions[f.decisions.length - 1];
    expect(d.key).toBe("expand");
  });
});

describe("the state", () => {
  test("survives a save and load, travels in deltas, and old saves load", () => {
    const { g, life } = one();
    const client: GameState = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    const f = innFirm(g, life);
    ticks(g, 70);
    applyDelta(client, g.takeDelta());
    expect(client.partners?.firms).toEqual(g.s.partners?.firms);
    expect(client.partners?.offers).toEqual(g.s.partners?.offers);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    g2.aiEnabled = false;
    ticks(g2, 40);
    expect(
      firmsOf(g2.s).find((x) => x.id === f.id)?.books.length,
    ).toBeGreaterThan(f.books.length);
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete old.partners;
    const g3 = new ConquestGame(map, old);
    ticks(g3, 40);
    expect(g3.s.partners).toBeUndefined();
  });

  test("the same seed runs the same", () => {
    const run = () => {
      const { g, life } = one(3);
      const f = innFirm(g, life);
      g.lifeCommand("s1", {
        k: "partners",
        act: "decide",
        id: f.id,
        key: "goods",
        arg: 10,
      });
      for (let m = 0; m < 14; m++) toNextMonth(g);
      return JSON.stringify(g.s.partners);
    };
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------- through the server

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: {
    test: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMessage["t"]>(
    t: T,
    test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        4000,
      );
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }
  /** Wait until what this player sees passes a test. */
  async until(pred: (s: GameState) => boolean): Promise<GameState> {
    for (let i = 0; i < 20; i++) {
      const s = this.state();
      if (s && pred(s)) return s;
      await this.next("d").catch(() => undefined);
    }
    return this.state();
  }
  /** The game as this player sees it: the start, and every delta since. */
  state(): GameState {
    let s: GameState | null = null;
    for (const m of this.messages) {
      if (m.t === "game") s = JSON.parse(JSON.stringify(m.state));
      else if (m.t === "d" && s) applyDelta(s, m.d as GameDelta);
    }
    return s!;
  }
  close() {
    this.ws.close();
  }
}

describe("two players through the rooms server", () => {
  let server: http.Server;
  let url = "";
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    const rooms = new ConquestRooms(() => 1_800_000_000_000);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterAll(async () => {
    for (const c of clients) c.close();
    await new Promise((r) => server.close(r));
  });
  const client = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    return c;
  };

  test("articles proposed, countered and signed between two players", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal", start: 1700 },
    });
    const l = await lobby;
    const friend = await client("Bea");
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code });
    await joined;
    host.send({ t: "plan", plan: plan({ home: JT, background: "clerk" }) });
    friend.send({
      t: "plan",
      plan: plan({
        home: JT,
        first: "Beatrice",
        family: "Cole",
        female: true,
        background: "clerk",
      }),
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    friend.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    const paused = host.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    await paused;

    // Alden puts articles to Beatrice, in person: a company for cargoes.
    const s = host.state();
    const a = lifeOfSeat(s, hg.you)!;
    const b = lifeOfSeat(s, fg.you)!;
    const bc = s.chars[b.c];
    const w = worldOf(AMERICAS);
    const ch = holdChoices(s, w, a, bc).find((x) => x.key === "venture")!;
    const t = suggestTerms(s, w, a, bc, ch, 1);
    t.sides[0].cap = 6;
    t.sides[1].cap = 4;
    t.sides[0].share = 60;
    t.sides[1].share = 40;
    const ack1 = host.next("ack", (m) => m.id === 1);
    host.send({
      t: "cmd",
      id: 1,
      c: { k: "partners", act: "propose", terms: t },
    });
    expect((await ack1).err).toBeNull();

    // She sees the articles as a scene to answer, and sends back her own terms.
    const fs = await friend.until(
      (x) =>
        !!lifeOfSeat(x, fg.you)?.events.some((e) => e.key === "p2p-articles"),
    );
    const ev = lifeOfSeat(fs, fg.you)!.events.find(
      (e) => e.key === "p2p-articles",
    );
    expect(ev).toBeTruthy();
    const offer = fs.partners!.offers.find((o) => o.to === b.c)!;
    const ack2 = friend.next("ack", (m) => m.id === 2);
    friend.send({
      t: "cmd",
      id: 2,
      c: {
        k: "partners",
        act: "counter",
        id: offer.id,
        share: 50,
        mine: 5,
        theirs: 5,
      },
    });
    expect((await ack2).err).toBeNull();

    // He gets her terms back, and signs.
    const hs = await host.until(
      (x) =>
        !!lifeOfSeat(x, hg.you)?.events.some((e) => e.key === "p2p-articles"),
    );
    expect(
      lifeOfSeat(hs, hg.you)!.events.some((e) => e.key === "p2p-articles"),
    ).toBe(true);
    const ack3 = host.next("ack", (m) => m.id === 3);
    host.send({
      t: "cmd",
      id: 3,
      c: { k: "partners", act: "sign", id: offer.id },
    });
    expect((await ack3).err).toBeNull();

    // Both see the firm, with the shares as Beatrice put them.
    for (const c of [host, friend]) {
      const f = (await c.until((x) => !!x.partners?.firms.length)).partners!
        .firms[0];
      expect(f.name).toBe(t.name);
      expect(f.partners.map((p) => p.share).sort()).toEqual([50, 50]);
      expect(f.hold).toBe("venture");
      expect(f.chest).toBe(10);
    }
  }, 30000);
});
