// DLC (r21): the Derp Store's items for Conquest, in the engine.
// - 1776: The Revolution: the world of 1 January 1776 (the United Colonies
//   in rebellion, British America, the British crown), the war's beats on
//   their real dates (the Declaration, New York, France and Spain at war,
//   Yorktown, the Treaty of Paris and its cessions) and the end in 1784;
//   sides and the turncoat's price; a commission and spying rolled by the
//   odds they show.
// - Legends: rumours as rare as they say, each step rolled by the odds the
//   page shows, endings by their chances, a trail gone cold after three
//   failures, sacred places that give nothing to take, the Fountain's
//   lasting mark, and a player's legends kept from other seats.
// The delta carries it all; a save loads; the same seed runs the same.

import { describe, expect, test } from "vitest";
import { maxHealthOf } from "../../src/conquest/engine/Body";
import { dayOf } from "../../src/conquest/engine/Calendar";
import {
  beatDay,
  BEATS,
  britainOf,
  campaignOf,
  cdice,
  COMMISSION,
  commissionCheck,
  commissionOdds,
  isCampaign,
  kingOf,
  sideCheck,
  sideOf,
  SPY,
  spyCheck,
  spyOdds,
  TURNCOAT,
  usOf,
} from "../../src/conquest/engine/Campaign1776";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeForOthers } from "../../src/conquest/engine/IntrigueCore";
import {
  askOdds,
  canHear,
  ldice,
  LEGEND_RULES,
  LEGENDS,
  legendsOn,
  pickOutcome,
  progressOf,
  rememberRumour,
  rumourChance,
  setLegendsOwned,
  stepOdds,
  stepProvinces,
  workCheck,
} from "../../src/conquest/engine/Legends";
import { FOUNTAIN } from "../../src/conquest/engine/LegendsData";
import { meOf, skillLevel } from "../../src/conquest/engine/LifeQueries";
import { checkChance } from "../../src/conquest/engine/LifeRules";
import { atWar, provincesOf } from "../../src/conquest/engine/Queries";
import { PLUNDER_FINDS } from "../../src/conquest/engine/SacredPlunder"; // CQ24 (r24)
import type { GameState, Life } from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

const cmd = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, c as never);

function answerAll(g: ConquestGame, life: Life, choice = 0): void {
  for (const ev of [...life.events]) {
    const e = g.lifeCommand(life.seat, { k: "event", id: ev.id, choice });
    if (e) g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: 0 });
  }
}

const key = (s: GameState, k: string) =>
  s.nations.findIndex((n) => n.key === k);

/** A game that begins in 1776, with a colonist of Plymouth. */
function game1776(seed = 5) {
  const g = world({
    start: 1776,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: prov("Plymouth"), age: 28 }),
      },
    ],
  });
  return { g, s: g.s, life: lifeOf(g) };
}

/** Tick until `day` (answering nothing). */
function until(g: ConquestGame, day: number): void {
  while (!g.s.over && g.s.day < day) {
    g.tick();
    g.takeDelta();
  }
}

// ---------------------------------------------------------------- 1776

describe("1776: The Revolution", () => {
  test("the world of 1 January 1776: the colonies at war with the King", () => {
    const { s, life } = game1776();
    expect(isCampaign(s)).toBe(true);
    expect(s.day).toBe(dayOf(1776));
    expect(s.settings.endYear).toBe(1784);
    const us = usOf(s);
    const king = kingOf(s);
    const br = britainOf(s);
    expect(us).toBe(key(s, "england"));
    expect(s.nations[us].name).toBe("the United Colonies");
    expect(s.nations[us].rebelling).toBe(true);
    expect(s.nations[us].rebellion?.since).toBe(dayOf(1775, 3, 19));
    expect(s.nations[us].desk?.rev).toBeTruthy();
    expect(s.nations[us].flag?.division).toBe("continental");
    expect(s.nations[br]).toMatchObject({
      key: "britain",
      name: "British America",
      kind: "power",
    });
    expect(key(s, "crown-britain")).toBeGreaterThanOrEqual(0);
    expect(s.nations[king].name).toBe("the British crown");
    expect(atWar(s, us, king)).toBe(true);
    expect(atWar(s, us, br)).toBe(true);
    // Boston besieged (the King's army holds it); Montreal taken.
    expect(s.provinces[prov("Massachusetts Bay")].occupier).toBe(king);
    expect(s.provinces[prov("Hochelaga")].occupier).toBe(us);
    // The thirteen colonies and the loyal ones.
    const usProvs = provincesOf(s, us).map((p) => map.provinces[p].name);
    for (const p of [
      "Fort Christina",
      "New Amsterdam",
      "Charles Town",
      "Jamestown",
    ])
      expect(usProvs).toContain(p);
    for (const p of ["Quebec", "St. Augustine", "Jamaica"])
      expect(s.provinces[prov(p)].owner).toBe(br);
    // The player is asked their side; Norfolk's burning is the first morning's news.
    expect(life.events.map((e) => e.key)).toContain("r76-sides");
    const { g: g1, s: s1 } = game1776();
    g1.tick();
    expect(campaignOf(s1)?.beats.norfolk).toBe(dayOf(1776));
    expect(
      (g1.takeDelta().events ?? []).some(
        (e) => e.k === "news" && e.text.startsWith("Norfolk in ashes"),
      ),
    ).toBe(true);
    // Any other start isn't the campaign.
    const other = world({ start: 1650 }).s;
    expect(isCampaign(other)).toBe(false);
    expect(key(other, "britain")).toBe(-1);
    expect(other.settings.endYear).toBe(1776);
  });

  test("the war's beats come on their dates, through the peace to 1784", () => {
    const { g, s } = game1776();
    const us = usOf(s);
    const king = kingOf(s);
    const br = britainOf(s);
    const france = key(s, "france");
    const spain = key(s, "spain");
    // The Declaration renames them.
    until(g, dayOf(1776, 6, 3));
    expect(s.nations[us].name).toBe("the United Colonies");
    until(g, dayOf(1776, 6, 5));
    expect(s.nations[us].name).toBe("the United States");
    // New York falls in September 1776.
    until(g, dayOf(1776, 8, 16));
    expect(s.provinces[prov("New Amsterdam")].occupier).toBe(king);
    // France at war with Britain from the summer of 1778, Spain from 1779.
    until(g, dayOf(1778, 6, 1));
    expect(atWar(s, france, br)).toBe(true);
    until(g, dayOf(1779, 7, 1));
    expect(atWar(s, spain, br)).toBe(true);
    // Yorktown.
    until(g, dayOf(1781, 9, 20));
    expect(campaignOf(s)?.beats.yorktown).toBe(dayOf(1781, 9, 19));
    // The Treaty of Paris.
    until(g, dayOf(1783, 8, 4));
    expect(s.nations[us].independent).toBe(true);
    expect(s.nations[us].rebelling).toBe(false);
    expect(atWar(s, us, king)).toBe(false);
    expect(atWar(s, france, br)).toBe(false);
    for (const p of ["St. Augustine", "Pensacola", "Mobile"])
      expect(s.provinces[prov(p)].owner, p).toBe(spain);
    expect(s.provinces[prov("Tobago")].owner).toBe(france);
    expect(s.provinces[prov("Cahokia")].owner).toBe(us);
    // The game ends on 1 January 1784, every beat on its day.
    until(g, dayOf(1785));
    expect(s.over).toBe(true);
    expect(s.day).toBe(dayOf(1784));
    for (const b of BEATS)
      expect(campaignOf(s)?.beats[b.key], b.key).toBe(beatDay(b));
  }, 120_000);

  test("sides: choosing, the turncoat's price, and the governor's desk sends you to the war's page", () => {
    const { g, s, life } = game1776();
    answerAll(g, life, 2); // keep your head down for now
    expect(sideOf(s, life)).toBe("neutral");
    expect(cmd(g, life, { k: "r76", act: "side", arg: "patriot" })).toBeNull();
    expect(sideOf(s, life)).toBe("patriot");
    life.renown = 20;
    const before = life.renown;
    expect(cmd(g, life, { k: "r76", act: "side", arg: "loyal" })).toBeNull();
    expect(sideOf(s, life)).toBe("loyal");
    expect(life.r76?.turned).toBe(1);
    // GOV's own +favour for the King's side; the turncoat's renown.
    expect(life.renown).toBeCloseTo(before + TURNCOAT.renown, 5);
    expect(sideCheck(s, life, "patriot").ok).toBe(false);
    expect(cmd(g, life, { k: "r76", act: "side", arg: "patriot" })).toMatch(
      /this year/,
    );
    expect(cmd(g, life, { k: "desk", act: "side", arg: "patriot" })).toMatch(
      /Society › The war/,
    );
  });

  test("a commission is given by the odds it shows", () => {
    let given = 0;
    let tried = 0;
    for (const seed of [3, 4, 5, 6, 7, 8]) {
      const { g, s, life } = game1776(seed);
      answerAll(g, life, 0); // a patriot
      expect(sideOf(s, life)).toBe("patriot");
      life.purse = 50;
      // The Continental Army's headquarters is at Plymouth when the game begins.
      expect(commissionCheck(s, life).ok).toBe(true);
      const { odds, rank } = commissionOdds(s, life);
      const lead = skillLevel(s, life, "leadership");
      expect(odds.parts[0].value).toBeCloseTo(
        checkChance(lead, COMMISSION.leadershipDc),
        5,
      );
      const will = cdice(s, 0x11, life.c, s.day).chance(odds.total);
      const purse = life.purse;
      expect(cmd(g, life, { k: "r76", act: "commission" })).toBeNull();
      tried++;
      if (will) {
        given++;
        expect(life.job).toMatchObject({
          kind: "soldier",
          rank,
          nation: usOf(s),
        });
        expect(life.purse).toBe(purse - COMMISSION.cost);
      } else {
        expect(life.job?.kind === "soldier" && life.job.rank >= 3).toBe(false);
        expect(life.purse).toBe(purse);
        expect(commissionCheck(s, life).ok).toBe(false); // once a season
      }
    }
    expect(tried).toBe(6);
    expect(given).toBeGreaterThanOrEqual(0);
    // The dice the commission rolls come up as often as the odds say.
    const { s } = game1776();
    for (const p of [0.25, 0.5, 0.8]) {
      let hits = 0;
      const n = 4000;
      for (let d = 0; d < n; d++)
        if (cdice({ ...s, day: s.day + d }, 0x11, 1, s.day + d).chance(p))
          hits++;
      expect(Math.abs(hits / n - p)).toBeLessThan(0.03);
    }
  });

  test("spying, where the King holds the town: a report by the odds shown", () => {
    const { g, s, life } = game1776();
    answerAll(g, life, 0);
    expect(spyCheck(s, life).ok).toBe(false); // Plymouth is the patriots'
    life.prov = prov("Massachusetts Bay"); // Boston, the King's army in it
    expect(spyCheck(s, life).ok).toBe(true);
    const o = spyOdds(s, life);
    expect(o.pass).toBeCloseTo(
      checkChance(skillLevel(s, life, "stealth"), SPY.dc),
      5,
    );
    expect(o.caught).toBeCloseTo((1 - o.pass) * SPY.caught, 5);
    const will = cdice(s, 0x22, life.c, s.day).chance(o.pass);
    expect(cmd(g, life, { k: "r76", act: "spy" })).toBeNull();
    expect((life.r76?.reports ?? 0) > 0).toBe(will);
    expect(spyCheck(s, life).ok).toBe(false); // lie low a while
    // Nobody else sees a spy's reports.
    const seen = lifeForOthers(life);
    expect(seen.r76?.reports).toBeUndefined();
    expect(seen.r76?.spied).toBeUndefined();
  });

  test("the delta carries the campaign, a save loads, and the same seed runs the same", () => {
    const a = game1776(9);
    const b = game1776(9);
    const mine = JSON.parse(JSON.stringify(a.s)) as GameState;
    a.g.takeDelta();
    for (let i = 0; i < 200; i++) {
      a.g.tick();
      b.g.tick();
      applyDelta(mine, a.g.takeDelta());
      b.g.takeDelta();
    }
    expect(mine.nations[usOf(mine)].r76).toEqual(a.s.nations[usOf(a.s)].r76);
    expect(mine.nations[usOf(mine)].name).toBe(a.s.nations[usOf(a.s)].name);
    expect(JSON.stringify(b.s.provinces)).toBe(JSON.stringify(a.s.provinces));
    const saved = JSON.parse(JSON.stringify(a.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    until(g2, dayOf(1776, 6, 5));
    expect(g2.s.nations[usOf(g2.s)].name).toBe("the United States");
  });
});

// ---------------------------------------------------------------- Legends

/** A world of 1700 whose player owns Legends. */
function legendsWorld(owned = true) {
  const g = world({
    start: 1700,
    seed: 11,
    plans: [{ seat: "s1", name: "Alden", plan: plan({ age: 30 }) }],
  });
  setLegendsOwned(g, "s1", owned);
  return { g, s: g.s, life: lifeOf(g) };
}

describe("Legends", () => {
  test("only an owner hears of them, and as rarely as the page says", () => {
    const off = legendsWorld(false);
    expect(legendsOn(off.life)).toBe(false);
    expect(rumourChance(off.s, off.g.w, off.life).total).toBe(0);
    const { g, s, life } = legendsWorld();
    expect(legendsOn(life)).toBe(true);
    const r = rumourChance(s, g.w, life);
    expect([
      LEGEND_RULES.rumour,
      LEGEND_RULES.rumour * LEGEND_RULES.region,
    ]).toContain(r.total);
    expect(LEGEND_RULES.rumour).toBeLessThanOrEqual(1 / 60);
    // The month's roll comes up as often as the chance.
    let hits = 0;
    const n = 30000;
    for (let d = 0; d < n; d++)
      if (
        ldice({ ...s, day: s.day + d }, 0x01, life.c, s.day + d).chance(r.total)
      )
        hits++;
    expect(Math.abs(hits / n - r.total)).toBeLessThan(0.006);
    // And when it does, the scene asks (made certain here to see it come).
    const was = LEGEND_RULES.rumour;
    try {
      (LEGEND_RULES as { rumour: number }).rumour = 1;
      toNextMonth(g);
      toNextMonth(g);
    } finally {
      (LEGEND_RULES as { rumour: number }).rumour = was;
    }
    expect(life.events.some((e) => e.key === "legend-rumour")).toBe(true);
    // Asking after old stories: the odds shown are the check's, then a third.
    expect(askOdds(s, life)).toBeCloseTo(
      checkChance(skillLevel(s, life, "persuasion"), LEGEND_RULES.ask.dc) *
        LEGEND_RULES.ask.then,
      5,
    );
  });

  test("each step is rolled by the odds shown, and three failures send a trail cold", () => {
    const { g, s, life } = legendsWorld();
    const i = LEGENDS.findIndex((d) => d.key === "fountain");
    const def = LEGENDS[i];
    rememberRumour(g, life, i, life.prov);
    expect(progressOf(life, "fountain")).toMatchObject({ step: 0, tries: 0 });
    // Find a town where its first step can be worked (an archive).
    life.purse = 500;
    const at = stepProvinces(s, g.w, def, 0).find((p) => {
      life.prov = p;
      return workCheck(s, g.w, life, "fountain").ok;
    });
    expect(at).toBeDefined();
    life.prov = at!;
    const odds = stepOdds(s, g.w, life, def, 0);
    expect(odds.chance).toBeCloseTo(
      checkChance(odds.level + odds.bonus, def.steps[0].dc),
      5,
    );
    // Try on days whose roll fails (as the odds say most will, untrained).
    for (let t = 1; t <= LEGEND_RULES.tries; t++) {
      const x = progressOf(life, "fountain")!;
      while (
        s.day < x.next ||
        ldice(s, 0x03, life.c, s.day, i, 0).chance(
          stepOdds(s, g.w, life, def, 0).chance,
        )
      ) {
        g.tick();
        g.takeDelta();
        life.prov = at!;
        life.travel = null;
      }
      expect(
        cmd(g, life, { k: "legend", act: "work", key: "fountain" }),
      ).toBeNull();
      expect(progressOf(life, "fountain")!.tries).toBe(t);
    }
    expect(progressOf(life, "fountain")!.cold).toBe(s.day);
    expect(workCheck(s, g.w, life, "fountain").ok).toBe(false);
    // A cold trail can't be heard of again for years.
    expect(canHear(s, g.w, life, def)).toBe(false);
  });

  test("a step passed moves the trail on", () => {
    const { g, s, life } = legendsWorld();
    const i = LEGENDS.findIndex((d) => d.key === "roanoke");
    const def = LEGENDS[i];
    rememberRumour(g, life, i, life.prov);
    life.purse = 500;
    const at = stepProvinces(s, g.w, def, 0).find((p) => {
      life.prov = p;
      return workCheck(s, g.w, life, "roanoke").ok;
    });
    expect(at).toBeDefined();
    // Wait for a day whose roll passes.
    let guard = 0;
    while (
      !ldice(s, 0x03, life.c, s.day, i, 0).chance(
        stepOdds(s, g.w, life, def, 0).chance,
      )
    ) {
      g.tick();
      g.takeDelta();
      life.prov = at!;
      life.travel = null;
      expect(++guard).toBeLessThan(400);
    }
    const purse = life.purse;
    expect(
      cmd(g, life, { k: "legend", act: "work", key: "roanoke" }),
    ).toBeNull();
    expect(progressOf(life, "roanoke")).toMatchObject({ step: 1, tries: 0 });
    expect(life.purse).toBe(purse - def.steps[0].cost);
  });

  test("endings come by their chances; the Fountain's water is rare, and lasts", () => {
    for (const def of LEGENDS) {
      const sum = def.outcomes.reduce((m, o) => m + o.chance, 0);
      expect(sum, def.key).toBeCloseTo(1, 9);
      const n = 12000;
      const counts = new Map<string, number>();
      for (let k = 0; k < n; k++) {
        const o = pickOutcome(def, (k + 0.5) / n);
        counts.set(o.key, (counts.get(o.key) ?? 0) + 1);
      }
      for (const o of def.outcomes)
        expect(
          Math.abs((counts.get(o.key) ?? 0) / n - o.chance),
          `${def.key} ${o.key}`,
        ).toBeLessThan(0.002);
      // Every step is a hard one.
      for (const st of def.steps)
        expect(st.dc, `${def.key} ${st.title}`).toBeGreaterThanOrEqual(13);
    }
    const fountain = LEGENDS.find((d) => d.key === "fountain")!;
    expect(fountain.outcomes.find((o) => o.waters)?.chance).toBeCloseTo(
      1 / 12,
      9,
    );
    // The water puts the body's decline off: at 60, as if 52.
    const { s, life } = legendsWorld();
    const me = meOf(s, life)!;
    me.born = s.day - 60 * 365 - 10;
    const without = maxHealthOf(s, me, life).total;
    life.legends = { list: [], waters: me.id };
    const withIt = maxHealthOf(s, me, life).total;
    expect(withIt).toBeGreaterThan(without);
    me.born = s.day - (60 - FOUNTAIN.years) * 365 - 10;
    life.legends = undefined;
    expect(maxHealthOf(s, me, life).total).toBe(withIt);
  });

  // CQ24 (r24): kept on the trail's own road, or plundered (the plunder's
  // own tests are in ConquestCq24.test.ts).
  test("sacred places are learned and kept, or plundered", () => {
    const sacred = LEGENDS.filter((d) => d.kind === "sacred");
    expect(sacred.map((d) => d.key).sort()).toEqual(
      ["bdote", "cahokia", "kituwah", "pahasapa", "serpent"].sort(),
    );
    for (const d of sacred) {
      expect(d.people, d.key).toBeTruthy();
      // Kept: the walk with an elder pays no coins, and asks your promise.
      for (const o of d.outcomes) {
        expect(o.coins, d.key).toBeUndefined();
        expect(o.keep, d.key).toBe(true);
      }
      // Plundered: what a dig may find, by its chances.
      const finds = PLUNDER_FINDS[d.key];
      expect(finds?.length, d.key).toBeGreaterThan(1);
      expect(
        finds.reduce((m, f) => m + f.chance, 0),
        d.key,
      ).toBeCloseTo(1, 9);
      expect(
        finds.some((f) => f.coins[1] > 0),
        d.key,
      ).toBe(true);
    }
  });

  test("a player's legends are their own: other seats never see them, the delta carries them", () => {
    const { g, life } = legendsWorld();
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    rememberRumour(g, life, 0, life.prov);
    applyDelta(mine, g.takeDelta());
    expect(mine.lives[0].legends).toEqual(life.legends);
    expect(lifeForOthers(life).legends).toBeUndefined();
    // An old save (before r21) loads with no legends, and they come once owned.
    const old = JSON.parse(
      JSON.stringify(world({ start: 1700 }).s),
    ) as GameState;
    for (const l of old.lives) {
      delete l.legends;
      delete l.dlc;
    }
    const g3 = new ConquestGame(map, old);
    ticks(g3, 40);
    expect(legendsOn(lifeOf(g3))).toBe(false);
    setLegendsOwned(g3, "s1", true);
    expect(legendsOn(lifeOf(g3))).toBe(true);
  });
});
