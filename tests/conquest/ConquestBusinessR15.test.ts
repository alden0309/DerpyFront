// Derpy Conquest, round 15 (BUSINESS): a business that pays when it's run
// sensibly and says plainly why when it doesn't; partnerships made easy with
// presets; a trading company for particular goods. A modest business set up
// by someone who knows the trade and minds it makes money within its first
// months, as its plan said it would; a badly chosen one loses, and the game
// names why; the presets fill in fair splits; a silent share in a sound
// business is worth having; a company's books reconcile, its trade moves the
// markets' prices, and the odds it shows are the odds its voyages are rolled
// by.

import { describe, expect, test, vi } from "vitest";
import {
  presetsFor,
  presetTerms,
  termsSummary,
  type PresetKey,
} from "../../src/conquest/engine/BizPresets";
import {
  bizAdvice,
  bizPlan,
  handCount,
  propertyView,
  startInput,
  startView,
} from "../../src/conquest/engine/Business";
import { isMonthStart } from "../../src/conquest/engine/Calendar";
import {
  CO_LOADS,
  companyOdds,
  companyQuote,
  defaultPlan,
  rollVoyage,
  steadyGain,
  voyageDice,
  voyageRisks,
} from "../../src/conquest/engine/Company";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { firmAdvice, firmHowItPays } from "../../src/conquest/engine/Firms";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { affairsOf } from "../../src/conquest/engine/Ledger";
import { peopleHere } from "../../src/conquest/engine/LifeQueries";
import { JOBS, VENTURE_LUCK } from "../../src/conquest/engine/LifeRules";
import { priceView } from "../../src/conquest/engine/Markets";
import {
  articlesAcceptance,
  fairShares,
  likelyPartners,
  termsCheck,
} from "../../src/conquest/engine/Partners";
import { firmsWith, partnerIn } from "../../src/conquest/engine/PartnersCore";
import { openBusiness } from "../../src/conquest/engine/Property";
import { Rng } from "../../src/conquest/engine/Rng";
import type {
  CompanyPlan,
  GameState,
  JobKind,
  Life,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

// Many games and months in each: give them room on a busy machine.
vi.setConfig({ testTimeout: 240_000 });

const JT = prov("Jamestown");

function game(
  seed: number,
  o: { background?: string; home?: number; purse?: number } = {},
): { g: ConquestGame; life: Life } {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({
          home: o.home ?? JT,
          background: (o.background ?? "gentry") as never,
        }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  life.purse = o.purse ?? 400;
  return { g, life };
}

/** Run to the next month's turn. */
function month(g: ConquestGame): void {
  do g.tick();
  while (!g.s.over && !isMonthStart(g.s.day));
}

/** The month's statement line of a property (all its money at the turn). */
function propertyLine(life: Life, id: number): number {
  const st = life.statements?.[life.statements.length - 1];
  if (!st) return 0;
  return (
    Math.round(
      st.lines.filter((l) => l.k === `p:${id}`).reduce((m, l) => m + l.v, 0) *
        100,
    ) / 100
  );
}

/** Someone who knows the trade, with no other work, setting up alone here. */
function sensible(seed: number, job: JobKind, level = 1) {
  const { g, life } = game(seed);
  life.skills[JOBS[job].main] = 7;
  life.job = null;
  const err = g.lifeCommand("s1", { k: "business", act: "found", job, level });
  expect(err).toBeNull();
  const pr = life.property!.find((x) => x.kind === "business")!;
  return { g, life, pr };
}

const mean = (a: number[]) => a.reduce((m, v) => m + v, 0) / a.length;
const SEEDS = [3, 11, 19, 27, 35, 43];

describe("the sensible start pays", () => {
  test("a modest business, minded by someone who knows the trade, makes money within its first months", () => {
    for (const job of ["shopkeeper", "innkeeper", "craftsman"] as JobKind[]) {
      const runs = SEEDS.map((seed) => {
        const { g, life, pr } = sensible(seed, job);
        const out: number[] = [];
        for (let m = 0; m < 6; m++) {
          month(g);
          out.push(propertyLine(life, pr.id));
        }
        return out;
      });
      // On average every one of its first six months makes money...
      for (let m = 0; m < 6; m++)
        expect(mean(runs.map((r) => r[m]))).toBeGreaterThan(0);
      // ...and from its third month in every run.
      for (const r of runs) expect(r[2]).toBeGreaterThan(0);
    }
  });

  test("its months go as its plan said, and it pays back what it cost", () => {
    const { g, life } = game(5);
    life.skills.trade = 7;
    life.job = null;
    const v = startView(g.s, g.w, life, "shopkeeper", 1);
    // The plan made before (no business yet): it pays from its first months.
    expect(v.plan.paysFrom).toBeGreaterThan(0);
    expect(v.plan.paysFrom).toBeLessThanOrEqual(2);
    expect(v.plan.breakEven).toBeGreaterThan(0);
    expect(v.plan.breakEven).toBeLessThanOrEqual(18);
    expect(v.advice.some((a) => a.tone === "bad")).toBe(false);
    const plan = bizPlan(
      g.s,
      startInput(g.s, g.w, life, "shopkeeper", 1),
      v.cost,
    );
    expect(
      g.lifeCommand("s1", {
        k: "business",
        act: "found",
        job: "shopkeeper",
        level: 1,
      }),
    ).toBeNull();
    const pr = life.property!.find((x) => x.kind === "business")!;
    const acct: number[] = [];
    for (let m = 0; m < 4; m++) {
      month(g);
      acct.push(pr.biz!.acct![pr.biz!.acct!.length - 1].profit);
    }
    // Nothing in a business runs on dice: what was planned is what came.
    for (let m = 0; m < 4; m++)
      expect(Math.abs(acct[m] - plan.months[m].profit)).toBeLessThan(0.5);
    expect(handCount(pr)).toBeGreaterThan(0);
  });

  test("a business bought with your trade's rung opens with the hands that pay, not with none", () => {
    const { g, life } = game(7, { background: "clerk" });
    life.skills.trade = 7;
    const job = life.job!;
    job.kind = "shopkeeper";
    job.own = true;
    job.place = JOBS.shopkeeper.places[0];
    job.rank = JOBS.shopkeeper.ranks.findIndex((r) => r.buy);
    life.area = job.place;
    life.travel = null;
    life.prov = job.prov;
    // It used to open with no hands at all, and only cost its keep.
    const pr = openBusiness(g, life, job);
    expect(handCount(pr)).toBeGreaterThan(0);
    const v = propertyView(g.s, life, pr);
    expect(v.input.minded).toBe(true);
    expect(v.profit).toBeGreaterThan(0);
  });
});

describe("the badly chosen start loses, and says why", () => {
  test("nobody minding it: the advice says so, plainly, and a warning comes before the losses pile up", () => {
    const { g, life } = game(9, { background: "clerk" });
    expect(life.job).toBeTruthy();
    expect(
      g.lifeCommand("s1", {
        k: "business",
        act: "found",
        job: "shopkeeper",
        level: 1,
      }),
    ).toBeNull();
    const pr = life.property!.find((x) => x.kind === "business")!;
    const v = propertyView(g.s, life, pr);
    expect(v.profit).toBeLessThan(0);
    const advice = bizAdvice(g.s, v, { owner: true });
    expect(advice[0].tone).toBe("bad");
    expect(advice[0].key).toBe("away");
    expect(advice[0].text).toMatch(/Losing money: nobody minds it/);
    expect(advice[0].text).toMatch(/0\.6/);
    for (let m = 0; m < 3; m++) month(g);
    expect(pr.biz!.acct!.every((a) => a.profit < 0)).toBe(true);
    const warn = life.journal.find((j) =>
      /lost money two months running/.test(j.text),
    );
    expect(warn?.text).toMatch(/nobody minds it/);
    expect(warn?.aff).toBe("property");
    // The start window said so before a coin was spent.
    const { g: g2, life: l2 } = game(9, { background: "clerk" });
    const sv = startView(g2.s, g2.w, l2, "shopkeeper", 1);
    expect(sv.input.minded).toBe(false);
    expect(sv.advice[0].key).toBe("away");
    expect(sv.plan.paysFrom).toBe(0);
  });

  test("not your trade, or too big for the town: it loses, and the advice names it", () => {
    // Not the trade: a gentleman with no head for it.
    const { g, life } = game(13);
    life.skills.trade = 1;
    life.job = null;
    const sv = startView(g.s, g.w, life, "shopkeeper", 2);
    expect(sv.plan.going.profit).toBeLessThan(0);
    expect(sv.advice.some((a) => a.key === "skill" && a.tone === "bad")).toBe(
      true,
    );
    // Too big: a great joiner's shop in a small town, by someone who knows the trade.
    const small = prov("Plymouth");
    const { g: g2, life: l2 } = game(13, { home: small });
    l2.skills.craft = 10;
    l2.job = null;
    const big = startView(g2.s, g2.w, l2, "carpenter", 3);
    expect(big.plan.going.profit).toBeLessThan(
      startView(g2.s, g2.w, l2, "carpenter", 1).plan.going.profit,
    );
    expect(
      big.advice.some(
        (a) => (a.key === "toobig" || a.key === "idle") && a.tone !== "good",
      ),
    ).toBe(true);
  });
});

describe("partnerships made easy", () => {
  test("each preset fills in a fair split, who runs it, and says it in plain words", () => {
    const { g, life } = game(5, { purse: 300 });
    const seen = new Set<PresetKey>();
    for (const c of likelyPartners(g.s, life)) {
      for (const p of presetsFor(g.s, g.w, life, c)) {
        const t = presetTerms(g.s, g.w, life, c, p.key);
        if (p.why) continue;
        expect(t).toBeTruthy();
        seen.add(p.key);
        const fair = fairShares(g.s, t!)[0];
        expect(t!.sides[0].share + t!.sides[1].share).toBe(100);
        expect(t!.sides[0].share).toBe(
          Math.max(5, Math.min(95, Math.floor(fair / 5) * 5)),
        );
        if (p.key === "silent") {
          expect(t!.sides[0].role).toBe("silent");
          expect(t!.holder).toBe(c.id);
        }
        const words = termsSummary(g.s, g.w, life, t!);
        expect(words).toMatch(
          new RegExp(`^You put in .*You get ${t!.sides[0].share} in a hundred`),
        );
        expect(words).toMatch(
          t!.sides[0].role === "managing"
            ? /you (run it|choose its cargoes)/
            : new RegExp(`${c.first} (runs it|chooses its cargoes)`),
        );
        expect(termsCheck(g.s, g.w, life, t!, false).ok).toBe(true);
      }
    }
    expect(seen.has("silent")).toBe(true);
    expect(seen.has("found")).toBe(true);
    expect(seen.has("cargo")).toBe(true);
  });

  test("a silent share in a sound business is worth having, on average", () => {
    const back: number[] = [];
    const put: number[] = [];
    for (const seed of SEEDS) {
      const { g, life } = game(seed, { background: "clerk", purse: 300 });
      const c = peopleHere(g.s, life.prov, life).find(
        (x) => x.role === "innkeeper",
      );
      if (!c) continue;
      g.char(c.id).memories.push({
        of: life.c,
        why: "Test",
        value: 40,
        until: 0,
      });
      const t = presetTerms(g.s, g.w, life, c, "silent")!;
      // A fair silent share is one they'd sign.
      expect(
        articlesAcceptance(g.s, t, c, life, undefined, g.w).total,
      ).toBeGreaterThan(0);
      expect(
        g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
      ).toBeNull();
      const f = firmsWith(g.s, life.c)[0];
      if (!f) continue;
      const me = partnerIn(f, life.c)!;
      for (let m = 0; m < 30; m++) month(g);
      back.push(me.drawn);
      put.push(me.capital);
    }
    expect(back.length).toBeGreaterThanOrEqual(4);
    // In two and a half years it has paid back most of what was put in, and
    // the share is still yours.
    expect(mean(back)).toBeGreaterThan(mean(put) * 0.6);
  });

  test("a firm says how it makes its money, and why it's losing when it is", () => {
    const { g, life } = game(9, { background: "clerk", purse: 300 });
    const c = likelyPartners(g.s, life).find((x) => x.role === "merchant")!;
    expect(c).toBeTruthy();
    g.char(c.id).memories.push({
      of: life.c,
      why: "Test",
      value: 60,
      until: 0,
    });
    // Alden (busy clerking) means to run a new store: nobody would mind it.
    const t = presetTerms(g.s, g.w, life, c, "found", { job: "shopkeeper" })!;
    t.sides[0].role = "managing";
    t.sides[1].role = "silent";
    expect(
      g.lifeCommand("s1", { k: "partners", act: "propose", terms: t }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c)[0];
    expect(firmHowItPays(g.s, g.w, f).join(" ")).toMatch(/takings/);
    const adv = firmAdvice(g.s, g.w, f);
    expect(adv[0].key).toBe("away");
    for (let m = 0; m < 3; m++) month(g);
    expect(
      life.journal.some(
        (j) =>
          /lost money two months running/.test(j.text) &&
          /Nobody minds it|nobody minds it/.test(j.text),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------- the trading company

/** A merchant at Jamestown with a company of their own, on the default plan. */
function company(seed = 7, cap = 300) {
  const { g, life } = game(seed, { background: "clerk", purse: 600 });
  const plan = defaultPlan(g.s, g.w, life.prov)!;
  expect(plan).toBeTruthy();
  const err = g.lifeCommand("s1", {
    k: "business",
    act: "company",
    plan,
    cap,
  });
  expect(err).toBeNull();
  const f = firmsWith(g.s, life.c).find((x) => x.hold === "company")!;
  return { g, life, f, plan };
}

describe("a trading company for particular goods", () => {
  test("the default line of trade from a port pays once it's going, and its odds say so", () => {
    const { g, life } = game(5, { background: "clerk" });
    const plan = defaultPlan(g.s, g.w, life.prov)!;
    expect(plan.from).toBe(life.prov);
    expect(CO_LOADS).toContain(plan.loads);
    const o = companyOdds(g.s, g.w, plan);
    expect(o.per).toBe("trip");
    expect(o.expected).toBeGreaterThan(0);
    expect(o.net).toBeGreaterThan(0);
    expect(steadyGain(g.s, g.w, plan)).toBeLessThanOrEqual(o.expected + 0.01);
    expect(o.factors.join(" ")).toMatch(/pace/i);
  });

  test("its books reconcile, and its buying and selling move the markets' prices", () => {
    const { g, life } = game(7, { background: "clerk", purse: 600 });
    const plan = defaultPlan(g.s, g.w, life.prov)!;
    const before = priceView(g.s, g.w, plan.from, plan.item).price;
    expect(
      g.lifeCommand("s1", { k: "business", act: "company", plan, cap: 300 }),
    ).toBeNull();
    const f = firmsWith(g.s, life.c).find((x) => x.hold === "company")!;
    // The first cargo sails at once: bought at the port, the price there rises.
    expect(f.co!.voyages.length).toBe(1);
    expect(priceView(g.s, g.w, plan.from, plan.item).price).toBeGreaterThan(
      before,
    );
    const me = partnerIn(f, life.c)!;
    for (let m = 0; m < 14; m++) month(g);
    expect(f.co!.made).toBeGreaterThan(2);
    // The chest is what was put in, and what its months made, less what's
    // been divided and what's at sea.
    const booked = f.books.reduce((m, b) => m + b.profit, 0);
    const atSea = f.co!.voyages.reduce((m, v) => m + v.cost, 0);
    expect(f.chest + me.drawn + atSea).toBeCloseTo(me.capital + booked, 0);
    // Its voyages are its own news, and in the tracker.
    expect(life.journal.some((j) => j.aff === "firm")).toBe(true);
    const items = affairsOf(g.s, g.w, life);
    expect(items.some((x) => x.id === `firm:${f.id}`)).toBe(true);
    // Selling into a port of the Americas cheapens the price there.
    const coastal: CompanyPlan = {
      item: "tobacco",
      from: JT,
      to: prov("Massachusetts Bay"),
      loads: 10,
      every: 2,
    };
    const there = priceView(g.s, g.w, coastal.to, coastal.item).price;
    const q = companyQuote(g.s, g.w, coastal);
    expect(q.sale / coastal.loads).toBeLessThan(there);
  });

  test("the odds shown are the odds its voyages are rolled by", () => {
    const { g } = game(5, { background: "clerk" });
    const cases: CompanyPlan[] = [
      { item: "tobacco", from: JT, to: -1, loads: 10, every: 2 },
      { item: "tobacco", from: JT, to: prov("Quebec"), loads: 10, every: 2 },
      { item: "grain", from: JT, to: prov("Barbados"), loads: 10, every: 3 },
    ];
    for (const plan of cases) {
      const o = companyOdds(g.s, g.w, plan);
      const k = voyageRisks(g.s, g.w, plan);
      const n = 20000;
      const counts: Record<string, number> = {};
      const rng = new Rng({ rng: 12345 });
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
      // What a voyage is expected to bring is the average of what it does.
      const q = companyQuote(g.s, g.w, plan);
      const sim =
        ((counts.home ?? 0) * q.sale +
          ((counts.spoiled ?? 0) * Math.round(q.sale * 0.65 * 10)) / 10) /
          n -
        q.cost;
      expect(Math.abs(sim - o.expected)).toBeLessThan(
        Math.max(1, q.cost * 0.03),
      );
    }
    // Smuggling to the French: the customs may seize it.
    const smuggle = companyOdds(g.s, g.w, cases[1]);
    expect(
      smuggle.outcomes.find((x) => x.label === "seized by the customs")?.p,
    ).toBeGreaterThan(0);
  });

  test("each voyage's dice are its own: the same game runs the same", () => {
    const run = () => {
      const { g } = company(9);
      for (let m = 0; m < 8; m++) month(g);
      return JSON.stringify(g.s.partners);
    };
    expect(run()).toBe(run());
    // A voyage's own dice depend on the game's seed and the voyage only.
    const s = { settings: { seed: 4 } } as GameState;
    expect(voyageDice(s, 77).next()).toBe(voyageDice(s, 77).next());
  });

  test("in wartime cargoes that get through fetch war prices: a venture about pays", () => {
    const loss = 0.26;
    const rest = VENTURE_LUCK.slice(1);
    const total = rest.reduce((m, l) => m + l.p, 0);
    const ev =
      rest.reduce((m, l) => m + ((1 - loss) * l.p * l.x) / total, 0) * 1.25;
    expect(ev).toBeGreaterThan(1);
  });
});

describe("the state", () => {
  test("a business's books and a company survive a save and load, ride the deltas, and old saves load", () => {
    const { g, life, f } = company(5);
    const client: GameState = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    life.skills.trade = 7;
    life.job = null;
    expect(
      g.lifeCommand("s1", {
        k: "business",
        act: "found",
        job: "shopkeeper",
        level: 1,
      }),
    ).toBeNull();
    for (let m = 0; m < 3; m++) month(g);
    applyDelta(client, g.takeDelta());
    const mine = client.lives.find((l) => l.seat === "s1")!;
    expect(mine.property).toEqual(life.property);
    expect(client.partners?.firms).toEqual(g.s.partners?.firms);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    g2.aiEnabled = false;
    for (let m = 0; m < 2; m++) month(g2);
    const l2 = lifeOf(g2);
    const pr2 = l2.property!.find((x) => x.kind === "business")!;
    expect(pr2.biz!.acct!.length).toBe(5);
    expect(
      g2.s.partners!.firms.find((x) => x.id === f.id)!.co!.made,
    ).toBeGreaterThanOrEqual(f.co!.made);
    // An old save: a business from before, with no state of its own.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    const ol = old.lives.find((l) => l.seat === "s1")!;
    for (const pr of ol.property ?? []) delete pr.biz;
    const g3 = new ConquestGame(map, old);
    g3.aiEnabled = false;
    month(g3);
    const pr3 = lifeOf(g3).property!.find((x) => x.kind === "business")!;
    expect(pr3.biz?.acct?.length).toBe(1);
  });
});
