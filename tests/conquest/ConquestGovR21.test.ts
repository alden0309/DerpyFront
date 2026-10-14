// GOV (r21): expeditions (solo, with companions, a hired leader, two
// players together; discovery, a river, trade, an outpost, a mission, a
// raid and a port), grants from the treasury, the governor's desk (duties,
// a building programme, native affairs, the militia, pardons, the desk's
// matters), the question of independence (the house's division, the
// declaration, the crown's regiments going over, counties holding for the
// King, sides and their ends), and founding (for another crown, the first
// year's odds, the founder's mayoralty). The odds shown are the odds rolled;
// old saves load; the delta carries it; the same seed runs the same.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { ensureCabinet } from "../../src/conquest/engine/Council";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  costOf,
  draftOf,
  expedChanged as expedChangedFor,
  expedOdds,
  expedOf,
  expedState,
  hirelings,
  myExped,
  outcomeBands,
  RAID,
  targetsFor,
  workChance,
} from "../../src/conquest/engine/ExpedCore";
import {
  choiceChance,
  farScene,
  resolveByLeader,
  SCENES,
} from "../../src/conquest/engine/ExpedEvents";
import { grantOdds, grantsDaily } from "../../src/conquest/engine/ExpedGrant";
import { frontierCounty } from "../../src/conquest/engine/Expeditions";
import {
  completeSettlement,
  settlementSites,
} from "../../src/conquest/engine/Founding";
import { seasoningOdds } from "../../src/conquest/engine/FoundingR21";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  deskView,
  DUTIES,
  MUSTERS,
  PROGRAMMES,
  RANGERS,
} from "../../src/conquest/engine/GovDesk";
import { MATTER_KEYS } from "../../src/conquest/engine/GovEvents";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import {
  atWar,
  provincesOf,
  relationOf,
} from "../../src/conquest/engine/Queries";
import {
  holdOdds,
  REV,
  revDivision,
  risingAim,
} from "../../src/conquest/engine/Revolution";
import { officesIn } from "../../src/conquest/engine/SocietyCore";
import type {
  Expedition,
  GameDelta,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import {
  deltaForViewer,
  deltaIsPerViewer,
  stateForViewer,
} from "../../src/conquest/engine/Viewers";
import { addRegiment } from "../../src/conquest/engine/War";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

const JAMESTOWN = prov("Jamestown");

/** 1700 at Jamestown, the world quiet, a grown man with a full purse (and a second player if asked). */
function quiet(
  o: { seed?: number; players?: number; start?: 1607 | 1650 | 1700 } = {},
) {
  const plans = [
    { seat: "s1", name: "Alden", plan: plan({ age: 30 }) },
    ...(o.players === 2
      ? [
          {
            seat: "s2",
            name: "Bea",
            plan: plan({
              first: "Beatrice",
              family: "Cole",
              female: true,
              age: 28,
            }),
          },
        ]
      : []),
  ];
  const g = world({ start: o.start ?? 1700, seed: o.seed ?? 7, plans });
  g.aiEnabled = false;
  const a = lifeOf(g, "s1");
  a.purse = 400;
  return { g, s: g.s, a, england: g.s.chars[a.c].nation };
}

const cmd = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, c as never);

/** Answer whatever scenes are waiting (a given choice, else the first that isn't blocked). */
function answerAll(g: ConquestGame, life: Life, choice = 0): void {
  for (const ev of [...life.events]) {
    const e = g.lifeCommand(life.seat, { k: "event", id: ev.id, choice });
    if (e) g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: 0 });
  }
}

/** Run until the expeditions under way are home (answering scenes). */
function runHome(g: ConquestGame, lives: Life[], max = 600): void {
  for (let i = 0; i < max; i++) {
    for (const l of lives) answerAll(g, l);
    if (!expedOf(g.s).list.some((x) => x.stage !== "forming")) return;
    g.tick();
  }
}

/** The first native nation a colony borders, and one of its towns near. */
function nativeNear(g: ConquestGame, n: number) {
  const s = g.s;
  for (const p of provincesOf(s, n))
    for (const [q] of g.map.provinces[p].nb) {
      const o = s.provinces[q].owner;
      if (o >= 0 && s.nations[o].kind === "native") return { o, p: q };
    }
  throw new Error("no native neighbour");
}

/** A party at the far end (for rolling the work many times). */
function partyAt(
  g: ConquestGame,
  kind: Expedition["kind"],
  target: number,
  leader: number,
  id: number,
  men = 6,
): Expedition {
  return {
    id,
    kind,
    n: g.s.chars[leader].nation,
    by: "",
    leader,
    members: [],
    asked: [],
    hands: men - 1,
    men,
    people: [],
    from: JAMESTOWN,
    target,
    route: [JAMESTOWN, target],
    sea: [false],
    legs: [10],
    start: g.s.day - 10,
    arrive: g.s.day,
    home: g.s.day + 20,
    stage: "there",
    cost: 0,
    treasury: 0,
    scenes: [],
    edge: 0,
    lost: 0,
  };
}

describe("GOV r21: expeditions", () => {
  test("solo: a discovery planned, paid for, carried on the map there and back, and its maps for the colony", () => {
    const { g, s, a, england } = quiet();
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    expect(t).toBeDefined();
    const before = a.purse;
    expect(
      cmd(g, a, {
        k: "exped",
        act: "plan",
        kind: "discover",
        p: t.p,
        hands: 4,
      }),
    ).toBeNull();
    const x = myExped(s, a.seat)!;
    expect(x.stage).toBe("forming");
    const cost = costOf(s, g.map, draftOf(x), false).total;
    expect(cmd(g, a, { k: "exped", act: "go" })).toBeNull();
    expect(a.purse).toBeCloseTo(before - cost, 5);
    expect(x.stage).toBe("out");
    expect(a.travel?.exped).toBe(x.id);
    const seen = new Set<number>();
    for (let i = 0; i < 400 && expedOf(s).list.length; i++) {
      answerAll(g, a);
      g.tick();
      seen.add(a.prov);
    }
    expect(expedOf(s).list.length).toBe(0);
    const past = expedOf(s).past.slice(-1)[0];
    expect(past.kind).toBe("discover");
    // It went hop by hop: through more places than home and the far end.
    expect(seen.size).toBeGreaterThan(2);
    expect(a.prov).toBe(JAMESTOWN);
    expect(a.travel).toBeNull();
    if (past.result === "won" || past.result === "half")
      expect(s.nations[england].explored).toContain(t.p);
    expect(
      a.milestones.some((m) => /Explored|Led an expedition/.test(m.text)),
    ).toBe(true);
  });

  test("the odds shown are the odds rolled: the planner's chance is the far end's first way, and 2,000 parties come out at it", () => {
    const { g, s, a, england } = quiet();
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    const x0 = partyAt(g, "discover", t.p, a.c, 1_000_000);
    const shown = expedOdds(s, g.w, draftOf(x0), false);
    const p = workChance(s, g.w, draftOf(x0), s.day).p;
    expect(shown.outcomes[0].p).toBeCloseTo(p, 6);
    expect(shown.outcomes[1].p).toBeCloseTo(outcomeBands(p).half, 6);
    // One of the computer's leaders: the far end's first choice carries exactly his chance.
    const npc = Object.values(s.chars).find(
      (c) => c?.alive && c.nation === england && c.id !== a.c && !c.abroad,
    )!;
    const xn = partyAt(g, "discover", t.p, npc.id, 1_000_001);
    const pn = workChance(s, g.w, draftOf(xn), s.day).p;
    expect(choiceChance(g, xn, farScene("discover").choices[0])).toBeCloseTo(
      pn,
      6,
    );
    // Many parties under him, at the far end: as often as shown.
    const st = expedState(g);
    let won = 0;
    let half = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const x = partyAt(g, "discover", t.p, npc.id, 2_000_000 + i);
      st.list.push(x);
      resolveByLeader(g, x, farScene("discover"));
      if (x.result === "won") won++;
      if (x.result === "half") half++;
      st.list.pop();
    }
    const se = Math.sqrt((pn * (1 - pn)) / N);
    expect(Math.abs(won / N - pn)).toBeLessThan(4 * se + 0.005);
    const bh = outcomeBands(pn).half;
    expect(Math.abs(half / N - bh)).toBeLessThan(
      4 * Math.sqrt((bh * (1 - bh)) / N) + 0.005,
    );
  }, 60_000);

  test("a leader hired from the town goes for you: his fee, his own judgement on the way, word sent home", () => {
    const { g, s, a, england } = quiet();
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    let h = hirelings(s, a, "discover", 20).find((x) => !x.yours);
    if (!h) {
      const c = Object.values(s.chars).find(
        (c) =>
          c?.alive &&
          c.nation === england &&
          !c.abroad &&
          c.id !== a.c &&
          !lifeOfSeat(s, "s2"),
      )!;
      c.role = "hunter";
      (s.locals[JAMESTOWN] ??= []).push(c.id);
      h = hirelings(s, a, "discover", 20).find((x) => !x.yours)!;
    }
    expect(h.fee).toBeGreaterThan(0);
    const purse = a.purse;
    expect(
      cmd(g, a, {
        k: "exped",
        act: "go",
        kind: "discover",
        p: t.p,
        leader: h.c.id,
        hands: 3,
      }),
    ).toBeNull();
    const x = myExped(s, a.seat)!;
    expect(x.leader).toBe(h.c.id);
    expect(x.lseat).toBeUndefined();
    expect(purse - a.purse).toBeCloseTo(
      costOf(s, g.map, draftOf(x), true).total,
      5,
    );
    // You stay home; the party goes.
    expect(a.travel).toBeNull();
    const j0 = a.journal.length;
    runHome(g, [a]);
    expect(a.prov).toBe(JAMESTOWN);
    const news = a.journal
      .slice(j0)
      .map((j) => j.text)
      .join("\n");
    expect(news).toMatch(/is home at Jamestown/);
    expect(expedOf(s).past.slice(-1)[0].leader).toBe(h.c.id);
  });

  test("two players together: asked in a scene, carried together, and what it brings shared", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    const b = lifeOf(g, "s2");
    b.purse = 50;
    const { p } = nativeNear(g, england);
    expect(
      cmd(g, a, {
        k: "exped",
        act: "plan",
        kind: "trade",
        p,
        hands: 3,
        stake: 30,
      }),
    ).toBeNull();
    expect(cmd(g, a, { k: "exped", act: "invite", seat: "s2" })).toBeNull();
    const ev = b.events.find((e) => e.key === "exped-invite")!;
    expect(ev).toBeDefined();
    expect(cmd(g, b, { k: "event", id: ev.id, choice: 0 })).toBeNull();
    const x = myExped(s, a.seat)!;
    expect(x.members.map((m) => m.seat)).toEqual(["s2"]);
    expect(cmd(g, a, { k: "exped", act: "go" })).toBeNull();
    expect(b.travel?.exped).toBe(x.id);
    expect(a.travel?.exped).toBe(x.id);
    const purseB = b.purse;
    let together = 0;
    for (let i = 0; i < 400 && expedOf(s).list.length; i++) {
      answerAll(g, a);
      answerAll(g, b);
      g.tick();
      if (a.prov === b.prov) together++;
    }
    expect(together).toBeGreaterThan(5);
    const past = expedOf(s).past.slice(-1)[0];
    expect(past.members).toEqual(["s2"]);
    // A trade always brings something back: shared between the two.
    expect(
      b.journal.some((j) => /coins each from what it brought/.test(j.text)),
    ).toBe(true);
    void purseB;
    expect(b.prov).toBe(JAMESTOWN);
  });

  test("leave at the next stop: Halt takes a player out of the party (not its leader)", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    const b = lifeOf(g, "s2");
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    cmd(g, a, { k: "exped", act: "plan", kind: "discover", p: t.p, hands: 4 });
    cmd(g, a, { k: "exped", act: "invite", seat: "s2" });
    cmd(g, b, {
      k: "exped",
      act: "answer",
      id: myExped(s, a.seat)!.id,
      yes: true,
    });
    expect(cmd(g, a, { k: "exped", act: "go" })).toBeNull();
    const x = myExped(s, a.seat)!;
    expect(cmd(g, a, { k: "halt" })).toMatch(/lead/);
    expect(cmd(g, b, { k: "halt" })).toBeNull();
    expect(x.members.length).toBe(0);
    expect(b.travel?.exped).toBeUndefined();
    for (let i = 0; i < 60; i++) g.tick();
    expect(b.travel).toBeNull();
  });

  test("a grant: the computer's governor answers at the odds shown, and the gold pays for it", () => {
    const { g, s, a, england } = quiet();
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    s.nations[england].gold = 5000;
    cmd(g, a, { k: "exped", act: "plan", kind: "discover", p: t.p, hands: 4 });
    const x = myExped(s, a.seat)!;
    const ask = 30;
    const shown = grantOdds(s, g.w, a, x, ask, true).total;
    expect(shown).toBeGreaterThan(0.03);
    const st = expedState(g);
    let yes = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const id = 5_000_000 + i;
      st.asks.push({
        id,
        seat: a.seat,
        c: a.c,
        n: england,
        x: x.id,
        kind: "discover",
        target: t.p,
        gold: ask,
        day: s.day,
        answer: s.day,
        stage: "asked",
        byLetter: true,
      });
      grantsDaily(g);
      const r = st.asks.find((y) => y.id === id)!;
      if (r.stage === "granted") {
        yes++;
        x.grant = undefined;
        x.treasury = 0;
        x.leave = undefined;
      }
      st.asks = st.asks.filter((y) => y.id !== id);
      s.nations[england].gold = 5000;
    }
    expect(Math.abs(yes / N - shown)).toBeLessThan(
      4 * Math.sqrt((shown * (1 - shown)) / N) + 0.005,
    );
    // Granted, the gold goes into the expedition's chest, and pays.
    st.asks.push({
      id: 6_000_000,
      seat: a.seat,
      c: a.c,
      n: england,
      x: x.id,
      kind: "discover",
      target: t.p,
      gold: 20,
      day: s.day,
      answer: s.day,
      stage: "asked",
    });
    let tries = 0;
    while (st.asks.find((y) => y.id === 6_000_000)!.stage !== "granted") {
      const r = st.asks.find((y) => y.id === 6_000_000)!;
      r.stage = "asked";
      s.day++;
      r.answer = s.day;
      grantsDaily(g);
      if (++tries > 400) throw new Error("never granted");
    }
    expect(x.treasury).toBe(20);
    expect(s.nations[england].gold).toBe(4980);
    const purse = a.purse;
    const cost = costOf(s, g.map, draftOf(x), false).total;
    expect(cmd(g, a, { k: "exped", act: "go" })).toBeNull();
    expect(a.purse).toBeCloseTo(purse - Math.max(0, cost - 20), 5);
    expect(s.nations[england].gold).toBeCloseTo(
      4980 + Math.max(0, 20 - cost),
      5,
    );
  }, 60_000);

  test("a player who governs answers a grant in a scene; and sends one at the treasury's charge", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    const b = lifeOf(g, "s2");
    g.nation(england).ruler = b.c;
    s.nations[england].gold = 300;
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    cmd(g, a, { k: "exped", act: "plan", kind: "discover", p: t.p, hands: 4 });
    expect(cmd(g, a, { k: "exped", act: "ask", gold: 25 })).toBeNull();
    const ev = b.events.find((e) => e.key === "exped-grant")!;
    expect(ev).toBeDefined();
    expect(cmd(g, b, { k: "event", id: ev.id, choice: 1 })).toBeNull(); // half
    const x = myExped(s, a.seat)!;
    expect(x.grant).toBeDefined();
    expect(x.treasury).toBe(13);
    expect(s.nations[england].gold).toBe(287);
    // The governor's own, at the treasury's charge.
    const t2 = targetsFor(s, g.w, "outpost", england, b.prov)[0];
    const gold = s.nations[england].gold;
    const purse = b.purse;
    expect(
      cmd(g, b, {
        k: "exped",
        act: "go",
        kind: "outpost",
        p: t2.p,
        hands: 12,
        treasury: true,
      }),
    ).toBeNull();
    const y = myExped(s, b.seat)!;
    expect(b.purse).toBe(purse);
    expect(s.nations[england].gold).toBeLessThan(gold);
    expect(y.leave).toBe(true);
  });

  test("a raid: war at once or a war party later, as often as the table says; the town laid waste; the frontier answered", () => {
    const { g, s, a, england } = quiet();
    const { o, p } = nativeNear(g, england);
    let wars = 0;
    let parties = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      s.wars = s.wars.filter((w) => !(w.a === o || w.b === o));
      expedState(g).reprisals = [];
      const x = partyAt(g, "raid", p, a.c, 3_000_000 + i, 40);
      x.leave = true;
      expedState(g).list.push(x);
      SCENES.FAR.raid.choices[0].apply(g, x, true);
      expedState(g).list.pop();
      if (atWar(s, o, england)) wars++;
      else if (expedOf(s).reprisals.length) parties++;
    }
    const pWar = Math.min(
      0.9,
      RAID.war + (s.nations[o].strong ? RAID.warStrong : 0),
    );
    expect(Math.abs(wars / N - pWar)).toBeLessThan(
      4 * Math.sqrt((pWar * (1 - pWar)) / N) + 0.01,
    );
    const pParty = (1 - pWar) * RAID.reprisal;
    expect(Math.abs(parties / N - pParty)).toBeLessThan(
      4 * Math.sqrt((pParty * (1 - pParty)) / N) + 0.01,
    );
    expect(s.provinces[p].devastation).toBeGreaterThan(0.3);
    expect(
      relationOf(s, g.w, o, england).parts.some((x) =>
        /raid on/i.test(x.label),
      ),
    ).toBe(true);
    expect(s.nations[england].mods.some((m) => m.key === "r21:fear")).toBe(
      true,
    );
    // A war party falls on the county nearest, with a scene for whoever lives there.
    s.wars = s.wars.filter((w) => !(w.a === o || w.b === o));
    const county = frontierCounty(g, england, p);
    a.home = county;
    a.prov = county;
    a.travel = null;
    expedState(g).reprisals = [
      { n: o, against: england, p: county, day: s.day + 1, from: p },
    ];
    const ruin = s.provinces[county].devastation;
    g.tick();
    expect(s.provinces[county].devastation).toBeGreaterThan(ruin);
    expect(a.events.some((e) => e.key === "exped-reprisal")).toBe(true);
  }, 60_000);

  test("a private raid in peacetime: the law and London want words", () => {
    const { g, s, a, england } = quiet();
    const { o, p } = nativeNear(g, england);
    s.wars = s.wars.filter((w) => !(w.a === o || w.b === o));
    const x = partyAt(g, "raid", p, a.c, 4_000_000, 40);
    x.lseat = a.seat;
    expedState(g).list.push(x);
    const fav = a.favor;
    SCENES.FAR.raid.choices[0].apply(g, x, true);
    expect(a.crime?.heat[england] ?? 0).toBeGreaterThanOrEqual(
      RAID.privateHeat,
    );
    expect(a.favor).toBeLessThanOrEqual(fav);
    expect(
      s.nations[england].mods.some((m) => m.key === "r21:raid-shame"),
    ).toBe(true);
  });

  test("an outpost, a mission and a port: each done in the world", () => {
    const { g, s, a, england } = quiet();
    const st = expedState(g);
    const out = targetsFor(s, g.w, "outpost", england, a.prov)[0];
    const xo = partyAt(g, "outpost", out.p, a.c, 6_000_000, 14);
    st.list.push(xo);
    SCENES.FAR.outpost.choices[0].apply(g, xo, true);
    expect(s.provinces[out.p].outpost?.by).toBe(england);
    const { p } = nativeNear(g, england);
    const xm = partyAt(g, "mission", p, a.c, 6_000_001, 3);
    st.list.push(xm);
    SCENES.FAR.mission.choices[0].apply(g, xm, true);
    expect(s.provinces[p].mods.some((m) => m.key === "r21:mission")).toBe(true);
    const own = provincesOf(s, england).find(
      (q) => g.map.provinces[q].coastal && !(s.provinces[q].b.port ?? 0),
    );
    if (own !== undefined) {
      const xp = partyAt(g, "port", own, a.c, 6_000_002, 18);
      st.list.push(xp);
      SCENES.FAR.port.choices[0].apply(g, xp, true);
      expect(s.provinces[own].b.port).toBe(1);
    }
    const open = targetsFor(s, g.w, "port", england, a.prov).find(
      (t) => s.provinces[t.p].owner < 0,
    );
    expect(open).toBeDefined();
    const xq = partyAt(g, "port", open!.p, a.c, 6_000_003, 18);
    st.list.push(xq);
    SCENES.FAR.port.choices[0].apply(g, xq, true);
    expect(s.provinces[open!.p].owner).toBe(england);
    expect(s.provinces[open!.p].b.port).toBe(1);
  });

  test("saved mid-expedition it goes on the same; the delta carries it; an old save loads", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    const b = lifeOf(g, "s2");
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    cmd(g, a, { k: "exped", act: "plan", kind: "discover", p: t.p, hands: 4 });
    cmd(g, a, { k: "exped", act: "invite", seat: "s2" });
    answerAll(g, b);
    cmd(g, a, { k: "exped", act: "go" });
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 8; i++) {
      g.tick();
      applyDelta(mine, g.takeDelta());
    }
    expect(mine.exped).toEqual(s.exped);
    expect(mine.lives.find((l) => l.seat === "s2")!.travel).toEqual(b.travel);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    g2.aiEnabled = false;
    for (let i = 0; i < 120; i++) {
      answerAll(g, a);
      answerAll(g, b);
      answerAll(g2, lifeOf(g2, "s1"));
      answerAll(g2, lifeOf(g2, "s2"));
      g.tick();
      g2.tick();
    }
    expect(JSON.stringify(g2.s.exped)).toBe(JSON.stringify(s.exped));
    expect(lifeOf(g2, "s1").prov).toBe(a.prov);
    // An old save, from before r21: no expeditions, no desks.
    const fresh = quiet().g;
    const old = JSON.parse(JSON.stringify(fresh.s)) as GameState;
    delete old.exped;
    for (const n of old.nations) delete n.desk;
    for (const l of old.lives) if (l.travel) l.travel = null;
    const g3 = new ConquestGame(map, old);
    for (let i = 0; i < 40; i++) g3.tick();
    const a3 = lifeOf(g3, "s1");
    a3.travel = null;
    a3.prov = JAMESTOWN;
    a3.purse = 300;
    const t3 = targetsFor(g3.s, g3.w, "discover", england, JAMESTOWN)[0];
    expect(
      g3.lifeCommand("s1", {
        k: "exped",
        act: "go",
        kind: "discover",
        p: t3.p,
        hands: 2,
      } as never),
    ).toBeNull();
  });

  test("the same commands make the same expeditions", () => {
    const run = () => {
      const { g, s, a, england } = quiet({ seed: 23 });
      const t = targetsFor(s, g.w, "trade", england, a.prov)[0];
      cmd(g, a, {
        k: "exped",
        act: "go",
        kind: "trade",
        p: t.p,
        hands: 4,
        stake: 25,
      });
      runHome(g, [a]);
      return JSON.stringify({
        past: expedOf(s).past,
        purse: a.purse,
        j: a.journal.slice(-6).map((x) => x.text),
      });
    };
    expect(run()).toBe(run());
  });

  test("what each seat is sent: a raid getting up is its colony's secret, a war party coming is nobody's to know", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    const b = lifeOf(g, "s2");
    const { o, p } = nativeNear(g, england);
    s.wars = s.wars.filter((w) => !(w.a === o || w.b === o));
    cmd(g, a, { k: "exped", act: "plan", kind: "raid", p, hands: 10 });
    const raid = myExped(s, a.seat)!;
    expect(raid.kind).toBe("raid");
    const disc = partyAt(g, "discover", p, a.c, 7_000_000);
    disc.stage = "out";
    expedState(g).list.push(disc);
    expedState(g).reprisals.push({
      n: o,
      against: england,
      p: a.prov,
      day: s.day + 30,
      from: p,
    });
    expedState(g).asks.push({
      id: 1,
      seat: a.seat,
      c: a.c,
      n: england,
      x: raid.id,
      kind: "raid",
      target: p,
      gold: 20,
      day: s.day,
      answer: s.day + 20,
      stage: "asked",
    });
    const ids = (seat: string | null) =>
      stateForViewer(s, seat).exped!.list.map((x) => x.id);
    // Of the colony: everything but the war party coming.
    expect(ids("s2")).toEqual([raid.id, disc.id]);
    expect(stateForViewer(s, "s2").exped!.asks.length).toBe(1);
    expect(stateForViewer(s, "s1").exped!.reprisals).toEqual([]);
    // Another colony's player, and a watcher: only the party on the roads.
    const other = s.nations.findIndex(
      (n, i) => i !== england && n.kind === "power",
    );
    const mine = s.chars[b.c].nation;
    s.chars[b.c].nation = other;
    expect(ids("s2")).toEqual([disc.id]);
    expect(stateForViewer(s, "s2").exped!.asks).toEqual([]);
    expect(ids(null)).toEqual([disc.id]);
    // The same in the deltas.
    expedChangedFor(g);
    const d = g.takeDelta();
    expect(deltaIsPerViewer(d)).toBe(true);
    expect(deltaForViewer(s, d, "s2").exped!.list.map((x) => x.id)).toEqual([
      disc.id,
    ]);
    expect(deltaForViewer(s, d, null).exped!.reprisals).toEqual([]);
    s.chars[b.c].nation = mine;
    // The game's own state is untouched.
    expect(expedOf(s).reprisals.length).toBe(1);
  });
});

describe("GOV r21: the governor's desk", () => {
  function governor() {
    const w = quiet();
    w.g.nation(w.england).ruler = w.a.c;
    w.s.nations[w.england].gold = 600;
    return w;
  }

  test("duties: a schedule set, its effects on the colony, and not changed again for half a year", () => {
    const { g, s, a, england } = governor();
    expect(cmd(g, a, { k: "desk", act: "duty", level: 3 })).toBeNull();
    const m = s.nations[england].mods.find((x) => x.key === "r21:duty")!;
    expect(m.fx).toEqual(DUTIES[3].fx);
    expect(cmd(g, a, { k: "desk", act: "duty", level: 0 })).toMatch(/so soon/);
    s.day += 200;
    expect(cmd(g, a, { k: "desk", act: "duty", level: 2 })).toBeNull();
    expect(s.nations[england].mods.some((x) => x.key === "r21:duty")).toBe(
      false,
    );
  });

  test("a building programme orders the next building from the treasury", () => {
    const { g, s, a, england } = governor();
    const def = PROGRAMMES.find((p) =>
      provincesOf(s, england).some((q) => p.wants(s, g.w, england, q)),
    )!;
    expect(cmd(g, a, { k: "desk", act: "prog", key: def.key })).toBeNull();
    const d = deskView(s, england);
    expect(d.prog?.key).toBe(def.key);
    expect(d.prog!.built.length).toBe(1);
    expect(
      provincesOf(s, england).some((q) => s.provinces[q].build?.kind === def.b),
    ).toBe(true);
    expect(cmd(g, a, { k: "desk", act: "prog", key: def.key })).toMatch(
      /Finish/,
    );
  });

  test("a treaty council: presents from the treasury, and the council's answer", () => {
    const { g, s, a, england } = governor();
    const { o } = nativeNear(g, england);
    const gold = s.nations[england].gold;
    expect(cmd(g, a, { k: "desk", act: "council", n: o })).toBeNull();
    expect(s.nations[england].gold).toBe(gold - 20);
    const ev = a.events.find((e) => e.key === "gov-council")!;
    expect(ev).toBeDefined();
    const before = relationOf(s, g.w, o, england).total;
    expect(cmd(g, a, { k: "event", id: ev.id, choice: 3 })).toBeNull();
    expect(relationOf(s, g.w, o, england).total).toBeGreaterThan(before);
    expect(cmd(g, a, { k: "desk", act: "council", n: o })).toMatch(
      /Once a year/,
    );
  });

  test("the militia: musters and rangers on the colony's ledger each month; drilled militia steadier", () => {
    const { g, s, a, england } = governor();
    expect(cmd(g, a, { k: "desk", act: "musters", level: 2 })).toBeNull();
    expect(cmd(g, a, { k: "desk", act: "rangers", level: 2 })).toBeNull();
    for (let i = 0; i < 40; i++) g.tick();
    const lines = s.nations[england].ledger.spending;
    expect(lines.map((l) => l.label)).toContain(MUSTERS[2].name);
    expect(lines.find((l) => /Ranging/.test(l.label))!.value).toBe(
      2 * RANGERS.gold,
    );
    const army = addRegiment(g, england, s.nations[england].capital, "militia");
    expect(army.regs[army.regs.length - 1].morale).toBeCloseTo(
      0.75 + MUSTERS[2].morale,
      6,
    );
  });

  test("a pardon opens the gaol to a player of the colony", () => {
    const { g, s, a, england } = quiet({ players: 2 });
    g.nation(england).ruler = a.c;
    const b = lifeOf(g, "s2");
    b.crime = {
      notoriety: 0,
      heat: { [england]: 30 },
      dens: [],
      record: [],
      jail: {
        p: b.prov,
        until: s.day + 200,
        charge: "theft",
        grade: 2,
        trial: false,
        nation: england,
      },
    };
    expect(cmd(g, a, { k: "desk", act: "pardon", seat: "s2" })).toBeNull();
    expect(b.crime.jail).toBeNull();
    expect(b.crime.heat[england]).toBeUndefined();
  });

  test("matters come to a player's desk every month or two, each different", () => {
    const { g, a } = governor();
    const seen: string[] = [];
    for (let i = 0; i < 365; i++) {
      for (const ev of [...a.events]) {
        if (MATTER_KEYS.includes(ev.key)) seen.push(ev.key);
        cmd(g, a, { k: "event", id: ev.id, choice: 0 });
      }
      g.tick();
    }
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.length).toBeLessThanOrEqual(13);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("GOV r21: breaking with the crown", () => {
  function governor() {
    const w = quiet({ players: 2 });
    w.g.nation(w.england).ruler = w.a.c;
    return w;
  }

  test("the house divides as the page said; carried and declared: war, the crown's men go over, counties hold, everyone chooses, and the end", () => {
    const { g, s, a, england } = governor();
    const b = lifeOf(g, "s2");
    const pol = s.polities[england];
    expect(pol.assembly.length).toBeGreaterThan(0);
    for (const c of pol.assembly)
      ensureCabinet(g, england).faction[c] = "country";
    g.nation(england).autonomy = 80;
    g.nation(england).favor = 20;
    expect(cmd(g, a, { k: "desk", act: "motion" })).toBeNull();
    const m = deskView(s, england).motion!;
    const forecast = revDivision(s, england, m.by, m.salt, m.votes);
    for (let i = 0; i < 15; i++) g.tick();
    const r = deskView(s, england).motion!.result!;
    expect(r.ayes).toBe(forecast.ayes);
    expect(r.noes).toBe(forecast.noes);
    expect(r.carried).toBe(true);
    const army = s.armies.find((x) => x.owner === england);
    if (army)
      army.regs.push({
        type: "regulars",
        men: 100,
        morale: 1,
        home: -1,
        crown: "war",
      });
    const crown = s.nations.findIndex(
      (n) => n.kind === "crown" && n.colony === england,
    );
    expect(cmd(g, a, { k: "desk", act: "declare", on: true })).toBeNull();
    expect(s.nations[england].rebelling).toBe(true);
    expect(atWar(s, crown, england)).toBe(true);
    if (army) {
      expect(
        s.armies.some(
          (x) => x.owner === england && x.regs.some((q) => q.crown),
        ),
      ).toBe(false);
      expect(s.armies.some((x) => x.owner === crown)).toBe(true);
    }
    const rev = deskView(s, england).rev!;
    for (const p of rev.holds) expect(s.provinces[p].occupier).toBe(crown);
    const ev = b.events.find((e) => e.key === "gov-rev-sides")!;
    expect(ev).toBeDefined();
    cmd(g, b, { k: "event", id: ev.id, choice: 1 }); // with the King
    expect(deskView(s, england).rev!.sides.s2).toBe("loyal");
    b.purse = 90;
    g.event({ k: "independence", day: s.day, n: england, won: true });
    expect(b.purse).toBe(60);
    expect(a.constitute?.n).toBe(england);
  });

  test("counties hold for the King at the odds the page showed (reckoned before the declaration sets the crown's favour to nothing)", () => {
    const { g, s, a, england } = governor();
    for (const c of s.polities[england].assembly)
      ensureCabinet(g, england).faction[c] = "country";
    g.nation(england).autonomy = 80;
    g.nation(england).favor = 20;
    expect(cmd(g, a, { k: "desk", act: "motion" })).toBeNull();
    for (let i = 0; i < 15; i++) g.tick();
    expect(deskView(s, england).motion!.result!.carried).toBe(true);
    // The crown still well thought of: the King's friends are strong everywhere.
    g.nation(england).favor = 100;
    const capital = s.nations[england].capital;
    const shown = provincesOf(s, england)
      .filter((p) => p !== capital)
      .map((p) => ({ p, o: holdOdds(s, g.w, england, p).total }));
    const expected = shown.reduce((m, x) => m + x.o, 0);
    expect(expected).toBeGreaterThan(8);
    expect(cmd(g, a, { k: "desk", act: "declare", on: true })).toBeNull();
    expect(s.nations[england].favor).toBe(0);
    const holds = deskView(s, england).rev!.holds;
    // Before the fix they were rolled at favour 0: about one county, not ten.
    expect(holds.length).toBeGreaterThanOrEqual(expected / 2);
    expect(holds.length).toBeLessThanOrEqual(expected * 2);
    expect(holds).not.toContain(capital);
    for (const p of holds)
      expect(shown.find((x) => x.p === p)!.o).toBeGreaterThan(0);
  });

  test("in the war, the colony's generals fight at home: at the crown's men when stronger, else the capital", () => {
    const { g, s, a, england } = governor();
    for (const c of s.polities[england].assembly)
      ensureCabinet(g, england).faction[c] = "country";
    g.nation(england).autonomy = 80;
    g.nation(england).favor = 20;
    cmd(g, a, { k: "desk", act: "motion" });
    for (let i = 0; i < 15; i++) g.tick();
    const away = provincesOf(s, england).find(
      (p) => p !== s.nations[england].capital && s.provinces[p].occupier < 0,
    )!;
    const mine = addRegiment(g, england, away, "militia");
    // Not declared: the ordinary campaign.
    expect(risingAim(g, england, mine)).toBeUndefined();
    expect(cmd(g, a, { k: "desk", act: "declare", on: true })).toBeNull();
    const crown = s.nations.findIndex(
      (n) => n.kind === "crown" && n.colony === england,
    );
    for (const x of s.armies.filter((x) => x.owner === crown))
      s.armies.splice(s.armies.indexOf(x), 1);
    // Nobody of the crown's on the colony's soil: home to the capital.
    expect(risingAim(g, england, mine)).toBe(s.nations[england].capital);
    // A smaller landing on its soil: at them.
    const land = provincesOf(s, england).find(
      (p) => p !== away && p !== s.nations[england].capital,
    )!;
    const theirs = addRegiment(g, crown, land, "regulars");
    theirs.regs[0].men = Math.floor(
      mine.regs.reduce((m, r) => m + r.men, 0) * REV.attackAt * 0.5,
    );
    expect(risingAim(g, england, mine)).toBe(land);
    // Too strong for it: hold the capital instead.
    theirs.regs[0].men = 5000;
    expect(risingAim(g, england, mine)).toBe(s.nations[england].capital);
  });

  test("a county's odds of holding for the King; and the motion lost, London hears", () => {
    const { g, s, a, england } = governor();
    for (const p of provincesOf(s, england)) {
      const o = holdOdds(s, g.w, england, p).total;
      expect(o).toBeGreaterThanOrEqual(0.02);
      expect(o).toBeLessThanOrEqual(1);
    }
    for (const c of s.polities[england].assembly)
      ensureCabinet(g, england).faction[c] = "court";
    g.nation(england).autonomy = 0;
    g.nation(england).favor = 90;
    expect(cmd(g, a, { k: "desk", act: "motion" })).toBeNull();
    for (let i = 0; i < 15; i++) g.tick();
    expect(deskView(s, england).motion!.result!.carried).toBe(false);
    expect(
      s.nations[england].mods.some((m) => m.key === "r21:treason-talk"),
    ).toBe(true);
    expect(cmd(g, a, { k: "desk", act: "motion" })).toMatch(/Not again/);
  });
});

describe("GOV r21: founding widened", () => {
  test("for another crown: the settlement is theirs, and so are you; your old colony takes it ill", () => {
    const { g, s, a, england } = quiet();
    const other = s.nations.find(
      (n) =>
        n.kind === "power" &&
        n.alive &&
        n.id !== england &&
        !n.independent &&
        !atWar(s, n.id, england) &&
        provincesOf(s, n.id).length,
    )!;
    const site = settlementSites(s, g.w, a)[0];
    expect(site).toBeDefined();
    expect(
      cmd(g, a, {
        k: "society",
        act: "found",
        p: site.p,
        arg: 1,
        crown: other.id,
      }),
    ).toBeNull();
    expect(a.founding?.under).toBe(other.id);
    expect(seasoningOdds(s, g.w, a).total).toBeGreaterThan(0);
    a.founding!.settlers = Object.values(s.chars)
      .filter(
        (c) =>
          c?.alive &&
          c.nation === england &&
          c.home !== undefined &&
          c.id !== a.c,
      )
      .slice(0, 3)
      .map((c) => c.id);
    a.prov = site.p;
    a.travel = null;
    const renown = a.renown;
    completeSettlement(g, a);
    expect(s.provinces[site.p].owner).toBe(other.id);
    expect(s.chars[a.c].nation).toBe(other.id);
    expect(a.renown).toBeGreaterThan(renown);
    expect(
      s.nations[england].relations[other.id]?.some((m) =>
        /went over/.test(m.why),
      ),
    ).toBe(true);
  });

  test("the founder is the town's proprietor and its first mayor", () => {
    const { g, s, a, england } = quiet();
    const site = settlementSites(s, g.w, a)[0];
    expect(
      cmd(g, a, { k: "society", act: "found", p: site.p, arg: 1 }),
    ).toBeNull();
    a.founding!.settlers = Object.values(s.chars)
      .filter(
        (c) =>
          c?.alive &&
          c.nation === england &&
          c.home !== undefined &&
          c.id !== a.c,
      )
      .slice(0, 3)
      .map((c) => c.id);
    a.founding!.charter = "granted";
    a.prov = site.p;
    completeSettlement(g, a);
    const offices = officesIn(s, site.p);
    expect(offices.find((o) => o.key === "founder")?.holder).toBe(a.c);
    expect(offices.find((o) => o.key === "mayor")?.holder).toBe(a.c);
  });
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

describe("GOV r21 through the rooms server: an expedition together", () => {
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

  test("Alden asks Bea along on a discovery; she says yes in her scene; both copies show the party under way", async () => {
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
    host.send({ t: "plan", plan: plan({ age: 30 }) });
    bea.send({
      t: "plan",
      plan: plan({ first: "Beatrice", family: "Cole", female: true, age: 28 }),
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
    const B = lifeOfSeat(s, bg.you)!;
    A.purse = 300;
    B.prov = A.prov;
    B.travel = null;
    const n = s.chars[A.c].nation;
    const t = targetsFor(s, game.w, "discover", n, A.prov)[0];
    expect(
      await host.cmd({
        k: "exped",
        act: "plan",
        kind: "discover",
        p: t.p,
        hands: 3,
      }),
    ).toBeNull();
    expect(
      await host.cmd({ k: "exped", act: "invite", seat: bg.you }),
    ).toBeNull();
    const ev = B.events.find((e) => e.key === "exped-invite")!;
    expect(await bea.cmd({ k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(await host.cmd({ k: "exped", act: "go" })).toBeNull();
    const hers = bea.state();
    expect(hers.exped?.list.length).toBe(1);
    expect(hers.exped?.list[0].members.map((m) => m.seat)).toEqual([bg.you]);
    expect(hers.lives.find((x) => x.seat === bg.you)!.travel?.exped).toBe(
      hers.exped?.list[0].id,
    );
    expect(host.state().exped?.list[0].stage).toBe("out");
  });
});
