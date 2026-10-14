// LIFE (r21): skills on thirty levels and a rising curve (and old saves
// carried over), opinion that has to be earned, health with age and strain,
// teaching by the gap, study that grows Learning, someone's stats, duels to
// the death (and running), the one ordinal, positions for your own people,
// the bawdy house (its odds, the pox, a spouse, the minister, the secrecy),
// a dead duellist's kin, and save, load and the delta.

import { describe, expect, test } from "vitest";
import { knowOf, statsView } from "../../src/conquest/engine/Acquaint";
import {
  BAWDY,
  bawdyCheck,
  bawdyIn,
  bawdyOdds,
  bawdyRoll,
} from "../../src/conquest/engine/Bawdy";
import {
  ageHealth,
  maxHealth,
  strained,
  stressTier,
} from "../../src/conquest/engine/Body";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  DEATH,
  deathOdds,
  DOWN,
  duelOdds,
  startDuel,
  SWORD_TAKEN,
  SWORD_WOUND,
} from "../../src/conquest/engine/Duels";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { inviteText } from "../../src/conquest/engine/Gatherings";
import { interactionView } from "../../src/conquest/engine/Interactions";
import { lifeForOthers } from "../../src/conquest/engine/IntrigueCore";
import { actCheck, actLabel, ACTS } from "../../src/conquest/engine/LifeActs";
import { gainXp, heal, hurt } from "../../src/conquest/engine/LifeCore";
import {
  meOf,
  monthlyBudget,
  opinionOf,
  placesIn,
  skillOf,
} from "../../src/conquest/engine/LifeQueries";
import {
  carrySkills,
  ldice,
  markOn,
  SKILL_SCALE,
  STUDY,
} from "../../src/conquest/engine/LifeR21Core";
import {
  oldXpToNext,
  SKILL_MAX,
  skillTier,
  skillWeight,
  xpToNext,
  xpToReach,
} from "../../src/conquest/engine/LifeRules";
import { ordinal, ordinalWord } from "../../src/conquest/engine/Ordinal";
import { ageOf, settlers } from "../../src/conquest/engine/Queries";
import { isKindness, REGARD } from "../../src/conquest/engine/Regard";
import {
  bodyguardPlot,
  physicianDeath,
  postBudget,
  postValue,
  setPost,
} from "../../src/conquest/engine/Retinue";
import { teachRate, teachXp } from "../../src/conquest/engine/Teach";
import type {
  Character,
  Follower,
  FollowerKind,
  Gathering,
  Life,
} from "../../src/conquest/engine/Types";
import { SKILLS } from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

/** Grown townsfolk here, not played and not you. */
function townsfolk(g: ConquestGame, life: Life): Character[] {
  return (g.s.locals[life.prov] ?? [])
    .map((id) => g.s.chars[id])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        c.id !== life.c &&
        ageOf(g.s, c) >= 18 &&
        !g.s.lives.some((l) => l.c === c.id),
    );
}

/** Answer whatever scene of this key is waiting (first allowed choice by default). */
function answer(g: ConquestGame, life: Life, key: string, choice = 0): boolean {
  const ev = life.events.find((e) => e.key === key);
  if (!ev) return false;
  expect(
    g.lifeCommand(life.seat, { k: "event", id: ev.id, choice }),
  ).toBeNull();
  return true;
}

/** One of your people, made directly (a local taken into service). */
function follower(
  g: ConquestGame,
  life: Life,
  c: Character,
  kind: FollowerKind,
  rank = 1,
): Follower {
  const f: Follower = {
    id: g.nextId(),
    c: c.id,
    kind,
    rank,
    wage: 3,
    share: 0,
    loyalty: 60,
    joined: g.s.day,
    task: null,
  };
  (life.people ??= []).push(f);
  return f;
}

// ---------------------------------------------------------------- skills

describe("skills on thirty levels", () => {
  test("the first ten levels cost what they did; from 10 each costs more by the square", () => {
    expect(SKILL_MAX).toBe(30);
    for (let l = 0; l < 10; l++) expect(xpToNext(l)).toBe(oldXpToNext(l));
    expect(xpToNext(10)).toBe(166);
    expect(xpToNext(15)).toBe(436);
    expect(xpToNext(19)).toBe(868);
    expect(xpToNext(29)).toBe(2788);
    for (let l = 10; l < 30; l++)
      expect(xpToNext(l) - xpToNext(l - 1)).toBeGreaterThan(
        xpToNext(l - 1) - xpToNext(l - 2) - 0.0001,
      );
    expect(xpToReach(10)).toBe(940);
    expect(xpToReach(20)).toBe(5390);
    expect(xpToReach(30)).toBe(23640);
    expect(skillTier(8).name).toBe("Able");
    expect(skillTier(20).name).toBe("Master");
    expect(skillTier(30).name).toBe("Legend");
    // A sum with no ceiling counts levels above 20 at half.
    expect(skillWeight(12)).toBe(12);
    expect(skillWeight(30)).toBe(25);
  });

  test("a skill grows past 20 to 30, a level at a time, and says when it's a master's", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.skills.trade = 19;
    life.xp.trade = 0;
    gainXp(g, life, "trade", xpToNext(19));
    expect(life.skills.trade).toBe(20);
    expect(life.journal[life.journal.length - 1].text).toMatch(/Master/);
    gainXp(g, life, "trade", 1e6);
    expect(life.skills.trade).toBe(30);
    expect(life.xp.trade).toBe(0);
    expect(skillOf(g.s, life, "trade").total).toBeLessThanOrEqual(36);
  });

  test("an old save keeps its levels and carries each skill's progress as the same share of the way", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    expect(life.r21?.sk).toBe(SKILL_SCALE);
    // As round 20 saved it: no scale, progress in the old units.
    delete life.r21;
    life.skills.trade = 15;
    life.xp.trade = 110; // half of the old 220
    life.skills.craft = 20;
    life.xp.craft = 0;
    life.skills.farming = 4;
    life.xp.farming = 30;
    const saved = JSON.parse(JSON.stringify(g.s));
    const g2 = new ConquestGame(map, saved);
    const l2 = lifeOf(g2);
    expect(l2.r21?.sk).toBe(SKILL_SCALE);
    expect(l2.skills.trade).toBe(15);
    expect(l2.xp.trade).toBeCloseTo(0.5 * xpToNext(15), 0);
    expect(l2.skills.craft).toBe(20);
    expect(l2.skills.farming).toBe(4);
    expect(l2.xp.farming).toBe(30); // below 10 the cost is unchanged
    // Done once: loading again changes nothing.
    expect(carrySkills(l2)).toBe(false);
    const g3 = new ConquestGame(map, JSON.parse(JSON.stringify(g2.s)));
    expect(lifeOf(g3).xp.trade).toBe(l2.xp.trade);
    // A level 20 can go on now.
    gainXp(g2, l2, "craft", xpToNext(20));
    expect(l2.skills.craft).toBe(21);
  });
});

// ---------------------------------------------------------------- opinion

describe("opinion has to be earned", () => {
  test("a gift again adds less each time, up to its most; the kindnesses together count half past 25", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 500;
    const c = townsfolk(g, life)[0];
    const gift = () =>
      c.memories.find((m) => m.of === life.c && m.why === "A generous gift");
    const gives: number[] = [];
    for (let i = 0; i < 5; i++) {
      delete life.cooldowns[`p:gift:${c.id}`];
      expect(
        g.lifeCommand("s1", { k: "person", c: c.id, act: "gift", arg: 5 }),
      ).toBeNull();
      gives.push(gift()!.value);
    }
    const adds = gives.map((v, i) => v - (gives[i - 1] ?? 0));
    for (let i = 1; i < adds.length; i++)
      expect(adds[i]).toBeLessThan(adds[i - 1] + 0.001);
    expect(gift()!.n).toBe(5);
    expect(gives[4]).toBeLessThanOrEqual(12);
    // The kindnesses together: in full to 25, half beyond.
    c.memories.push(
      { of: life.c, why: "Courted me", value: 20, until: 0 },
      { of: life.c, why: "Generous to the poor", value: 10, until: 0 },
    );
    const op = opinionOf(g.s, c, life);
    const soft = op.parts.find((p) => p.label === "Kindnesses only go so far");
    expect(soft).toBeDefined();
    const kind = c.memories
      .filter((m) => m.of === life.c && m.value > 0 && isKindness(m.why))
      .reduce((a, m) => a + m.value, 0);
    expect(soft!.value).toBeCloseTo(-(kind - REGARD.soft) * REGARD.softRate, 0);
    // Anything else they remember counts in full (a life saved isn't a kindness worn thin).
    c.memories.push({ of: life.c, why: "Saved my life", value: 40, until: 0 });
    expect(
      opinionOf(g.s, c, life).parts.find(
        (p) => p.label === "Kindnesses only go so far",
      )!.value,
    ).toBe(soft!.value);
  });

  test("friendship needs a few conversations first", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const c = townsfolk(g, life)[1];
    const v0 = interactionView(g.s, g.w, life, c.id, "befriend");
    expect(
      v0.accept?.parts.some((p) => /hardly know each other/.test(p.label)),
    ).toBe(true);
    for (let i = 0; i < REGARD.knowTalks; i++) {
      delete life.cooldowns[`p:talk:${c.id}`];
      g.lifeCommand("s1", { k: "person", c: c.id, act: "talk" });
    }
    const v1 = interactionView(g.s, g.w, life, c.id, "befriend");
    expect(
      v1.accept?.parts.some((p) => /hardly know each other/.test(p.label)),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- the body

describe("health with age and strain", () => {
  test("the most health falls slowly from 45, and marks lower it", () => {
    expect(ageHealth(30)).toBe(100);
    expect(ageHealth(45)).toBe(100);
    expect(ageHealth(50)).toBe(95);
    expect(ageHealth(55)).toBe(88);
    expect(ageHealth(60)).toBe(80);
    expect(ageHealth(70)).toBe(60);
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    me.born = g.s.day - 60 * 365;
    expect(maxHealth(g.s, life)).toBe(80);
    me.traits.push("sickly");
    expect(maxHealth(g.s, life)).toBe(70);
    life.health = 60;
    heal(g, life, 40);
    expect(life.health).toBe(70);
    // A month brings an old body down to the most it can hold.
    life.health = 100;
    me.traits = me.traits.filter((t) => t !== "sickly");
    ticks(g, 32);
    if (meOf(g.s, life)?.id === me.id)
      expect(life.health).toBeLessThanOrEqual(80);
  });

  test("strain makes every hurt worse, by tiers", () => {
    expect(stressTier(10).mult).toBe(1);
    expect(stressTier(20).mult).toBe(1.1);
    expect(stressTier(45).mult).toBe(1.25);
    expect(stressTier(65).mult).toBe(1.4);
    expect(stressTier(90).mult).toBe(1.6);
    expect(strained(10, 85)).toBe(16);
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    for (const [stress, took] of [
      [0, 10],
      [25, 11],
      [45, 13],
      [65, 14],
      [85, 16],
    ]) {
      life.health = 80;
      life.stress = stress;
      hurt(g, life, 10, "a test");
      expect(80 - life.health).toBe(took);
    }
  });
});

// ---------------------------------------------------------------- teaching and study

describe("someone to teach you, and study with the minister", () => {
  test("the rate goes by how far above you they stand; the month pays the table", () => {
    expect(teachRate(5, 5)).toBe(0);
    expect(teachRate(7, 5)).toBe(0.25);
    expect(teachRate(8, 5)).toBe(0.75);
    expect(teachRate(13, 5)).toBe(1.5);
    expect(teachRate(25, 5)).toBe(2.5);
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const c = townsfolk(g, life).find((x) => x.role)!;
    const v = interactionView(g.s, g.w, life, c.id, "mentor");
    expect(v.teach).toBeDefined();
    expect(v.label).toMatch(/Ask them to teach you .+ \(×[\d.]+\)/);
    expect(v.teach!.rate).toBe(teachRate(v.teach!.theirs, v.teach!.mine));
    // Taken on: the month's lesson is the table's.
    life.ties[c.id] = "mentor";
    const sk = v.teach!.skill;
    const before = life.xp[sk] + xpToReach(life.skills[sk]);
    const want = teachXp(g.s, life, c);
    const was = { ...life.xp };
    // The month's lessons only (work and acts aside): call the ties' month.
    life.job = null;
    ticks(g, 40);
    if (want > 0 && life.ties[c.id] === "mentor")
      expect(life.xp[sk] + xpToReach(life.skills[sk])).toBeGreaterThanOrEqual(
        before + want - 0.5,
      );
    void was;
  });

  test("study with the minister grows letters, faith and (every 25 lessons) learning, three at most", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 100;
    const me = meOf(g.s, life)!;
    const lea = me.stats.lea;
    const def = ACTS.find((a) => a.key === "study")!;
    expect(actLabel(g.s, life, def)).toMatch(/letters, learning, faith/);
    const letters = life.xp.letters + xpToReach(life.skills.letters);
    life.area = "church";
    for (let i = 0; i < STUDY.per / STUDY.pts; i++) {
      delete life.cooldowns["act:study"];
      expect(
        g.lifeCommand("s1", { k: "act", place: "church", act: "study" }),
      ).toBeNull();
    }
    expect(me.stats.lea).toBe(lea + 1);
    expect(life.xp.letters + xpToReach(life.skills.letters)).toBeGreaterThan(
      letters,
    );
    for (let i = 0; i < 200; i++) {
      delete life.cooldowns["act:study"];
      g.lifeCommand("s1", { k: "act", place: "church", act: "study" });
    }
    expect(me.stats.lea).toBe(Math.min(STUDY.ceiling, lea + STUDY.most));
  });
});

// ---------------------------------------------------------------- their stats

describe("someone's stats", () => {
  test("you know your own exactly, a stranger only by their trade, and your odds against them", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const folk = townsfolk(g, life);
    const stranger = folk.find((c) => !life.met.includes(c.id) && c.role)!;
    const sv = statsView(g.s, life, stranger);
    expect(sv.know).toBeLessThanOrEqual(1);
    expect(sv.skills.filter((x) => x.v.value !== null)).toHaveLength(0);
    const trade = sv.skills.find((x) => x.skill === sv.trade);
    expect(trade?.v.lo).toBeDefined();
    expect(sv.duel!.sword).toBeGreaterThan(0);
    expect(sv.duel!.sword).toBeLessThan(1);
    expect(sv.duel!.death.win + sv.duel!.death.lose).toBeCloseTo(1, 5);
    // A friend: known well.
    life.ties[stranger.id] = "friend";
    const sf = statsView(g.s, life, stranger);
    expect(sf.know).toBe(3);
    expect(sf.skills.every((x) => x.v.value !== null)).toBe(true);
    expect(sf.fighting.value).not.toBeNull();
    expect(knowOf(g.s, life, stranger).why).toMatch(/friend/);
  });
});

// ---------------------------------------------------------------- duels to the death

describe("duels to the death", () => {
  test("the odds of the whole of it match pass after pass rolled from the same tables", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const foe = townsfolk(g, life)[0];
    const ctx = { c: foe.id, w: 1, sec: -1, mw: 0, fw: 0, r: 0 };
    for (const move of ["guard", "press", "feint"] as const) {
      const shown = deathOdds(g.s, life, ctx, move).win;
      const p = duelOdds(g.s, life, ctx, move).chance;
      const r = ldice(g.s, 77, move.length);
      let wins = 0;
      const N = 6000;
      for (let i = 0; i < N; i++) {
        let mw = 0;
        let fw = 0;
        while (mw < DOWN && fw < DOWN) {
          if (r.next() < p) fw += r.int(...SWORD_WOUND[move]);
          else mw += r.int(...SWORD_TAKEN[move]);
        }
        if (fw >= DOWN) wins++;
      }
      expect(Math.abs(wins / N - shown)).toBeLessThan(0.025);
    }
  });

  test("a sworn enemy calls you out to the death: no yielding, and you may run (a coward's name)", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const foe = townsfolk(g, life).find((c) => !c.traits.includes("craven"))!;
    life.ties[foe.id] = "nemesis";
    life.skills.fighting = 0;
    startDuel(g, life, foe, true);
    const call = life.events.find((e) => e.key === "duel-call")!;
    expect(call.ctx.dd).toBe(1);
    expect(call.body).toMatch(/To the death/i);
    answer(g, life, "duel-call", 1); // to the field without a second
    answer(g, life, "duel-weapons", 0); // smallswords
    const dawn = life.events.find((e) => e.key === "duel-dawn")!;
    expect(g.lifeCommand("s1", { k: "event", id: dawn.id, choice: 2 })).toMatch(
      /to the death/i,
    ); // no first blood
    answer(g, life, "duel-dawn", 0);
    life.renown = 30;
    const renown = life.renown;
    let ran = false;
    for (let i = 0; i < 20 && meOf(g.s, life); i++) {
      const ex = life.events.find((e) => e.key === "duel-exchange");
      if (!ex) break;
      // Never a yield in a duel to the death.
      expect(g.lifeCommand("s1", { k: "event", id: ex.id, choice: 7 })).toMatch(
        /to the death/i,
      );
      if (ex.ctx.r > 0) {
        answer(g, life, "duel-exchange", 8);
        ran = true;
        break;
      }
      answer(g, life, "duel-exchange", 1);
    }
    // Fighting 0 against them: hurt at the first pass, never down in one.
    expect(ran).toBe(true);
    {
      expect(markOn(g.s, life, "coward")).toBeDefined();
      expect(life.renown).toBeLessThanOrEqual(renown + DEATH.runRenown + 0.5);
      expect(
        life.milestones.some((m) =>
          /Ran from a duel to the death/.test(m.text),
        ),
      ).toBe(true);
      expect(
        opinionOf(g.s, townsfolk(g, life)[1], life).parts.some(
          (p) => p.label === "Ran from the field",
        ),
      ).toBe(true);
    }
  });

  test("to the death, the one who goes down dies of it", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const foe = townsfolk(g, life).filter(
      (c) => !c.traits.includes("craven"),
    )[1];
    life.skills.fighting = 30;
    life.health = 100;
    life.stress = 0;
    life.ties[foe.id] = "nemesis";
    startDuel(g, life, foe, true);
    expect(life.events.find((e) => e.key === "duel-call")!.ctx.dd).toBe(1);
    answer(g, life, "duel-call", 1);
    answer(g, life, "duel-weapons", 0);
    answer(g, life, "duel-dawn", 0);
    for (let i = 0; i < 30; i++)
      if (!answer(g, life, "duel-exchange", 1)) break;
    const me = meOf(g.s, life);
    expect(!!me || !foe.alive).toBe(true);
    if (me) {
      expect(foe.alive).toBe(false);
      expect(
        life.milestones.some((m) =>
          /Killed .+ in a duel to the death/.test(m.text),
        ),
      ).toBe(true);
    }
  });

  test("Challenge to the death says how likely they'd take it; between players, both agree and the loser dies", () => {
    const g = world({
      start: 1700,
      plans: [
        { seat: "s1", name: "Alden", plan: plan() },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({ first: "Beatrice", family: "Cole", female: true }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const foe = townsfolk(g, a)[0];
    a.ties[foe.id] = "rival";
    const v = interactionView(g.s, g.w, a, foe.id, "duel", 1);
    expect(v.label).toMatch(/Challenge to the death \(they'd take it \d+%\)/);
    // Another player is asked.
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "duel", arg: 1 }),
    ).toBeNull();
    const ev = b.events.find((e) => e.key === "p2p-duel")!;
    expect(ev.ctx.dd).toBe(1);
    expect(ev.body).toMatch(/to the death/);
    const ac = a.c;
    const bc = b.c;
    answer(g, b, "p2p-duel", 0);
    const dead = [ac, bc].filter((c) => !g.s.chars[c].alive);
    expect(dead).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- ordinals

describe("ordinals", () => {
  test("1st, 2nd, 3rd, 11th, 12th, 13th, 21st... and in words", () => {
    const want: Record<number, string> = {
      1: "1st",
      2: "2nd",
      3: "3rd",
      4: "4th",
      11: "11th",
      12: "12th",
      13: "13th",
      21: "21st",
      22: "22nd",
      23: "23rd",
      31: "31st",
      101: "101st",
      111: "111th",
      112: "112th",
      113: "113th",
      0: "0th",
    };
    for (const [k, v] of Object.entries(want))
      expect(ordinal(Number(k))).toBe(v);
    expect(ordinalWord(1)).toBe("first");
    expect(ordinalWord(2)).toBe("second");
    expect(ordinalWord(12)).toBe("twelfth");
    expect(ordinalWord(21)).toBe("twenty-first");
    expect(ordinalWord(30)).toBe("thirtieth");
    expect(ordinalWord(33)).toBe("thirty-third");
  });

  test('an invitation for the 2nd of the month says so (it said "2th")', () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const host = townsfolk(g, life)[0];
    for (const [day, word] of [
      [1, "1st"],
      [2, "2nd"],
      [3, "3rd"],
      [22, "22nd"],
    ] as const) {
      const gat: Gathering = {
        id: 1,
        kind: "dinner",
        host: host.id,
        prov: life.prov,
        venue: "tavern",
        day: dayOf(1702, 4, day),
        scale: 1,
        cost: 0,
        invited: [],
        rsvp: {},
        about: [],
        status: "planned",
        mood: 0,
        played: [],
        turns: {},
        lines: [],
      };
      const text = inviteText(g, gat);
      expect(text).toContain(`on the ${word} of May`);
      expect(text).not.toMatch(/\b[123]th\b/);
    }
  });
});

// ---------------------------------------------------------------- your people's posts

describe("posts for your own people", () => {
  test("one to a post; each does what its holder's skill says; the pay is in the month", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 200;
    const [a, b, c2, d] = townsfolk(g, life);
    const clerk = follower(g, life, a, "clerk", 2);
    const doc = follower(g, life, b, "physician", 2);
    const guard = follower(g, life, c2, "sword", 2);
    const steward = follower(g, life, d, "clerk", 1);
    const tradeBefore = skillOf(g.s, life, "trade").total;
    expect(setPost(g, life, clerk.id, "bookkeeper")).toBeNull();
    expect(skillOf(g.s, life, "trade").total).toBeGreaterThanOrEqual(
      tradeBefore,
    );
    expect(
      skillOf(g.s, life, "trade").parts.some((p) =>
        p.label.startsWith("Clerk of your accounts"),
      ),
    ).toBe(postValue(g.s, life, "bookkeeper") > 0);
    // One to a post: a second bookkeeper stands the first down.
    expect(setPost(g, life, steward.id, "bookkeeper")).toBeNull();
    expect(clerk.post).toBeUndefined();
    expect(setPost(g, life, steward.id, "steward")).toBeNull();
    expect(setPost(g, life, clerk.id, "bookkeeper")).toBeNull();
    expect(setPost(g, life, doc.id, "physician")).toBeNull();
    expect(setPost(g, life, guard.id, "bodyguard")).toBeNull();
    expect(physicianDeath(g.s, life)).toBeLessThan(1);
    expect(bodyguardPlot(g.s, life)).toBeLessThan(1);
    const lines = postBudget(g.s, life);
    expect(
      lines.find((l) => /^Posts in your household/.test(l.label))!.value,
    ).toBeCloseTo(-3, 5);
    expect(lines.some((l) => l.label === "Your steward's economies")).toBe(
      true,
    );
    // The month's figure has them, and the month's turn pays them.
    const forecast = monthlyBudget(g.s, g.w, life);
    expect(
      forecast.parts.some((p) => /^Posts in your household/.test(p.label)),
    ).toBe(true);
    // Away on a task, a post does nothing.
    doc.task = { kind: "wait", p: life.prov, back: g.s.day + 30 };
    expect(physicianDeath(g.s, life)).toBe(1);
    // Stood down.
    expect(setPost(g, life, guard.id, "")).toBeNull();
    expect(bodyguardPlot(g.s, life)).toBe(1);
  });

  test("a chaplain eases you, a tutor teaches the children, a scout brings word of a new place", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 500;
    const me = meOf(g.s, life)!;
    const [a, b, c2] = townsfolk(g, life);
    const chap = follower(g, life, a, "tutor", 2);
    const scout = follower(g, life, b, "guide", 1);
    setPost(g, life, chap.id, "chaplain");
    setPost(g, life, scout.id, "scout");
    // A child of eight at home for the tutor.
    const kid = c2;
    kid.father = me.id;
    kid.born = g.s.day - 8 * 365;
    kid.home = life.home;
    kid.spouse = -1;
    me.children.push(kid.id);
    const tutor = follower(g, life, townsfolk(g, life)[3], "tutor", 2);
    setPost(g, life, tutor.id, "tutor");
    const known = (life.known ?? []).length;
    life.stress = 50;
    for (let m = 0; m < 6; m++) ticks(g, 31);
    expect(kid.taught?.letters ?? 0).toBeGreaterThan(0);
    expect((life.known ?? []).length).toBeGreaterThanOrEqual(known);
  });
});

// ---------------------------------------------------------------- the bawdy house

describe("the bawdy house", () => {
  test("only in a great port or a capital; grown, free people only", () => {
    const g = world({ start: 1700 });
    const s = g.s;
    const boston = prov("Massachusetts Bay");
    expect(settlers(s.provinces[boston])).toBeGreaterThanOrEqual(BAWDY.minFolk);
    expect(bawdyIn(s, g.w, boston)).toBe(true);
    expect(placesIn(s, g.w, boston)).toContain("bawdy");
    const small = s.provinces.findIndex(
      (pr, p) =>
        pr.owner >= 0 &&
        s.nations[pr.owner].kind === "power" &&
        settlers(pr) > 100 &&
        settlers(pr) < 600 &&
        s.nations[pr.owner].capital !== p,
    );
    expect(bawdyIn(s, g.w, small)).toBe(false);
    const life = lifeOf(g);
    const me = meOf(s, life)!;
    me.born = s.day - 17 * 365;
    expect(bawdyCheck(s, life).ok).toBe(false);
    me.born = s.day - 25 * 365;
    expect(bawdyCheck(s, life).ok).toBe(true);
    life.job = {
      kind: "servant",
      rank: 0,
      prov: life.prov,
      place: "fields",
      employer: -1,
      nation: me.nation,
      army: -1,
      since: s.day,
      months: 0,
      away: 0,
      worked: 0,
      awayDays: 0,
      own: false,
    };
    expect(bawdyCheck(s, life).ok).toBe(false);
  });

  test("an evening: the scene's odds are the ones rolled", () => {
    const g = world({
      start: 1700,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: prov("Massachusetts Bay"), religion: "puritan" }),
        },
      ],
    });
    const life = lifeOf(g);
    const o = bawdyOdds(g.s, life);
    let seen = 0;
    let pox = 0;
    const N = 4000;
    const day = g.s.day;
    for (let i = 0; i < N; i++) {
      g.s.day = day + i;
      const r = bawdyRoll(g, life, true);
      if (r.seen) seen++;
      if (r.pox) pox++;
    }
    g.s.day = day;
    expect(Math.abs(seen / N - o.seenCompany)).toBeLessThan(0.02);
    expect(Math.abs(pox / N - o.pox)).toBeLessThan(0.012);
  });

  test("an evening upstairs: cares eased, the money paid; the pox, a wife who hears, the minister; and nobody else is told", () => {
    const g = world({
      start: 1700,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: prov("Massachusetts Bay"), religion: "puritan" }),
        },
      ],
    });
    const life = lifeOf(g);
    life.purse = 100;
    life.stress = 50;
    expect(actCheck(g.s, g.w, life, "bawdy", "bawdy").ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "act", place: "bawdy", act: "bawdy" }),
    ).toBeNull();
    const ev = life.events.find((e) => e.key === "bawdy-evening")!;
    expect(ev.body).toMatch(/grown and free/);
    expect(ev.choices[1].label).toMatch(/the pox.*\(\d coins\)$/);
    const purse = life.purse;
    answer(g, life, "bawdy-evening", 1);
    expect(life.stress).toBeLessThan(50);
    expect(life.purse).toBeLessThan(purse);
    expect(life.r21?.bawdy).toHaveLength(1);
    // Nobody else is sent the visit, its scene, its line in the books or its cooldown.
    const seen = lifeForOthers(life);
    expect(seen.r21?.bawdy).toBeUndefined();
    expect(Object.keys(seen.cooldowns).some((k) => k.includes("bawdy"))).toBe(
      false,
    );
    expect(seen.books?.lines.some((l) => l.k === "bawdy") ?? false).toBe(false);
    expect(seen.journal.some((j) => /upstairs/i.test(j.text))).toBe(false);
    // The pox, when it shows: health down, the most it can be 10 less, for good.
    const top = maxHealth(g.s, life);
    life.r21!.poxDue = g.s.day + 1;
    ticks(g, 2);
    expect(markOn(g.s, life, "pox")).toBeDefined();
    expect(maxHealth(g.s, life)).toBe(top - 10);
    expect(life.events.some((e) => e.key === "bawdy-pox")).toBe(true);
    expect(lifeForOthers(life).r21?.marks?.some((m) => m.k === "pox")).toBe(
      false,
    );
  });

  test("a wife who hears of it confronts you; a husband who's a player is told what the town says", () => {
    const g = world({
      start: 1700,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: prov("Massachusetts Bay"), religion: "puritan" }),
        },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({
            home: prov("Massachusetts Bay"),
            religion: "puritan",
            first: "Beatrice",
            family: "Cole",
            female: true,
          }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const he = meOf(g.s, a)!;
    const she = meOf(g.s, b)!;
    he.spouse = she.id;
    she.spouse = he.id;
    a.purse = 100;
    // Seen, and she hears: make the dice say so by trying evenings until it happens.
    for (
      let i = 0;
      i < 400 && !b.events.some((e) => e.key === "bawdy-told");
      i++
    ) {
      g.s.day++;
      delete a.cooldowns["act:bawdy"];
      a.events = a.events.filter((e) => e.key !== "bawdy-evening");
      g.lifeCommand("s1", { k: "act", place: "bawdy", act: "bawdy" });
      answer(g, a, "bawdy-evening", 1);
      a.purse = 100;
    }
    const told = b.events.find((e) => e.key === "bawdy-told");
    expect(told).toBeDefined();
    expect(told!.body).toMatch(/seen at the bawdy house/);
    expect(markOn(g.s, a, "rake")).toBeDefined();
    // Her scene is hers alone.
    expect(lifeForOthers(b).events.some((e) => e.key === "bawdy-told")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------- kin, saves and the delta

describe("a dead man's kin, saves and the delta", () => {
  test("a dead duellist's kin comes for you on the day; your bodyguard stands between", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const [kin, guardC] = townsfolk(g, life);
    const dead = townsfolk(g, life)[2];
    (life.r21 ??= {}).kin = [{ c: kin.id, dead: dead.id, due: g.s.day + 2 }];
    const guard = follower(g, life, guardC, "sword", 2);
    setPost(g, life, guard.id, "bodyguard");
    ticks(g, 3);
    const ev = life.events.find((e) => e.key === "duel-kin")!;
    expect(ev).toBeDefined();
    expect(ev.choices[0].label).toMatch(/bodyguard/);
    const health = life.health;
    answer(g, life, "duel-kin", 0);
    expect(life.health).toBe(health);
  });

  test("round 21's state survives save and load, and rides the delta", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const c = townsfolk(g, life)[0];
    const f = follower(g, life, c, "tutor", 1);
    setPost(g, life, f.id, "secretary");
    g.takeDelta();
    const client = JSON.parse(JSON.stringify(g.s));
    life.r21!.marks = [
      { k: "coward", c: life.c, day: g.s.day, until: g.s.day + 100 },
    ];
    g.lifeChanged("s1");
    applyDelta(client, g.takeDelta());
    expect(client.lives[0].r21.marks[0].k).toBe("coward");
    const g2 = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    const l2 = lifeOf(g2);
    expect(l2.people?.[0].post).toBe("secretary");
    expect(markOn(g2.s, l2, "coward")).toBeDefined();
    for (const sk of SKILLS) expect(l2.skills[sk]).toBe(life.skills[sk]);
  });
});
