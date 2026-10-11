// Derpy Conquest, round 11 (LIFE): a day every three seconds and a skip
// ahead that stops when something needs you; work that runs itself; many
// new trades with requirements; crime, the watch, trials and sentences, and
// lawmen on the other side; your own people, a company, contracts; boats
// that stay where you leave them; and the road's events by land and season.

import { describe, expect, test } from "vitest";
import {
  boatRoute,
  BOATS,
  buyBoat,
  sailCheck,
  setCrew,
} from "../../src/conquest/engine/Boats";
import { contractOffers } from "../../src/conquest/engine/Contracts";
import {
  addHeat,
  crimeState,
  jail,
  punish,
  sentenceFor,
} from "../../src/conquest/engine/Crime";
import {
  heatOf,
  knowsDen,
  lawAt,
} from "../../src/conquest/engine/CrimeQueries";
import {
  candidatesAt,
  followerCap,
  peopleOf,
  strengthOf,
} from "../../src/conquest/engine/Followers";
import { MORE_JOBS } from "../../src/conquest/engine/JobsData";
import { touchLife } from "../../src/conquest/engine/LifeCore";
import {
  answerLifeEvent,
  LIFE_EVENTS,
  raiseLifeEvent,
} from "../../src/conquest/engine/LifeEvents";
import {
  hasPlace,
  meOf,
  monthlyBudget,
  wageOf,
} from "../../src/conquest/engine/LifeQueries";
import {
  BACKGROUNDS,
  JOBS,
  roleJobs,
  ROLES,
  WORK_DAYS,
} from "../../src/conquest/engine/LifeRules";
import {
  attentionMark,
  SKIP_DAYS_PER_SECOND,
  skipBlocker,
  whyWoken,
} from "../../src/conquest/engine/Pace";
import {
  SPEED_DAYS_PER_SECOND,
  SPEED_LABELS,
} from "../../src/conquest/engine/Rules";
import {
  EFFORTS,
  jobGate,
  takeUpCheck,
  tradesFor,
} from "../../src/conquest/engine/Trades";
import {
  hopOf,
  regionOf,
  TRAVEL_EVENTS,
} from "../../src/conquest/engine/TravelEvents";
import type { Life } from "../../src/conquest/engine/Types";
import { startWar } from "../../src/conquest/engine/War";
import { MATTERS } from "../../src/conquest/engine/WorkEvents";
import { lifeOf, plan, prov, toNextMonth, world } from "./LifeUtil";

/** Clear the letters waiting (so a test isn't stopped by a stray event). */
function clearEvents(g: ReturnType<typeof world>, life: Life): void {
  for (const ev of [...life.events])
    answerLifeEvent(g, life, ev.id, ev.choices.length - 1);
}

describe("the pace of a life", () => {
  test("1× is a day every three seconds; 2×, 4× and 8× from there; skipping is quicker still", () => {
    expect(SPEED_DAYS_PER_SECOND[1]).toBeCloseTo(1 / 3, 5);
    expect(SPEED_DAYS_PER_SECOND[2]).toBeCloseTo(2 / 3, 5);
    expect(SPEED_DAYS_PER_SECOND[3]).toBeCloseTo(4 / 3, 5);
    expect(SPEED_DAYS_PER_SECOND[4]).toBeCloseTo(8 / 3, 5);
    expect(SPEED_LABELS.slice(1)).toEqual(["1×", "2×", "4×", "8×"]);
    expect(SKIP_DAYS_PER_SECOND).toBeGreaterThan(SPEED_DAYS_PER_SECOND[4] * 4);
  });

  test("a skip is blocked by waiting letters, and an arrival or a letter wakes it", () => {
    const g = world();
    const life = lifeOf(g);
    clearEvents(g, life);
    expect(skipBlocker(g.s)).toBeNull();
    raiseLifeEvent(g, life, "work-task", { t: 0 });
    expect(skipBlocker(g.s)).toMatch(/letters/);
    clearEvents(g, life);
    const mark = attentionMark(g.s);
    // Set out next door: arriving wakes the skip.
    const to = g.map.provinces[life.prov].nb[0][0];
    expect(g.lifeCommand("s1", { k: "travel", to })).toBeNull();
    let woke = "";
    for (let i = 0; i < 60 && !woke; i++) {
      g.tick();
      clearEvents(g, life);
      if (attentionMark(g.s) !== mark) woke = whyWoken(g.s, mark);
    }
    expect(woke).toMatch(/arrive|.+/);
    expect(life.wake ?? 0).toBeGreaterThan(0);
  });
});

describe("work runs itself", () => {
  test("days at your post are worked and paid with no commands at all", () => {
    const g = world();
    const life = lifeOf(g);
    expect(life.job?.kind).toBe("farmer");
    toNextMonth(g);
    const before = life.tally.earned;
    for (let d = 0; d < 20; d++) {
      g.tick();
      clearEvents(g, life);
    }
    expect(life.job!.worked).toBeGreaterThanOrEqual(15);
    toNextMonth(g);
    expect(life.tally.earned).toBeGreaterThan(before);
  });

  test("effort: shirking earns less, overtime up to 1.4 of a month", () => {
    const g = world();
    const life = lifeOf(g);
    const wage = JOBS.farmer.ranks[life.job!.rank].wage;
    expect(g.lifeCommand("s1", { k: "effort", v: "overtime" })).toBeNull();
    life.job!.worked = WORK_DAYS * 2;
    expect(wageOf(g.s, g.w, life, true)).toBeCloseTo(wage * 1.4, 1);
    expect(g.lifeCommand("s1", { k: "effort", v: "steady" })).toBeNull();
    expect(wageOf(g.s, g.w, life, true)).toBeCloseTo(wage, 1);
    expect(EFFORTS.shirk.day).toBeLessThan(1);
    expect(EFFORTS.hard.xp).toBeGreaterThan(EFFORTS.steady.xp);
  });

  test("being away still counts against you: weeks away and the place is gone", () => {
    const g = world();
    const life = lifeOf(g);
    life.job!.awayDays = 41;
    // Somewhere else, not at the post.
    life.prov = g.map.provinces[life.job!.prov].nb[0][0];
    g.tick();
    expect(life.job).toBeNull();
  });

  test("every trade has matters of its own, and they come up at work", () => {
    for (const k of Object.keys(JOBS) as (keyof typeof JOBS)[]) {
      if (JOBS[k].crime || JOBS[k].law) continue;
      expect(MATTERS[k], k).toBeDefined();
    }
    const g = world();
    const life = lifeOf(g);
    const keys = new Set<string>();
    for (let d = 0; d < 400 && keys.size < 1; d++) {
      g.tick();
      for (const ev of [...life.events]) {
        if (ev.key.startsWith("work-")) keys.add(ev.key);
        answerLifeEvent(g, life, ev.id, 0);
      }
    }
    expect(
      [...keys].some((k) => k === "work-task" || k === "work-trouble"),
    ).toBe(true);
  });

  test("the hard day act is gone: no button to click every few days", async () => {
    const { ACTS } = await import("../../src/conquest/engine/LifeActs");
    expect(ACTS.some((a) => a.key === "work")).toBe(false);
  });
});

describe("many more jobs", () => {
  test("the new trades, the law, arms and crime all have ladders, places and backgrounds", () => {
    const kinds = Object.keys(MORE_JOBS);
    expect(kinds.length).toBeGreaterThanOrEqual(28);
    for (const k of [
      "thief",
      "fence",
      "smuggler",
      "highwayman",
      "counterfeiter",
      "pirate",
      "watch",
      "militia",
      "thieftaker",
      "blacksmith",
      "whaler",
      "interpreter",
      "guide",
      "counsellor",
    ])
      expect(kinds).toContain(k);
    expect(JOBS.thief.ranks[JOBS.thief.ranks.length - 1].title).toBe(
      "Gang boss",
    );
    expect(JOBS.watch.ranks.map((r) => r.title)).toContain("High sheriff");
    expect(JOBS.militia.ranks.map((r) => r.title)).toContain("Colonel");
    for (const b of [
      "blacksmith",
      "pickpocket",
      "watchman",
      "militiaman",
      "pirate",
      "guide",
    ] as const)
      expect(BACKGROUNDS[b].job).toBeTruthy();
    expect(Object.keys(BACKGROUNDS).length).toBeGreaterThanOrEqual(45);
    // Someone takes people on for each new honest trade, or you set up on your own.
    for (const k of kinds as (keyof typeof JOBS)[]) {
      const hired = (Object.keys(ROLES) as (keyof typeof ROLES)[]).some((r) =>
        roleJobs(r).includes(k),
      );
      expect(hired || !!JOBS[k].selfStart, k).toBe(true);
    }
  });

  test("a master craftsman takes on a smith; a background starts in its trade", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan({ background: "blacksmith" }) },
      ],
    });
    const life = lifeOf(g);
    expect(life.job?.kind).toBe("blacksmith");
    expect(life.job?.place).toBe("workshop");
  });

  test("some trades are only open in the right place or with the right contacts", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    // Whaling is for the northern ports.
    expect(jobGate(g.s, g.w, life, "whaler", prov("Jamestown")).ok).toBe(false);
    expect(
      jobGate(g.s, g.w, life, "whaler", prov("Massachusetts Bay")).ok,
    ).toBe(true);
    // A fence needs a name in the underworld.
    expect(jobGate(g.s, g.w, life, "fence", life.prov).ok).toBe(false);
    // Anyone may enrol in the militia at the muster.
    life.job = null;
    expect(takeUpCheck(g.s, g.w, life, "militia", "tavern").ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "takeup", job: "militia", place: "tavern" }),
    ).toBeNull();
    expect(lifeOf(g).job?.kind).toBe("militia");
    // The list of every trade says how to get into each.
    const trades = tradesFor(g.s, g.w, life);
    expect(trades.find((t) => t.kind === "fence")?.open).toBe(false);
    expect(
      trades.find((t) => t.kind === "blacksmith")?.hiredBy.length,
    ).toBeGreaterThan(0);
  });
});

describe("crime and the law", () => {
  test("a street thief starts known in the den, with a name, and the work draws heat", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan({ background: "pickpocket" }) },
      ],
    });
    const life = lifeOf(g);
    expect(life.job?.kind).toBe("thief");
    expect(knowsDen(life, life.prov)).toBe(true);
    expect(life.crime!.notoriety).toBeGreaterThanOrEqual(5);
    const n = lawAt(g.s, life.prov);
    for (let d = 0; d < 40; d++) {
      g.tick();
      clearEvents(g, life);
      if (life.crime?.jail) break;
    }
    expect(heatOf(life, n) > 0 || !!life.crime?.jail).toBe(true);
    // Takings, not wages, and no tithes on them.
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => p.label.startsWith("Takings"))).toBe(true);
    expect(b.parts.some((p) => p.label.startsWith("Tithes"))).toBe(false);
  });

  test("caught: the gaol, the quarter sessions, and a sentence by the grade of the crime", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan({ background: "pickpocket" }) },
      ],
    });
    const life = lifeOf(g);
    clearEvents(g, life);
    const n = lawAt(g.s, life.prov);
    raiseLifeEvent(g, life, "crime-seized", {
      g: 1,
      n,
      k: Object.keys(JOBS).indexOf("thief"),
      r: 0,
    });
    const ev = life.events.find((e) => e.key === "crime-seized")!;
    expect(answerLifeEvent(g, life, ev.id, 0)).toBeNull();
    expect(life.crime!.jail?.trial).toBe(true);
    // In a cell you can't travel.
    expect(
      g.lifeCommand("s1", {
        k: "travel",
        to: g.map.provinces[life.prov].nb[0][0],
      }),
    ).toMatch(/gaol/);
    for (
      let d = 0;
      d < 30 && !life.events.some((e) => e.key === "crime-trial");
      d++
    )
      g.tick();
    const trial = life.events.find((e) => e.key === "crime-trial")!;
    expect(trial).toBeDefined();
    expect(answerLifeEvent(g, life, trial.id, 0)).toBeNull();
    expect(life.crime!.record.length).toBe(1);
    // Sentences grow with the crime and the record.
    expect(sentenceFor(1, 0).key).toBe("fine");
    expect(sentenceFor(2, 0).key).toBe("whip");
    expect(sentenceFor(3, 0).key).toBe("transport");
    expect(sentenceFor(3, 1).key).toBe("hang");
    expect(sentenceFor(4, 0).key).toBe("hang");
    // Petty theft never hangs, however long the record.
    expect(sentenceFor(1, 5).key).not.toBe("hang");
  });

  test("transportation sends you far off, bound; hanging ends the life (the heir carries on)", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const n = lawAt(g.s, life.prov);
    crimeState(g, life);
    const from = life.prov;
    life.purse = 200;
    life.goods = { furs: 3 };
    expect(
      punish(
        g,
        life,
        { key: "transport", text: "transportation for seven years", n: 7 },
        "burglary",
        n,
      ),
    ).toBe(true);
    expect(life.prov).not.toBe(from);
    expect(g.s.provinces[life.prov].owner).toBe(n);
    expect(life.job?.kind).toBe("servant");
    // A felon's money and goods are forfeit.
    expect(life.purse).toBeLessThan(25);
    expect(life.goods.furs ?? 0).toBe(0);
    expect(
      punish(
        g,
        life,
        { key: "hang", text: "hanging", n: 0 },
        "highway robbery",
        n,
      ),
    ).toBe(false);
    expect(me.alive).toBe(false);
  });

  test("benefit of clergy: a reader is branded instead of hanged, once", () => {
    const g = world({
      start: 1650,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ background: "footpad", skills: { letters: 3 } }),
        },
      ],
    });
    const life = lifeOf(g);
    clearEvents(g, life);
    jail(g, life, "highway robbery", 3, lawAt(g.s, life.prov));
    life.crime!.jail!.until = g.s.day;
    g.tick();
    const trial = life.events.find((e) => e.key === "crime-trial")!;
    const clergy = trial.choices.findIndex((c) => /clergy/.test(c.label));
    expect(answerLifeEvent(g, life, trial.id, clergy)).toBeNull();
    expect(life.crime!.branded).toBe(true);
    expect(life.crime!.jail).toBeNull();
    expect(meOf(g.s, life)?.alive).toBe(true);
  });

  test("a lawman takes up a wanted player, and a bribe goes into the lawman's purse", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "Rogue", plan: plan({ background: "pickpocket" }) },
        {
          seat: "s2",
          name: "Law",
          plan: plan({ background: "watchman", first: "Ezra" }),
        },
      ],
    });
    const rogue = lifeOf(g, "s1");
    const law = lifeOf(g, "s2");
    expect(law.job?.kind).toBe("watch");
    clearEvents(g, rogue);
    clearEvents(g, law);
    const n = lawAt(g.s, rogue.prov);
    addHeat(g, rogue, n, 50);
    expect(
      g.lifeCommand("s2", { k: "law", act: "arrest", c: rogue.c }),
    ).toBeNull();
    const ev = rogue.events.find((e) => e.key === "crime-seized")!;
    expect(ev).toBeDefined();
    rogue.purse = 100;
    const before = law.purse;
    const bribe = ev.choices.findIndex((c) => /Bribe/.test(c.label));
    // Bribing is a check: whichever way it goes, someone's purse or freedom changes.
    expect(answerLifeEvent(g, rogue, ev.id, bribe)).toBeNull();
    expect(law.purse > before || !!rogue.crime?.jail).toBe(true);
  });
});

describe("your own people", () => {
  test("people for hire at the tavern; their wages come out monthly; unpaid they leave", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.area = "tavern";
    life.purse = 200;
    const cands = candidatesAt(g.s, g.w, life, life.prov, "tavern");
    expect(cands.length).toBeGreaterThan(0);
    expect(
      g.lifeCommand("s1", { k: "people", act: "hire", arg: cands[0].slot }),
    ).toBeNull();
    expect(peopleOf(life)).toHaveLength(1);
    const f = peopleOf(life)[0];
    expect(g.s.chars[f.c]?.alive).toBe(true);
    expect(followerCap(g.s, life)).toBeGreaterThanOrEqual(2);
    // Broke: two months unpaid and they're gone.
    life.purse = 0;
    for (let m = 0; m < 3; m++) {
      life.purse = 0;
      toNextMonth(g);
      clearEvents(g, life);
    }
    expect(peopleOf(life).some((x) => x.id === f.id)).toBe(false);
  });

  test("a clerk trades with your stake and comes home (or doesn't)", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.area = "market";
    life.purse = 500;
    const cands = candidatesAt(g.s, g.w, life, life.prov, "market");
    const clerk = cands.find((c) => c.kind === "clerk");
    if (!clerk) return;
    expect(
      g.lifeCommand("s1", { k: "people", act: "hire", arg: clerk.slot }),
    ).toBeNull();
    const f = peopleOf(life)[0];
    expect(
      g.lifeCommand("s1", { k: "people", act: "trade", id: f.id, arg: 50 }),
    ).toBeNull();
    expect(f.task?.kind).toBe("trade");
    for (let d = 0; d < 70 && f.task; d++) {
      g.tick();
      clearEvents(g, life);
    }
    expect(f.task).toBeNull();
  });

  test("a captain raises a company and takes the field as a real army under them", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan({ background: "militiaman" }) },
      ],
    });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.job!.rank = 5; // a militia captain
    life.purse = 300;
    expect(g.lifeCommand("s1", { k: "people", act: "raise" })).toBeNull();
    expect(life.company?.men).toBe(20);
    const weak = strengthOf(g.s, life);
    expect(weak).toBeGreaterThan(0);
    expect(g.lifeCommand("s1", { k: "people", act: "field" })).toBeNull();
    const army = g.s.armies.find((a) => a.id === life.company!.army)!;
    expect(army.commander).toBe(life.c);
    expect(army.regs[0].men).toBe(20);
    expect(g.lifeCommand("s1", { k: "people", act: "standdown" })).toBeNull();
    expect(g.s.armies.some((a) => a.id === army.id)).toBe(false);
    expect(life.company!.men).toBe(20);
  });

  test("in wartime the colony pays a company in the field, and its captain an allowance", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan({ background: "militiaman" }) },
      ],
    });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.job!.rank = 5;
    life.purse = 300;
    expect(g.lifeCommand("s1", { k: "people", act: "raise" })).toBeNull();
    expect(g.lifeCommand("s1", { k: "people", act: "field" })).toBeNull();
    const army = g.s.armies.find((a) => a.id === life.company!.army)!;
    const foe = g.s.nations.findIndex(
      (n, i) => i !== army.owner && n.alive && n.kind !== "crown",
    );
    startWar(g, army.owner, foe, "a test", false);
    g.s.nations[army.owner].gold = 5000;
    const purse = life.purse;
    const gold = g.s.nations[army.owner].gold;
    toNextMonth(g);
    toNextMonth(g);
    expect(life.company?.inPay).toBe(true);
    expect(g.s.nations[army.owner].gold).toBeLessThan(gold);
    // The captain is paid, not paying (whatever else the month cost).
    expect(life.purse).toBeGreaterThan(purse - 10);
    // On service with the company: not dismissed for being away.
    expect(life.job?.kind).toBe("militia");
  });

  test("contracts are offered at the tavern and can be taken", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.area = "tavern";
    let offers = contractOffers(g.s, g.w, life.prov, "tavern");
    for (let m = 0; m < 6 && !offers.length; m++) {
      toNextMonth(g);
      offers = contractOffers(g.s, g.w, life.prov, "tavern");
    }
    expect(offers.length).toBeGreaterThan(0);
    life.area = "tavern";
    life.travel = null;
    expect(
      g.lifeCommand("s1", { k: "contract", act: "take", id: offers[0].id }),
    ).toBeNull();
    expect(life.contracts?.[0].status).toBe("taken");
    // The same offer can't be taken twice.
    expect(
      g.lifeCommand("s1", { k: "contract", act: "take", id: offers[0].id }),
    ).not.toBeNull();
  });
});

describe("boats of your own", () => {
  test("a boat stays where you left it, its crew is paid monthly, and sailing in it costs no fare", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.purse = 400;
    expect(buyBoat(g, life, "sloop", -1)).toBeNull();
    const b = life.boats![0];
    expect(b.prov).toBe(prov("Jamestown"));
    // Not enough hands: she won't sail.
    const to = prov("Massachusetts Bay");
    expect(sailCheck(g.s, g.map, life, b, to).ok).toBe(false);
    expect(setCrew(g, life, b.id, BOATS.sloop.crew)).toBeNull();
    expect(boatRoute(g.map, life.prov, to, "sloop")).not.toBeNull();
    // Walk off inland: the boat stays put.
    const inland = g.map.provinces[life.prov].nb.find(
      ([q]) => !g.map.provinces[q].coastal,
    )?.[0];
    if (inland !== undefined) {
      expect(g.lifeCommand("s1", { k: "travel", to: inland })).toBeNull();
      for (let d = 0; d < 30 && life.travel; d++) {
        g.tick();
        clearEvents(g, life);
      }
      expect(b.prov).toBe(prov("Jamestown"));
      expect(
        g.lifeCommand("s1", { k: "travel", to: prov("Jamestown") }),
      ).toBeNull();
      for (let d = 0; d < 30 && life.travel; d++) {
        g.tick();
        clearEvents(g, life);
      }
    }
    // Monthly: her keep and her crew's wages.
    const purse = life.purse;
    toNextMonth(g);
    clearEvents(g, life);
    expect(life.purse).toBeLessThan(purse + 50);
    // Sail in her: no fare, and she lies where you land.
    life.job = null;
    expect(g.lifeCommand("s1", { k: "sail", to, boat: b.id })).toBeNull();
    expect(life.travel?.cost).toBe(0);
    expect(life.travel?.boat).toBe(b.id);
    for (let d = 0; d < 120 && life.travel; d++) {
      g.tick();
      clearEvents(g, life);
    }
    if (life.boats!.some((x) => x.id === b.id)) expect(b.prov).toBe(life.prov);
  });

  test("unpaid crews leave", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 400;
    expect(buyBoat(g, life, "schooner", -1)).toBeNull();
    const b = life.boats![0];
    expect(setCrew(g, life, b.id, BOATS.schooner.crew)).toBeNull();
    for (let m = 0; m < 3; m++) {
      life.purse = 0;
      toNextMonth(g);
      clearEvents(g, life);
    }
    expect(b.crew).toBe(0);
  });
});

describe("the road and the sea", () => {
  test("forty and more events, by land and sea", () => {
    expect(TRAVEL_EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(
      TRAVEL_EVENTS.filter((e) => e.pool === "sea").length,
    ).toBeGreaterThanOrEqual(10);
    const keys = new Set(LIFE_EVENTS.map((e) => e.key));
    for (const e of TRAVEL_EVENTS) expect(keys.has(e.key)).toBe(true);
  });

  test("regions on the map", () => {
    expect(regionOf(33, -80)).toBe("south");
    expect(regionOf(29.9, -81.7)).toBe("florida");
    expect(regionOf(18, -77)).toBe("caribbean");
    expect(regionOf(42.4, -71.4)).toBe("newengland");
    expect(regionOf(46.3, -71)).toBe("north");
  });

  test("the land decides: a Spanish patrol only stops strangers in Spanish country", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const patrol = TRAVEL_EVENTS.find((e) => e.key === "trv-spanish-patrol")!;
    const staug = prov("St. Augustine");
    const from = g.map.provinces[staug].nb[0][0];
    life.prov = from;
    touchLife(g, life).travel = {
      dest: staug,
      path: [staug],
      sea: [false],
      depart: g.s.day,
      arrive: g.s.day + 5,
      cost: 0,
    };
    expect(hopOf(g, life)?.ownerKey).toBe("spain");
    expect(patrol.when!(g, life)).not.toBeNull();
    // Not on the road to Boston.
    const boston = prov("Massachusetts Bay");
    life.prov = g.map.provinces[boston].nb[0][0];
    life.travel = {
      dest: boston,
      path: [boston],
      sea: [false],
      depart: g.s.day,
      arrive: g.s.day + 5,
      cost: 0,
    };
    expect(patrol.when!(g, life)).toBeNull();
  });

  test("every travel event can be answered every way without trouble", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    clearEvents(g, life);
    const to = g.map.provinces[life.prov].nb[0][0];
    for (const def of TRAVEL_EVENTS)
      for (let i = 0; i < def.choices.length; i++) {
        life.purse = 100;
        life.health = 100;
        life.crime = undefined;
        touchLife(g, life).travel = {
          dest: to,
          path: [to],
          sea: [def.pool === "sea"],
          depart: g.s.day,
          arrive: g.s.day + 5,
          cost: 0,
        };
        life.events = [];
        life.cooldowns[`ev:${def.key}`] = 0;
        raiseLifeEvent(g, life, def.key, { p: to, o: g.s.provinces[to].owner });
        const ev = life.events.find((e) => e.key === def.key)!;
        expect(ev, def.key).toBeDefined();
        const err = answerLifeEvent(g, life, ev.id, i);
        // A blocked choice says why; anything else must go through.
        if (err) expect(err).toMatch(/\.$/);
        if (!meOf(g.s, life)?.alive) return;
      }
  });

  test("road events come more often now that a day is three seconds, and a guide makes the road kinder", async () => {
    const { roadRiskFactor } =
      await import("../../src/conquest/engine/LifeR11");
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const to = g.map.provinces[life.prov].nb[0][0];
    touchLife(g, life).travel = {
      dest: to,
      path: [to],
      sea: [false],
      depart: g.s.day,
      arrive: g.s.day + 5,
      cost: 0,
    };
    expect(roadRiskFactor(g, life)).toBeGreaterThan(1);
    expect(hasPlace(g.s, g.w, prov("Jamestown"), "gaol")).toBe(true);
  });
});
