// Derpy Conquest, round 17 (ECON): two-way trade, loans on terms, and leave
// from work. A trading company can buy goods where its cargo is sold and
// bring them home, each leg priced from the markets at its two ends and
// rolled from the same table its odds are shown from, and its books still
// reconcile; a merchant sailor can take a venture home. Lending or borrowing
// makes a bond at the lawful rate of the place, with its interest in the
// month's figure, repaid early or called in at its day, put off, defaulted,
// forgiven, taken in kind or sued for; the computer's people repay by their
// means and their honesty, at the odds shown; a bond is sent only to its two
// parties. And you can ask for leave, and keep your place while you're away.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { isMonthStart } from "../../src/conquest/engine/Calendar";
import {
  backOdds,
  backPlan,
  companyOdds,
  planCheck,
  rollVoyage,
  voyageRisks,
} from "../../src/conquest/engine/Company";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeForOthers } from "../../src/conquest/engine/IntrigueCore";
import {
  askLeave,
  leaveOdds,
  officeLeaveDays,
  onLeave,
  OVERSTAY_SACK,
  OVERSTAY_WARN,
  tripLeave,
} from "../../src/conquest/engine/Leave";
import { affairsOf, ledgerForecast } from "../../src/conquest/engine/Ledger";
import { lifeOfChar } from "../../src/conquest/engine/LifeQueries";
import {
  lawfulRate,
  loansOf,
  loanStateForSeat,
  monthInterest,
  owedNow,
} from "../../src/conquest/engine/LoanCore";
import {
  callIn,
  makeLoan,
  repayOdds,
  willBorrow,
} from "../../src/conquest/engine/Loans";
import { priceView } from "../../src/conquest/engine/Markets";
import { firmsWith, partnerIn } from "../../src/conquest/engine/PartnersCore";
import { Rng } from "../../src/conquest/engine/Rng";
import { seaOf } from "../../src/conquest/engine/SeaCore";
import type {
  Character,
  CompanyPlan,
  GameDelta,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import { goVoyage } from "../../src/conquest/engine/Voyages";
import { startJob } from "../../src/conquest/engine/Work";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

// Many games and months in each: give them room on a busy machine.
vi.setConfig({ testTimeout: 240_000 });

const JT = prov("Jamestown");
const HAVANA = prov("Havana");

function game(
  seed = 7,
  o: { background?: string; purse?: number; start?: 1650 | 1700 } = {},
): { g: ConquestGame; life: Life } {
  const g = world({
    start: o.start ?? 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({
          home: JT,
          background: (o.background ?? "clerk") as never,
        }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  life.purse = o.purse ?? 900;
  return { g, life };
}

function month(g: ConquestGame): void {
  do g.tick();
  while (!g.s.over && !isMonthStart(g.s.day));
}

/** Answer whatever's waiting with its quiet course (or a chosen one). */
function answerAll(
  g: ConquestGame,
  life: Life,
  pick?: (key: string) => number | undefined,
): void {
  for (const ev of [...life.events]) {
    const choice = pick?.(ev.key);
    if (choice !== undefined)
      g.lifeCommand(life.seat, { k: "event", id: ev.id, choice });
  }
}

/** Someone of the town, grown and not played. */
function townsman(
  g: ConquestGame,
  life: Life,
  f: (c: Character) => boolean = () => true,
): Character {
  const c = (g.s.locals[life.prov] ?? [])
    .map((id) => g.s.chars[id])
    .find(
      (c) =>
        c?.alive &&
        !c.abroad &&
        !lifeOfChar(g.s, c.id) &&
        g.s.day - c.born > 20 * 365 &&
        f(c),
    );
  if (!c) throw new Error("nobody in town");
  return c;
}

// ---------------------------------------------------------------- two-way trade

describe("ECON r17: a trading company's return cargo", () => {
  const twoWay = (): CompanyPlan => ({
    item: "tobacco",
    from: JT,
    to: HAVANA,
    loads: 5,
    every: 2,
    back: "cochineal",
    backLoads: 5,
  });

  test("the plan names the goods each way; either may be nothing", () => {
    const { g } = game();
    expect(planCheck(g.s, g.w, twoWay()).ok).toBe(true);
    // Nothing home is the old one-way trade.
    expect(planCheck(g.s, g.w, { ...twoWay(), back: undefined }).ok).toBe(true);
    // Nothing out, cochineal home: the factor at Havana buys on the company's bills.
    const ballast = { ...twoWay(), loads: 0 };
    expect(planCheck(g.s, g.w, ballast).ok).toBe(true);
    expect(companyOdds(g.s, g.w, ballast).title).toMatch(/Nothing out/);
    // Nothing either way isn't a plan.
    expect(planCheck(g.s, g.w, { ...ballast, back: undefined }).ok).toBe(false);
    // Havana doesn't sell what it doesn't stock; London ships woollens out, and buys none.
    expect(planCheck(g.s, g.w, { ...twoWay(), back: "furs" }).ok).toBe(false);
    const london: CompanyPlan = {
      item: "tobacco",
      from: JT,
      to: -1,
      loads: 20,
      every: 3,
      back: "woollens",
      backLoads: 5,
    };
    expect(planCheck(g.s, g.w, london).ok).toBe(true);
    expect(planCheck(g.s, g.w, { ...london, back: "tobacco" }).ok).toBe(false);
    const bp = backPlan(london)!;
    expect(bp.from).toBe(-1);
    expect(bp.to).toBe(JT);
    expect(bp.round).toBe(true);
    // Each leg has its own odds, from the same table each is rolled from.
    const o = backOdds(g.s, g.w, twoWay())!;
    expect(o.title).toMatch(/Home: cochineal from Havana to Jamestown/);
    expect(o.outcomes.some((x) => x.label === "seized by the customs")).toBe(
      true,
    );
  });

  test("each leg's odds are the odds it's rolled by", () => {
    const { g } = game(5);
    for (const plan of [
      twoWay(),
      {
        item: "tobacco",
        from: JT,
        to: -1,
        loads: 20,
        every: 3,
        back: "woollens",
        backLoads: 5,
      } as CompanyPlan,
    ]) {
      const bp = backPlan(plan)!;
      const o = backOdds(g.s, g.w, plan)!;
      const k = voyageRisks(g.s, g.w, bp);
      const n = 20000;
      const counts: Record<string, number> = {};
      const rng = new Rng({ rng: 2468 });
      for (let i = 0; i < n; i++) {
        const end = rollVoyage(rng, k);
        counts[end] = (counts[end] ?? 0) + 1;
      }
      const label: Record<string, string> = {
        home: "sold at its price",
        spoiled: "spoiled in part",
        lost: "wrecked",
        taken: "taken by a privateer",
        seized: "seized by the customs",
      };
      for (const [end, name] of Object.entries(label)) {
        const shown = o.outcomes.find((x) => x.label === name)?.p ?? 0;
        expect(Math.abs((counts[end] ?? 0) / n - shown)).toBeLessThan(0.012);
      }
    }
  });

  test("its books reconcile, both legs are in the ledger, and its prices move at both ends", () => {
    const { g, life } = game(7);
    const p = twoWay();
    expect(
      g.lifeCommand("s1", { k: "business", act: "company", plan: p, cap: 300 }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c).find((x) => x.hold === "company")!;
    const me = partnerIn(f, life.c)!;
    let boughtAt: { before: number; after: number } | null = null;
    let soldAt: { before: number; after: number } | null = null;
    let sawHomeward = false;
    for (let d = 0; d < 14 * 31 && !g.s.over; d++) {
      const backs = f.co!.voyages.filter((v) => v.leg === "back").length;
      const havana = priceView(g.s, g.w, HAVANA, "cochineal").price;
      const home = priceView(g.s, g.w, JT, "cochineal").price;
      const arrivedBefore = f.co!.legs?.back.sale ?? 0;
      g.tick();
      const now = f.co!.voyages.filter((v) => v.leg === "back").length;
      if (!boughtAt && now > backs)
        boughtAt = {
          before: havana,
          after: priceView(g.s, g.w, HAVANA, "cochineal").price,
        };
      if (!soldAt && (f.co!.legs?.back.sale ?? 0) > arrivedBefore)
        soldAt = {
          before: home,
          after: priceView(g.s, g.w, JT, "cochineal").price,
        };
      if (affairsOf(g.s, g.w, life).some((a) => a.status === "homeward"))
        sawHomeward = true;
    }
    // The books are reckoned at the month's turn.
    month(g);
    const legs = f.co!.legs!;
    expect(legs.out.n).toBeGreaterThan(2);
    expect(legs.back.n).toBeGreaterThan(1);
    expect(legs.back.sale).toBeGreaterThan(0);
    // Buying at Havana dears the price there; selling at home cheapens it.
    expect(boughtAt!.after).toBeGreaterThan(boughtAt!.before);
    expect(soldAt!.after).toBeLessThan(soldAt!.before);
    // The books: the chest, what's been divided and what's at sea (both legs).
    const booked = f.books.reduce((m, b) => m + b.profit, 0);
    const atSea = f.co!.voyages.reduce((m, v) => m + v.cost, 0);
    expect(f.chest + me.drawn + atSea).toBeCloseTo(me.capital + booked, 0);
    // The legs add up to what was booked as sold.
    const takings = f.books.reduce((m, b) => m + b.takings, 0);
    expect(legs.out.sale + legs.back.sale).toBeCloseTo(takings, 0);
    // Each leg in your own news and the tracker.
    expect(
      life.journal.some((j) => j.aff === "firm" && /homeward: /.test(j.text)),
    ).toBe(true);
    expect(
      life.journal.some((j) => j.aff === "firm" && /outward: /.test(j.text)),
    ).toBe(true);
    expect(sawHomeward).toBe(true);
  });

  test("with nothing outward, only the return cargo sails", () => {
    const { g, life } = game(11);
    const p = { ...twoWay(), loads: 0 };
    expect(
      g.lifeCommand("s1", { k: "business", act: "company", plan: p, cap: 300 }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c).find((x) => x.hold === "company")!;
    for (let m = 0; m < 8; m++) month(g);
    expect(f.co!.legs!.out.n).toBe(0);
    expect(f.co!.legs!.back.n).toBeGreaterThan(0);
  });

  test("a merchant sailor may take a venture home from the far port, at its odds", () => {
    const { g, life } = game(7, { background: "sailor", purse: 200 });
    life.prov = JT;
    startJob(g, life, "sailor", "docks", 3);
    expect(goVoyage(g, life, "merchant", HAVANA, false)).toBeNull();
    const v = seaOf(g.s).voyages.find((x) => x.seat === life.seat)!;
    for (let d = 0; d < 90 && v.phase === "out"; d++) g.tick();
    expect(v.phase).toBe("there");
    const ev = life.events.find((e) => e.key === "econ-venture");
    expect(ev).toBeDefined();
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev!.id, choice: 0 }),
    ).toBeNull();
    expect(v.back).toBeDefined();
    expect(life.purse).toBeLessThan(purse);
    for (let d = 0; d < 120 && v.phase !== "done"; d++) {
      g.tick();
      answerAll(g, life, () => 0);
    }
    expect(v.phase).toBe("done");
    expect(v.end).toMatch(/venture for home/);
  });
});

// ---------------------------------------------------------------- bonds

describe("ECON r17: bonds", () => {
  test("the lawful rate follows the colony's law and the year", () => {
    const { g } = game();
    const at = (name: string, year: number) =>
      lawfulRate(g.s, map, prov(name), (year - 1607) * 365 + 100).rate;
    expect(at("Jamestown", 1650)).toBe(0.08);
    expect(at("Jamestown", 1700)).toBe(0.06);
    expect(at("Jamestown", 1750)).toBe(0.05);
    expect(at("Massachusetts Bay", 1680)).toBe(0.08);
    expect(at("Massachusetts Bay", 1700)).toBe(0.06);
    expect(at("Quebec", 1700)).toBe(0.05);
    expect(at("Havana", 1700)).toBe(0.05);
    expect(lawfulRate(g.s, map, JT).law).toMatch(/1660/);
  });

  test("lending to one of the computer's people: the interest a month in the figure and the books, a reminder, its day", () => {
    const { g, life } = game(7);
    // Someone who'd take it (the window says why, and the same reckoning decides).
    const c = townsman(
      g,
      life,
      (x) => willBorrow(g.s, life, x, 40, 12, false, 0.06).total > 0,
    );
    const b = willBorrow(g.s, life, c, 40, 12, false, 0.06);
    expect(b.parts.length).toBeGreaterThan(0);
    const purse = life.purse;
    const err = g.lifeCommand("s1", {
      k: "econ",
      act: "lend",
      c: c.id,
      sum: 40,
      months: 12,
    });
    expect(err).toBeNull();
    const l = loansOf(g.s).find(
      (x) => x.lender === life.c && x.borrower === c.id,
    )!;
    expect(l).toBeDefined();
    expect(life.purse).toBe(purse - 40);
    expect(l.rate).toBe(0.06);
    expect(monthInterest(l)).toBe(0.2);
    // The month's figure has the interest; the month's turn pays it, in the books.
    const fc = ledgerForecast(g.s, g.w, life);
    expect(
      fc.lines.some((x) => x.key === `loan:${l.id}` && x.value === 0.2),
    ).toBe(true);
    month(g);
    month(g);
    const st = life.statements![life.statements!.length - 1];
    expect(st.lines.find((x) => x.k === `loan:${l.id}`)?.v).toBeCloseTo(0.2, 2);
    expect(affairsOf(g.s, g.w, life).some((a) => a.kind === "loan")).toBe(true);
    // The month before its day, you're told; on its day it falls due (or they come to pay).
    while (g.s.day < l.due - 29) g.tick();
    expect(life.journal.some((j) => /falls due on/.test(j.text) && j.sec)).toBe(
      true,
    );
    while (g.s.day <= l.due) g.tick();
    expect(["due", "closed"]).toContain(l.status);
    if (l.status === "due")
      expect(life.events.some((e) => e.key === "loan-falls")).toBe(true);
  });

  test("called in, the computer's people pay, ask for time or can't, at the odds shown", () => {
    const { g, life } = game(9);
    const c = townsman(g, life);
    const counts = { pay: 0, time: 0, cannot: 0 };
    let shown: ReturnType<typeof repayOdds> | null = null;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const l = makeLoan(g, {
        lender: life.c,
        borrower: c.id,
        sum: 20,
        months: 12,
        rate: 0.06,
        how: "bond",
        due: g.s.day,
      });
      l.status = "due";
      shown = repayOdds(g.s, l);
      callIn(g, life, l);
      const st = l.status as string;
      if (st === "closed") counts.pay++;
      else if ((l.ask ?? 0) > 0) counts.time++;
      else if (st === "default") counts.cannot++;
      if (i % 50 === 49) g.tick();
      life.events = [];
      life.purse = 900;
    }
    expect(Math.abs(counts.pay / n - shown!.pay)).toBeLessThan(0.06);
    expect(Math.abs(counts.time / n - shown!.time)).toBeLessThan(0.06);
    expect(Math.abs(counts.cannot / n - shown!.cannot)).toBeLessThan(0.06);
    expect(shown!.pay + shown!.time + shown!.cannot).toBeCloseTo(1, 1);
    // The reasons are given.
    expect(shown!.why.parts.length).toBeGreaterThan(0);
  });

  test("a player borrower repays early, in part and in whole, and the lender thinks the better of it", () => {
    const { g, life } = game(7);
    const c = townsman(
      g,
      life,
      (x) => x.role === "merchant" || x.role === "planter",
    );
    const l = makeLoan(g, {
      lender: c.id,
      borrower: life.c,
      sum: 20,
      months: 12,
      rate: 0.06,
      how: "bond",
    });
    expect(
      g.lifeCommand("s1", { k: "econ", act: "repay", id: l.id, sum: 5 }),
    ).toBeNull();
    expect(l.owed).toBe(15);
    expect(l.status).toBe("running");
    expect(
      g.lifeCommand("s1", { k: "econ", act: "repay", id: l.id }),
    ).toBeNull();
    expect(l.status).toBe("closed");
    expect(l.end).toBe("paid");
    expect(
      c.memories.some(
        (m) => m.of === life.c && /Paid me back early/.test(m.why),
      ),
    ).toBe(true);
  });

  test("a player borrower is reminded, called in, can't pay, and is sued at the court-house", () => {
    const { g, life } = game(7);
    const c = townsman(
      g,
      life,
      (x) => x.role === "merchant" || x.role === "planter",
    );
    c.memories.push({
      of: life.c,
      why: "Never liked them",
      value: -60,
      until: 0,
    });
    const l = makeLoan(g, {
      lender: c.id,
      borrower: life.c,
      sum: 40,
      months: 6,
      rate: 0.06,
      how: "bond",
    });
    while (g.s.day < l.due - 29) g.tick();
    const due = life.events.find((e) => e.key === "loan-due");
    expect(due).toBeDefined();
    expect(
      g.lifeCommand("s1", { k: "event", id: due!.id, choice: 2 }),
    ).toBeNull();
    while (g.s.day <= l.due) g.tick();
    // He doesn't think well enough of you to let it run on: he calls it in.
    expect(l.status).toBe("called");
    const called = life.events.find((e) => e.key === "loan-called");
    expect(called).toBeDefined();
    life.purse = 0;
    for (const k of Object.keys(life.goods))
      delete (life.goods as Record<string, number>)[k];
    expect(
      g.lifeCommand("s1", { k: "event", id: called!.id, choice: 1 }),
    ).toBeNull();
    // Nothing to take in kind, and a court here: he sues.
    expect(l.status).toBe("court");
    const t = g.s.power!.trials.find((x) => x.id === l.trial)!;
    expect(t.kind).toBe("debt");
    expect(t.sum).toBeCloseTo(owedNow(l), 1);
    for (let d = 0; d < 120 && l.status === "court"; d++) {
      g.tick();
      for (const ev of [...life.events])
        g.lifeCommand("s1", {
          k: "event",
          id: ev.id,
          choice: ev.key === "trial-plea" ? 0 : 0,
        });
    }
    expect(l.status).not.toBe("court");
    expect(l.log.some((x) => /court|Judgment/.test(x.text))).toBe(true);
  });

  test("a player lender forgives, or takes it in kind, with the reasons remembered", () => {
    const { g, life } = game(7);
    const a = townsman(g, life);
    const b = townsman(g, life, (x) => x.id !== a.id);
    const l1 = makeLoan(g, {
      lender: life.c,
      borrower: a.id,
      sum: 20,
      months: 12,
      rate: 0.06,
      how: "bond",
    });
    l1.status = "default";
    expect(
      g.lifeCommand("s1", { k: "econ", act: "forgive", id: l1.id }),
    ).toBeNull();
    expect(l1.end).toBe("forgiven");
    expect(
      a.memories.some(
        (m) => m.of === life.c && m.why === "Forgave my debt" && m.value > 0,
      ),
    ).toBe(true);
    const l2 = makeLoan(g, {
      lender: life.c,
      borrower: b.id,
      sum: 20,
      months: 12,
      rate: 0.06,
      how: "bond",
    });
    l2.status = "default";
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "econ", act: "kind", id: l2.id }),
    ).toBeNull();
    expect(l2.status).toBe("closed");
    expect(life.purse).toBeGreaterThan(purse);
    expect(life.purse - purse).toBeLessThan(20);
  });

  test("the old ways of lending and borrowing make bonds, and an old save's debts become bonds", () => {
    const { g, life } = game(7);
    const c = townsman(
      g,
      life,
      (x) => x.role === "merchant" || x.role === "planter",
    );
    c.memories.push({ of: life.c, why: "Old friends", value: 80, until: 0 });
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "person", c: c.id, act: "borrow" }),
    ).toBeNull();
    const l = loansOf(g.s).find(
      (x) => x.lender === c.id && x.borrower === life.c,
    );
    expect(l).toBeDefined();
    expect(life.purse).toBeGreaterThan(purse);
    expect(l!.rate).toBe(0.06);
    expect(life.debts.length).toBe(0);
    // An old save, with a debt of the old kind.
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete saved.loans;
    const sl = saved.lives.find((x) => x.seat === "s1")!;
    sl.debts = [{ to: c.id, amount: 24, due: saved.day + 100 }];
    const g2 = new ConquestGame(map, saved);
    g2.aiEnabled = false;
    g2.tick();
    const l2 = loansOf(g2.s).find((x) => x.how === "old");
    expect(l2?.owed).toBe(24);
    expect(lifeOf(g2).debts.length).toBe(0);
    // Saves, loads and the delta carry the bonds.
    const client = JSON.parse(JSON.stringify(g2.s)) as GameState;
    g2.takeDelta();
    expect(
      g2.lifeCommand("s1", { k: "econ", act: "repay", id: l2!.id, sum: 4 }),
    ).toBeNull();
    applyDelta(client, g2.takeDelta());
    expect(client.loans).toEqual(g2.s.loans);
    const g3 = new ConquestGame(map, JSON.parse(JSON.stringify(g2.s)));
    expect(loansOf(g3.s).find((x) => x.id === l2!.id)?.owed).toBe(20);
  });
});

// ---------------------------------------------------------------- leave

describe("ECON r17: leave from work", () => {
  function clerk(seed = 7) {
    const { g, life } = game(seed, { background: "clerk" });
    const boss = life.job ? g.s.chars[life.job.employer] : undefined;
    return { g, life, boss };
  }

  test("your master gives leave, or refuses it, at the odds shown", () => {
    const { g, life, boss } = clerk(7);
    expect(life.job).toBeTruthy();
    expect(boss).toBeDefined();
    const o = leaveOdds(g.s, life, 30, "job");
    expect(o.by?.id).toBe(boss!.id);
    expect(o.why.parts.length).toBeGreaterThan(1);
    let yes = 0;
    let expected = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      life.leave = undefined;
      // The odds as they stand today (what your master thinks of you moves).
      expected += leaveOdds(g.s, life, 30, "job").p;
      askLeave(g, life, 30, "job");
      if (onLeave(g.s, life, "job")) yes++;
      g.tick();
    }
    expect(Math.abs(yes - expected) / n).toBeLessThan(0.08);
    // Refused, you can't ask again at once.
    life.leave = { list: [], refused: { job: g.s.day + 10 } };
    expect(g.lifeCommand("s1", { k: "econ", act: "leave", days: 30 })).toMatch(
      /Refused lately/,
    );
  });

  test("on leave you aren't counted away; overstay it and a letter comes, then the sack", () => {
    const { g, life, boss } = clerk(7);
    const job = life.job!;
    life.leave = {
      list: [{ of: "job", from: g.s.day, until: g.s.day + 29, by: boss!.id }],
    };
    // Gone to Boston for a while.
    life.prov = prov("Massachusetts Bay");
    for (let d = 0; d < 29; d++) g.tick();
    expect(life.job).toBe(job);
    expect(job.awayDays ?? 0).toBe(0);
    for (let d = 0; d < OVERSTAY_WARN; d++) g.tick();
    expect(job.awayDays).toBe(OVERSTAY_WARN);
    expect(life.events.some((e) => e.key === "leave-over")).toBe(true);
    for (let d = OVERSTAY_WARN; d < OVERSTAY_SACK; d++) g.tick();
    expect(life.job).toBeNull();
    expect(life.journal.some((j) => /overstayed your leave/.test(j.text))).toBe(
      true,
    );
  });

  test("without leave, the same journey costs your place", () => {
    const { g, life } = clerk(7);
    life.prov = prov("Massachusetts Bay");
    for (let d = 0; d < 45; d++) g.tick();
    expect(life.job).toBeNull();
  });

  test("setting off on a long journey offers leave first, with the master's likely answer", () => {
    const { g, life } = clerk(7);
    const t = tripLeave(g.s, g.w, life, prov("Massachusetts Bay"), 19);
    expect(t?.kind).toBe("job");
    expect(t!.days).toBeGreaterThanOrEqual(41);
    expect(t!.odds!.p).toBeGreaterThan(0);
    // A short hop needs none.
    expect(tripLeave(g.s, g.w, life, prov("Pamunkey"), 3)).toBeNull();
  });

  test("leave from a county office keeps its duty from counting as neglected", () => {
    const { g, life } = clerk(7);
    const o = {
      id: 1,
      key: "churchwarden",
      prov: JT,
      nation: 0,
      holder: life.c,
      since: 0,
      election: -1,
      candidates: [],
      duty: g.s.day - 10,
    } as never;
    life.leave = {
      list: [{ of: 1, from: g.s.day - 5, until: g.s.day + 30, by: -1 }],
    };
    expect(officeLeaveDays(g.s, life, o)).toBe(6);
  });
});

// ---------------------------------------------------------------- in company

describe("ECON r17: a bond is its two parties' business", () => {
  test("a loan offered between players is answered by the borrower; nobody else is sent it", () => {
    const g = world({
      start: 1700,
      seed: 7,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: JT, background: "clerk" }),
        },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({
            home: JT,
            first: "Beatrice",
            family: "Cole",
            female: true,
            background: "clerk",
          }),
        },
        {
          seat: "s3",
          name: "Cato",
          plan: plan({
            home: JT,
            first: "Cato",
            family: "Hale",
            background: "clerk",
          }),
        },
      ],
    });
    g.aiEnabled = false;
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    a.purse = 100;
    b.purse = 5;
    expect(
      g.lifeCommand("s1", {
        k: "econ",
        act: "lend",
        c: b.c,
        sum: 20,
        months: 12,
      }),
    ).toBeNull();
    const l = loansOf(g.s)[0];
    expect(l.status).toBe("offered");
    expect(a.purse).toBe(100);
    const ev = b.events.find((e) => e.key === "loan-offer")!;
    expect(ev).toBeDefined();
    expect(
      g.lifeCommand("s2", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(l.status).toBe("running");
    expect(a.purse).toBe(80);
    expect(b.purse).toBe(25);
    // Each party sees it; the third, nothing (the bond, its scenes, its lines).
    expect(loanStateForSeat(g.s, "s1").loans!.list.length).toBe(1);
    expect(loanStateForSeat(g.s, "s2").loans!.list.length).toBe(1);
    expect(loanStateForSeat(g.s, "s3").loans!.list.length).toBe(0);
    const seenB = lifeForOthers(b);
    expect(seenB.journal.some((j) => /lends you/.test(j.text))).toBe(false);
    b.events.push({ ...ev, id: 999, key: "loan-called" });
    expect(lifeForOthers(b).events.some((e) => e.key.startsWith("loan-"))).toBe(
      false,
    );
    b.events.pop();
    // Interest at the month's turn goes from one purse to the other, in each one's books.
    month(g);
    month(g);
    const line = (x: Life) =>
      x.statements![x.statements!.length - 1].lines.find(
        (y) => y.k === `loan:${l.id}`,
      )?.v;
    expect(line(a)).toBeCloseTo(0.1, 2);
    expect(line(b)).toBeCloseTo(-0.1, 2);
    expect(l.paid).toBeCloseTo(0.2, 2);
    // And nobody else is sent those lines of their books.
    expect(JSON.stringify(lifeForOthers(a).statements)).not.toMatch(/loan:/);
  });
});

const settle = () => new Promise((r) => setTimeout(r, 60));
let tick: () => void = () => {};

class Client {
  readonly messages: ServerMessage[] = [];
  readonly raw: string[] = [];
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
      const text = String(data);
      this.raw.push(text);
      const m = JSON.parse(text) as ServerMessage;
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
  private id = 100;
  async cmd(c: object): Promise<string | null> {
    const id = this.id++;
    tick();
    const ack = this.next("ack", (m) => m.id === id);
    this.send({ t: "cmd", id, c });
    return (await ack).err;
  }
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

describe("ECON r17: through the rooms server, a bond is sent only to its parties", () => {
  let server: http.Server;
  let url = "";
  let clock = 1_800_000_000_000;
  let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    rooms = new ConquestRooms(() => clock);
    tick = () => (clock += 60);
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

  test("Alden lends Beatrice money on bond; Cato is sent none of it", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal", start: 1700 },
    });
    const l = await lobby;
    const bea = await client("Bea");
    const cato = await client("Cato");
    const joined = host.next("lobby", (m) => m.seats.length === 3);
    bea.send({ t: "join", code: l.code });
    cato.send({ t: "join", code: l.code });
    await joined;
    host.send({ t: "plan", plan: plan({ home: JT, background: "clerk" }) });
    bea.send({
      t: "plan",
      plan: plan({
        home: JT,
        first: "Beatrice",
        family: "Cole",
        female: true,
        background: "clerk",
      }),
    });
    cato.send({
      t: "plan",
      plan: plan({
        home: JT,
        first: "Cato",
        family: "Hale",
        background: "clerk",
      }),
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    bea.send({ t: "ready", ready: true });
    cato.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.filter((s) => s.ready).length >= 2);
    const games = [host.next("game"), bea.next("game"), cato.next("game")];
    host.send({ t: "start" });
    const [hg, bg, cg] = await Promise.all(games);
    const paused = host.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    await paused;
    const game = rooms.rooms.get(l.code)!.game!;
    const A = game.s.lives.find((x) => x.seat === hg.you)!;
    const B = game.s.lives.find((x) => x.seat === bg.you)!;
    A.purse = 300;
    B.purse = 10;
    expect(
      await host.cmd({ k: "econ", act: "lend", c: B.c, sum: 40, months: 24 }),
    ).toBeNull();
    await settle();
    const ev = B.events.find((e) => e.key === "loan-offer")!;
    expect(ev).toBeDefined();
    expect(await bea.cmd({ k: "event", id: ev.id, choice: 0 })).toBeNull();
    for (let d = 0; d < 40; d++) game.tick();
    await cato.cmd({ k: "will", share: true });
    await bea.cmd({ k: "will", share: true });
    await host.cmd({ k: "will", share: true });
    await settle();
    const catoSaw = cato.raw.join("\n");
    expect(catoSaw).not.toMatch(/loan-offer|lends you|Money lent on bond/);
    expect(cato.state().loans?.list.length ?? 0).toBe(0);
    expect(bea.state().loans?.list.length).toBe(1);
    expect(host.state().loans?.list.length).toBe(1);
    expect(bea.state().loans!.list[0].sum).toBe(40);
    void cg;
  });
});

// ---------------------------------------------------------------- more of a bond's life, and half pay

describe("ECON r17: a computer lender who thinks well of you, and an officer's half pay", () => {
  test("a lender who thinks well of you lets the bond run on at its day", () => {
    const { g, life } = game(7);
    const c = townsman(
      g,
      life,
      (x) => x.role === "merchant" || x.role === "planter",
    );
    c.memories.push({ of: life.c, why: "Old friends", value: 90, until: 0 });
    const l = makeLoan(g, {
      lender: c.id,
      borrower: life.c,
      sum: 20,
      months: 6,
      rate: 0.06,
      how: "bond",
    });
    const due = l.due;
    // Interest kept up, and the day comes.
    while (g.s.day <= due) g.tick();
    expect(l.status).toBe("running");
    expect(l.due).toBeGreaterThan(due + 150);
    expect(life.journal.some((j) => /let your bond run on/.test(j.text))).toBe(
      true,
    );
  });

  test("an officer on leave is on half pay, in the month's figure and at its turn", () => {
    const { g, life } = game(7, { background: "soldier" });
    month(g);
    startJob(g, life, "soldier", "fort", 3);
    life.job!.employer = -1;
    life.leave = {
      list: [
        {
          of: "job",
          from: g.s.day,
          until: g.s.day + 59,
          by: -1,
          half: true,
        },
      ],
    };
    life.prov = prov("Massachusetts Bay");
    for (let d = 0; d < 10; d++) g.tick();
    const fc = ledgerForecast(g.s, g.w, life);
    // A lieutenant's 8 a month, halved, for the month's days on leave (28 to 30).
    const line = fc.lines.find((x) => x.key === "leave:half");
    expect(line!.value).toBeGreaterThan(3.7);
    expect(line!.value).toBeLessThanOrEqual(4);
    month(g);
    const st = life.statements![life.statements!.length - 1];
    expect(st.lines.find((x) => x.k === "leave:half")?.v).toBeCloseTo(
      line!.value,
      2,
    );
    expect(life.job).toBeTruthy();
  });
});
