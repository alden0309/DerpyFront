// WORK (r21): jobs worth playing, leaving them from anywhere, hiring into
// your businesses by role and pay (Hiring.ts, as a ship's company), no cap
// on businesses, a business's plan both ways (minded, or not), partnership
// buyouts and sales by offer, and a trading company whose cargoes move the
// markets as a person's buying does.

import { describe, expect, test, vi } from "vitest";
import {
  handCount,
  propertyInput,
  propertyView,
} from "../../src/conquest/engine/Business";
import {
  fairPrice,
  leastToSell,
  mostToBuy,
} from "../../src/conquest/engine/Buyouts";
import { isMonthStart } from "../../src/conquest/engine/Calendar";
import {
  CO_MOVE,
  companyQuote,
  defaultPlan,
} from "../../src/conquest/engine/Company";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { buyoutPrice } from "../../src/conquest/engine/Firms";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  askingPay,
  offersTo,
  prospectOf,
  roleOf,
  signOdds,
} from "../../src/conquest/engine/Hiring";
import { ledgerForecast } from "../../src/conquest/engine/Ledger";
import { autoAnswerLife } from "../../src/conquest/engine/LifeEvents";
import { jobTitle, lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { BUSINESS_HANDS, HAND_WAGE } from "../../src/conquest/engine/LifeRules";
import { marketTrade, netNow } from "../../src/conquest/engine/Markets";
import { NOTICE_DAYS, quitView } from "../../src/conquest/engine/Notice";
import { holdChoices, suggestTerms } from "../../src/conquest/engine/Partners";
import { firmsWith, partnerIn } from "../../src/conquest/engine/PartnersCore";
import {
  bizHost,
  clerkWorth,
  staffCandidates,
  staffInput,
  staffLadder,
  startWays,
} from "../../src/conquest/engine/Staff";
import type {
  Character,
  Firm,
  GameState,
  Life,
  Property,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

vi.setConfig({ testTimeout: 240_000 });

const JT = prov("Jamestown");
const BOS = prov("Massachusetts Bay");

function game(
  seed: number,
  o: { background?: string; purse?: number; seats?: number } = {},
): { g: ConquestGame; life: Life } {
  const plans = [
    {
      seat: "s1",
      name: "Alden",
      plan: plan({ home: JT, background: (o.background ?? "farmer") as never }),
    },
  ];
  if ((o.seats ?? 1) > 1)
    plans.push({
      seat: "s2",
      name: "Bea",
      plan: plan({
        first: "Beatrice",
        family: "Hale",
        female: true,
        home: JT,
        background: "farmer" as never,
      }),
    });
  const g = world({ start: 1700, seed, plans });
  g.aiEnabled = false;
  const life = lifeOf(g);
  for (const l of g.s.lives) l.purse = o.purse ?? 400;
  return { g, life };
}

function cmd(
  g: ConquestGame,
  c: Parameters<ConquestGame["lifeCommand"]>[1],
  seat = "s1",
) {
  return g.lifeCommand(seat, c);
}

function answerAll(g: ConquestGame) {
  for (const l of g.s.lives)
    for (const e of [...l.events]) autoAnswerLife(g, l.seat, e.id);
}

function days(g: ConquestGame, n: number, answer = true) {
  for (let i = 0; i < n; i++) {
    g.tick();
    if (answer) answerAll(g);
  }
}

/** Run to the next month's turn. */
function month(g: ConquestGame): void {
  do g.tick();
  while (!g.s.over && !isMonthStart(g.s.day));
}

const memoryOf = (g: ConquestGame, c: number, of: number, why: string) =>
  g.s.chars[c]?.memories.find((m) => m.of === of && m.why === why);

// ---------------------------------------------------------------- leaving your work

describe("leaving your work from anywhere", () => {
  test("by letter, with your master far away (and he remembers the lurch)", () => {
    const { g, life } = game(3);
    const job = life.job!;
    expect(job.own).toBeFalsy();
    const boss = job.employer;
    expect(boss).toBeGreaterThanOrEqual(0);
    // Away at Boston: the master's at Jamestown.
    life.prov = BOS;
    life.travel = null;
    const v = quitView(g.s, g.w, life);
    expect(v.how).toBe("letter");
    expect(v.lurch).toBe(true);
    expect(cmd(g, { k: "quit" })).toBeNull();
    expect(life.job).toBeNull();
    expect(
      life.journal.some((j) => /You write to .* won't be back/.test(j.text)),
    ).toBe(true);
    expect(memoryOf(g, boss, life.c, "Left me in the lurch")).toBeTruthy();
  });

  test("a fortnight's notice, worked out: paid till the end, and parted on good terms", () => {
    const { g, life } = game(4);
    const boss = life.job!.employer;
    expect(cmd(g, { k: "quit", how: "notice" })).toBeNull();
    expect(life.job?.notice?.until).toBe(g.s.day + NOTICE_DAYS);
    expect(cmd(g, { k: "quit", how: "notice" })).toMatch(/notice already/);
    days(g, NOTICE_DAYS - 1);
    expect(life.job).not.toBeNull();
    expect(life.job!.notice!.done).toBeGreaterThanOrEqual(6);
    days(g, 2);
    expect(life.job).toBeNull();
    expect(memoryOf(g, boss, life.c, "Gave fair notice")).toBeTruthy();
    expect(memoryOf(g, boss, life.c, "Left me in the lurch")).toBeUndefined();
  });

  test("notice can be taken back", () => {
    const { g, life } = game(5);
    expect(cmd(g, { k: "quit", how: "notice" })).toBeNull();
    days(g, 3);
    expect(cmd(g, { k: "quit", how: "stay" })).toBeNull();
    expect(life.job?.notice).toBeUndefined();
    days(g, NOTICE_DAYS + 2);
    expect(life.job).not.toBeNull();
  });

  test("working for another player: leave from the job menu, and they're told", () => {
    const { g, life } = game(6, { seats: 2 });
    const bea = lifeOfSeat(g.s, "s2")!;
    // Bea works at Alden's store the old way (a hand taken on before r21).
    expect(cmd(g, { k: "quit" })).toBeNull();
    life.purse = 900;
    expect(
      cmd(g, { k: "business", act: "found", job: "shopkeeper", level: 1 }),
    ).toBeNull();
    const pr = life.property!.find((p) => p.kind === "business")!;
    expect(cmd(g, { k: "quit" }, "s2")).toBeNull();
    pr.hands.push(bea.c);
    bea.job = {
      kind: "shopkeeper",
      rank: 1,
      prov: JT,
      place: pr.place!,
      employer: life.c,
      nation: g.s.chars[bea.c].nation,
      army: -1,
      since: g.s.day,
      months: 0,
      away: 0,
      worked: 0,
      awayDays: 0,
    };
    // Alden is away: no matter, and no scene puts words in his mouth.
    life.prov = BOS;
    expect(quitView(g.s, g.w, bea).how).toBe("player");
    expect(cmd(g, { k: "quit" }, "s2")).toBeNull();
    expect(bea.job).toBeNull();
    expect(pr.hands).not.toContain(bea.c);
    expect(life.journal.some((j) => /has left your employ/.test(j.text))).toBe(
      true,
    );
  });

  test("an indenture still binds", () => {
    const { g, life } = game(7, { background: "servant" });
    if (life.job?.kind !== "servant") return;
    expect(quitView(g.s, g.w, life).check.ok).toBe(false);
    expect(cmd(g, { k: "quit", how: "notice" })).toMatch(/bound/);
  });
});

// ---------------------------------------------------------------- no cap

describe("no cap on businesses", () => {
  test("four businesses of your own, and more", () => {
    const { g, life } = game(8, { background: "gentry", purse: 2000 });
    life.job = null;
    const kinds = [
      "shopkeeper",
      "innkeeper",
      "carpenter",
      "blacksmith",
      "cooper",
    ];
    let made = 0;
    for (const job of kinds)
      if (!cmd(g, { k: "business", act: "found", job: job as never, level: 1 }))
        made++;
    expect(made).toBeGreaterThanOrEqual(4);
    expect(life.property!.filter((p) => p.kind === "business").length).toBe(
      made,
    );
  });
});

// ---------------------------------------------------------------- a company and the markets

describe("a trading company moves the markets as a person does", () => {
  test("its cargo bought at the port moves the price as buying the loads yourself would", () => {
    expect(CO_MOVE).toBe(1);
    // A person buys the loads.
    const a = game(9, { background: "clerk", purse: 900 });
    const plan = defaultPlan(a.g.s, a.g.w, a.life.prov)!;
    expect(plan).toBeTruthy();
    expect(marketTrade(a.g, a.life, plan.item, plan.loads)).toBeNull();
    const person = netNow(a.g.s.markets?.[plan.from], plan.item, a.g.s.day);
    // The same world, a company's first cargo.
    const b = game(9, { background: "clerk", purse: 900 });
    const q = companyQuote(b.g.s, b.g.w, plan);
    expect(q.buy).toBeGreaterThan(0);
    expect(
      cmd(b.g, { k: "business", act: "company", plan, cap: 400 }),
    ).toBeNull();
    const f = firmsWith(b.g.s, b.life.c).find((x) => x.hold === "company")!;
    expect(f.co!.voyages.length).toBe(1);
    const co = netNow(b.g.s.markets?.[plan.from], plan.item, b.g.s.day);
    expect(co).toBeCloseTo(person, 5);
    expect(co).toBeCloseTo(-plan.loads, 5);
    // And it says so in the firm's books.
    expect(
      f.lines.some((l) => /Its buying put the price of/.test(l.text)),
    ).toBe(true);
    void month;
  });
});

// ---------------------------------------------------------------- a business's staff

/** Alden at Jamestown with a store of his own (middling), and no other work. */
function store(seed: number, seats = 1) {
  const { g, life } = game(seed, { background: "clerk", purse: 900, seats });
  life.job = null;
  life.skills.trade = 8;
  expect(
    cmd(g, { k: "business", act: "found", job: "shopkeeper", level: 2 }),
  ).toBeNull();
  const pr = life.property!.find((p) => p.kind === "business")!;
  return { g, s: g.s, life, pr };
}

/** One of the town who'd sign as a role at what they'd ask. */
function willing(
  s: GameState,
  g: ConquestGame,
  life: Life,
  pr: Property,
  role: string,
): { c: Character; pay: number } {
  const host = bizHost(s, life, pr, g.map);
  const ladder = staffLadder(pr.job!);
  const r = roleOf(ladder, role)!;
  for (const c of staffCandidates(s, g.w, life, pr)) {
    const p = prospectOf(s, life, c, ladder);
    const pay = Math.max(r.pay, askingPay(p, r)) + 1;
    if (signOdds(host, p, r, pay).total > 0) return { c, pay };
  }
  throw new Error(`nobody would sign as ${role}`);
}

describe("a business's staff by name (Hiring.ts, as a ship's company)", () => {
  test("the town's people sign by the odds shown, in the role and at the pay chosen; what they do is in the month", () => {
    const { g, s, life, pr } = store(21);
    const before = propertyView(s, life, pr);
    const hands = handCount(pr);
    // Too little pay: refused, and nobody's made.
    const { c, pay } = willing(s, g, life, pr, "clerk");
    expect(
      cmd(g, {
        k: "staff",
        act: "hire",
        id: pr.id,
        c: c.id,
        role: "clerk",
        pay: 0.5,
      }),
    ).toMatch(/won't sign/);
    expect(pr.biz?.roster?.hires.length ?? 0).toBe(0);
    expect(
      cmd(g, {
        k: "staff",
        act: "hire",
        id: pr.id,
        c: c.id,
        role: "clerk",
        pay,
      }),
    ).toBeNull();
    const h = pr.biz!.roster!.hires[0];
    expect(h).toMatchObject({ c: c.id, role: "clerk", pay });
    // A clerk keeps the books: the takings rise, and his pay is the business's cost.
    const fx = staffInput(s, life, pr)!;
    expect(fx.takeX).toBeGreaterThan(1);
    expect(fx.pay).toBe(pay);
    const after = propertyView(s, life, pr);
    expect(after.takings).toBeGreaterThan(before.takings);
    expect(after.staff).toBe(pay);
    expect(after.profit).toBeCloseTo(
      after.takings - after.wages - after.upkeep - after.excise - pay,
      1,
    );
    expect(handCount(pr)).toBe(hands);
    expect(clerkWorth(10)).toBe(1.08);
    // The month: his pay goes out under the staff's own line, as its forecast said.
    const fc = ledgerForecast(s, g.w, life).lines.find(
      (l) => l.key === `ps:${pr.id}`,
    );
    expect(fc?.value).toBe(-pay);
    month(g);
    month(g);
    const paid = (life.statements ?? [])
      .slice(-1)
      .flatMap((x) => x.lines)
      .filter((l) => l.k === `ps:${pr.id}`)
      .reduce((m, l) => m + l.v, 0);
    expect(paid).toBeCloseTo(-pay, 2);
    // The business's account carries it.
    const row = pr.biz!.acct!.slice(-1)[0];
    expect(row.staff).toBe(pay);
  });

  test("a hand by name takes a town hand's place; promoted to foreman (a middling place), demoted again", () => {
    const { g, s, life, pr } = store(22);
    const room = BUSINESS_HANDS[pr.level];
    pr.biz!.extra = room;
    expect(handCount(pr)).toBe(room);
    const { c, pay } = willing(s, g, life, pr, "hand");
    expect(
      cmd(g, {
        k: "staff",
        act: "hire",
        id: pr.id,
        c: c.id,
        role: "hand",
        pay,
      }),
    ).toBeNull();
    expect(handCount(pr)).toBe(room);
    expect(pr.biz!.extra).toBe(room - 1);
    // Wages: the town's hands only (the named hand has his own pay).
    const i = propertyInput(s, life, pr);
    expect(propertyView(s, life, pr).wages).toBe((room - 1) * HAND_WAGE);
    expect(i.unpaid).toBe(1);
    const h = pr.biz!.roster!.hires[0];
    expect(
      cmd(g, {
        k: "staff",
        act: "role",
        id: pr.id,
        hire: h.id,
        role: "foreman",
      }),
    ).toBeNull();
    expect(h.role).toBe("foreman");
    expect(c.memories.some((m) => m.why === "Made me foreman")).toBe(true);
    expect(
      cmd(g, { k: "staff", act: "role", id: pr.id, hire: h.id, role: "hand" }),
    ).toBeNull();
    expect(c.memories.some((m) => m.why === "Broke me to a lower place")).toBe(
      true,
    );
    expect(
      cmd(g, { k: "staff", act: "pay", id: pr.id, hire: h.id, pay: pay + 1 }),
    ).toBeNull();
    expect(h.pay).toBe(pay + 1);
    expect(
      cmd(g, { k: "staff", act: "dismiss", id: pr.id, hire: h.id }),
    ).toBeNull();
    expect(pr.biz!.roster!.hires.length).toBe(0);
  });

  test("a small place has no foreman; a manager on the staff minds it while you're at other work", () => {
    const { g, s, life, pr } = store(23);
    pr.level = 1;
    const host = bizHost(s, life, pr, g.map);
    expect(host.room("foreman")).toBe(0);
    pr.level = 2;
    // Alden takes work elsewhere: nobody minds it.
    expect(cmd(g, { k: "job", place: "market", job: "clerk" })).toBeNull();
    life.job!.prov = prov("Massachusetts Bay");
    expect(propertyInput(s, life, pr).minded).toBe(false);
    const { c, pay } = willing(s, g, life, pr, "manager");
    expect(
      cmd(g, {
        k: "staff",
        act: "hire",
        id: pr.id,
        c: c.id,
        role: "manager",
        pay,
      }),
    ).toBeNull();
    const i = propertyInput(s, life, pr);
    expect(i.minded).toBe(true);
    expect(i.who).toBe(`your manager ${c.first}`);
  });

  test("another player is offered a place in a scene, takes it, is paid by the days at their post, and leaves from the job menu", () => {
    const { g, s, life, pr } = store(24, 2);
    const bea = lifeOfSeat(s, "s2")!;
    expect(
      cmd(g, {
        k: "staff",
        act: "offer",
        id: pr.id,
        c: bea.c,
        role: "skilled",
        pay: 4,
      }),
    ).toBeNull();
    expect(offersTo(s, "s2").length).toBe(1);
    const ev = bea.events.find((e) => e.key === "p2p-staff")!;
    expect(ev).toBeTruthy();
    expect(ev.title).toMatch(/A place as shopman at Alden's store/);
    expect(cmd(g, { k: "event", id: ev.id, choice: 0 }, "s2")).toBeNull();
    expect(bea.job?.berth).toMatchObject({
      kind: "biz",
      seat: "s1",
      id: pr.id,
      pay: 4,
    });
    expect(jobTitle(bea)).toBe("Shopman of Alden's store at Jamestown");
    // She's one of its hands (and not paid a hand's wage).
    expect(staffInput(s, life, pr)!.hands).toBe(1);
    month(g);
    month(g);
    const got = (bea.statements ?? [])
      .flatMap((x) => x.lines)
      .filter((l) => /^m:Wage: shopman of alden's store/.test(l.k))
      .reduce((m, l) => m + l.v, 0);
    expect(got).toBeGreaterThan(0);
    const paid = (life.statements ?? [])
      .flatMap((x) => x.lines)
      .filter((l) => l.k === `ps:${pr.id}`)
      .reduce((m, l) => m + l.v, 0);
    expect(paid).toBeCloseTo(-got, 1);
    // Promoted to manager: Alden is told nothing new; Bea is.
    const h = pr.biz!.roster!.hires[0];
    expect(
      cmd(g, {
        k: "staff",
        act: "role",
        id: pr.id,
        hire: h.id,
        role: "manager",
      }),
    ).toBeNull();
    expect(jobTitle(bea)).toBe("Manager of Alden's store at Jamestown");
    expect(
      bea.journal.some((j) => /promotes you to manager/.test(j.text)),
    ).toBe(true);
    // She leaves from the usual job menu (Alden's away: no matter).
    life.prov = BOS;
    expect(cmd(g, { k: "quit" }, "s2")).toBeNull();
    expect(bea.job).toBeNull();
    expect(pr.biz!.roster!.hires.length).toBe(0);
    expect(life.journal.some((j) => /leaves Alden's store/.test(j.text))).toBe(
      true,
    );
  });

  test("saves, the delta and old saves", () => {
    const { g, s, life, pr } = store(25);
    const { c, pay } = willing(s, g, life, pr, "clerk");
    expect(
      cmd(g, {
        k: "staff",
        act: "hire",
        id: pr.id,
        c: c.id,
        role: "clerk",
        pay,
      }),
    ).toBeNull();
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 40; i++) {
      g.tick();
      answerAll(g);
      applyDelta(mine, g.takeDelta());
    }
    const mineA = mine.lives.find((x) => x.seat === "s1")!;
    expect(mineA.property).toEqual(life.property);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    for (let i = 0; i < 40; i++) {
      g.tick();
      g2.tick();
    }
    expect(lifeOfSeat(g2.s, "s1")!.purse).toBeCloseTo(life.purse, 6);
    // An old save: no rosters at all.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const l of old.lives)
      for (const p of l.property ?? []) if (p.biz) delete p.biz.roster;
    const g3 = new ConquestGame(map, old);
    for (let i = 0; i < 40; i++) g3.tick();
    const l3 = lifeOfSeat(g3.s, "s1")!;
    expect(l3.property!.some((p) => p.kind === "business")).toBe(true);
  });
});

// ---------------------------------------------------------------- a new business, both ways

describe("a new business's plan both ways", () => {
  test("working elsewhere, the plan shows it minded (you, or a manager at his wage) as well as unminded", () => {
    const { g, life } = game(31, { background: "clerk", purse: 900 });
    expect(life.job?.kind).toBe("clerk");
    life.skills.trade = 8;
    const ways = startWays(g.s, g.w, life, "shopkeeper", 1);
    const by = (k: string) => ways.find((w) => w.key === k)!;
    expect(ways.map((w) => w.key)).toEqual(["you", "manager", "none"]);
    // As things stand he's clerking: nobody would mind it.
    expect(by("none").now).toBe(true);
    expect(by("you").note).toMatch(/If you gave up your work as clerk/);
    const net = (k: string) => by(k).plan.going.profit - by(k).plan.going.mgr;
    expect(net("you")).toBeGreaterThan(net("none"));
    expect(net("manager")).toBeGreaterThan(net("none"));
    // The manager's wage is in his way's figures.
    expect(by("manager").plan.going.staff).toBeGreaterThan(0);
    expect(by("manager").note).toMatch(/a month on its staff/);
    // With no other work, minding it himself is the way things stand.
    life.job = null;
    const free = startWays(g.s, g.w, life, "shopkeeper", 1);
    expect(free.find((w) => w.now)?.key).toBe("you");
  });
});

// ---------------------------------------------------------------- partnership buyouts and sales by offer

/** Alden buys into the innkeeper's inn on fair terms (the innkeeper manages it). */
function inn(
  seed: number,
  seats = 1,
): { g: ConquestGame; life: Life; f: Firm } {
  const { g, life } = game(seed, { background: "clerk", purse: 300, seats });
  const c = peopleHereWithRole(g, life, "innkeeper");
  g.char(c.id).memories.push({ of: life.c, why: "Test", value: 40, until: 0 });
  const ch = holdChoices(g.s, g.w, life, c).find((x) =>
    x.key.startsWith("theirs"),
  )!;
  const t = suggestTerms(g.s, g.w, life, c, ch);
  expect(cmd(g, { k: "partners", act: "propose", terms: t })).toBeNull();
  const f = firmsWith(g.s, life.c)[0];
  expect(f).toBeTruthy();
  return { g, life, f };
}

function peopleHereWithRole(g: ConquestGame, life: Life, role: string) {
  const c = Object.values(g.s.chars).find(
    (x) =>
      x.alive &&
      !x.abroad &&
      x.role === role &&
      (g.s.locals[life.prov] ?? []).includes(x.id),
  );
  if (!c) throw new Error(`no ${role} here`);
  return c as Character;
}

describe("partnership buyouts and sales by offer", () => {
  test("a computer partner sells only at their price: refused far under it, a counter near it, and the business is yours", () => {
    const { g, life, f } = inn(41);
    life.purse = 2000;
    const npc = f.partners.find((p) => p.c !== life.c)!;
    const ch = g.s.chars[npc.c];
    const { least, b } = leastToSell(g.s, f, ch, life);
    // The reckoning shown is the one they decide by.
    expect(b.parts.map((x) => x.label).join(" ")).toMatch(
      /fair price.*their living/,
    );
    expect(least).toBeGreaterThan(fairPrice(g.s, f, npc.c));
    // Far under it: no.
    expect(
      cmd(g, {
        k: "bid",
        act: "make",
        id: f.id,
        key: "buy",
        c: npc.c,
        price: Math.round(least * 0.5),
      }),
    ).toBeNull();
    expect(f.bids![0].status).toBe("declined");
    expect(f.partners.length).toBe(2);
    // Near it: they name their price, and Alden is asked.
    expect(
      cmd(g, {
        k: "bid",
        act: "make",
        id: f.id,
        key: "buy",
        c: npc.c,
        price: Math.round(least * 0.85),
      }),
    ).toBeNull();
    const counter = f.bids!.find((x) => x.status === "open")!;
    expect(counter).toMatchObject({
      kind: "sell",
      by: npc.c,
      to: life.c,
      price: least,
    });
    const ev = life.events.find((e) => e.key === "p2p-bid")!;
    expect(ev).toBeTruthy();
    const purse = life.purse;
    const chest = f.chest;
    expect(cmd(g, { k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(counter.status).toBe("accepted");
    expect(f.status).toBe("dissolved");
    expect(life.purse).toBeCloseTo(purse - least + chest, 1);
    expect(
      life.property!.some(
        (p) => p.kind === "business" && p.job === "innkeeper",
      ),
    ).toBe(true);
  });

  test("your share sold to a computer partner at what they'd pay", () => {
    const { g, life, f } = inn(42);
    const npc = f.partners.find((p) => p.c !== life.c)!;
    const { most } = mostToBuy(g.s, f, g.s.chars[npc.c], life);
    expect(most).toBeGreaterThan(0);
    const purse = life.purse;
    expect(
      cmd(g, {
        k: "bid",
        act: "make",
        id: f.id,
        key: "sell",
        c: npc.c,
        price: most,
      }),
    ).toBeNull();
    expect(partnerIn(f, life.c)).toBeUndefined();
    expect(life.purse).toBeCloseTo(purse + most, 1);
  });

  test("between players: an offer, a counter, accepted; and a minority partner can't force it even with the clause", () => {
    const { g, life, f } = inn(43, 2);
    const bea = lifeOfSeat(g.s, "s2")!;
    // Bea takes the innkeeper's place in the firm (as an heir would).
    const other = f.partners.find((p) => p.c !== life.c)!;
    other.c = bea.c;
    life.purse = 1000;
    bea.purse = 50;
    const me = partnerIn(f, life.c)!;
    f.clause = true;
    expect(me.share).toBeLessThan(50);
    const fair = buyoutPrice(g.s, f, bea.c);
    expect(
      cmd(g, {
        k: "bid",
        act: "make",
        id: f.id,
        key: "buy",
        c: bea.c,
        price: fair,
      }),
    ).toBeNull();
    // Not forced: Bea is asked in a scene.
    expect(f.bids![0].status).toBe("open");
    const ev = bea.events.find((e) => e.key === "p2p-bid")!;
    expect(ev.title).toMatch(/offers to buy your share/);
    // She names her own price from the partnership's page.
    expect(
      cmd(
        g,
        {
          k: "bid",
          act: "counter",
          id: f.id,
          hire: f.bids![0].id,
          price: fair + 30,
        },
        "s2",
      ),
    ).toBeNull();
    expect(bea.events.some((e) => e.key === "p2p-bid")).toBe(false);
    const nb = f.bids!.find((x) => x.status === "open")!;
    expect(nb).toMatchObject({
      kind: "sell",
      by: bea.c,
      to: life.c,
      price: fair + 30,
    });
    const ev2 = life.events.find((e) => e.key === "p2p-bid")!;
    expect(cmd(g, { k: "event", id: ev2.id, choice: 0 })).toBeNull();
    expect(bea.purse).toBeCloseTo(50 + fair + 30, 1);
    expect(f.status).toBe("dissolved");
  });

  test("selling up needs every partner; a computer partner of a paying business refuses (and may offer to buy you out instead)", () => {
    const { g, life, f } = inn(44);
    life.purse = 900;
    f.books.push({ day: g.s.day, takings: 40, costs: 10, profit: 30 });
    expect(
      cmd(g, { k: "bid", act: "make", id: f.id, key: "sellall" }),
    ).toBeNull();
    const b = f.bids![0];
    expect(b.status).toBe("declined");
    expect(f.status).toBe("trading");
    const instead = f.bids!.find((x) => x.status === "open");
    if (instead) {
      expect(instead).toMatchObject({ kind: "buy", to: life.c });
      expect(life.events.some((e) => e.key === "p2p-bid")).toBe(true);
    }
    // A losing business: they're glad to sell.
    f.books = [{ day: g.s.day, takings: 5, costs: 20, profit: -15 }];
    for (const x of f.bids!)
      x.status = x.status === "open" ? "withdrawn" : x.status;
    life.events = life.events.filter((e) => e.key !== "p2p-bid");
    expect(
      cmd(g, { k: "bid", act: "make", id: f.id, key: "sellall" }),
    ).toBeNull();
    expect(f.status).toBe("dissolved");
  });
});
