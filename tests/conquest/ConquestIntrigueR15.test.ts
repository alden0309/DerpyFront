// INTRIGUE (r15): hearts and schemes. Seduction for grown people only, never
// close kin; plots whose shown odds are the ones rolled, that lead to a trial
// when found out, that never touch a child, and that never simply kill a
// player (warned first, a scene to meet the moment); a promise to marry that
// becomes a wedding planned and played as a gathering (or a quiet one, or a
// broken one); the journey to a gathering you're asked to, there and home,
// with an arrival and the evening's vignettes; letters to other players in
// your own words; and, through the rooms server, that nobody but a scheme's
// own player (and a letter's writer and reader) is ever sent any of it.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { journeyView } from "../../src/conquest/engine/Attendance";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { familyOf } from "../../src/conquest/engine/EventPacing";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  gatheringById,
  GATHERINGS,
  pushGathering,
} from "../../src/conquest/engine/Gatherings";
import { interactionView } from "../../src/conquest/engine/Interactions";
import {
  ADULT_AGE,
  betrothalOf,
  closeKin,
  intrigue,
  intrigueChanged,
  intrigueOf,
  stateForIntrigue,
} from "../../src/conquest/engine/IntrigueCore";
import {
  pickVignette,
  VIGNETTE_CHANCE,
  VIGNETTES,
} from "../../src/conquest/engine/IntrigueEvents";
import { ledgerForecast } from "../../src/conquest/engine/Ledger";
import { letterCheck, postOf } from "../../src/conquest/engine/Letters";
import { lifeOfSeat, peopleHere } from "../../src/conquest/engine/LifeQueries";
import {
  cleanText,
  NOTE_MAX,
  noteCheck,
} from "../../src/conquest/engine/Notes";
import {
  discovered,
  PLOT_METHODS,
  plotCheck,
  plotOutcomes,
  plotView,
  plotWeek,
} from "../../src/conquest/engine/Plots";
import { ageOf } from "../../src/conquest/engine/Queries";
import { DAYS_PER_YEAR } from "../../src/conquest/engine/Rules";
import {
  keepCost,
  seduceCheck,
  seduceView,
  seduceWeek,
} from "../../src/conquest/engine/Seduction";
import type {
  Character,
  GameDelta,
  GameState,
  Gathering,
  IntrigueScheme,
  Life,
  PlotMethod,
} from "../../src/conquest/engine/Types";
import { betroth, quietWedding } from "../../src/conquest/engine/Weddings";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

const JT = prov("Jamestown");

/** Two players at Jamestown in 1700: Alden (s1) and Beatrice (s2). */
function pair(seed = 11): { g: ConquestGame; a: Life; b: Life } {
  const g = world({
    start: 1700,
    seed,
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
    ],
  });
  return { g, a: lifeOf(g, "s1"), b: lifeOf(g, "s2") };
}

/** One player at Jamestown in 1700. */
function solo(
  seed = 7,
  o: Parameters<typeof plan>[0] = {},
): {
  g: ConquestGame;
  life: Life;
} {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk", ...o }),
      },
    ],
  });
  return { g, life: lifeOf(g, "s1") };
}

const me = (g: ConquestGame, l: Life) => g.s.chars[l.c];

/** Grown people of the other sex here, not played, unmarried unless asked. */
function folk(
  g: ConquestGame,
  life: Life,
  o: { married?: boolean; female?: boolean } = {},
): Character[] {
  const m = me(g, life);
  return peopleHere(g.s, life.prov, life).filter(
    (c) =>
      !g.s.lives.some((l) => l.c === c.id) &&
      ageOf(g.s, c) >= ADULT_AGE &&
      ageOf(g.s, c) <= 50 &&
      c.female === (o.female ?? !m.female) &&
      (o.married === undefined || c.spouse >= 0 === o.married) &&
      !closeKin(g.s, m, c),
  );
}

/** Someone free to marry: unmarried already, or made a widow (or widower) for the test. */
function single(g: ConquestGame, life: Life, n = 1): Character[] {
  const out = folk(g, life, { married: false }).slice(0, n);
  for (const c of folk(g, life, { married: true })) {
    if (out.length >= n) break;
    const sp = g.s.chars[c.spouse];
    if (sp) sp.spouse = -1;
    c.spouse = -1;
    out.push(c);
  }
  return out;
}

/** Make someone this many years old today. */
function aged(g: ConquestGame, c: Character, years: number): void {
  c.born = g.s.day - years * DAYS_PER_YEAR - 10;
}

// ---------------------------------------------------------------- who may be courted

describe("seduction and courting: grown people only, never close kin", () => {
  test("close kin: parents and grandparents, children, brothers and sisters (half too), uncles and aunts, cousins, a step-parent; not strangers or in-laws' cousins", () => {
    const mk = (id: number, o: Partial<Character> = {}) =>
      ({ id, father: -1, mother: -1, spouse: -1, ...o }) as Character;
    const chars: Record<number, Character> = {};
    const add = (c: Character) => (chars[c.id] = c);
    // Grandparents 1 and 2; their children 3 (father of 5) and 4 (mother of 7);
    // 5 and 6 are siblings (6 a half-sibling by 9); 7 is their cousin.
    add(mk(1));
    add(mk(2));
    add(mk(3, { father: 1, mother: 2, spouse: 9 }));
    add(mk(4, { father: 1, mother: 2 }));
    add(mk(9, { spouse: 3 }));
    add(mk(5, { father: 3, mother: 9 }));
    add(mk(6, { father: 3, mother: 10 }));
    add(mk(7, { mother: 4 }));
    add(mk(8)); // a stranger
    add(mk(10));
    add(mk(11, { spouse: 10 })); // 6's step-father
    const s = { chars } as unknown as GameState;
    const kin = (a: number, b: number) => closeKin(s, chars[a], chars[b]);
    expect(kin(5, 3)).toBe(true); // father
    expect(kin(5, 1)).toBe(true); // grandfather
    expect(kin(1, 5)).toBe(true); // grandchild
    expect(kin(5, 6)).toBe(true); // half-sister
    expect(kin(5, 4)).toBe(true); // aunt
    expect(kin(5, 7)).toBe(true); // first cousin
    expect(kin(6, 11)).toBe(true); // step-father
    expect(kin(5, 8)).toBe(false);
    expect(kin(7, 9)).toBe(false); // a cousin's mother-in-law's... no blood
  });

  test("nobody under eighteen seduces or is seduced, courts or is courted, writes love letters or proposes; nor their close kin", () => {
    const { g, life } = solo(7);
    const s = g.s;
    const her = single(g, life)[0];
    expect(her).toBeDefined();
    life.met.push(her.id);
    // Grown, both: it can be begun.
    aged(g, her, 24);
    expect(seduceCheck(s, g.w, life, her).ok).toBe(true);
    // She's seventeen: never.
    aged(g, her, 17);
    for (const aim of ["lover", "keep"] as const) {
      const v = seduceCheck(s, g.w, life, her, aim);
      expect(v.ok).toBe(false);
      expect(v.ok ? "" : v.why).toMatch(/eighteen/);
    }
    for (const act of ["court", "propose", "tryst"] as const) {
      const v = interactionView(s, g.w, life, her.id, act, 1);
      expect(v.check.ok, act).toBe(false);
    }
    for (const kind of ["love", "marriage"] as const)
      expect(letterCheck(s, g.w, life, her.id, kind, 0, -1).ok).toBe(false);
    expect(
      seduceView(s, g.w, life, her.id).check.ok ||
        seduceView(s, g.w, life, her.id, "keep").check.ok,
    ).toBe(false);
    // And you're seventeen yourself: never, however old they are.
    aged(g, her, 24);
    aged(g, me(g, life), 17);
    const mine = seduceCheck(s, g.w, life, her);
    expect(mine.ok ? "" : mine.why).toMatch(/you're eighteen/);
    expect(interactionView(s, g.w, life, her.id, "court").check.ok).toBe(false);
    aged(g, me(g, life), 30);
    // Your own sister, grown: never.
    const sis = her;
    sis.father = me(g, life).father >= 0 ? me(g, life).father : 99_999;
    me(g, life).father = sis.father;
    const k = seduceCheck(s, g.w, life, sis);
    expect(k.ok ? "" : k.why).toBe("Too close kin.");
  });

  test("a plot never touches a child, nor your own husband or wife, nor your own blood", () => {
    const { g, life } = solo(7);
    const s = g.s;
    const c = folk(g, life)[0];
    life.met.push(c.id);
    aged(g, c, 30);
    life.purse = 100;
    expect(plotCheck(s, g.w, life, c, "ambush").ok).toBe(true);
    aged(g, c, 15);
    for (const m of Object.keys(PLOT_METHODS) as PlotMethod[]) {
      const v = plotCheck(s, g.w, life, c, m);
      expect(v.ok ? "" : v.why, m).toBe("Never a child.");
    }
    aged(g, c, 30);
    me(g, life).spouse = c.id;
    const sp = plotCheck(s, g.w, life, c, "ambush");
    expect(sp.ok ? "" : sp.why).toMatch(/husband or wife/);
  });
});

// ---------------------------------------------------------------- the odds are the ones rolled

/** A scheme, ready to run, as if it had just been begun. */
function scheme(
  g: ConquestGame,
  life: Life,
  c: Character,
  o: Partial<IntrigueScheme>,
): IntrigueScheme {
  const x: IntrigueScheme = {
    id: g.nextId(),
    kind: "plot",
    seat: life.seat,
    by: life.c,
    target: c.id,
    p: life.prov,
    started: g.s.day,
    week: 0,
    weeks: 3,
    helpers: [],
    leaks: 0,
    odds: { p: 0.5, d: 0, f: 0 },
    paid: 0,
    status: "on",
    lines: [],
    ...o,
  };
  intrigue(g).schemes.push(x);
  intrigueChanged(g);
  return x;
}

describe("the odds shown are the odds rolled", () => {
  test("a plot against one of the computer's people: done, done and traced, foiled, found out, at the shown rates", () => {
    const { g, life } = solo(13);
    const s = g.s;
    const c = folk(g, life, { married: false, female: false })[0];
    life.met.push(c.id);
    aged(g, c, 30);
    life.purse = 1e6;
    const v = plotView(s, g.w, life, c.id, "ambush");
    expect(v.check.ok, v.check.ok ? "" : v.check.why).toBe(true);
    // The real numbers, a little sharpened so each way shows up often.
    const odds = { p: 0.55, d: 0.06, f: 0.4 };
    const weeks = 3;
    const shown = Object.fromEntries(
      plotOutcomes(odds, weeks).map((o) => [o.key, o.p]),
    );
    expect(Object.values(shown).reduce((m, p) => m + p, 0)).toBeCloseTo(1, 6);
    const n = 1500;
    const seen: Record<string, number> = {
      done: 0,
      "done-traced": 0,
      foiled: 0,
      found: 0,
    };
    const day0 = s.day;
    life.purse = 1e6;
    for (let i = 0; i < n; i++) {
      // Each trial on days of its own (the track's dice are drawn by the day).
      s.day = day0 + i * 11;
      c.alive = true;
      delete c.died;
      life.health = 100;
      const x = scheme(g, life, c, {
        method: "ambush",
        odds,
        weeks,
        p: life.prov,
      });
      for (let w = 0; w < weeks + 2 && x.status === "on"; w++) {
        s.day++;
        plotWeek(g, life, x);
      }
      const dead = !c.alive;
      const key =
        x.status === "done"
          ? "done"
          : x.status === "found"
            ? dead
              ? "done-traced"
              : "found"
            : x.status === "foiled"
              ? "foiled"
              : "other";
      seen[key] = (seen[key] ?? 0) + 1;
      // Tidy away, so the state doesn't grow.
      intrigue(g).schemes = [];
    }
    s.day = day0;
    expect(seen.other ?? 0).toBe(0);
    for (const k of Object.keys(shown))
      expect(seen[k] / n, `${k}: shown ${shown[k]}`).toBeCloseTo(shown[k], 1);
    for (const k of Object.keys(shown))
      expect(Math.abs(seen[k] / n - shown[k]), k).toBeLessThan(0.04);
  });

  test("winning someone: as often as the odds say, in the weeks shown", () => {
    const { g, life } = solo(17);
    const s = g.s;
    const her = single(g, life)[0];
    aged(g, her, 25);
    const v = seduceView(s, g.w, life, her.id);
    expect(v.check.ok).toBe(true);
    expect(v.outcomes.reduce((m, o) => m + o.p, 0)).toBeCloseTo(1, 6);
    // Neither married: nothing to notice, so it's won or refused.
    expect(v.odds.d).toBe(0);
    const n = 1200;
    let won = 0;
    const day0 = s.day;
    for (let i = 0; i < n; i++) {
      s.day = day0 + i * 9;
      delete life.ties[her.id];
      const x = scheme(g, life, her, {
        kind: "seduce",
        aim: "lover",
        odds: v.odds,
        weeks: v.weeks,
      });
      for (let w = 0; w < v.weeks + 1 && x.status === "on"; w++) {
        s.day++;
        seduceWeek(g, life, x);
      }
      expect(x.status === "done" || x.status === "failed").toBe(true);
      if (x.status === "done") won++;
      intrigue(g).schemes = [];
    }
    s.day = day0;
    expect(Math.abs(won / n - v.odds.p)).toBeLessThan(0.04);
  });
});

// ---------------------------------------------------------------- plots: the law, and players

describe("plots", () => {
  test("found out: the constable, and a trial for conspiring to murder (or murder, if it was done)", () => {
    const { g, life } = solo(13);
    const s = g.s;
    const c = folk(g, life, { female: false })[0];
    life.met.push(c.id);
    aged(g, c, 30);
    life.purse = 100;
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "plot",
        c: c.id,
        method: "ambush",
      }),
    ).toBeNull();
    expect(life.purse).toBeLessThan(100);
    const x = intrigueOf(s).schemes.find((y) => y.target === c.id)!;
    expect(x.kind).toBe("plot");
    discovered(g, x, false);
    expect(x.status).toBe("found");
    const t = (s.power?.trials ?? []).find((y) => y.defendant === life.c);
    expect(t, "a trial").toBeDefined();
    expect(t!.charge).toMatch(/conspiring to murder/);
    expect(t!.grade).toBe(3);
    expect(life.ties[c.id]).toBe("nemesis");
    expect(life.journal.some((j) => /constable/.test(j.text))).toBe(true);
  });

  test("another player is warned before the moment, never killed outright, and gets a scene to meet it; guards foil it", () => {
    const { g, a, b } = pair(21);
    const s = g.s;
    const B = me(g, b);
    a.met.push(B.id);
    a.purse = 200;
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "plot",
        c: B.id,
        method: "cutthroat",
      }),
    ).toBeNull();
    const x = intrigueOf(s).schemes[0];
    x.odds = { ...x.odds, d: 0 }; // not found out on the way, for this test
    const order: string[] = [];
    for (let d = 0; d < 7 * 12 && x.status === "on"; d++) {
      g.tick();
      B.alive = true;
      b.health = 100;
      for (const e of b.events)
        if (!order.includes(`${e.key}#${e.id}`)) order.push(`${e.key}#${e.id}`);
      // Beatrice puts the warnings out of her mind.
      for (const e of [...b.events])
        if (e.key === "intr-warn")
          g.lifeCommand("s2", { k: "event", id: e.id, choice: 3 });
    }
    expect(x.status).toBe("strike");
    const keys = order.map((k) => k.split("#")[0]);
    const firstWarn = keys.indexOf("intr-warn");
    const strike = keys.indexOf("intr-strike");
    expect(firstWarn).toBeGreaterThanOrEqual(0);
    expect(strike).toBeGreaterThan(firstWarn);
    // The moment has come, and she's alive, with a choice to make.
    expect(B.alive).toBe(true);
    const ev = b.events.find((e) => e.key === "intr-strike")!;
    expect(ev).toBeDefined();
    expect(ev.choices.length).toBe(3);
    // She cries murder, and (this time) it's heard: she lives; it's foiled.
    b.skills.persuasion = 30;
    const err = g.lifeCommand("s2", { k: "event", id: ev.id, choice: 2 });
    expect(err).toBeNull();
    expect(B.alive).toBe(true);
    expect(x.status === "foiled" || x.status === "found").toBe(true);
    expect(b.ties[a.c]).toBe("nemesis");

    // Again, with men hired to watch over her: they foil it without a scene.
    const { g: g2, a: a2, b: b2 } = pair(22);
    const B2 = me(g2, b2);
    a2.met.push(B2.id);
    a2.purse = b2.purse = 200;
    expect(
      g2.lifeCommand("s1", {
        k: "intrigue",
        act: "plot",
        c: B2.id,
        method: "ambush",
      }),
    ).toBeNull();
    const x2 = intrigueOf(g2.s).schemes[0];
    x2.odds = { ...x2.odds, d: 0 };
    let struck = false;
    for (let d = 0; d < 7 * 12 && x2.status === "on"; d++) {
      g2.tick();
      B2.alive = true;
      b2.health = 100;
      for (const e of [...b2.events]) {
        if (e.key === "intr-warn")
          g2.lifeCommand("s2", { k: "event", id: e.id, choice: 0 }); // guards
        if (e.key === "intr-strike") struck = true;
      }
    }
    expect(intrigueOf(g2.s).guards[B2.id]).toBeGreaterThan(g2.s.day);
    expect(struck).toBe(false);
    expect(x2.status === "foiled" || x2.status === "found").toBe(true);
    expect(B2.alive).toBe(true);
  });
});

// ---------------------------------------------------------------- weddings

describe("weddings", () => {
  test("asking for a hand makes a betrothal; the wedding is planned, then played as a gathering: the vows, the dowry, married", () => {
    const { g, life } = solo(31);
    const s = g.s;
    const her = single(g, life)[0];
    aged(g, her, 24);
    life.purse = 300;
    // Asking for her hand costs nothing yet, and the menu offers both ways.
    expect(interactionView(s, g.w, life, her.id, "propose", 1).label).toBe(
      "Ask for their hand",
    );
    expect(betroth(g, life, her)).toBeNull();
    const b = betrothalOf(s, life.c)!;
    expect(b.status).toBe("promised");
    expect(me(g, life).spouse).toBe(-1);
    // The banns take three Sundays: too soon is refused.
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "plan",
        id: b.id,
        rite: "church",
        tier: 2,
        days: 7,
        licence: false,
        list: [],
      }),
    ).toMatch(/banns/);
    const before = life.purse;
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "plan",
        id: b.id,
        rite: "church",
        tier: 2,
        days: 25,
        licence: false,
        list: [],
      }),
    ).toBeNull();
    expect(life.purse).toBeLessThan(before);
    expect(b.status).toBe("planned");
    const gat = gatheringById(s, b.gat!)!;
    expect(gat.kind).toBe("wedding");
    expect(gat.bet).toBe(b.id);
    // On the day: the couple's scenes, one by one; married at the vows.
    const played: string[] = [];
    for (let d = 0; d < 40 && gat.status !== "held"; d++) {
      g.tick();
      for (const e of [...life.events]) {
        if (!e.key.startsWith("gather-")) continue;
        played.push(e.key);
        g.lifeCommand("s1", { k: "event", id: e.id, choice: 0 });
      }
    }
    expect(played).toContain("gather-w-vows");
    expect(played).toContain("gather-w-feast");
    expect(played).toContain("gather-w-dance");
    expect(b.status).toBe("wed");
    expect(me(g, life).spouse).toBe(her.id);
    expect(her.spouse).toBe(life.c);
    expect(b.dowry).toBe(true);
  });

  test("a quiet wedding before the minister, there and then; and a promise broken, with damages", () => {
    const { g, life } = solo(33);
    const s = g.s;
    const [her, other] = single(g, life, 2);
    aged(g, her, 24);
    aged(g, other, 26);
    life.purse = 300;
    betroth(g, life, her);
    const b = betrothalOf(s, life.c)!;
    expect(quietWedding(g, life, b.id)).toBeNull();
    expect(me(g, life).spouse).toBe(her.id);
    expect(b.status).toBe("wed");

    const { g: g2, life: l2 } = solo(34);
    const h2 = single(g2, l2)[0];
    aged(g2, h2, 24);
    l2.purse = 300;
    betroth(g2, l2, h2);
    const b2 = betrothalOf(g2.s, l2.c)!;
    const p0 = l2.purse;
    expect(
      g2.lifeCommand("s1", { k: "intrigue", act: "jilt", id: b2.id }),
    ).toBeNull();
    expect(b2.status).toBe("broken");
    expect(l2.purse).toBeLessThan(p0);
    expect(betrothalOf(g2.s, l2.c)).toBeUndefined();
  });

  test("old saves (no intrigue at all) load and run; the state survives a save and a load", () => {
    const { g, life } = solo(35);
    const her = single(g, life)[0];
    aged(g, her, 24);
    betroth(g, life, her);
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(g.map, saved);
    expect(betrothalOf(g2.s, life.c)?.b).toBe(her.id);
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete old.intrigue;
    for (const l of old.lives) delete l.attend;
    const g3 = new ConquestGame(g.map, old);
    ticks(g3, 40);
    expect(
      g3.s.intrigue === undefined || g3.s.intrigue.schemes.length === 0,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------- going to a gathering

describe("going to a gathering you're asked to", () => {
  test("you set out in time, travel there on the map, arrive, play the evening (vignettes among it), and come home", () => {
    const { g, life } = solo(41);
    const s = g.s;
    // A feast in a town nearby, given by one of the computer's people there.
    let to = -1;
    const seen = new Set([JT]);
    let edge = [JT];
    for (let hop = 0; hop < 6 && to < 0; hop++) {
      const next: number[] = [];
      for (const p of edge)
        for (const [q] of g.map.provinces[p].nb) {
          if (seen.has(q)) continue;
          seen.add(q);
          next.push(q);
          if (
            to < 0 &&
            hop >= 1 &&
            peopleHere(s, q).some(
              (c) => ageOf(s, c) >= 25 && !s.lives.some((l) => l.c === c.id),
            )
          )
            to = q;
        }
      edge = next;
    }
    expect(to).toBeGreaterThanOrEqual(0);
    const host = peopleHere(s, to).find(
      (c) => ageOf(s, c) >= 25 && !s.lives.some((l) => l.c === c.id),
    )!;
    const gat: Gathering = {
      id: g.nextId(),
      kind: "feast",
      host: host.id,
      prov: to,
      venue: "tavern",
      day: s.day + 30,
      scale: 2,
      cost: 0,
      invited: [
        life.c,
        ...peopleHere(s, to)
          .slice(0, 6)
          .map((c) => c.id),
      ],
      rsvp: Object.fromEntries(
        peopleHere(s, to)
          .slice(0, 6)
          .map((c) => [c.id, { yes: true, why: "glad to come" }]),
      ),
      about: [],
      status: "planned",
      mood: 0,
      played: [],
      turns: {},
      lines: [],
    };
    pushGathering(g, gat);
    life.purse = 100;
    // The day: a week to spare after the journey there.
    gat.day = s.day + 200;
    gat.day = s.day + journeyView(s, g.w, life, gat).days + 10;
    const v = journeyView(s, g.w, life, gat);
    expect(
      v.check.ok,
      v.check.ok ? "" : `${v.check.why} (${g.map.provinces[to].name})`,
    ).toBe(true);
    expect(v.here).toBe(false);
    expect(v.days).toBeGreaterThan(0);
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "attend",
        id: gat.id,
        back: true,
      }),
    ).toBeNull();
    expect(gat.rsvp[life.c]?.yes).toBe(true);
    expect(life.attend?.stage).toBe("wait");
    let travelled = false;
    let arrived = false;
    let wentHome = false;
    const turns: string[] = [];
    for (let d = 0; d < v.days * 2 + 60; d++) {
      g.tick();
      life.health = 100;
      if (life.travel?.dest === to) travelled = true;
      if (travelled && life.travel?.dest === JT) wentHome = true;
      for (const e of [...life.events]) {
        if (e.key === "intr-arrive") arrived = true;
        if (e.key.startsWith("gather-")) turns.push(e.key);
        g.lifeCommand("s1", {
          k: "event",
          id: e.id,
          choice: e.key === "intr-arrive" ? 1 : 0,
        });
      }
      if (wentHome && !life.travel) break;
    }
    expect(travelled).toBe(true);
    expect(arrived).toBe(true);
    expect(gat.status).toBe("held");
    expect(turns.length).toBeGreaterThan(0);
    expect(wentHome).toBe(true);
    expect(life.prov).toBe(JT);
    expect(life.attend ?? null).toBeNull();
  });

  test("the vignettes: about the computer's people only, at gatherings they suit, resting by family with the event pacing", () => {
    const { g, life } = solo(43);
    const s = g.s;
    const here = peopleHere(s, life.prov, life).filter(
      (c) => ageOf(s, c) >= 18 && !s.lives.some((l) => l.c === c.id),
    );
    for (const v of VIGNETTES)
      expect(familyOf(v.def.key, "raised"), v.key).toBe(v.family);
    const gat: Gathering = {
      id: g.nextId(),
      kind: "ball",
      host: here[0].id,
      prov: life.prov,
      venue: "tavern",
      day: s.day,
      scale: 2,
      cost: 0,
      invited: [life.c],
      rsvp: {},
      about: [],
      status: "on",
      mood: 0,
      played: ["ball-open"],
      turns: {},
      lines: [],
    };
    gat.played = [GATHERINGS.ball.pool[0]];
    const got: string[] = [];
    for (let i = 0; i < 400; i++) {
      s.day += 1;
      const t = pickVignette(g, life, gat, here);
      if (!t) continue;
      const v = VIGNETTES.find((x) => x.key === t.key)!;
      expect(v.kinds === "any" || v.kinds.includes("ball")).toBe(true);
      expect(s.lives.some((l) => l.c === t.c)).toBe(false);
      expect(t.c).toBeGreaterThanOrEqual(0);
      got.push(t.key);
    }
    expect(got.length / 400).toBeGreaterThan(VIGNETTE_CHANCE * 0.7);
    expect(new Set(got).size).toBeGreaterThan(4);
    // Never at the couple's own wedding: their scenes are the day's.
    const wed: Gathering = {
      ...gat,
      kind: "wedding",
      bet: 1,
      about: [life.c, here[0].id],
    };
    expect(pickVignette(g, life, wed, here)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- letters in your own words

describe("letters in your own words", () => {
  test("plain text, tidied and cut to length; only to another player's character; postage, and a limit a day", () => {
    expect(cleanText("Dear B,\r\n\r\n\u0007Yours\u0000 truly", 100)).toBe(
      "Dear B,\n\nYours truly",
    );
    expect(cleanText("a\n\n\n\n\n\nb", 100)).toBe("a\n\n\nb");
    expect([...cleanText("x".repeat(5000), NOTE_MAX)].length).toBe(NOTE_MAX);
    expect(cleanText("<b>bold</b>", 100)).toBe("<b>bold</b>"); // shown escaped, never as markup
    const { g, a, b } = pair(51);
    const s = g.s;
    const B = me(g, b);
    const stranger = folk(g, a)[0];
    a.purse = 50;
    expect(noteCheck(s, g.w, a, stranger.id, "", "Hello").ok).toBe(false);
    expect(noteCheck(s, g.w, a, B.id, "", "   ").ok).toBe(false);
    expect(noteCheck(s, g.w, a, B.id, "", "x".repeat(NOTE_MAX + 1)).ok).toBe(
      false,
    );
    expect(noteCheck(s, g.w, a, B.id, "Re: the mill", "Dear Beatrice").ok).toBe(
      true,
    );
    for (let i = 0; i < 3; i++)
      expect(
        g.lifeCommand("s1", {
          k: "intrigue",
          act: "write",
          c: B.id,
          subject: `No. ${i}`,
          body: `Letter ${i}`,
        }),
      ).toBeNull();
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "write",
        c: B.id,
        body: "A fourth",
      }),
    ).toMatch(/today/);
    expect(a.purse).toBeLessThan(50);
    // They arrive in her letter case, from him, in his words.
    ticks(g, 20);
    const got = postOf(b).filter((l) => l.kind === "personal" && l.to === B.id);
    expect(got.map((l) => l.text).sort()).toEqual([
      "Letter 0",
      "Letter 1",
      "Letter 2",
    ]);
    expect(got[0].subject).toMatch(/^No\. /);
    // And she can write back.
    expect(
      g.lifeCommand("s2", {
        k: "intrigue",
        act: "write",
        c: a.c,
        body: "Received, with thanks.",
        re: got[0].id,
      }),
    ).toBeNull();
    const reply = postOf(b).find(
      (l) => l.from === B.id && l.kind === "personal",
    )!;
    expect(reply.re).toBe(got[0].id);
  });
});

// ---------------------------------------------------------------- what other players are sent

describe("secrecy: each player's copy of the game", () => {
  test("a plot and a private letter are in their own players' copies only", () => {
    const { g, a, b } = pair(61);
    const s = g.s;
    const B = me(g, b);
    a.met.push(B.id);
    a.purse = b.purse = 200;
    g.lifeCommand("s1", {
      k: "intrigue",
      act: "plot",
      c: B.id,
      method: "ambush",
    });
    g.lifeCommand("s1", {
      k: "intrigue",
      act: "write",
      c: B.id,
      subject: "Private",
      body: "The secret word is quince.",
    });
    const forB = JSON.stringify(stateForIntrigue(s, "s2"));
    const forA = JSON.stringify(stateForIntrigue(s, "s1"));
    expect(forB).not.toMatch(/quince/);
    expect(forB).not.toMatch(/set a plot/i);
    expect(stateForIntrigue(s, "s2").intrigue?.schemes.length ?? 0).toBe(0);
    expect(forA).toMatch(/quince/);
    expect(stateForIntrigue(s, "s1").intrigue?.schemes.length).toBe(1);
    expect(forA).toMatch(/set a plot/i);
  });

  test("a kept lover's allowance is in the month's figure, and is what's paid", () => {
    const { g, life } = solo(71);
    const s = g.s;
    const her = single(g, life)[0];
    aged(g, her, 26);
    life.purse = 500;
    const cost = keepCost(s, her);
    intrigue(g).kept.push({
      seat: "s1",
      by: life.c,
      c: her.id,
      since: s.day,
      cost,
      owed: 0,
    });
    const line = ledgerForecast(s, g.w, life).lines.find(
      (p) => p.key === "intr:kept",
    );
    expect(line?.value).toBe(-cost);
    expect(JSON.stringify(line)).not.toMatch(new RegExp(her.first));
    toNextMonth(g);
    const st = (life.statements ?? [])[(life.statements ?? []).length - 1];
    const paid = JSON.stringify(st ?? life.books ?? {});
    expect(paid).toMatch(/intr:kept/);
  });
});

// ---------------------------------------------------------------- through the rooms server

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

describe("through the rooms server: plots and private letters are sent to nobody else", () => {
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

  test("Alden plots against Beatrice and writes to her; Cato is sent none of it, and Beatrice only her letter (and what she finds out)", async () => {
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
    const A = lifeOfSeat(game.s, hg.you)!;
    const B = lifeOfSeat(game.s, bg.you)!;
    const C = lifeOfSeat(game.s, cg.you)!;
    A.purse = B.purse = C.purse = 200;
    A.met.push(B.c);

    // The server checks a letter's length, and how many a minute.
    expect(
      await host.cmd({
        k: "intrigue",
        act: "write",
        c: B.c,
        body: "x".repeat(NOTE_MAX * 2 + 1),
      }),
    ).toMatch(/characters/);
    expect(
      await host.cmd({ k: "intrigue", act: "plot", c: B.c, method: "ambush" }),
    ).toBeNull();
    expect(
      await host.cmd({
        k: "intrigue",
        act: "write",
        c: B.c,
        subject: "Quince",
        body: "Meet me at the wharf. Tell nobody: marmalade.",
      }),
    ).toBeNull();
    const x = intrigueOf(game.s).schemes[0];
    expect(x).toBeDefined();
    x.odds = { ...x.odds, d: 0 };
    // Days pass: the letter arrives, the plot ripens (and Beatrice hears things).
    for (let d = 0; d < 60; d++) {
      game.tick();
      B.health = A.health = C.health = 100;
      if (d % 5 === 4) await cato.cmd({ k: "will", share: d % 2 === 0 });
    }
    await bea.cmd({ k: "will", share: true });
    await host.cmd({ k: "will", share: true });
    await settle();

    // Cato: nothing of it, ever.
    const catoSaw = cato.raw.join("\n");
    expect(catoSaw).not.toMatch(/marmalade/);
    expect(catoSaw).not.toMatch(/Quince/);
    expect(catoSaw).not.toMatch(/set a plot/i);
    expect(catoSaw).not.toMatch(/intr-warn|intr-strike/);
    const cs = cato.state();
    expect(cs.intrigue?.schemes.length ?? 0).toBe(0);
    for (const life of cs.lives) {
      if (life.seat === cg.you) continue;
      expect(life.journal.some((j) => j.sec)).toBe(false);
      expect((life.post ?? []).some((p) => p.kind === "personal")).toBe(false);
      expect(life.events.some((e) => e.key.startsWith("intr-"))).toBe(false);
      expect(Object.keys(life.cooldowns).some((k) => /intr/.test(k))).toBe(
        false,
      );
    }

    // Beatrice: her letter, in his words; the plot only if she's found it out.
    const bs = bea.state();
    const mine = bs.lives.find((x) => x.seat === bg.you)!;
    const letter = (mine.post ?? []).find((p) => p.kind === "personal");
    expect(letter?.text).toMatch(/marmalade/);
    expect(letter?.subject).toBe("Quince");
    const beaSaw = bea.raw.join("\n");
    expect(beaSaw).not.toMatch(/set a plot/i);
    const knows = !!x.knows;
    expect((bs.intrigue?.schemes.length ?? 0) > 0).toBe(knows);
    const aldenToB = bs.lives.find((y) => y.seat === hg.you)!;
    expect(aldenToB.journal.some((j) => j.sec)).toBe(false);

    // Alden: his plot, and his letter.
    const as = host.state();
    expect(as.intrigue?.schemes.length).toBe(1);
    const sent = (as.lives.find((y) => y.seat === hg.you)!.post ?? []).find(
      (p) => p.kind === "personal",
    );
    expect(sent?.text).toMatch(/marmalade/);

    // Coming back (a resync), the full state hides them too.
    const back = await client("Cato");
    const again = back.next("game");
    back.send({ t: "rejoin", code: l.code, secret: cg.secret });
    const g2 = await again;
    expect(JSON.stringify(g2.state)).not.toMatch(/marmalade|set a plot/i);
  }, 120_000);
});
