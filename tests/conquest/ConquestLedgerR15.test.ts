// Derpy Conquest, round 15 (LEDGER): money made plain. The month's figure
// counts every flow (boats' crews, your people's wages, rents, keep,
// dividends, voyages), with what runs on luck apart; each month's turn
// matches its forecast exactly for the fixed lines and on average for the
// chance ones; the odds shown for a boat's work and a clerk's trip are the
// odds the engine rolls; the month's books close into statements that
// survive a save; news of your own affairs is marked; the tracker lists what
// is out working; the acres you own add up by province.

import { describe, expect, test } from "vitest";
import {
  BOAT_WEAR,
  BOATS,
  boatsMonthly,
  CREW_WAGE,
} from "../../src/conquest/engine/Boats";
import { isMonthStart } from "../../src/conquest/engine/Calendar";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  FOLLOWER_KINDS,
  peopleDaily,
  peopleMonthly,
  TRADE_LUCK,
} from "../../src/conquest/engine/Followers";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  acresOf,
  affairsOf,
  FARM_ACRES,
  forecastBreakdown,
  ledgerForecast,
} from "../../src/conquest/engine/Ledger";
import { setFlow, withFlow } from "../../src/conquest/engine/LedgerCore";
import { earn, journal } from "../../src/conquest/engine/LifeCore";
import { monthlyBudget } from "../../src/conquest/engine/LifeQueries";
import { JOBS, LAND_LOT } from "../../src/conquest/engine/LifeRules";
import {
  boatJobOdds,
  chanceWords,
  clerkOdds,
  tradeOdds,
  type OddsView,
} from "../../src/conquest/engine/Odds";
import { propertyWorth } from "../../src/conquest/engine/Property";
import type {
  Boat,
  BoatUse,
  Follower,
  FollowerKind,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

const NORTH = prov("Massachusetts Bay");

const last = <T>(a: T[]): T => a[a.length - 1];

/** A clerk in a northern port with a purse to spend. */
function merchant(seed = 5, purse = 900): { g: ConquestGame; life: Life } {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "A",
        plan: plan({ home: NORTH, background: "clerk" }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  life.purse = purse;
  return { g, life };
}

function cmd(g: ConquestGame, c: Parameters<ConquestGame["lifeCommand"]>[1]) {
  const e = g.lifeCommand("s1", c);
  expect(e).toBeNull();
}

/** Someone of the town taken into your service as a follower of this kind. */
function follower(
  g: ConquestGame,
  life: Life,
  kind: FollowerKind,
  skip = 0,
): Follower {
  const c = (g.s.locals[life.prov] ?? [])
    .map((id) => g.s.chars[id])
    .filter((x) => x?.alive && !x.abroad && g.s.day - x.born > 25 * 365)[skip];
  expect(c).toBeTruthy();
  const f: Follower = {
    id: g.nextId(),
    c: c.id,
    kind,
    rank: 0,
    wage: FOLLOWER_KINDS[kind].wage[0],
    share: 0,
    loyalty: 100,
    joined: g.s.day,
    task: null,
  };
  (life.people ??= []).push(f);
  return f;
}

/** Tick to the eve of the next month's turn, answering anything asked. */
function toEve(g: ConquestGame, life: Life): void {
  do {
    g.tick();
    for (const e of [...life.events])
      g.lifeCommand(life.seat, { k: "event", id: e.id, choice: 0 });
  } while (!isMonthStart(g.s.day + 1));
}

const shape = (life: Life) =>
  [
    (life.boats ?? []).map((b) => `${b.id}:${b.crew}`).join(","),
    (life.people ?? []).map((f) => f.id).join(","),
    (life.property ?? []).map((p) => `${p.id}:${p.level}`).join(","),
    (life.ventures ?? []).map((v) => v.id).join(","),
    life.job ? `${life.job.kind}${life.job.rank}` : "",
  ].join("|");

describe("the month's figure", { timeout: 120_000 }, () => {
  test("counts boats' crews, your people, keep and voyages; a full crew shows at once", () => {
    const { g, life } = merchant();
    cmd(g, { k: "enter", area: "docks" });
    const before = ledgerForecast(g.s, g.w, life);
    cmd(g, { k: "boat", act: "buy", kind: "sloop", arg: -1 });
    const b = life.boats![0];
    cmd(g, { k: "boat", act: "crew", id: b.id, arg: BOATS.sloop.crew });
    const after = ledgerForecast(g.s, g.w, life);
    const wages = BOATS.sloop.upkeep + BOATS.sloop.crew * CREW_WAGE;
    expect(after.fixed).toBeCloseTo(before.fixed - wages, 1);
    // The top bar's figure (monthlyBudget) counts it too.
    expect(monthlyBudget(g.s, g.w, life).total).toBeCloseTo(after.total, 0);
    const line = after.lines.find((l) => l.key === `b:${b.id}`)!;
    expect(line.value).toBeCloseTo(-wages, 2);
    expect(line.chance).toBeUndefined();
    // Put to fishing: a chance line, apart, with its range.
    cmd(g, { k: "boat", act: "use", id: b.id, use: "fishing" });
    const f = ledgerForecast(g.s, g.w, life);
    const job = f.lines.find((l) => l.key === `bj:${b.id}`)!;
    expect(job.chance).toBeDefined();
    expect(job.chance![0]).toBeLessThan(job.value);
    expect(job.chance![1]).toBeGreaterThan(job.value);
    expect(f.expected).toBeGreaterThan(0);
    expect(f.total).toBeCloseTo(f.fixed + f.expected, 1);
    // The tooltip's breakdown keeps the chance lines apart, at the end.
    const bd = forecastBreakdown(f);
    const firstChance = bd.parts.findIndex((p) => p.chance);
    expect(bd.parts.slice(firstChance).every((p) => p.chance)).toBe(true);
    // A mate's wages, an officer's keep: each its own line.
    const mate = follower(g, life, "mate");
    const f2 = ledgerForecast(g.s, g.w, life);
    expect(f2.lines.find((l) => l.key === `f:${mate.id}`)?.value).toBe(
      -mate.wage,
    );
  });

  test("each month's turn matches the forecast: the fixed lines exactly, the chance lines on average", () => {
    const { g, life } = merchant(11, 2000);
    cmd(g, { k: "enter", area: "docks" });
    cmd(g, { k: "boat", act: "buy", kind: "sloop", arg: -1 });
    const b = life.boats![0];
    cmd(g, { k: "boat", act: "crew", id: b.id, arg: 3 });
    cmd(g, { k: "boat", act: "use", id: b.id, use: "fishing" });
    cmd(g, { k: "property", act: "land" });
    cmd(g, { k: "property", act: "land" });
    cmd(g, { k: "act", place: "market", act: "horse" });
    cmd(g, { k: "enter", area: "market" });
    cmd(g, { k: "act", place: "market", act: "shares" });
    cmd(g, { k: "property", act: "house" });
    follower(g, life, "hand");
    const fixedMiss: string[] = [];
    const chance = new Map<string, { fc: number; got: number; n: number }>();
    let checked = 0;
    for (let m = 0; m < 60; m++) {
      toEve(g, life);
      const was = shape(life);
      const f = ledgerForecast(g.s, g.w, life);
      g.tick();
      if (shape(life) !== was || life.watching) continue;
      checked++;
      const st = last(life.statements!);
      const turn = st.lines.filter((l) => l.t);
      // Every coin of the turn is named, and forecast.
      for (const l of turn) {
        expect(l.k).not.toBe("turn");
        if (l.k.startsWith("debt:") || l.k === "bailiffs") continue;
        expect(
          f.lines.some((x) => x.key === l.k),
          `${l.k} ${l.l}`,
        ).toBe(true);
      }
      for (const line of f.lines) {
        const got = turn
          .filter((x) => x.k === line.key)
          .reduce((a, x) => a + x.v, 0);
        if (line.chance) {
          const c = chance.get(line.key.split(":")[0]) ?? {
            fc: 0,
            got: 0,
            n: 0,
          };
          c.fc += line.value;
          c.got += got;
          c.n++;
          chance.set(line.key.split(":")[0], c);
        } else if (Math.abs(got - line.value) > 0.011)
          fixedMiss.push(`${m}: ${line.key} ${line.value} vs ${got}`);
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(fixedMiss).toEqual([]);
    // Fishing (a sloop's month), the shares' dividend, the land's rents.
    for (const key of ["bj", "v", "p"]) {
      const c = chance.get(key)!;
      expect(c.n).toBeGreaterThan(40);
      const fc = c.fc / c.n;
      const got = c.got / c.n;
      expect(Math.abs(got - fc), `${key}: ${fc} vs ${got}`).toBeLessThan(
        Math.max(0.03, Math.abs(fc) * 0.12),
      );
    }
  });

  test("a business is paid the takings its budget promised (minded when worked)", () => {
    const g = world({
      start: 1700,
      seed: 3,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ home: prov("Jamestown"), background: "farmer" }),
        },
      ],
    });
    g.aiEnabled = false;
    const life = lifeOf(g);
    life.purse = 300;
    const hands = (g.s.locals[life.prov] ?? [])
      .map((id) => g.s.chars[id])
      .filter((c) => c?.alive && g.s.day - c.born > 20 * 365)
      .slice(0, 2)
      .map((c) => c.id);
    life.job = {
      kind: "farmer",
      rank: 1,
      prov: life.prov,
      place: "fields",
      employer: -1,
      nation: g.s.provinces[life.prov].owner,
      army: -1,
      since: g.s.day,
      months: 0,
      away: 0,
      worked: 0,
      awayDays: 0,
      own: true,
    };
    life.property = [
      {
        id: g.nextId(),
        kind: "business",
        prov: life.prov,
        level: 1,
        job: "farmer",
        place: "fields",
        hands,
        since: g.s.day,
        name: "farm",
      },
    ];
    const pr = life.property[0];
    toEve(g, life);
    toEve(g, life);
    const f = ledgerForecast(g.s, g.w, life);
    const line = f.lines.find((l) => l.key === `p:${pr.id}`)!;
    expect(line.parts!.some((p) => p.label.startsWith("Takings"))).toBe(true);
    g.tick();
    const got = last(life.statements!)
      .lines.filter((l) => l.t && l.k === `p:${pr.id}`)
      .reduce((a, l) => a + l.v, 0);
    expect(got).toBeCloseTo(line.value, 1);
  });
});

// ---------------------------------------------------------------- the odds

/** The outcome a month's work came to, by what she brought in. */
function bucket(view: OddsView, got: number): number {
  // Outcomes that bring nothing are told apart by what else happened.
  let best = -1;
  view.outcomes.forEach((o, i) => {
    if (o.hi <= 0) return;
    if (got >= o.lo - 0.051 && got <= o.hi + 0.051 && best < 0) best = i;
  });
  return best;
}

function schoonerAt(g: ConquestGame, life: Life, use: BoatUse): Boat {
  const b: Boat = {
    id: g.nextId(),
    kind: "schooner",
    name: "Trial",
    prov: life.prov,
    condition: 100,
    crew: BOATS.schooner.crew,
    morale: 70,
    use,
    bought: g.s.day,
  };
  life.boats = [b];
  return b;
}

describe(
  "risk and reward, shown as the engine rolls it",
  { timeout: 120_000 },
  () => {
    const N = 2500;
    for (const use of [
      "fishing",
      "whaling",
      "trading",
      "smuggling",
      "privateering",
    ] as BoatUse[])
      test(`a schooner ${use}: the odds shown are the odds rolled`, () => {
        const { g, life } = merchant(7, 0);
        // High summer (no winter at the banks), you aboard in port.
        g.s.day = g.s.day - (g.s.day % 365) + 190;
        life.travel = null;
        const b0 = schoonerAt(g, life, use);
        life.skills.seamanship = 6;
        const view = boatJobOdds(g.s, g.w, life, b0, use);
        expect(view.ok).toBe(true);
        const p = view.outcomes.reduce((m, o) => m + o.p, 0);
        expect(p).toBeCloseTo(1, 6);
        const counts = view.outcomes.map(() => 0);
        const lostIdx = view.outcomes.findIndex(
          (o) => o.bad && o.hi === 0 && /lost|seized|taken/.test(o.label),
        );
        const emptyIdx = view.outcomes.findIndex(
          (o) => o.hi === 0 && !(o.bad && /lost|seized|taken/.test(o.label)),
        );
        let total = 0;
        const wear = BOAT_WEAR.work;
        let hurt = 0;
        for (let i = 0; i < N; i++) {
          const b = schoonerAt(g, life, use);
          life.skills.seamanship = 6;
          life.xp.seamanship = 0;
          life.purse = 1000;
          const wages =
            Math.round((BOATS.schooner.upkeep + b.crew * CREW_WAGE) * 10) / 10;
          boatsMonthly(g, life);
          const got = Math.round((life.purse - 1000 + wages) * 100) / 100;
          total += got;
          const gone = !life.boats?.some((x) => x.id === b.id);
          if (!gone && b.condition < 100 - wear - 0.01) hurt++;
          let k: number;
          if (gone) k = lostIdx;
          else if (got <= 0) k = emptyIdx;
          else k = bucket(view, got);
          expect(k, `${use}: ${got}`).toBeGreaterThanOrEqual(0);
          counts[k]++;
        }
        view.outcomes.forEach((o, i) => {
          const f = counts[i] / N;
          const sd = Math.sqrt((o.p * (1 - o.p)) / N);
          expect(
            Math.abs(f - o.p),
            `${use} ${o.label}: shown ${o.p}, rolled ${f}`,
          ).toBeLessThan(4 * sd + 0.004);
        });
        // What's expected, on average.
        expect(Math.abs(total / N - view.expected)).toBeLessThan(
          Math.max(0.15, view.expected * 0.06),
        );
        // The damage risks: a squall, a stove boat, a fight.
        const damage = view.risks.filter(
          (r) => r.p < 1 && /soundness/.test(r.label),
        );
        if (damage.length) {
          const pd = damage.reduce((m, r) => m + r.p, 0);
          const sd = Math.sqrt((pd * (1 - pd)) / N);
          expect(
            Math.abs(
              hurt / N -
                pd * (1 - (lostIdx >= 0 ? view.outcomes[lostIdx].p : 0)),
            ),
          ).toBeLessThan(4 * sd + 0.004);
        }
      });

    test("a clerk's trip: the odds shown are the odds rolled, and skill helps", () => {
      const { g, life } = merchant(9, 0);
      const f = follower(g, life, "clerk");
      const stake = 100;
      for (const loyalty of [100, 15]) {
        f.loyalty = loyalty;
        const view = clerkOdds(g.s, f, stake);
        expect(view.outcomes.reduce((m, o) => m + o.p, 0)).toBeCloseTo(1, 6);
        const counts = view.outcomes.map(() => 0);
        const N = 3000;
        let sum = 0;
        for (let i = 0; i < N; i++) {
          life.people = [f];
          f.loyalty = loyalty;
          f.task = {
            kind: "trade",
            p: life.prov,
            back: g.s.day,
            stake,
            repeat: false,
          };
          life.purse = 0;
          peopleDaily(g, life);
          const ran = !life.people.includes(f);
          const back = life.purse;
          sum += back - stake;
          const k = ran
            ? view.outcomes.findIndex((o) => o.label === "they never come back")
            : view.outcomes.findIndex(
                (o) =>
                  o.label !== "they never come back" &&
                  Math.abs(o.lo - back) < 0.01,
              );
          expect(k, `back ${back}`).toBeGreaterThanOrEqual(0);
          counts[k]++;
        }
        view.outcomes.forEach((o, i) => {
          const fr = counts[i] / N;
          const sd = Math.sqrt((o.p * (1 - o.p)) / N);
          expect(
            Math.abs(fr - o.p),
            `${o.label}: ${o.p} vs ${fr}`,
          ).toBeLessThan(4 * sd + 0.004);
        });
        expect(Math.abs(sum / N - view.expected)).toBeLessThan(stake * 0.03);
      }
      // A skilled clerk does better than an unskilled one; a war makes it worse.
      const unskilled = tradeOdds(50, { skill: 0 });
      const skilled = tradeOdds(50, { skill: 12 });
      const atWar = tradeOdds(50, { skill: 12, war: true });
      expect(skilled.expected).toBeGreaterThan(unskilled.expected);
      expect(atWar.expected).toBeLessThan(skilled.expected);
      expect(skilled.outcomes[0].p).toBeLessThan(unskilled.outcomes[0].p);
      expect(TRADE_LUCK[0].x).toBe(0);
    });

    test("odds are said plainly", () => {
      expect(chanceWords(0.2)).toBe("1 in 5");
      expect(chanceWords(0.04)).toBe("1 in 25");
      expect(chanceWords(2 / 3)).toBe("2 in 3");
      expect(chanceWords(0.35)).toBe("7 in 20");
      expect(chanceWords(0.988)).toBe("all but 1 in 83");
      expect(chanceWords(0)).toBe("never");
      expect(chanceWords(1)).toBe("certain");
    });

    test("no whales in the south, and nobody to command her while you're away", () => {
      const g = world({
        start: 1700,
        seed: 4,
        plans: [
          {
            seat: "s1",
            name: "A",
            plan: plan({ home: prov("Jamestown"), background: "clerk" }),
          },
        ],
      });
      const life = lifeOf(g);
      const b = schoonerAt(g, life, "whaling");
      expect(boatJobOdds(g.s, g.w, life, b, "whaling").ok).toBe(false);
      life.prov = NORTH;
      const away = boatJobOdds(g.s, g.w, life, b, "fishing");
      expect(away.ok).toBe(false);
      expect(away.why).toMatch(/skipper/);
      // With a full crew to come, the cost of signing them shows.
      b.crew = 0;
      const hire = boatJobOdds(g.s, g.w, life, b, "fishing", {
        crew: BOATS.schooner.crew,
      });
      expect(hire.costNow).toBe(BOATS.schooner.crew);
      expect(hire.costMonth).toBeCloseTo(
        BOATS.schooner.upkeep + BOATS.schooner.crew * CREW_WAGE,
        5,
      );
    });
  },
);

// ---------------------------------------------------------------- the books

describe("the month's books and statements", { timeout: 120_000 }, () => {
  test("every coin is written under a name; the month closes into a statement", () => {
    const { g, life } = merchant(13, 500);
    cmd(g, { k: "enter", area: "docks" });
    cmd(g, { k: "boat", act: "buy", kind: "shallop", arg: -1 });
    toEve(g, life);
    const open = life.books!.open;
    const mid = life.books!.lines;
    // What was bought went under the command's name.
    expect(mid.some((l) => l.k === "cmd:boat" && l.v < 0)).toBe(true);
    g.tick();
    const st = last(life.statements!);
    expect(st.open).toBe(open);
    const sum = st.lines.reduce((m, l) => m + l.v, 0);
    expect(st.close - st.open).toBeCloseTo(sum, 2);
    expect(st.expected).toBeDefined();
    // The statement is news of your own affairs.
    const note = last(life.journal);
    expect(note.aff).toBe("statement");
    expect(note.text).toMatch(/month's accounts/);
    // A fresh month's books.
    expect(life.books!.lines.filter((l) => !l.t).length).toBe(0);
  });

  test("withFlow names the money, nests, and marks the news", () => {
    const { g, life } = merchant(13, 500);
    withFlow(g, { key: "x:1", label: "Outer", aff: "boat" }, () => {
      earn(g, life, 3);
      withFlow(g, { key: "x:2", label: "Inner", chance: true }, () =>
        earn(g, life, 2),
      );
      earn(g, life, 1);
      journal(g, life, "Her month.");
    });
    const lines = life.books!.lines;
    expect(lines.find((l) => l.k === "x:1")?.v).toBe(4);
    expect(lines.find((l) => l.k === "x:2")?.c).toBe(1);
    expect(last(life.journal).aff).toBe("boat");
    const was = setFlow(g, { key: "y", label: "Y" });
    earn(g, life, 1);
    setFlow(g, was);
    earn(g, life, 1);
    expect(lines.find((l) => l.k === "y")?.v).toBe(1);
    expect(lines.find((l) => l.k === "other")?.v).toBe(1);
  });

  test("statements survive a save and a load, and the delta", () => {
    const { g, life } = merchant(17, 500);
    cmd(g, { k: "enter", area: "docks" });
    cmd(g, { k: "boat", act: "buy", kind: "shallop", arg: -1 });
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 3; i++) {
      toEve(g, life);
      g.tick();
      applyDelta(mine, g.takeDelta());
    }
    expect(life.statements!.length).toBeGreaterThanOrEqual(3);
    const there = mine.lives.find((l) => l.seat === "s1")!;
    expect(there.statements).toEqual(life.statements);
    expect(there.books).toEqual(life.books);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    const l2 = g2.s.lives.find((l) => l.seat === "s1")!;
    expect(l2.statements).toEqual(life.statements);
    toEve(g2, l2);
    g2.tick();
    expect(l2.statements!.length).toBe(life.statements!.length + 1);
    // An old save without books: they open at the next coin or month.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const l of old.lives) {
      delete l.books;
      delete l.statements;
      for (const j of l.journal) delete j.aff;
    }
    const g3 = new ConquestGame(map, old);
    const l3 = g3.s.lives.find((l) => l.seat === "s1")!;
    toEve(g3, l3);
    g3.tick();
    expect(l3.statements?.length).toBe(1);
  });
});

// ---------------------------------------------------------------- the tracker and acres

describe(
  "what's out working, and the acres you own",
  { timeout: 120_000 },
  () => {
    test("the tracker lists boats, cargoes, shares and traders, with what they're expected to bring", () => {
      const { g, life } = merchant(19, 900);
      cmd(g, { k: "enter", area: "docks" });
      cmd(g, { k: "boat", act: "buy", kind: "sloop", arg: -1 });
      const b = life.boats![0];
      cmd(g, { k: "boat", act: "crew", id: b.id, arg: 3 });
      cmd(g, { k: "boat", act: "use", id: b.id, use: "fishing" });
      cmd(g, { k: "act", place: "docks", act: "venture" });
      const clerk = follower(g, life, "clerk");
      cmd(g, { k: "people", act: "trade-again", id: clerk.id, arg: 50 });
      const list = affairsOf(g.s, g.w, life);
      const boat = list.find((x) => x.id === `b:${b.id}`)!;
      expect(boat.status).toBe("at work");
      expect(boat.expected!.value).toBeGreaterThan(0);
      expect(boat.cost).toBeLessThan(0);
      const cargo = list.find((x) => x.kind === "cargo")!;
      expect(cargo.due).toBeGreaterThan(g.s.day);
      expect(cargo.expected!.per).toBe("home");
      const trader = list.find((x) => x.id === `f:${clerk.id}`)!;
      expect(trader.status).toBe("trading");
      expect(trader.expected!.lo).toBe(-50);
      // The trip's coming home is news of your affairs, under its own name.
      for (let i = 0; i < 70 && clerk.task?.back !== undefined; i++) {
        const back = clerk.task.back;
        g.tick();
        if (g.s.day >= back) break;
      }
      expect(life.journal.some((j) => j.aff === "trader")).toBe(true);
      expect(life.books!.lines.some((l) => l.k === `tr:${clerk.id}`)).toBe(
        true,
      );
    });

    test("acres by province, with a subtotal each and a grand total", () => {
      const { g, life } = merchant(23, 900);
      cmd(g, { k: "property", act: "land" });
      cmd(g, { k: "property", act: "land" });
      const other = prov("Plymouth");
      life.property!.push(
        {
          id: g.nextId(),
          kind: "land",
          prov: other,
          level: 3,
          hands: [],
          since: g.s.day,
          name: "Land",
        },
        {
          id: g.nextId(),
          kind: "business",
          prov: other,
          level: 2,
          job: "farmer",
          place: "fields",
          hands: [],
          since: g.s.day,
          name: "farm",
        },
      );
      const a = acresOf(g.s, g.w, life);
      const home = a.rows.find((r) => r.prov === life.prov)!;
      expect(home.total).toBe(20);
      const there = a.rows.find((r) => r.prov === other)!;
      expect(there.total).toBe(30 + FARM_ACRES[2]);
      expect(there.lines.length).toBe(2);
      expect(a.total).toBe(20 + 30 + FARM_ACRES[2]);
      // Home first.
      expect(a.rows[0].prov).toBe(life.home);
    });

    test("a Sell button's figure is what the sale pays", () => {
      const { g, life } = merchant(31, 900);
      cmd(g, { k: "property", act: "land" });
      cmd(g, { k: "property", act: "house" });
      life.property!.push({
        id: g.nextId(),
        kind: "business",
        prov: life.prov,
        level: 2,
        job: "farmer",
        place: "fields",
        hands: [],
        since: g.s.day,
        name: "farm",
      });
      for (const pr of [...life.property!]) {
        const worth = propertyWorth(g.s, life, pr);
        expect(worth).toBeGreaterThan(0);
        const was = life.purse;
        cmd(g, { k: "property", act: "sell", id: pr.id });
        expect(life.purse - was).toBeCloseTo(worth, 6);
      }
      expect(life.property!.length).toBe(0);
    });
  },
);

describe("a month's wages and keep are paid as the forecast said, people too", () => {
  test("followers' wages and a company's pay are their own lines", () => {
    const { g, life } = merchant(29, 900);
    const f = follower(g, life, "sword");
    life.company = {
      name: "Drackley's Rangers",
      kind: "rangers",
      men: 20,
      drill: 0.3,
      morale: 0.7,
      raised: g.s.day,
      army: -1,
    };
    const fc = ledgerForecast(g.s, g.w, life);
    expect(fc.lines.find((l) => l.key === "co")!.value).toBeCloseTo(-7, 5);
    const before = life.purse;
    setFlow(g, null);
    peopleMonthly(g, life);
    expect(before - life.purse).toBeCloseTo(f.wage + 7, 5);
    expect(life.books!.lines.find((l) => l.k === `f:${f.id}`)!.v).toBe(-f.wage);
    expect(life.books!.lines.find((l) => l.k === "co")!.v).toBe(-7);
    expect(JOBS.clerk).toBeDefined();
    expect(LAND_LOT.rent).toBeGreaterThan(0);
  });
});
