// CROWN (r18): regiments from Europe, fortress garrisons, and a governor's
// petition for an expedition to take back a town. A crown at war sends
// regiments by its means and the stake, at the odds its table gives; they
// land and join its armies, and go home at the peace; the fortress
// garrisons stand from the start and are renewed every year while the crown
// holds the town; a petition's answer is rolled at exactly the odds shown; a
// granted expedition sails, lands and marches on the town, and can take it
// back (or fail); the computer's governors petition; a player who governs
// gets one up, others ask him, pay in and ride with it; a petition is its
// colony's secret until it sails; old saves load; the delta carries it; the
// same seed runs the same.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { runAi } from "../../src/conquest/engine/Ai";
import { dateOf, dayOf } from "../../src/conquest/engine/Calendar";
import { cede } from "../../src/conquest/engine/Crown";
import {
  askOf,
  claimedTowns,
  crownDeltaForSeat,
  crownOf,
  crownRegs,
  crownStateForSeat,
  EXPEDITION,
  expeditionOdds,
  FORT_MONTH,
  FORTS,
  garrisonArmy,
  isGarrison,
  MEANS,
  meansOf,
  sendOdds,
  STAKE,
  warStake,
} from "../../src/conquest/engine/CrownCore";
import {
  answerAsk,
  beginAsk,
  grantAsk,
  grantRoll,
  petitionsMonthly,
} from "../../src/conquest/engine/CrownPetition";
import { crownMonthly } from "../../src/conquest/engine/CrownRegiments";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeForOthers } from "../../src/conquest/engine/IntrigueCore";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { atWar, warBetween } from "../../src/conquest/engine/Queries";
import { claimLive, claimOf } from "../../src/conquest/engine/ReclaimCore";
import { DAYS_PER_YEAR } from "../../src/conquest/engine/Rules";
import type {
  CrownAsk,
  GameDelta,
  GameState,
} from "../../src/conquest/engine/Types";
import { endWar, startWar } from "../../src/conquest/engine/War";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const SA = prov("St. Augustine");
const HAVANA = prov("Havana");
const PENSACOLA = prov("Pensacola");

function nationKey(g: ConquestGame, key: string): number {
  const i = g.s.nations.findIndex((n) => n.key === key);
  if (i < 0) throw new Error(`no nation ${key}`);
  return i;
}

/** 1700, the world quiet unless asked; Spanish players at Havana if wanted. */
function quiet(
  o: { seed?: number; players?: number; start?: 1607 | 1650 | 1700 } = {},
) {
  const spanish = (seat: string, first: string) => ({
    seat,
    name: seat,
    plan: plan({
      origin: "spain",
      home: HAVANA,
      religion: "catholic",
      first,
      family: "Ortiz",
      age: 30,
    }),
  });
  const plans =
    o.players === 2
      ? [spanish("s1", "Diego"), spanish("s2", "Ana")]
      : o.players === 1
        ? [spanish("s1", "Diego")]
        : undefined;
  const g = world({ start: o.start ?? 1700, seed: o.seed ?? 7, plans });
  g.aiEnabled = false;
  return {
    g,
    spain: nationKey(g, "spain"),
    england: nationKey(g, "england"),
    france: nationKey(g, "france"),
    muscogee: nationKey(g, "muscogee"),
  };
}

/** St. Augustine taken from Spain by the Muscogee at a peace: Spain claims it. */
function muscogeeAugustine(o: { seed?: number; players?: number } = {}) {
  const w = quiet(o);
  cede(w.g, SA, w.muscogee);
  for (const a of [...w.g.s.armies])
    if (a.owner === w.muscogee) w.g.removeArmy(a);
  return w;
}

/** A blank petition, for reckoning odds without the state. */
function draft(n: number, p: number, by: number, id = 1): CrownAsk {
  return {
    id,
    n,
    p,
    holder: -1,
    by,
    begun: 0,
    sails: 0,
    answer: 0,
    stage: "sent",
    men: 0,
    gold: 0,
    paid: {},
    council: [],
    house: [],
    refused: [],
    court: 0,
    asked: [],
    riders: [],
  };
}

const json = (s: GameState) => JSON.stringify(s);

describe("CROWN r18: regiments from Europe in wartime", () => {
  test("a war begun brings regiments at the odds of the crown's means and the war's stake", () => {
    const { g, spain, france } = quiet();
    const s = g.s;
    const m = meansOf(s, spain)!;
    expect(m).toBeDefined();
    let sent = 0;
    let regs = 0;
    const tries = 600;
    const base = s.day;
    for (let k = 0; k < tries; k++) {
      s.day = base + k * 17 + 1;
      s.wars = [];
      s.crown!.sailing = [];
      startWar(g, spain, france, "A colonial quarrel", false);
      const before = crownOf(s).sailing.filter(
        (x) => x.n === spain && x.why === "war",
      ).length;
      crownMonthly(g);
      const now = crownOf(s).sailing.filter(
        (x) => x.n === spain && x.why === "war",
      );
      if (now.length > before) {
        sent++;
        regs += now[0].foot + now[0].guns;
      }
    }
    const w = warBetween(s, spain, france)!;
    const stake = warStake(s, spain, w).total;
    expect(stake).toBe(STAKE.power);
    const o = sendOdds(m, stake, true);
    expect(Math.abs(sent / tries - o.chance)).toBeLessThan(0.05);
    expect(regs / Math.max(1, sent)).toBe(o.regs);
  });

  test("they land at the colony's port, join its armies, are in the news, and go home at the peace", () => {
    const { g, spain, france } = quiet();
    const s = g.s;
    // A Europe war: the full stake.
    s.europe.wars[`${Math.min(spain, france)}-${Math.max(spain, france)}`] =
      s.day;
    startWar(g, spain, france, "War (in Europe)", true);
    let tries = 0;
    while (
      !crownOf(s).sailing.some((x) => x.n === spain && x.why === "war") &&
      tries++ < 200
    ) {
      s.day += 7;
      const r = s.crown?.sent[spain];
      if (r) r.wars = [];
      crownMonthly(g);
    }
    const sl = crownOf(s).sailing.find(
      (x) => x.n === spain && x.why === "war",
    )!;
    expect(sl).toBeDefined();
    expect(sl.arrive - sl.departed).toBeGreaterThanOrEqual(45);
    const news: string[] = [];
    const orig = g.event.bind(g);
    g.event = (e) => {
      if (e.k === "news") news.push(e.text);
      orig(e);
    };
    s.day = sl.arrive - 1;
    g.tick();
    const landed = s.armies.filter(
      (a) => a.owner === spain && a.regs.some((r) => r.crown === "war"),
    );
    expect(landed.length).toBe(1);
    expect(landed[0].prov).toBe(sl.port);
    expect(s.provinces[sl.port].owner).toBe(spain);
    expect(news.some((t) => /of Spanish foot.*landed at/.test(t))).toBe(true);
    expect(crownOf(s).sent[spain].total).toBeGreaterThanOrEqual(
      sl.foot + sl.guns,
    );
    // Their pay is on a line of the colony's own.
    g.tick();
    // The peace: they sail home.
    delete s.europe.wars[
      `${Math.min(spain, france)}-${Math.max(spain, france)}`
    ];
    endWar(g, spain, france);
    crownMonthly(g);
    expect(crownRegs(s, spain, "war")).toBe(0);
    expect(crownOf(s).sent[spain].home).toBeGreaterThanOrEqual(
      sl.foot + sl.guns,
    );
    expect(news.some((t) => /sail home from/.test(t))).toBe(true);
  });

  test("each crown by its age: Britain rarely before the 1750s and by the score after, France its marines, the Dutch few, Sweden none", () => {
    const { g, england, france } = quiet();
    const s = g.s;
    const at = (y: number) => {
      s.day = dayOf(y);
    };
    at(1640);
    const early = meansOf(s, england)!;
    at(1720);
    const mid = meansOf(s, england)!;
    at(1760);
    const late = meansOf(s, england)!;
    expect(early.chance).toBeLessThan(0.1);
    expect(mid.chance).toBeLessThan(0.5);
    expect(late.chance).toBeGreaterThan(0.8);
    expect(late.max).toBeGreaterThan(mid.max * 3);
    at(1690);
    expect(meansOf(s, france)!.season).toBeGreaterThan(0);
    at(1760);
    expect(meansOf(s, france)!.first).toBeGreaterThan(2);
    expect(MEANS.netherlands[0].max).toBeLessThanOrEqual(1);
    expect(MEANS.sweden).toBeUndefined();
    // A war with a native nation, a small stake: rarely and few.
    const o = sendOdds(late, STAKE.native, true);
    expect(o.chance).toBeLessThan(late.chance * 0.5);
  });

  test("a colony on its own (independent) has no crown to send for, and keeps none of its men", () => {
    const { g, spain } = quiet();
    const s = g.s;
    expect(crownRegs(s, spain, "fort")).toBeGreaterThan(0);
    g.nation(spain).independent = true;
    expect(meansOf(s, spain)).toBeUndefined();
    crownMonthly(g);
    expect(crownRegs(s, spain)).toBe(0);
  });
});

describe("CROWN r18: fortress garrisons", () => {
  test("Spain's fortresses (and France's marine posts) have their garrisons from the start", () => {
    const { g, spain } = quiet();
    const s = g.s;
    const hav = garrisonArmy(s, HAVANA)!;
    expect(hav.owner).toBe(spain);
    expect(Math.round(hav.regs.reduce((m, r) => m + r.men, 0))).toBe(
      FORTS.find((f) => f.name === "Havana")!.men,
    );
    expect(hav.regs.every((r) => r.crown === "fort")).toBe(true);
    expect(garrisonArmy(s, SA)).toBeDefined();
    const quebec = prov("Quebec");
    if (s.provinces[quebec].owner === nationKey(g, "france"))
      expect(garrisonArmy(s, quebec)).toBeDefined();
  });

  test("renewed each year with the fleet while Spain holds the town; lost, it sails home; won back, it comes again", () => {
    const { g, spain, england } = quiet();
    const s = g.s;
    const hav = garrisonArmy(s, HAVANA)!;
    for (const r of g.touch(hav).regs) r.men = Math.round(r.men / 2);
    // The next May.
    s.day = dayOf(dateOf(s.day).year + 1, FORT_MONTH);
    crownMonthly(g);
    const draft0 = crownOf(s).sailing.find(
      (x) => x.why === "fort" && x.fort === HAVANA,
    )!;
    expect(draft0).toBeDefined();
    expect(draft0.men).toBe(100);
    s.day = draft0.arrive - 1;
    g.tick();
    const after = garrisonArmy(s, HAVANA)!;
    expect(Math.round(after.regs.reduce((m, r) => m + r.men, 0))).toBe(200);
    // St. Augustine lost at a peace: its garrison sails for home.
    cede(g, SA, england);
    crownMonthly(g);
    expect(garrisonArmy(s, SA)).toBeUndefined();
    expect(
      s.armies.some((a) => a.prov === SA && a.regs.some((r) => r.crown)),
    ).toBe(false);
    // Back to Spain: next May's draft brings a garrison again.
    cede(g, SA, spain);
    s.day = dayOf(dateOf(s.day).year + 1, FORT_MONTH);
    crownMonthly(g);
    const d2 = crownOf(s).sailing.find(
      (x) => x.why === "fort" && x.fort === SA,
    );
    expect(d2).toBeDefined();
    s.day = d2!.arrive - 1;
    g.tick();
    expect(garrisonArmy(s, SA)).toBeDefined();
  });

  test("the computer never marches a garrison off, nor merges it into its field army", () => {
    const { g, spain, england } = quiet();
    const s = g.s;
    startWar(g, spain, england, "A colonial quarrel", false);
    const hav = garrisonArmy(s, HAVANA)!;
    for (let i = 0; i < 6; i++) {
      runAi(g, spain);
      ticks(g, 30);
    }
    const now = garrisonArmy(s, HAVANA)!;
    expect(now).toBeDefined();
    expect(now.id).toBe(hav.id);
    expect(now.prov).toBe(HAVANA);
    expect(isGarrison(s, now)).toBe(true);
    expect(now.regs.every((r) => r.crown === "fort")).toBe(true);
  });
});

describe("CROWN r18: a petition for an expedition", () => {
  test("its odds as shown are the odds it's answered at (3,000 answers)", () => {
    const { g, spain } = muscogeeAugustine();
    const s = g.s;
    const gov = s.nations[spain].ruler;
    const base = draft(spain, SA, gov);
    base.men = 1;
    base.council = [1];
    base.court = 1;
    const shown = expeditionOdds(s, map, spain, SA, base, gov).total;
    expect(shown).toBeGreaterThan(0.1);
    expect(shown).toBeLessThan(0.9);
    let yes = 0;
    const N = 3000;
    for (let i = 0; i < N; i++)
      if (grantRoll(s, map, { ...base, id: 1000 + i * 7 })) yes++;
    expect(Math.abs(yes / N - shown)).toBeLessThan(0.03);
    // What the page says each thing is worth is what it adds.
    const more = expeditionOdds(
      s,
      map,
      spain,
      SA,
      { ...base, council: [1, 2] },
      gov,
    ).total;
    expect(Math.round((more - shown) * 100)).toBe(
      Math.round(EXPEDITION.council * 100),
    );
  });

  test("in peace with another crown's colony the crown seldom grants it; at war, readily; in a truce, never", () => {
    const { g, spain, england } = quiet();
    const s = g.s;
    cede(g, SA, england);
    const gov = s.nations[spain].ruler;
    const peace = expeditionOdds(s, map, spain, SA, null, gov).total;
    s.truces = s.truces.filter(
      (t) =>
        !(
          (t.a === spain && t.b === england) ||
          (t.b === spain && t.a === england)
        ),
    );
    const peace2 = expeditionOdds(s, map, spain, SA, null, gov).total;
    startWar(g, spain, england, "A colonial quarrel", false);
    const war = expeditionOdds(s, map, spain, SA, null, gov).total;
    expect(peace2).toBeLessThan(0.25);
    expect(war).toBeGreaterThan(peace2 + 0.4);
    endWar(g, spain, england);
    expect(expeditionOdds(s, map, spain, SA, null, gov).total).toBe(0);
    void peace;
  });

  test("granted: the crown goes to war, the expedition sails, lands at the town, sits down before it, and takes it back", () => {
    const { g, spain, muscogee } = muscogeeAugustine();
    const s = g.s;
    const claim0 = claimLive(s, claimOf(s, spain, SA)!).total;
    expect(claim0).toBeGreaterThan(20);
    const gov = s.nations[spain].ruler;
    const a = beginAsk(g, spain, SA, gov, true);
    expect(a.stage).toBe("gathering");
    grantAsk(g, a);
    expect(atWar(s, spain, muscogee)).toBe(true);
    expect(warBetween(s, spain, muscogee)!.why).toBe(
      "To take back St. Augustine",
    );
    expect(a.stage).toBe("granted");
    const sl = crownOf(s).sailing.find(
      (x) => x.why === "exp" && x.ask === a.id,
    )!;
    expect(sl.port).toBe(SA);
    expect(sl.force).toBe(true);
    expect(sl.ships).toBeGreaterThan(0);
    s.day = sl.arrive - 1;
    g.tick();
    const cur = askOf(s, spain)!;
    expect(cur.stage).toBe("landed");
    const army = s.armies.find((x) => x.id === cur.army)!;
    expect(army.prov).toBe(SA);
    expect(army.regs.filter((r) => r.crown === "war").length).toBe(
      (cur.regs ?? 0) + (cur.guns ?? 0),
    );
    expect(army.commander).toBeGreaterThanOrEqual(0);
    // No one to stop it: the siege, and the town held.
    for (let i = 0; i < 60 && s.provinces[SA].occupier !== spain; i++) g.tick();
    expect(s.provinces[SA].occupier).toBe(spain);
    const favor0 = s.nations[spain].favor;
    // The peace hands it over.
    cede(g, SA, spain);
    expect(askOf(s, spain)).toBeUndefined();
    const done = crownOf(s).past.find((x) => x.id === a.id)!;
    expect(done.stage).toBe("won");
    expect(s.nations[spain].mods.some((m) => m.key === "crown-won")).toBe(true);
    void favor0;
  });

  test("the computer marches an expedition that lands at a port on its town", () => {
    const { g, spain } = muscogeeAugustine();
    const s = g.s;
    const a = beginAsk(g, spain, SA, s.nations[spain].ruler, true);
    grantAsk(g, a);
    // Brought in at Pensacola instead (as if the town were inland).
    const sl = crownOf(s).sailing.find((x) => x.ask === a.id)!;
    sl.port = PENSACOLA;
    sl.force = false;
    s.day = sl.arrive - 1;
    g.tick();
    const army = s.armies.find((x) => x.id === askOf(s, spain)!.army)!;
    expect(army.prov).toBe(PENSACOLA);
    runAi(g, spain);
    const moved = s.armies.find((x) => x.id === army.id)!;
    expect(moved.path.length).toBeGreaterThan(0);
    expect(moved.path[moved.path.length - 1]).toBe(SA);
  });

  test("failed (its army broken): favour lost, the colony's too, and the claim halved", () => {
    const { g, spain } = muscogeeAugustine();
    const s = g.s;
    const c0 = claimLive(s, claimOf(s, spain, SA)!).total;
    const a = beginAsk(g, spain, SA, s.nations[spain].ruler, true);
    grantAsk(g, a);
    const sl = crownOf(s).sailing.find((x) => x.ask === a.id)!;
    s.day = sl.arrive - 1;
    g.tick();
    const army = s.armies.find((x) => x.id === askOf(s, spain)!.army)!;
    g.removeArmy(army);
    petitionsMonthly(g);
    const done = crownOf(s).past.find((x) => x.id === a.id)!;
    expect(done.stage).toBe("failed");
    expect(s.nations[spain].mods.some((m) => m.key === "crown-failed")).toBe(
      true,
    );
    const c = claimOf(s, spain, SA);
    expect(c ? claimLive(s, c).total : 0).toBeLessThanOrEqual(c0 / 2 + 0.1);
  });

  test("a truce made meanwhile makes it moot; refused outright, the colony's favour moves a little", () => {
    const { g, spain, england } = quiet();
    const s = g.s;
    cede(g, SA, england);
    s.truces = s.truces.filter(
      (t) =>
        !(
          (t.a === spain && t.b === england) ||
          (t.b === spain && t.a === england)
        ),
    );
    const a = beginAsk(g, spain, SA, s.nations[spain].ruler, true);
    s.truces.push({ a: spain, b: england, until: s.day + 5 * DAYS_PER_YEAR });
    g.tick();
    const moot = crownOf(s).past.find((x) => x.id === a.id)!;
    expect(moot.stage).toBe("dropped");
    expect(s.nations[spain].mods.some((m) => m.key === "crown-refused")).toBe(
      false,
    );
    // Refused at its odds: a roll that goes against it.
    s.truces = [];
    const b = beginAsk(g, spain, SA, s.nations[spain].ruler, true);
    let id = b.id;
    while (grantRoll(s, map, { ...b, id })) id += 1;
    b.id = id;
    answerAsk(g, b);
    const done = crownOf(s).past.find((x) => x.id === id)!;
    expect(done.stage).toBe("refused");
    expect(done.odds).toBeGreaterThan(0);
    expect(s.nations[spain].mods.some((m) => m.key === "crown-refused")).toBe(
      true,
    );
  });

  test("the computer's governors petition where it's sensible, and not where it isn't", () => {
    const { g, spain, england } = muscogeeAugustine();
    const s = g.s;
    g.aiEnabled = true;
    const gov = g.char(s.nations[spain].ruler);
    if (!gov.traits.includes("ambitious")) gov.traits.push("ambitious");
    expect(claimedTowns(s, spain).some((t) => t.p === SA)).toBe(true);
    petitionsMonthly(g);
    const a = askOf(s, spain);
    expect(a).toBeDefined();
    expect(a!.p).toBe(SA);
    expect(a!.npc).toBe(true);
    expect(a!.men + a!.gold).toBeGreaterThan(0);
    // England, with no claim, petitions for nothing.
    expect(askOf(s, england)).toBeUndefined();
  });

  test("a player who governs gets one up: the fee, letters, friends at court, the house's vote; another asks him and pays in, and is paid back when it's dropped", () => {
    const { g, spain } = muscogeeAugustine({ players: 2 });
    const s = g.s;
    const gov = lifeOf(g, "s1");
    const ana = lifeOf(g, "s2");
    g.nation(spain).ruler = gov.c;
    gov.purse = 100;
    ana.purse = 100;
    gov.renown = 30;
    ana.renown = 30;
    // Ana asks the governor.
    expect(g.lifeCommand("s2", { k: "crown", act: "ask", p: SA })).toBeNull();
    expect(
      gov.journal.some((j) => j.sec && /asks you to petition/.test(j.text)),
    ).toBe(true);
    expect(g.lifeCommand("s2", { k: "crown", act: "ask", p: SA })).toMatch(
      /lately/,
    );
    // He begins it.
    expect(g.lifeCommand("s1", { k: "crown", act: "begin", p: SA })).toBeNull();
    expect(gov.purse).toBe(100 - EXPEDITION.fee);
    const a = askOf(s, spain)!;
    expect(a.by).toBe(gov.c);
    expect(a.asked).toContain("s2");
    expect(g.lifeCommand("s1", { k: "crown", act: "letters" })).toBeNull();
    expect(
      a.council.length + a.house.length + a.refused.length,
    ).toBeGreaterThan(0);
    expect(g.lifeCommand("s1", { k: "crown", act: "letters" })).toMatch(
      /Again in/,
    );
    expect(g.lifeCommand("s1", { k: "crown", act: "court" })).toBeNull();
    expect(gov.purse).toBe(100 - EXPEDITION.fee - EXPEDITION.postage);
    expect(
      g.lifeCommand("s1", { k: "crown", act: "offer", men: 1, gold: 50 }),
    ).toBeNull();
    expect(a.voted !== undefined || a.balked !== undefined).toBe(true);
    // Ana pays in.
    expect(
      g.lifeCommand("s2", { k: "crown", act: "pledge", coins: 10 }),
    ).toBeNull();
    expect(ana.purse).toBe(90);
    expect(a.paid.s2).toBe(10);
    // The retainer is in the month's figure.
    // He lets it drop: Ana's coins come back.
    expect(g.lifeCommand("s1", { k: "crown", act: "drop" })).toBeNull();
    expect(askOf(s, spain)).toBeUndefined();
    expect(ana.purse).toBe(100);
  });

  test("granted to a player who governs: he chooses who leads it; another player rides with it, and leaves it by setting off alone", () => {
    const { g, spain } = muscogeeAugustine({ players: 2 });
    const s = g.s;
    const gov = lifeOf(g, "s1");
    const ana = lifeOf(g, "s2");
    g.nation(spain).ruler = gov.c;
    const a = beginAsk(g, spain, SA, gov.c, false);
    grantAsk(g, a);
    expect(gov.events.some((e) => e.key === "crown-granted")).toBe(true);
    const sl = crownOf(s).sailing.find((x) => x.ask === a.id)!;
    sl.port = PENSACOLA;
    sl.force = false;
    s.day = sl.arrive - 1;
    g.tick();
    const army = s.armies.find((x) => x.id === askOf(s, spain)!.army)!;
    // The crown's general leads it (he hasn't chosen to).
    expect(army.commander).not.toBe(gov.c);
    // Ana, at Pensacola, rides with it.
    ana.prov = PENSACOLA;
    ana.travel = null;
    expect(g.lifeCommand("s2", { k: "crown", act: "ride" })).toBeNull();
    expect(askOf(s, spain)!.riders).toContain("s2");
    // It marches; she goes with it.
    g.aiEnabled = true;
    runAi(g, spain);
    for (let i = 0; i < 40 && army.prov === PENSACOLA; i++) g.tick();
    expect(army.prov).not.toBe(PENSACOLA);
    expect(ana.prov).toBe(army.prov);
    // She sets off alone: she's left it.
    ana.travel = {
      dest: HAVANA,
      path: [HAVANA],
      sea: [true],
      depart: s.day,
      arrive: s.day + 30,
      cost: 0,
    };
    g.tick();
    expect(askOf(s, spain)?.riders ?? []).not.toContain("s2");
  });

  test("a petition is its colony's secret until the expedition sails; then everyone hears", () => {
    const { g, spain, england } = quiet({ players: 2 });
    const s = g.s;
    // Ana is English.
    const ana = lifeOf(g, "s2");
    g.char(ana.c).nation = england;
    cede(g, SA, england);
    const gov = lifeOf(g, "s1");
    g.nation(spain).ruler = gov.c;
    g.takeDelta();
    const a = beginAsk(g, spain, SA, gov.c, false);
    const d = g.takeDelta();
    expect(d.crown?.asks.length).toBe(1);
    expect(crownDeltaForSeat(s, d, "s2").crown!.asks.length).toBe(0);
    expect(crownDeltaForSeat(s, d, "s1").crown!.asks.length).toBe(1);
    expect(crownStateForSeat(s, "s2").crown!.asks.length).toBe(0);
    expect(crownStateForSeat(s, "s1").crown!.asks.length).toBe(1);
    // His own journal lines about it are his alone.
    g.lifeCommand("s1", { k: "crown", act: "court" });
    const others = lifeForOthers(gov);
    expect(others.journal.some((j) => /court/.test(j.text))).toBe(false);
    expect(
      Object.keys(others.cooldowns).some((k) => k.startsWith("crown:")),
    ).toBe(false);
    expect(Object.keys(gov.cooldowns).some((k) => k.startsWith("crown:"))).toBe(
      true,
    );
    // Granted: it sails, and the English governor of the town would hear.
    s.truces = [];
    grantAsk(g, a);
    expect(crownStateForSeat(s, "s2").crown!.asks.length).toBe(1);
  });
});

describe("CROWN r18: saves, the delta and the dice", () => {
  test("an old save (no crown at all) loads, and its garrisons stand at the month's turn", () => {
    const { g } = quiet();
    const old = JSON.parse(json(g.s)) as GameState;
    delete old.crown;
    for (const a of old.armies) {
      a.regs = a.regs.filter((r) => !r.crown);
      for (const r of a.regs) delete r.crown;
    }
    old.armies = old.armies.filter((a) => a.regs.length);
    const g2 = new ConquestGame(map, old);
    g2.aiEnabled = false;
    expect(() => {
      for (let i = 0; i < 40; i++) g2.tick();
    }).not.toThrow();
    expect(garrisonArmy(g2.s, HAVANA)).toBeDefined();
  });

  test("a save mid-expedition loads and runs on the same; the delta carries it to a player's copy", () => {
    const { g, spain } = muscogeeAugustine();
    const a = beginAsk(g, spain, SA, g.s.nations[spain].ruler, true);
    grantAsk(g, a);
    const copy = JSON.parse(json(g.s)) as GameState;
    g.takeDelta();
    const saved = json(g.s);
    const g2 = new ConquestGame(map, JSON.parse(saved) as GameState);
    g2.aiEnabled = false;
    for (let i = 0; i < 150; i++) {
      g.tick();
      g2.tick();
      applyDelta(copy, g.takeDelta());
    }
    expect(json(g2.s)).toBe(json(g.s));
    expect(JSON.stringify(copy.crown)).toBe(JSON.stringify(g.s.crown));
  });

  test("the same seed runs the same, regiments, garrisons, petitions and all", () => {
    const run = () => {
      const g = world({ start: 1700, seed: 11 });
      for (let i = 0; i < 2 * DAYS_PER_YEAR; i++) g.tick();
      return JSON.stringify({
        crown: g.s.crown,
        armies: g.s.armies,
        wars: g.s.wars,
      });
    };
    expect(run()).toBe(run());
  }, 60_000);
});

// ---------------------------------------------------------------- through the rooms server

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
  private id = 100;
  async cmd(c: object): Promise<string | null> {
    const id = this.id++;
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

describe("CROWN r18 through the rooms server: a petition is its colony's secret until it sails", () => {
  let server: http.Server;
  let url = "";
  const clock = 1_800_000_000_000;
  let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    rooms = new ConquestRooms(() => clock);
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

  test("Alden, who governs Spain, petitions for St. Augustine; Bea, of the English who hold it, sees nothing until the expedition sails", async () => {
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
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    bea.send({ t: "join", code: l.code });
    await joined;
    host.send({
      t: "plan",
      plan: plan({
        origin: "spain",
        home: HAVANA,
        religion: "catholic",
        first: "Diego",
        family: "Ortiz",
        age: 40,
      }),
    });
    bea.send({
      t: "plan",
      plan: plan({
        home: prov("Charles Town"),
        first: "Beatrice",
        family: "Cole",
        female: true,
        age: 32,
      }),
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    bea.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.filter((s) => s.ready).length >= 1);
    const games = [host.next("game"), bea.next("game")];
    host.send({ t: "start" });
    const [hg, bg] = await Promise.all(games);
    const paused = host.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    await paused;
    const game = rooms.rooms.get(l.code)!.game!;
    const s = game.s;
    const A = lifeOfSeat(s, hg.you)!;
    const spain = s.chars[A.c].nation;
    const england = s.nations.findIndex((n) => n.key === "england");
    expect(s.chars[lifeOfSeat(s, bg.you)!.c].nation).toBe(england);
    cede(game, SA, england);
    s.truces = [];
    game.nation(spain).ruler = A.c;
    A.purse = 60;
    expect(await host.cmd({ k: "crown", act: "begin", p: SA })).toBeNull();
    expect(await host.cmd({ k: "crown", act: "court" })).toBeNull();
    // His copy has it; hers doesn't, nor his journal's lines about it.
    expect(host.state().crown?.asks.length).toBe(1);
    const theirs = bea.state();
    expect(theirs.crown?.asks.length ?? 0).toBe(0);
    const hisLife = theirs.lives.find((x) => x.seat === hg.you)!;
    expect(hisLife.journal.some((j) => /petition/.test(j.text))).toBe(false);
    // She governs the English now: granted, it sails, and she hears.
    game.nation(england).ruler = lifeOfSeat(s, bg.you)!.c;
    grantAsk(game, askOf(s, spain)!);
    await bea.cmd({ k: "crown", act: "ride" });
    const after = bea.state();
    expect(after.crown?.asks.length).toBe(1);
    expect(after.crown?.asks[0].stage).toBe("granted");
    const hers = after.lives.find((x) => x.seat === bg.you)!;
    expect(hers.journal.some((j) => /Word from the sea/.test(j.text))).toBe(
      true,
    );
  });
});
