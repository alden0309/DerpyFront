// CHAMBER (r16): the council's varied business (none twice in a year), the
// factions that remember votes and stands (and say why, in their members'
// opinions), the assembly's yearly session (a scene for each player, speeches
// at the odds shown, the house divides), a seat's work that comes to
// something later, and the journal's small talk kept fresh; and that all of
// it saves, loads, rides the deltas, leaves other players' words alone and
// runs the same twice.

import { describe, expect, test } from "vitest";
import { memberFaction } from "../../src/conquest/engine/Assembly";
import { dateOf, dayOf } from "../../src/conquest/engine/Calendar";
import {
  GOSSIP_HEARINGS,
  GOSSIP_LINES,
  gossipAt,
  JOURNAL_CAP,
} from "../../src/conquest/engine/Chatter";
import {
  councillorVote,
  ensureCabinet,
  factionOf,
  MEASURES,
  putMeasure,
  seatActionCheck,
  seatCouncillor,
  settleMatter,
} from "../../src/conquest/engine/Council";
import { seatHolderId } from "../../src/conquest/engine/CouncilTitles";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  BUSINESS,
  DOCKET_REST,
  docketKey,
  PETITIONS,
} from "../../src/conquest/engine/Docket";
import {
  factionName,
  factionNamesOf,
  interestOf,
  markFaction,
  partyOf,
  standWith,
} from "../../src/conquest/engine/Factions";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import { LATER } from "../../src/conquest/engine/Later";
import { autoAnswerLife } from "../../src/conquest/engine/LifeEvents";
import { meOf, opinionOf } from "../../src/conquest/engine/LifeQueries";
import { writeToCrown } from "../../src/conquest/engine/Politics";
import {
  divisionNow,
  QUESTION_BY_KEY,
  QUESTIONS,
  SESSION_DAYS,
  speechOf,
  standInSession,
} from "../../src/conquest/engine/Session";
import type { GameState, Life } from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, ticks, world } from "./LifeUtil";

function strong(life: Life): void {
  life.renown = 60;
  life.favor = 40;
  life.purse = 300;
  for (const k of Object.keys(life.skills) as (keyof Life["skills"])[])
    life.skills[k] = 10;
}

/** A councillor of England at Jamestown in 1700. */
function councillor(
  seed = 7,
  seat:
    | "envoy"
    | "surveyor"
    | "treasurer"
    | "attorney"
    | "spymaster"
    | "marshal"
    | "chaplain" = "envoy",
) {
  const g = world({
    start: 1700,
    seed,
    plans: [{ seat: "s1", name: "A", plan: plan({ age: 32 }) }],
  });
  const life = lifeOf(g);
  strong(life);
  const n = meOf(g.s, life)!.nation;
  life.prov = g.s.nations[n].capital;
  ensureCabinet(g, n);
  seatCouncillor(g, n, seat, life.c, "for the test");
  return { g, life, n };
}

/** Answer every scene that's up: aye in council, the first choice at the session, the first allowed otherwise. */
function answerAll(g: ConquestGame, life: Life): void {
  for (const ev of [...life.events]) {
    const err = g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: 0 });
    if (err)
      for (let i = 1; i < ev.choices.length; i++)
        if (!g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: i }))
          break;
  }
}

const toDay = (g: ConquestGame, day: number) => {
  while (g.s.day < day && !g.s.over) g.tick();
};

// ---------------------------------------------------------------- the council's business

/** The last of a list (the tests' lib has no Array.prototype.at). */
const last = <T>(xs: T[]): T => xs[xs.length - 1];

describe("the council's business", () => {
  test("varied business, real stakes, and no kind of it twice in a year", () => {
    const { g, life, n } = councillor(7, "envoy");
    const seen = new Map<number, { key: string; dk: string; day: number }>();
    for (let d = 0; d < 4 * 365 && !g.s.over; d++) {
      g.tick();
      answerAll(g, life);
      for (const m of g.s.power?.cabinets[n]?.matters ?? [])
        if (!seen.has(m.id))
          seen.set(m.id, {
            key: m.key,
            dk: docketKey(m.key, m.arg),
            day: m.day,
          });
      // Keep the councillor at the table.
      if (seatHolderId(g.s, n, "envoy") !== life.c)
        seatCouncillor(g, n, "envoy", life.c, "for the test");
    }
    const list = [...seen.values()].sort((a, b) => a.day - b.day);
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(new Set(list.map((x) => x.key)).size).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < i; j++)
        if (list[j].dk === list[i].dk)
          expect(
            list[i].day - list[j].day,
            `${list[i].dk} twice within a year`,
          ).toBeGreaterThanOrEqual(DOCKET_REST);
    // Every kind of business is a measure the council knows, with its stakes and leanings.
    for (const b of BUSINESS) {
      expect(MEASURES[b.key], b.key).toBeTruthy();
      expect(b.label.length).toBeGreaterThan(5);
    }
  });

  test("a councillor's own measure waits on the docket too", () => {
    const { g, life, n } = councillor(7, "envoy");
    const o = g.s.nations.findIndex((x) => x.alive && x.kind === "native");
    g.nation(n).gold = 100;
    const m = putMeasure(g, n, "presents", o, g.s.nations[n].ruler);
    expect(typeof m).not.toBe("string");
    // The council divides at the month's turn; then it's off the table, and still waits.
    ticks(g, 40);
    expect(typeof m !== "string" && m.status).not.toBe("open");
    const c = seatActionCheck(g.s, life, "presents");
    expect(c.ok).toBe(false);
    expect(c.ok ? "" : c.why).toMatch(/lately: again in \d+ days/);
  });

  test("a county's petition: carried, the county has it; refused, the county is angrier", () => {
    const { g, n } = councillor(7, "envoy");
    const p = g.s.nations[n].capital;
    g.nation(n).gold = 100;
    const ferry = PETITIONS.findIndex((x) => x.key === "ferry");
    const a = putMeasure(g, n, "petition", p * 8 + ferry, g.s.nations[n].ruler);
    if (typeof a === "string") throw new Error(a);
    expect(a.title).toMatch(/A petition from .* for a ferry and a road/);
    expect(a.text).toMatch(/10 from the treasury/);
    settleMatter(g, n, a, true, 6, 1);
    expect(g.s.provinces[p].mods.some((m) => m.key === "council:ferry")).toBe(
      true,
    );
    expect(g.s.nations[n].gold).toBe(90);
    const courthouse = PETITIONS.findIndex((x) => x.key === "courthouse");
    const b = putMeasure(
      g,
      n,
      "petition",
      p * 8 + courthouse,
      g.s.nations[n].ruler,
    );
    if (typeof b === "string") throw new Error(b);
    settleMatter(g, n, b, false, 1, 6);
    expect(g.s.provinces[p].mods.some((m) => m.key === "council:refused")).toBe(
      true,
    );
  });

  test("an inquiry into the treasury: a guilty receiver is dismissed in disgrace; never a player's", () => {
    const { g, n } = councillor(7, "envoy");
    const id = seatHolderId(g.s, n, "treasurer");
    expect(id).toBeGreaterThanOrEqual(0);
    g.char(id).scheme = {
      kind: "embezzle",
      target: n,
      started: g.s.day,
      progress: 10,
      exposed: false,
    };
    const gold = g.s.nations[n].gold;
    const out = MEASURES.treasury.apply(g, n, -1);
    expect(out).toMatch(/put off the council in disgrace/);
    expect(seatHolderId(g.s, n, "treasurer")).toBe(-1);
    expect(g.s.nations[n].gold).toBeGreaterThan(gold);
    // A player keeps the treasury: no inquiry comes, and none can be put.
    const p = councillor(7, "treasurer");
    expect(MEASURES.treasury.blocked!(p.g.s, p.n, -1)).toMatch(/A player/);
    expect(
      BUSINESS.find((b) => b.key === "treasury")!.when(p.g, p.n),
    ).toBeNull();
  });

  test("war votes: a war carried is declared; a peace carried is made, or the belts come back", () => {
    const { g, n } = councillor(7, "marshal");
    const native = g.s.nations.find(
      (x) => x.alive && x.kind === "native" && x.id !== n,
    )!;
    const out = MEASURES["native-war"].apply(g, n, native.id);
    expect(out).toMatch(/War is declared/);
    expect(
      g.s.wars.some(
        (w) =>
          (w.a === n && w.b === native.id) || (w.b === n && w.a === native.id),
      ),
    ).toBe(true);
    const peace = MEASURES["native-peace"].apply(g, n, native.id);
    expect(peace).toMatch(/war is over|send the belts back/i);
    // The crown's war: the quota sent, or the reluctance noted.
    g.nation(n).gold = 50;
    MEASURES["war-quota"].apply(g, n, native.id);
    expect(g.s.nations[n].mods.some((m) => m.key === "council:quota")).toBe(
      true,
    );
    MEASURES["war-quota"].lost!(g, n, native.id);
    expect(g.s.nations[n].mods.some((m) => m.key === "council:noquota")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------- the factions

describe("the factions", () => {
  test("a vote is remembered by the factions that care, with the reasons in their members' opinion", () => {
    const { g, life, n } = councillor(7, "envoy");
    const by = (g.s.polities[n]?.assembly ?? []).find(
      (c) => !g.s.lives.some((l) => l.c === c),
    )!;
    const m = putMeasure(g, n, "paper", -1, by);
    if (typeof m === "string") throw new Error(m);
    expect(
      g.lifeCommand("s1", { k: "power", act: "vote", n, id: m.id, side: -1 }),
    ).toBeNull();
    expect(standWith(g.s, n, life.c, "merchants")!.v).toBeGreaterThan(0);
    expect(standWith(g.s, n, life.c, "planters")!.v).toBeLessThan(0);
    expect(standWith(g.s, n, life.c, "merchants")!.why[0].t).toMatch(
      /you voted against an emission of paper money/,
    );
    // A merchant in the colony's politics thinks the better of you for it, and says why.
    const merchant = [
      ...(g.s.polities[n]?.assembly ?? []),
      ...g.s.nations[n].court,
    ].find(
      (c) =>
        !g.s.lives.some((l) => l.c === c) &&
        g.s.chars[c]?.alive &&
        interestOf(g.s, n, c) === "merchants",
    );
    expect(merchant).toBeDefined();
    const op = opinionOf(g.s, g.s.chars[merchant!], life);
    const part = op.parts.find((p) => /The merchants remember/.test(p.label));
    expect(part?.label).toMatch(/you voted against an emission of paper money/);
    expect(part!.value).toBeGreaterThan(0);
  });

  test("a councillor of a faction that likes you leans toward your measures", () => {
    const { g, life, n } = councillor(7, "envoy");
    const cab = ensureCabinet(g, n);
    const other = seatHolderId(g.s, n, "marshal");
    const before = councillorVote(g.s, n, "trade", "marshal", other, life.c);
    for (const f of [
      "court",
      "country",
      "merchants",
      "planters",
      "frontier",
      "clergy",
    ] as const)
      markFaction(g, cab, life.c, f, -40, "you spat in the punch");
    const after = councillorVote(g.s, n, "trade", "marshal", other, life.c);
    expect(after.v).toBeLessThanOrEqual(before.v);
    expect(after.v).toBe(-1);
  });

  test("parties: the computer's people as the council and the house reckon them; a player's by record or regard", () => {
    const { g, life, n } = councillor(7, "envoy");
    for (const c of g.s.polities[n]?.assembly ?? [])
      if (
        !g.s.lives.some((l) => l.c === c) &&
        seatHolderId(g.s, n, "speaker") !== c
      )
        expect(partyOf(g.s, n, c)).toBe(memberFaction(g.s, n, c));
    const marshal = seatHolderId(g.s, n, "marshal");
    expect(partyOf(g.s, n, marshal)).toBe(factionOf(g.s, n, marshal));
    // A player who hasn't voted: by what the two parties think of them.
    const cab = ensureCabinet(g, n);
    delete cab.record;
    delete cab.faction[life.c];
    expect(partyOf(g.s, n, life.c)).toBeNull();
    markFaction(g, cab, life.c, "country", 12, "you spoke for the address");
    expect(partyOf(g.s, n, life.c)).toBe("country");
  });

  test("each people names them its own way; memories fade each January", () => {
    expect(factionNamesOf("french").court).toBe("the governor's party");
    expect(factionNamesOf("spanish").country).toBe("the creoles");
    expect(factionNamesOf("puritan").country).toBe("the popular party");
    const { g, life, n } = councillor(7, "envoy");
    expect(factionName(g.s, n, "frontier")).toBe("the backcountry men");
    const cab = ensureCabinet(g, n);
    markFaction(
      g,
      cab,
      life.c,
      "clergy",
      20,
      "you spoke for the clergy's rate",
    );
    toDay(g, dayOf(dateOf(g.s.day).year + 1, 0, 2));
    expect(standWith(g.s, n, life.c, "clergy")!.v).toBe(16);
  });
});

// ---------------------------------------------------------------- the session

describe("the assembly's session", () => {
  function member(seed = 7) {
    const c = councillor(seed, "envoy");
    const pol = c.g.s.polities[c.n]!;
    if (!pol.assembly.includes(c.life.c)) pol.assembly.push(c.life.c);
    return c;
  }

  test("the house sits on 1 April: a scene, a stand, a speech; it divides a month later and does what it carried", () => {
    const { g, life, n } = member();
    const year = dateOf(g.s.day).year + (dateOf(g.s.day).month >= 3 ? 1 : 0);
    toDay(g, dayOf(year, 3, 1));
    const ev = life.events.find((e) => e.key === "session-sits");
    expect(ev).toBeDefined();
    expect(ev!.choices).toHaveLength(4);
    expect(ev!.choices[0].label).toMatch(/\(Persuasion \d+%\)$/);
    const sess = g.s.power!.cabinets[n].session!;
    expect(sess.until - sess.opened).toBe(SESSION_DAYS);
    expect(
      g.lifeCommand("s1", { k: "event", id: ev!.id, choice: 0 }),
    ).toBeNull();
    expect(sess.stands[life.c]).toBe(0);
    expect(sess.swayed[life.c]).toBeGreaterThanOrEqual(0);
    const q = QUESTION_BY_KEY.get(sess.key)!;
    const glad = Object.entries(q.choices[0].marks).find(([, v]) => v > 0)!;
    expect(last(standWith(g.s, n, life.c, glad[0] as never)!.why).t).toMatch(
      /you spoke for/,
    );
    const before = divisionNow(g.s, n, sess);
    toDay(g, sess.until + 1);
    expect(sess.carried).toBeDefined();
    expect(sess.votes).toEqual(before);
    expect(sess.text).toBeTruthy();
    expect(
      life.journal.some((j) => /divides on .*: .* It carries/.test(j.text)),
    ).toBe(true);
  });

  test("two players: each speaks for themselves; one who says nothing stands aside, and nobody speaks in their name", () => {
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        { seat: "s1", name: "A", plan: plan({ age: 30 }) },
        {
          seat: "s2",
          name: "B",
          plan: plan({ age: 30, first: "Beatrice", female: true }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const n = meOf(g.s, a)!.nation;
    const pol = g.s.polities[n]!;
    for (const l of [a, b]) {
      strong(l);
      if (!pol.assembly.includes(l.c)) pol.assembly.push(l.c);
    }
    const year = dateOf(g.s.day).year + (dateOf(g.s.day).month >= 3 ? 1 : 0);
    toDay(g, dayOf(year, 3, 1));
    const sess = g.s.power!.cabinets[n].session!;
    const ea = a.events.find((e) => e.key === "session-sits")!;
    expect(b.events.some((e) => e.key === "session-sits")).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "event", id: ea.id, choice: 2 }),
    ).toBeNull();
    // The server's clock runs out on Beatrice's scene: she stands aside.
    const eb = b.events.find((e) => e.key === "session-sits")!;
    autoAnswerLife(g, "s2", eb.id);
    expect(sess.stands[b.c]).toBe(-1);
    expect(sess.swayed[b.c]).toBeUndefined();
    expect(g.s.power!.cabinets[n].stand?.[b.c]).toBeUndefined();
    toDay(g, sess.until + 1);
    expect(b.journal.some((j) => /You stood aside/.test(j.text))).toBe(true);
    // Nothing in Beatrice's journal speaks for Alden, or in Alden's for her.
    expect(b.journal.some((j) => /You spoke for/.test(j.text))).toBe(false);
  });

  test("a speech's odds are the ones rolled", () => {
    const { g, life, n } = member();
    const cab = ensureCabinet(g, n);
    const sp = speechOf(g.s, n, life);
    let pass = 0;
    const N = 1200;
    for (let i = 0; i < N; i++) {
      cab.session = {
        id: 100000 + i,
        year: 1700,
        key: "roads",
        arg: -1,
        opened: g.s.day,
        until: g.s.day + 30,
        stands: {},
        swayed: {},
      };
      standInSession(g, life, n, cab.session.id, 0);
      if (cab.session.swayed[life.c] === sp.pass) pass++;
    }
    expect(Math.abs(pass / N - sp.chance)).toBeLessThan(0.045);
  });

  test("the house's levers go to the governor's track when it listens, and fall back when it doesn't", () => {
    const { g, life, n } = member();
    const q = QUESTION_BY_KEY.get("supply")!;
    const heard: string[] = [];
    const h = (gg: ConquestGame, nn: number, lever: string, by: number[]) => {
      heard.push(`${lever}:${by.join(",")}`);
      return true;
    };
    hooks.houseLever.push(h);
    q.choices[2].carry(g, n, -1, [life.c]);
    hooks.houseLever.splice(hooks.houseLever.indexOf(h), 1);
    expect(heard).toEqual([`supply:${life.c}`]);
    expect(g.s.nations[n].mods.some((m) => m.key === "session:nosupply")).toBe(
      false,
    );
    q.choices[2].carry(g, n, -1, [life.c]);
    expect(g.s.nations[n].mods.some((m) => m.key === "session:nosupply")).toBe(
      true,
    );
    // Withholding the salary falls back on the house's own old way.
    QUESTION_BY_KEY.get("salary")!.choices[2].carry(g, n, -1, [life.c]);
    expect(g.s.power!.cabinets[n].unpaid).toBeGreaterThan(g.s.day);
  });

  test("a player governor hears what the house sits on and what it carried, and isn't asked to settle his own salary", () => {
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        { seat: "s1", name: "A", plan: plan({ age: 30 }) },
        {
          seat: "s2",
          name: "B",
          plan: plan({ age: 40, first: "Bartholomew" }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const n = meOf(g.s, a)!.nation;
    strong(a);
    const pol = g.s.polities[n]!;
    if (!pol.assembly.includes(a.c)) pol.assembly.push(a.c);
    pol.assembly = pol.assembly.filter((c) => c !== b.c);
    g.nation(n).ruler = b.c;
    expect(QUESTION_BY_KEY.get("salary")!.when(g, n)).toBeNull();
    const year = dateOf(g.s.day).year + (dateOf(g.s.day).month >= 3 ? 1 : 0);
    toDay(g, dayOf(year, 3, 1));
    const sess = g.s.power!.cabinets[n].session!;
    expect(sess.key).not.toBe("salary");
    expect(b.events.some((e) => e.key === "session-sits")).toBe(false);
    expect(b.journal.some((j) => / sits on .*It divides on/.test(j.text))).toBe(
      true,
    );
    toDay(g, sess.until + 1);
    expect(b.journal.some((j) => /divides on .*It carries/.test(j.text))).toBe(
      true,
    );
  });

  test("ten questions, each with three choices that say what they do", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(10);
    for (const q of QUESTIONS) {
      expect(q.choices).toHaveLength(3);
      for (const c of q.choices) {
        expect(c.tip.length).toBeGreaterThan(10);
        expect(Object.keys(c.marks).length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------- what a seat's work comes to

describe("a seat's work comes to something later", () => {
  test("a survey opens a road through the backcountry months later: in the journal, and on the list", () => {
    const { g, life, n } = councillor(7, "surveyor");
    life.skills.woodcraft = 20;
    expect(
      g.lifeCommand("s1", { k: "power", act: "seat", key: "survey" }),
    ).toBeNull();
    const cab = g.s.power!.cabinets[n];
    const w = cab.later?.find((x) => x.key === "survey" && x.by === life.c);
    if (!w) {
      // The survey came home half done (the shown odds): nothing to come.
      expect(last(life.journal).text).toMatch(/half done|fever/);
      return;
    }
    expect(w.due - w.day).toBeGreaterThanOrEqual(LATER.survey.days[0]);
    expect(w.due - w.day).toBeLessThanOrEqual(LATER.survey.days[1]);
    toDay(g, w.due + 1);
    const done = cab.later!.find((x) => x.id === w.id)!;
    expect(done.text).toBeTruthy();
    expect(life.journal.some((j) => j.text === done.text)).toBe(true);
    const key = done.good ? "later:road" : "later:mire";
    expect(g.s.provinces[w.arg2].mods.some((m) => m.key === key)).toBe(true);
    if (done.good)
      expect(done.text).toMatch(/Your road through .* is open: trade up/);
  });

  test("how often it turns out well is the chance the guide shows", () => {
    const { g, life, n } = councillor(7, "attorney");
    const cab = g.s.power!.cabinets[n];
    let good = 0;
    let all = 0;
    for (let i = 0; i < 600; i++) {
      delete life.cooldowns["seat:draft"];
      if (g.lifeCommand("s1", { k: "power", act: "seat", key: "draft" }))
        continue;
      const w = last(cab.later!);
      all++;
      if (w.good) good++;
      cab.later = [];
    }
    expect(all).toBe(600);
    expect(Math.abs(good / all - LATER.draft.p)).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------- the journal

describe("the journal's small talk", () => {
  test("talking to the governor every week: news first, the rest written down only the first few times a year", () => {
    const { g, life, n } = councillor(7, "envoy");
    const gov = g.s.nations[n].ruler;
    const counts = new Map<string, number>();
    let written = 0;
    for (let w = 0; w < 52; w++) {
      ticks(g, 7);
      life.prov = g.s.nations[n].capital;
      life.travel = null;
      delete life.cooldowns[`p:talk:${gov}`];
      const before = life.journal.length;
      const err = g.lifeCommand("s1", { k: "person", c: gov, act: "talk" });
      if (err) continue;
      for (const j of life.journal.slice(before)) {
        if (/grown to/.test(j.text)) continue;
        written++;
        counts.set(j.text, (counts.get(j.text) ?? 0) + 1);
      }
    }
    // Small talk, at most the cap a year, and news on top.
    expect(written).toBeLessThan(18);
    for (const [t, c] of counts) expect(c, t).toBeLessThanOrEqual(2);
  });

  test("the levee: everyone by name the first time, then the usual company", () => {
    const { g, life, n } = councillor(7, "envoy");
    const doIt = () => {
      delete life.cooldowns["act:respects"];
      life.prov = g.s.nations[n].capital;
      const before = life.journal.length;
      g.lifeCommand("s1", { k: "act", place: "governor", act: "respects" });
      return life.journal
        .slice(before)
        .map((j) => j.text)
        .join(" ");
    };
    expect(doIt()).toMatch(/At the governor's levee you meet .* and /);
    const again = doIt();
    expect(again).toMatch(/At the governor's levee: /);
    expect(again).not.toMatch(/you meet/);
  });

  test("the town's old stories are retired after a couple of hearings, and the world's dice are untouched", () => {
    const { g, life } = councillor(7, "envoy");
    const heard = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      g.s.day += 30;
      const rng = g.s.rng;
      const before = life.journal.length;
      gossipAt(g, life, (i * 0.618) % 1);
      expect(g.s.rng).toBe(rng);
      for (const j of life.journal.slice(before))
        heard.set(j.text, (heard.get(j.text) ?? 0) + 1);
    }
    for (const x of GOSSIP_LINES)
      expect(heard.get(x.text) ?? 0, x.text).toBeLessThanOrEqual(
        GOSSIP_HEARINGS,
      );
    expect(JOURNAL_CAP.drink).toBeGreaterThan(0);
  });

  test("with another player's character, only what you did: no laughing at your story or thanks in their name", () => {
    const g = world({
      start: 1700,
      seed: 9,
      plans: [
        { seat: "s1", name: "A", plan: plan({ age: 30 }) },
        {
          seat: "s2",
          name: "B",
          plan: plan({ age: 30, first: "Beatrice", female: true }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    a.purse = 100;
    const lines: string[] = [];
    for (let i = 0; i < 12; i++) {
      ticks(g, 8);
      a.travel = null;
      b.travel = null;
      b.prov = a.prov;
      g.char(b.c).home = a.prov;
      delete a.cooldowns[`p:talk:${b.c}`];
      const before = a.journal.length;
      const err = g.lifeCommand("s1", { k: "person", c: b.c, act: "talk" });
      if (err) continue;
      for (const j of a.journal.slice(before))
        if (!/grown to/.test(j.text)) lines.push(j.text);
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const t of lines)
      expect(t).toMatch(/^You (get to know|pass|stop|spend|seek)/);
    delete a.cooldowns[`p:gift:${b.c}`];
    const before = a.journal.length;
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "gift", arg: 3 }),
    ).toBeNull();
    const gave = a.journal.slice(before).map((j) => j.text);
    expect(gave.some((t) => /^You gave Beatrice .*3 coins\.$/.test(t))).toBe(
      true,
    );
  });

  test("a letter to the crown names the colony's own city and board, from a pool", () => {
    const { g, life } = councillor(7, "envoy");
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      g.s.day += 45;
      const before = life.journal.length;
      writeToCrown(g, life, true);
      for (const j of life.journal.slice(before))
        if (!/grown to/.test(j.text)) seen.add(j.text);
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const t of seen) {
      expect(t).not.toMatch(/or Paris|Seville/);
      expect(t).toMatch(/London|Board of Trade/);
    }
  });

  test("the governor's gout is talked of only when he has it", () => {
    const { g, life, n } = councillor(7, "envoy");
    const gov = g.char(g.s.nations[n].ruler);
    gov.traits = gov.traits.filter((t) => t !== "gouty");
    for (let i = 0; i < 30; i++) {
      g.s.day += 40;
      gossipAt(g, life, 0.5);
    }
    expect(life.journal.some((j) => /gout/.test(j.text))).toBe(false);
    gov.traits.push("gouty");
    g.s.day += 400;
    gossipAt(g, life, 0.5);
    expect(last(life.journal).text).toMatch(/governor's gout is worse/);
  });
});

// ---------------------------------------------------------------- saves and determinism

describe("saving, deltas, determinism", () => {
  function busy(seed: number): ConquestGame {
    const { g, life, n } = councillor(seed, "surveyor");
    const pol = g.s.polities[n]!;
    if (!pol.assembly.includes(life.c)) pol.assembly.push(life.c);
    return g;
  }

  test("the chamber's state survives a save and load and rides the deltas; old saves load", () => {
    const g = busy(11);
    const life = lifeOf(g);
    const client: GameState = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    for (let d = 0; d < 400; d++) {
      g.tick();
      answerAll(g, life);
      if (d === 5)
        g.lifeCommand("s1", { k: "power", act: "seat", key: "survey" });
    }
    gossipAt(g, life, 0.3);
    applyDelta(client, g.takeDelta());
    expect(client.power?.cabinets).toEqual(g.s.power?.cabinets);
    expect(client.lives.find((l) => l.seat === "s1")?.chatter).toEqual(
      life.chatter,
    );
    const n = meOf(g.s, life)!.nation;
    const cab = g.s.power!.cabinets[n];
    expect(cab.docket && Object.keys(cab.docket).length).toBeTruthy();
    expect(cab.session).toBeTruthy();
    expect(life.chatter).toBeTruthy();
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    ticks(g2, 60);
    // An old save without any of it.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const c of Object.values(old.power?.cabinets ?? {})) {
      delete c.docket;
      delete c.stand;
      delete c.later;
      delete c.session;
      delete c.sessions;
    }
    for (const l of old.lives) delete l.chatter;
    const g3 = new ConquestGame(map, old);
    ticks(g3, 400);
    expect(g3.s.power?.cabinets[n]?.session).toBeTruthy();
  });

  test("the same seed runs the same", () => {
    const run = () => {
      const g = busy(5);
      const life = lifeOf(g);
      for (let d = 0; d < 500; d++) {
        g.tick();
        answerAll(g, life);
      }
      return JSON.stringify([
        g.s.power,
        life.journal.map((j) => j.text),
        life.chatter,
      ]);
    };
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------- a life outside politics

describe("a life outside politics", () => {
  test("a farmer far from the council sees no session and no factions, and keeps his old journal", () => {
    const g = world({ start: 1700, seed: 13 });
    const life = lifeOf(g);
    ticks(g, 3 * 365);
    expect(life.events.some((e) => e.key === "session-sits")).toBe(false);
    expect(
      life.journal.some((j) =>
        /divides on|you spoke for|The council carries/.test(j.text),
      ),
    ).toBe(false);
    for (const cab of Object.values(g.s.power?.cabinets ?? {}))
      expect(cab.stand?.[life.c]).toBeUndefined();
  });
});
