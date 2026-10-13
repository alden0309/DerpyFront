// WAR (r17): towns that change hands. Occupations nobody could end are
// mended (a third nation relieving a friend's town, a town with no owner
// but an occupier, allies' wars against a rising that was over); a lost
// town becomes a claim, weighted by its size, a capital, the years and its
// people, that fades; the computer goes to war for a claim when it's strong
// enough (and not when it isn't), marches on it and asks for it at the
// peace; a town under foreign rule ferments, a plot forms, its first night
// is rolled at the odds shown, and held six months it goes back to its old
// owner; a player there can stir it up, join, lead or inform; old saves
// load; the delta carries it; the same seed runs the same.

import { describe, expect, test } from "vitest";
import { runAi } from "../../src/conquest/engine/Ai";
import { cede } from "../../src/conquest/engine/Crown";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  hooks,
  provinceTaken,
  takenHow,
} from "../../src/conquest/engine/Hooks";
import { endRising, rise } from "../../src/conquest/engine/Movements";
import {
  atWar,
  provincesOf,
  truceUntil,
  warBetween,
  warCheck,
  warScore,
} from "../../src/conquest/engine/Queries";
import {
  formPlot,
  INFORM,
  mendOccupations,
  plotInform,
  plotJoin,
  plotLead,
  plotOf,
  reclaimMonthly,
  stirTown,
} from "../../src/conquest/engine/Reclaim";
import {
  CLAIM,
  claimLive,
  claimOf,
  claimPull,
  FERMENT,
  fermentTarget,
  reclaimOf,
  RISING,
  risingOdds,
  townRisingOf,
  yokeOf,
} from "../../src/conquest/engine/ReclaimCore";
import { DAYS_PER_YEAR } from "../../src/conquest/engine/Rules";
import type { Movement } from "../../src/conquest/engine/Types";
import { addRegiment, startWar } from "../../src/conquest/engine/War";
import { lifeOf, map, plan, prov, ticks, toNextMonth } from "./LifeUtil";

const SA = prov("St. Augustine");

function nationKey(g: ConquestGame, key: string): number {
  const i = g.s.nations.findIndex((n) => n.key === key);
  if (i < 0) throw new Error(`no nation ${key}`);
  return i;
}

/** 1700, a Spanish townsman of St. Augustine, the world quiet unless asked. */
function augustine(o: { ai?: boolean; seed?: number; english?: boolean } = {}) {
  const g = ConquestGame.create(
    map,
    { endYear: 1776, difficulty: "normal", seed: o.seed ?? 7, start: 1700 },
    [
      {
        seat: "s1",
        name: "Alden",
        plan: plan(
          o.english
            ? { home: prov("Jamestown") }
            : {
                origin: "spain",
                home: SA,
                religion: "catholic",
                first: "Diego",
                family: "Ortiz",
              },
        ),
      },
    ],
  );
  g.aiEnabled = o.ai ?? false;
  const life = lifeOf(g);
  return {
    g,
    life,
    spain: nationKey(g, "spain"),
    england: nationKey(g, "england"),
    muscogee: nationKey(g, "muscogee"),
  };
}

function clearArmies(g: ConquestGame, n: number): void {
  for (const a of [...g.s.armies]) if (a.owner === n) g.removeArmy(a);
}

/** England takes St. Augustine from Spain at a peace (in 1700, before Queen Anne's War). */
function englishAugustine() {
  const w = augustine();
  ticks(w.g, 2);
  cede(w.g, SA, w.england);
  return w;
}

/** What a value is now, past the narrowing of an assignment just above. */
const statusOf = (m: Movement): Movement["status"] => m.status;
const nightOf = (tr: { night?: string }): string | undefined => tr.night;

/** A month's turn of the track alone, on a later day (its dice are the day's). */
function month(g: ConquestGame): void {
  g.s.day += 30;
  reclaimMonthly(g);
}

// ---------------------------------------------------------------- occupations nobody could end

describe("occupations nobody could end are mended", () => {
  test("a third nation that storms a town someone else holds, at peace with its owner, hands it back", () => {
    const { g, spain, england, muscogee } = augustine();
    startWar(g, england, spain, "test", false);
    startWar(g, muscogee, england, "test", false);
    expect(atWar(g.s, muscogee, spain)).toBe(false);
    const pr = g.prov(SA);
    pr.occupier = england;
    pr.b.fort = 0;
    clearArmies(g, england);
    addRegiment(g, muscogee, SA, "warriors");
    addRegiment(g, muscogee, SA, "warriors");
    pr.siege = { by: muscogee, start: g.s.day - 40, progress: 99.9 };
    g.tick();
    expect(g.s.provinces[SA].occupier).toBe(-1);
    expect(g.s.provinces[SA].owner).toBe(spain);
  });

  test("an occupation with no war behind it ends at the month's turn", () => {
    const { g, spain, muscogee } = augustine();
    g.prov(SA).occupier = muscogee;
    expect(atWar(g.s, spain, muscogee)).toBe(false);
    mendOccupations(g);
    expect(g.s.provinces[SA].occupier).toBe(-1);
    expect(g.s.provinces[SA].owner).toBe(spain);
  });

  test("a town with no owner but an occupier becomes the occupier's, with a claim for the people who live there", () => {
    const { g, spain, muscogee } = augustine();
    const pr = g.prov(SA);
    pr.owner = -1;
    pr.occupier = muscogee;
    mendOccupations(g);
    expect(g.s.provinces[SA].owner).toBe(muscogee);
    expect(g.s.provinces[SA].occupier).toBe(-1);
    const c = claimOf(g.s, spain, SA);
    expect(c?.how).toBe("mended");
    expect(c!.base).toBeGreaterThan(CLAIM.war);
    // Once only, however many months it's mended.
    mendOccupations(g);
    expect(
      reclaimOf(g.s).claims.filter((x) => x.p === SA && x.by === spain),
    ).toHaveLength(1);
    // Its Spanish townsfolk, under the Muscogee, cut off from their own, stir.
    month(g);
    const y = yokeOf(g.s, SA)!;
    expect(y.old).toBe(spain);
    expect(
      y.parts.some((p) => /colonists under the Muscogee/.test(p.label)),
    ).toBe(true);
    expect(y.target).toBeGreaterThan(60);
  });

  test("an occupation in a real war is left alone", () => {
    const { g, spain, england } = augustine();
    startWar(g, england, spain, "test", false);
    g.prov(SA).occupier = england;
    mendOccupations(g);
    expect(g.s.provinces[SA].occupier).toBe(england);
  });

  test("when a rising is over, the wars of those who took the government's side end too", () => {
    const { g, england } = augustine();
    const jt = prov("Jamestown");
    const m: Movement = {
      id: g.nextId(),
      key: "own",
      name: "The Test Association",
      goal: "reform",
      against: england,
      people: -1,
      region: [jt],
      founded: g.s.day,
      leader: g.s.nations[england].ruler,
      members: [],
      support: 60,
      arms: 0,
      status: "brewing",
      rebels: -1,
      rose: -1,
      ended: -1,
      due: -1,
      fades: g.s.day + 999,
      text: "",
    };
    g.s.movements.push(m);
    rise(g, m);
    expect(m.status).toBe("risen");
    // An ally comes in on the government's side.
    const ally = g.s.nations.find((n) => n.kind === "native" && n.alive)!.id;
    startWar(g, ally, m.rebels, "Defending England", false);
    endRising(g, m);
    expect(g.s.wars.some((w) => w.a === m.rebels || w.b === m.rebels)).toBe(
      false,
    );
  });

  test("a change of hands is told once, however many places tell it", () => {
    const { g } = augustine();
    let heard = 0;
    hooks.provinceTaken.push(() => heard++);
    provinceTaken(g, SA, 1, 2);
    provinceTaken(g, SA, 1, 2);
    hooks.provinceTaken.pop();
    expect(heard).toBe(1);
  });
});

// ---------------------------------------------------------------- claims

describe("claims on lost towns", () => {
  test("a town taken leaves its old owner a claim by its size, the years and its people", () => {
    const { g, spain, england } = englishAugustine();
    const c = claimOf(g.s, spain, SA)!;
    expect(c).toBeDefined();
    expect(c.from).toBe(england);
    const labels = c.parts.map((x) => x.label).join(" | ");
    expect(labels).toMatch(/Its size/);
    expect(labels).toMatch(/Theirs since before anyone remembers/);
    expect(labels).toMatch(/their own/);
    // Spanish townsfolk, held since before the game: worth a war.
    expect(c.base).toBeGreaterThanOrEqual(CLAIM.war);
    expect(claimPull(g.s, spain, SA)).toBeGreaterThan(0);
    expect(claimPull(g.s, spain, prov("Havana"))).toBe(0);
  });

  test("a capital counts, a sale leaves none, and a town held under three years leaves none", () => {
    const { g, spain, england } = englishAugustine();
    // Back to Spain a year later: England held it a year, so no claim.
    ticks(g, DAYS_PER_YEAR);
    cede(g, SA, spain);
    expect(claimOf(g.s, spain, SA)).toBeUndefined();
    expect(claimOf(g.s, england, SA)).toBeUndefined();
    // Havana, Spain's capital.
    const hav = prov("Havana");
    cede(g, hav, england);
    const c = claimOf(g.s, spain, hav)!;
    expect(c.parts.some((x) => x.label === "Their capital")).toBe(true);
    // A native town taken at a peace leaves its people a claim; one sold, none.
    const natives = g.s.provinces
      .map((pr, p) => ({ pr, p }))
      .filter(
        ({ pr }) =>
          pr.owner >= 0 &&
          g.s.nations[pr.owner].kind === "native" &&
          pr.pops.some((x) => x.cls === "tribe" && x.size > 300),
      );
    const taken = natives[0];
    const sold = natives.find((x) => x.pr.owner !== taken.pr.owner)!;
    const loser = taken.pr.owner;
    cede(g, taken.p, england);
    expect(claimOf(g.s, loser, taken.p)).toBeDefined();
    const seller = sold.pr.owner;
    takenHow.how = "bought";
    g.prov(sold.p).owner = england;
    provinceTaken(g, sold.p, seller, england);
    takenHow.how = "";
    expect(claimOf(g.s, seller, sold.p)).toBeUndefined();
    expect(reclaimOf(g.s).held[sold.p]).toBe(g.s.day);
  });

  test("a claim keeps its strength ten years, fades to nothing by thirty, and a lost war halves it", () => {
    const { g, spain } = englishAugustine();
    const c = claimOf(g.s, spain, SA)!;
    const day0 = g.s.day;
    expect(claimLive(g.s, c).total).toBe(c.base);
    g.s.day = day0 + 9 * DAYS_PER_YEAR;
    expect(claimLive(g.s, c).total).toBe(c.base);
    g.s.day = day0 + 20 * DAYS_PER_YEAR;
    expect(claimLive(g.s, c).total).toBeCloseTo(c.base / 2, 0);
    g.s.day = day0 + 30 * DAYS_PER_YEAR + 1;
    expect(claimLive(g.s, c).total).toBe(0);
    g.s.day = day0;
    c.tries = 1;
    expect(claimLive(g.s, c).total).toBeCloseTo(c.base / 2, 0);
  });

  test("a war for a claim that ends without the town weakens it; after two it's given up", () => {
    const { g, spain, england } = englishAugustine();
    const c = claimOf(g.s, spain, SA)!;
    c.war = g.s.day;
    month(g); // not at war: the war that was is over, without the town
    expect(claimOf(g.s, spain, SA)!.tries).toBe(1);
    claimOf(g.s, spain, SA)!.war = g.s.day;
    month(g);
    expect(claimOf(g.s, spain, SA)).toBeUndefined();
    void england;
  });
});

// ---------------------------------------------------------------- reconquest

describe("reconquest", () => {
  /** The Muscogee hold St. Augustine; Spain claims it. */
  function muscogeeAugustine(spainStrong: boolean) {
    const w = augustine({ ai: true });
    ticks(w.g, 2);
    cede(w.g, SA, w.muscogee);
    const g = w.g;
    g.s.wars = g.s.wars.filter((x) => x.a !== w.spain && x.b !== w.spain);
    g.s.truces = [];
    g.s.treaties = g.s.treaties.filter(
      (x) => ![x.a, x.b].includes(w.spain) || ![x.a, x.b].includes(w.muscogee),
    );
    g.nation(w.muscogee).overlord = -1;
    clearArmies(g, w.spain);
    clearArmies(g, w.muscogee);
    const cuba = prov("Havana");
    for (let i = 0; i < (spainStrong ? 30 : 1); i++)
      addRegiment(g, w.spain, cuba, "regulars");
    if (!spainStrong)
      for (let i = 0; i < 30; i++)
        addRegiment(g, w.muscogee, prov("Coweta"), "warriors");
    return w;
  }

  test("a strong power goes to war to take a town back", () => {
    const { g, spain, muscogee } = muscogeeAugustine(true);
    expect(claimLive(g.s, claimOf(g.s, spain, SA)!).total).toBeGreaterThan(
      CLAIM.war,
    );
    let war = false;
    for (let i = 0; i < 120 && !war; i++) {
      month(g);
      war = !!warBetween(g.s, spain, muscogee);
    }
    expect(war).toBe(true);
    expect(warBetween(g.s, spain, muscogee)!.why).toBe(
      "To take back St. Augustine",
    );
    expect(claimOf(g.s, spain, SA)!.war).toBeDefined();
  });

  test("a weak one doesn't", () => {
    const { g, spain, muscogee } = muscogeeAugustine(false);
    for (let i = 0; i < 120; i++) month(g);
    expect(warBetween(g.s, spain, muscogee)).toBeUndefined();
  });

  test("at the peace it asks for the town it claims, and gets it back", () => {
    const { g, spain, muscogee } = muscogeeAugustine(true);
    startWar(g, spain, muscogee, "To take back St. Augustine", false);
    const war = warBetween(g.s, spain, muscogee)!;
    war.start = g.s.day - 8 * 30;
    const side = war.a === spain ? 0 : 1;
    war.won[side] = 5;
    g.prov(SA).occupier = spain;
    runAi(g, spain);
    expect(g.s.provinces[SA].owner).toBe(spain);
    expect(claimOf(g.s, spain, SA)).toBeUndefined();
    // The Muscogee held it three years among Spanish townsfolk: a weak claim at most.
    const theirs = claimOf(g.s, muscogee, SA);
    expect(theirs ? claimLive(g.s, theirs).total : 0).toBeLessThan(CLAIM.war);
  });

  test("a winner holding a capital they won't give up makes peace without it, rather than fight on for ever", () => {
    const { g, england, muscogee } = augustine();
    const cap = g.s.nations[muscogee].capital;
    expect(provincesOf(g.s, muscogee).length).toBeGreaterThan(1);
    startWar(g, england, muscogee, "test", false);
    const war = warBetween(g.s, england, muscogee)!;
    war.start = g.s.day - 40 * 30;
    war.won[war.a === england ? 0 : 1] = 10;
    g.prov(cap).occupier = england;
    expect(warScore(g.s, war, england).total).toBeGreaterThanOrEqual(25);
    runAi(g, england);
    expect(atWar(g.s, england, muscogee)).toBe(false);
    expect(g.s.provinces[cap].owner).toBe(muscogee);
  });
});

// ---------------------------------------------------------------- the ferment

describe("a town under foreign rule ferments", () => {
  test("another tongue and faith, loyal to the old owner, no garrison and newly taken push it up; a garrison and the years bring it down", () => {
    const { g, spain, england } = englishAugustine();
    month(g);
    const y = yokeOf(g.s, SA)!;
    expect(y).toBeDefined();
    expect(y.old).toBe(spain);
    expect(y.ruler).toBe(england);
    const labels = y.parts.map((p) => p.label).join(" | ");
    expect(labels).toMatch(/another tongue/);
    expect(labels).toMatch(/another faith/);
    expect(labels).toMatch(/loyal to/);
    expect(labels).toMatch(/No soldiers/);
    expect(labels).toMatch(/Newly taken/);
    const bare = fermentTarget(g.s, g.w, SA, england, spain).total;
    for (let i = 0; i < 4; i++) addRegiment(g, england, SA, "regulars");
    const held = fermentTarget(g.s, g.w, SA, england, spain).total;
    expect(held).toBeLessThan(bare - 15);
    clearArmies(g, england);
    // A war with the old owner (and its army near) pushes it up.
    startWar(g, spain, england, "test", false);
    addRegiment(g, spain, prov("Timucua"), "regulars");
    const war = fermentTarget(g.s, g.w, SA, england, spain);
    expect(war.total).toBeGreaterThan(bare + FERMENT.oldAtWar);
    expect(war.parts.some((p) => /army near/.test(p.label))).toBe(true);
    // Years on, they're used to it.
    g.s.day += 20 * DAYS_PER_YEAR;
    g.s.wars = [];
    const later = fermentTarget(g.s, g.w, SA, england, spain).total;
    expect(later).toBeLessThan(bare - 10);
  });

  test("it moves an eighth of the way to its target each month", () => {
    const { g } = englishAugustine();
    month(g);
    const y = yokeOf(g.s, SA)!;
    y.ferment = 0;
    month(g);
    const y2 = yokeOf(g.s, SA)!;
    expect(y2.ferment).toBeCloseTo(y2.target * FERMENT.step, 0);
  });

  test("past 70 a plot forms, and the townsfolk living there are asked", () => {
    const { g, life } = englishAugustine();
    month(g);
    let m: Movement | undefined;
    for (let i = 0; i < 24 && !m; i++) {
      yokeOf(g.s, SA)!.ferment = 95;
      month(g);
      m = plotOf(g, yokeOf(g.s, SA));
    }
    expect(m).toBeDefined();
    expect(m!.status).toBe("brewing");
    expect(m!.region).toEqual([SA]);
    expect(townRisingOf(g.s, m!)?.aim).toBe("restore");
    expect(life.events.some((e) => e.key === "town-plot")).toBe(true);
  });
});

// ---------------------------------------------------------------- the rising

describe("a town's rising", () => {
  function plotted(o: { garrison?: number } = {}) {
    const w = englishAugustine();
    month(w.g);
    const y = yokeOf(w.g.s, SA)!;
    y.ferment = 90;
    const m = formPlot(w.g, y);
    clearArmies(w.g, w.england);
    for (let i = 0; i < (o.garrison ?? 0); i++)
      addRegiment(w.g, w.england, SA, "regulars");
    return { ...w, y, m };
  }

  test("its first night goes as often as the odds shown say", () => {
    const { g, m, england } = plotted({ garrison: 4 });
    const shown = risingOdds(g.s, g.w, m);
    expect(shown.found + shown.seize + shown.beaten).toBeCloseTo(1, 2);
    expect(shown.beaten).toBeGreaterThan(0.1);
    const seen = { found: 0, seized: 0, beaten: 0 };
    const N = 1500;
    const tr = townRisingOf(g.s, m)!;
    for (let i = 0; i < N; i++) {
      g.s.day += 1;
      tr.night = undefined;
      m.status = "brewing";
      const before = g.s.nations.length;
      const go = hooks.risingBegins.map((h) => h(g, m)).includes(false);
      seen[nightOf(tr) as keyof typeof seen]++;
      // Put the garrison back as it was, and undo anything that went ahead.
      expect(g.s.nations.length).toBe(before);
      void go;
      clearArmies(g, england);
      for (let k = 0; k < 4; k++) addRegiment(g, england, SA, "regulars");
    }
    expect(seen.found / N).toBeCloseTo(shown.found, 1);
    expect(seen.seized / N).toBeCloseTo(shown.seize, 1);
    expect(seen.beaten / N).toBeCloseTo(shown.beaten, 1);
  });

  test("held six months, the town goes back to its old owner", () => {
    const { g, m, spain, england, life } = plotted();
    // Make sure its first night goes its way.
    const tr = townRisingOf(g.s, m)!;
    let tries = 0;
    do {
      tr.night = undefined;
      m.status = "brewing";
      g.s.day++;
      rise(g, m);
      tries++;
    } while (statusOf(m) !== "risen" && tries < 50);
    expect(m.status).toBe("risen");
    expect(g.s.provinces[SA].occupier).toBe(m.rebels);
    for (let i = 0; i < RISING.holdMonths + 1 && statusOf(m) === "risen"; i++)
      toNextMonth(g);
    expect(m.status).toBe("won");
    expect(g.s.provinces[SA].owner).toBe(spain);
    expect(claimOf(g.s, spain, SA)).toBeUndefined();
    expect(atWar(g.s, m.rebels, england)).toBe(false);
    // England lets it be for some years: no taking it straight back.
    expect(truceUntil(g.s, england, spain)).toBeGreaterThan(
      g.s.day + (RISING.truceYears - 1) * DAYS_PER_YEAR,
    );
    expect(warCheck(g.s, england, spain).ok).toBe(false);
    expect(
      life.milestones.some(
        (x) => x.kind === "taken" && /St. Augustine went back to/.test(x.text),
      ),
    ).toBe(true);
  });

  test("found out, the ringleaders are taken and the town is cowed for years", () => {
    const { g, m, y } = plotted();
    const tr = townRisingOf(g.s, m)!;
    let tries = 0;
    do {
      tr.night = undefined;
      m.status = "brewing";
      g.s.day++;
      hooks.risingBegins.forEach((h) => h(g, m));
      tries++;
    } while (tr.night !== "found" && tries < 200);
    expect(tr.night).toBe("found");
    expect(m.status).toBe("crushed");
    month(g);
    const y2 = yokeOf(g.s, SA)!;
    expect(y2.cowed).toBeGreaterThan(g.s.day + 4 * DAYS_PER_YEAR);
    expect(y2.ferment).toBeLessThan(25);
    expect(y2.parts.some((p) => /Cowed/.test(p.label))).toBe(true);
    void y;
  });
});

// ---------------------------------------------------------------- a player's part

describe("a player in a town under foreign rule", () => {
  function inTown() {
    const w = englishAugustine();
    month(w.g);
    w.life.prov = SA;
    w.life.travel = null;
    return w;
  }

  test("stirs the town up (a test of persuasion), once a month", () => {
    const { g, life } = inTown();
    const y = yokeOf(g.s, SA)!;
    const before = y.ferment;
    expect(stirTown(g, life)).toBeNull();
    const add = yokeOf(g.s, SA)!.ferment - before;
    expect([FERMENT.stir, FERMENT.stirPoor]).toContain(Math.round(add));
    expect(stirTown(g, life)).toMatch(/month/);
  });

  test("joins a plot, or leads it and chooses a free town", () => {
    const { g, life } = inTown();
    const y = yokeOf(g.s, SA)!;
    y.ferment = 90;
    const m = formPlot(g, y);
    expect(plotJoin(g, life)).toBeNull();
    expect(m.members).toContain(life.c);
    expect(life.journal.some((j) => j.aff === "cause")).toBe(true);
    life.renown = 20;
    expect(plotLead(g, life)).toBeNull();
    expect(m.leader).toBe(life.c);
    expect(g.lifeCommand("s1", { k: "reclaim", act: "aim", aim: "free" })).toBe(
      null,
    );
    expect(townRisingOf(g.s, m)!.aim).toBe("free");
    expect(m.goal).toBe("free");
  });

  test("informs on a plot: its ringleaders taken, a reward, and the town cowed", () => {
    const { g, life } = inTown();
    const y = yokeOf(g.s, SA)!;
    y.ferment = 90;
    const m = formPlot(g, y);
    const purse = life.purse;
    expect(plotInform(g, life)).toBeNull();
    expect(m.status).toBe("crushed");
    expect(life.purse).toBeCloseTo(purse + INFORM.reward, 5);
    expect(life.milestones.some((x) => /Informed on/.test(x.text))).toBe(true);
    month(g);
    expect(yokeOf(g.s, SA)!.cowed).toBeGreaterThan(g.s.day);
  });

  test("left unanswered, the plot's scene keeps out of it", () => {
    const { g, life } = inTown();
    const y = yokeOf(g.s, SA)!;
    y.ferment = 90;
    const m = formPlot(g, y);
    const ev = life.events.find((e) => e.key === "town-plot")!;
    expect(ev).toBeDefined();
    expect(ev.body).toMatch(/If it rises/);
    ev.expires = g.s.day;
    g.tick();
    expect(m.members).not.toContain(life.c);
    expect(m.status).toBe("brewing");
  });
});

// ---------------------------------------------------------------- saves and the delta

describe("saves, the delta, and the same seed", () => {
  test("an old save (with no claims at all) loads and plays on", () => {
    const { g } = englishAugustine();
    const old = JSON.parse(JSON.stringify(g.s));
    delete old.reclaim;
    const again = new ConquestGame(map, old);
    ticks(again, 70);
    expect(again.s.reclaim).toBeDefined();
    expect(again.s.provinces[SA].owner).toBe(g.s.provinces[SA].owner);
  });

  test("the delta carries the claims and the ferment to a player's copy", () => {
    const { g } = englishAugustine();
    const copy = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    month(g);
    applyDelta(copy, g.takeDelta());
    expect(copy.reclaim).toEqual(g.s.reclaim);
    expect(JSON.parse(JSON.stringify(g.s)).reclaim).toEqual(g.s.reclaim);
  });

  test("the same seed runs the same", { timeout: 120_000 }, () => {
    const run = () => {
      const { g } = augustine({ ai: true, english: true, seed: 11 });
      ticks(g, 2);
      cede(g, SA, nationKey(g, "england"));
      ticks(g, DAYS_PER_YEAR);
      return JSON.stringify(g.s.reclaim);
    };
    expect(run()).toBe(run());
  });
});
