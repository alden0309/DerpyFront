// WORK (r21): jobs worth playing, leaving them from anywhere, hiring into
// your businesses by role and pay (Hiring.ts, as a ship's company), no cap
// on businesses, a business's plan both ways (minded, or not), partnership
// buyouts and sales by offer, and a trading company whose cargoes move the
// markets as a person's buying does.

import { describe, expect, test, vi } from "vitest";
import { isMonthStart } from "../../src/conquest/engine/Calendar";
import {
  CO_MOVE,
  companyQuote,
  defaultPlan,
} from "../../src/conquest/engine/Company";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { autoAnswerLife } from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { marketTrade, netNow } from "../../src/conquest/engine/Markets";
import { NOTICE_DAYS, quitView } from "../../src/conquest/engine/Notice";
import { firmsWith } from "../../src/conquest/engine/PartnersCore";
import type { Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

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
