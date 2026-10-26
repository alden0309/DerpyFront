// CQTUT (r26): the first life's lessons. The steps move on when the player
// does what they ask (and not otherwise); a step can be skipped and the
// lessons left, and the life carries on as a normal game; it's the same
// every time; nothing can go wrong while they run (no death, health kept up,
// nothing drawn or raised unasked, the perilous things waiting, steps that
// no longer apply passed over); the end's choices; it all rides the save and
// the delta, and old saves are untouched; First life is the account's alone.

import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_BY_KEY,
  gameCoins,
  paysOverall,
} from "../../src/conquest/engine/Achievements";
import { sitterOf } from "../../src/conquest/engine/Appearance";
import { findIn, presence } from "../../src/conquest/engine/Areas";
import { dateOf, dayOf } from "../../src/conquest/engine/Calendar";
import { kill } from "../../src/conquest/engine/Characters";
import { lifeCoins } from "../../src/conquest/engine/Coins";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { raiseEvent, shieldOf } from "../../src/conquest/engine/Hooks";
import { hurt } from "../../src/conquest/engine/LifeCore";
import {
  lifeOfSeat,
  meOf,
  siblingsOf,
} from "../../src/conquest/engine/LifeQueries";
import { AMERICAS } from "../../src/conquest/engine/Map";
import { ageOf } from "../../src/conquest/engine/Queries";
import { TUT_WAITS } from "../../src/conquest/engine/Tutorial";
import {
  FIRST_LIFE,
  FIRST_LIFE_COINS,
  TUT_FLOOR,
  TUTORIAL_STEPS,
  tutRunning,
  tutStep,
} from "../../src/conquest/engine/TutorialCore";
import {
  TUT_START,
  tutorialGame,
  tutorialWorld,
} from "../../src/conquest/engine/TutorialStart";
import type {
  GameState,
  Life,
  LifeCommand,
} from "../../src/conquest/engine/Types";
import { lifeOf, ticks, world } from "./LifeUtil";

const map = AMERICAS;
const P = (name: string) => map.provinces.findIndex((p) => p.name === name);
const BOSTON = P("Massachusetts Bay");
const PLYMOUTH = P("Plymouth");

function fresh(female = false): { g: ConquestGame; life: Life } {
  const g = tutorialGame(map, "s1", "Newcomer", female);
  return { g, life: lifeOfSeat(g.s, "s1")! };
}

function cmd(g: ConquestGame, c: LifeCommand): string | null {
  return g.lifeCommand("s1", c);
}

/** Answer the lessons' letter now waiting (the first choice it can take, or `choice`). */
function answer(g: ConquestGame, life: Life, choice = 0): string | null {
  const ev = life.events.find((e) => e.key.startsWith("tut-"));
  if (!ev) return "no letter";
  return cmd(g, { k: "event", id: ev.id, choice });
}

function runUntil(g: ConquestGame, done: () => boolean, max = 200): number {
  let n = 0;
  while (!done() && n < max && !g.s.over) {
    g.tick();
    n++;
  }
  return n;
}

const step = (life: Life) => tutStep(life);

/** Every step, done as asked. Returns the steps seen, in order. */
function playThrough(g: ConquestGame, life: Life): string[] {
  const seen: string[] = [];
  const at = () => {
    const s = step(life) ?? "end";
    if (seen[seen.length - 1] !== s) seen.push(s);
  };
  at();
  cmd(g, { k: "enter", area: "workshop" });
  at();
  cmd(g, { k: "effort", v: "hard" });
  at();
  cmd(g, { k: "person", c: life.tut!.cast.friend, act: "talk" });
  answer(g, life, 0);
  at();
  answer(g, life, 0);
  at();
  cmd(g, { k: "travel", to: PLYMOUTH, bySea: false });
  at();
  runUntil(g, () => !life.travel);
  answer(g, life, 2);
  at();
  cmd(g, { k: "travel", to: BOSTON, bySea: false });
  runUntil(g, () => step(life) !== "home");
  at();
  answer(g, life, 0);
  at();
  cmd(g, { k: "ambition", key: "rise" });
  at();
  runUntil(g, () => !!life.tut!.wait);
  answer(g, life, 1);
  at();
  cmd(g, { k: "tut", act: "saw", what: "heir" });
  at();
  return seen;
}

describe("the first life begins (CQTUT r26)", () => {
  test("Boston, 1 May 1700: a journeyman cooper of twenty, at home, with family and neighbours", () => {
    const { g, life } = fresh();
    const me = meOf(g.s, life)!;
    expect(dateOf(g.s.day)).toEqual({ year: 1700, month: 4, day: 1 });
    expect(g.s.day).toBe(TUT_START);
    expect(g.s.settings.tutorial).toBe(true);
    expect(g.s.settings.difficulty).toBe("easy");
    expect(life.home).toBe(BOSTON);
    expect(life.prov).toBe(BOSTON);
    expect(`${me.first} ${me.family}`).toBe("Thomas Hale");
    expect(ageOf(g.s, me)).toBe(20);
    expect(life.job?.kind).toBe("craftsman");
    expect(life.job?.rank).toBe(1);
    expect(life.area).toBe("home");
    const t = life.tut!;
    expect(t.step).toBe(0);
    expect(step(life)).toBe("places");
    // A widowed mother and a sister in town; a father dead two years.
    const mother = g.s.chars[t.cast.mother];
    const father = g.s.chars[t.cast.father];
    expect(me.mother).toBe(mother.id);
    expect(mother.alive && mother.home === BOSTON).toBe(true);
    expect(father.alive).toBe(false);
    expect(siblingsOf(g.s, me).map((c) => c.first)).toEqual(["Patience"]);
    // Neighbours who'll be a friend and a rival, known already.
    expect(g.s.chars[t.cast.friend].first).toBe("Ezra");
    expect(g.s.chars[t.cast.rival].first).toBe("Jonas");
    for (const id of [t.cast.mother, t.cast.friend, t.cast.rival])
      expect(life.met).toContain(id);
    expect(g.s.locals[BOSTON]).toContain(t.cast.friend);
    // The birthday is 15 June.
    expect(dateOf(t.birthday)).toEqual({ year: 1700, month: 5, day: 15 });
    expect(shieldOf(g, life)).toBe(TUT_FLOOR);
  });

  test("Hannah Hale, for a woman", () => {
    const { g, life } = fresh(true);
    const me = meOf(g.s, life)!;
    expect(me.female).toBe(true);
    expect(me.first).toBe("Hannah");
    expect(life.tut?.step).toBe(0);
  });

  test("the neighbour is at the next bench until you've spoken with him", () => {
    for (const female of [false, true]) {
      const { g, life } = fresh(female);
      const t = life.tut!;
      const friend = t.cast.friend;
      const where = (l: Life | null) =>
        findIn(g.s, g.w, BOSTON, friend, g.s.day, l);
      // Day after day, wherever his own hours would have had him.
      for (let d = 0; d < 10; d++) {
        expect(where(life)).toEqual({
          area: "workshop",
          doing: "at the next bench",
        });
        const all = [...presence(g.s, g.w, BOSTON, g.s.day, life).values()];
        expect(all.flat().filter((x) => x.c === friend)).toHaveLength(1);
        g.tick();
      }
      // Once you've spoken, he keeps his own hours again.
      cmd(g, { k: "enter", area: "workshop" });
      cmd(g, { k: "effort", v: "steady" });
      cmd(g, { k: "person", c: friend, act: "talk" });
      answer(g, life, 0);
      expect(step(life)).toBe("rival");
      for (let d = 0; d < 10; d++) {
        expect(where(life)).toEqual(where(null));
        g.tick();
      }
    }
  });

  test("the master, the friend and the rival: three faces a newcomer can tell apart", () => {
    for (const female of [false, true]) {
      const { g, life } = fresh(female);
      const t = life.tut!;
      const faces = [t.cast.master, t.cast.friend, t.cast.rival].map((id) => {
        const c = g.s.chars[id];
        return sitterOf(c, ageOf(g.s, c)).id;
      });
      expect(new Set(faces).size).toBe(3);
    }
  });

  test("the world is made once, and each first life gets its own copy", () => {
    const a = tutorialWorld(map);
    a.day += 99;
    const b = tutorialWorld(map);
    expect(b.day).toBe(TUT_START);
    expect(b.lives).toEqual([]);
  });
});

describe("the steps move on when the player does what they ask", () => {
  test("played through: every step in order, then the end and First life", () => {
    const { g, life } = fresh();
    const seen = playThrough(g, life);
    expect(seen).toEqual([...TUTORIAL_STEPS, "end"]);
    const t = life.tut!;
    expect(t.done).toEqual([...TUTORIAL_STEPS]);
    expect(t.skipped).toEqual([]);
    expect(t.over?.how).toBe("done");
    expect(life.achieved?.[FIRST_LIFE]).toBe(g.s.day);
    // The friend and the rival made along the way.
    expect(life.ties[t.cast.friend]).toBe("friend");
    expect(life.ties[t.cast.rival]).toBe("rival");
    expect(life.ambition?.key).toBe("rise");
    // Through May and into June, the birthday kept.
    expect(dateOf(g.s.day)).toEqual({ year: 1700, month: 5, day: 15 });
    expect(ageOf(g.s, meOf(g.s, life)!)).toBe(21);
    expect(shieldOf(g, life)).toBe(null);
  });

  test("not on the wrong things: another place, a look at the map, a word with nobody", () => {
    const { g, life } = fresh();
    expect(cmd(g, { k: "enter", area: "tavern" })).toBe(null);
    expect(step(life)).toBe("places");
    cmd(g, { k: "enter", area: "workshop" });
    expect(step(life)).toBe("work");
    // Choosing the work that was chosen already isn't choosing.
    cmd(g, { k: "lifestyle", v: "modest" });
    expect(step(life)).toBe("work");
    cmd(g, { k: "effort", v: "steady" });
    expect(step(life)).toBe("talk");
    // A talk refused (nobody of that id) doesn't count.
    expect(cmd(g, { k: "person", c: 999999, act: "talk" })).not.toBe(null);
    expect(step(life)).toBe("talk");
    expect(life.tut!.wait).toBeUndefined();
    // Talk with anyone: the neighbour's letter comes, and the step waits on it.
    const t = life.tut!;
    cmd(g, { k: "person", c: t.cast.friend, act: "talk" });
    expect(t.wait).toBe("tut-friend");
    expect(life.events.map((e) => e.key)).toEqual(["tut-friend"]);
    // The rival's letter has odds on its choices, from the engine's own check.
    answer(g, life, 2);
    expect(step(life)).toBe("rival");
    const rival = life.events.find((e) => e.key === "tut-rival")!;
    expect(rival.choices[0].label).toMatch(/\(Craft \d+%\)$/);
    expect(rival.choices[1].label).toMatch(/\(Persuasion \d+%\)$/);
    expect(rival.choices[2].label).not.toMatch(/%/);
    answer(g, life, 2);
    expect(step(life)).toBe("map");
    // Setting out somewhere else isn't the errand.
    cmd(g, { k: "travel", to: P("Narragansett"), bySea: false });
    expect(step(life)).toBe("map");
    cmd(g, { k: "travel", to: PLYMOUTH, bySea: false });
    expect(step(life)).toBe("road");
  });

  test("home waits for pay day (the month's turn), and pay day stops a skip ahead", () => {
    const { g, life } = fresh();
    for (let i = 0; i < 6; i++) cmd(g, { k: "tut", act: "skip", step: i });
    expect(step(life)).toBe("home");
    // At home already, but the month hasn't turned.
    ticks(g, 5);
    expect(step(life)).toBe("home");
    const wake = life.wake ?? 0;
    runUntil(g, () => step(life) !== "home");
    expect(dateOf(g.s.day).day).toBe(1);
    expect(life.wake).toBeGreaterThan(wake);
    expect(life.wakeWhy).toMatch(/Pay day/);
    // The family's letter comes at home.
    expect(step(life)).toBe("family");
    expect(life.events.map((e) => e.key)).toContain("tut-family");
  });

  test("supper at your mother's waits until you're home", () => {
    const { g, life } = fresh();
    for (let i = 0; i < 7; i++) cmd(g, { k: "tut", act: "skip", step: i });
    expect(step(life)).toBe("family");
    expect(life.events.map((e) => e.key)).toContain("tut-family");
    answer(g, life, 2);
    expect(step(life)).toBe("aim");
    // A second time, away: it waits for home.
    const b = fresh();
    cmd(b.g, { k: "travel", to: PLYMOUTH, bySea: false });
    for (let i = 0; i < 7; i++) cmd(b.g, { k: "tut", act: "skip", step: i });
    expect(step(b.life)).toBe("family");
    runUntil(b.g, () => !b.life.travel);
    expect(b.life.events.length).toBe(0);
    cmd(b.g, { k: "travel", to: BOSTON, bySea: false });
    runUntil(b.g, () => !b.life.travel);
    expect(b.life.events.map((e) => e.key)).toEqual(["tut-family"]);
  });

  test("an ambition set already counts; the birthday waits for its day", () => {
    const { g, life } = fresh();
    cmd(g, { k: "ambition", key: "rise" });
    for (let i = 0; i < 8; i++) cmd(g, { k: "tut", act: "skip", step: i });
    // "aim" was passed straight over: the ambition's set.
    expect(step(life)).toBe("birthday");
    expect(life.tut!.done).toContain("aim");
    expect(life.tut!.wait).toBeUndefined();
    runUntil(g, () => !!life.tut!.wait);
    expect(dateOf(g.s.day)).toEqual({ year: 1700, month: 5, day: 15 });
    expect(life.events.map((e) => e.key)).toEqual(["tut-birthday"]);
    answer(g, life, 1);
    expect(step(life)).toBe("heir");
    // Looking at something else isn't looking at the heir.
    cmd(g, { k: "tut", act: "saw", what: "work" });
    expect(step(life)).toBe("heir");
    cmd(g, { k: "tut", act: "saw", what: "heir" });
    expect(life.tut!.over?.how).toBe("done");
  });
});

describe("skipping a step, and leaving the lessons", () => {
  test("Skip step skips the step the card showed, once", () => {
    const { g, life } = fresh();
    expect(cmd(g, { k: "tut", act: "skip", step: 0 })).toBe(null);
    expect(step(life)).toBe("work");
    // A second click on the same card doesn't skip the next one too.
    expect(cmd(g, { k: "tut", act: "skip", step: 0 })).toBe(null);
    expect(step(life)).toBe("work");
    expect(life.tut!.skipped).toEqual(["places"]);
  });

  test("every step skipped: the end, and First life all the same", () => {
    const { g, life } = fresh();
    for (let i = 0; i < TUTORIAL_STEPS.length; i++)
      cmd(g, { k: "tut", act: "skip", step: i });
    expect(life.tut!.over?.how).toBe("done");
    expect(life.tut!.skipped).toEqual([...TUTORIAL_STEPS]);
    expect(life.achieved?.[FIRST_LIFE]).toBeDefined();
    expect(cmd(g, { k: "tut", act: "skip" })).toBe("The lessons are over.");
  });

  test("leaving the lessons: the life goes on as a normal game, without First life", () => {
    const { g, life } = fresh();
    cmd(g, { k: "enter", area: "workshop" });
    // Something unasked, kept back while they run...
    ticks(g, 1);
    raiseEvent(g, life, "kin-question", {});
    expect(life.events.length).toBe(0);
    expect(life.tut!.held?.map((e) => e.key)).toEqual(["kin-question"]);
    expect(cmd(g, { k: "tut", act: "leave" })).toBe(null);
    expect(tutRunning(life)).toBe(false);
    expect(life.tut!.over?.how).toBe("left");
    // ...given now.
    expect(life.events.map((e) => e.key)).toEqual(["kin-question"]);
    expect(life.tut!.held).toBeUndefined();
    expect(shieldOf(g, life)).toBe(null);
    // Nothing more moves: no step, no achievement.
    cmd(g, { k: "effort", v: "hard" });
    expect(life.tut!.step).toBe(1);
    ticks(g, 60);
    expect(life.achieved?.[FIRST_LIFE]).toBeUndefined();
    // And the world's letters come again: a year brings some.
    const before = life.tally.events;
    for (const ev of [...life.events])
      cmd(g, { k: "event", id: ev.id, choice: 0 });
    runUntil(g, () => life.tally.events > before + 2, 400);
    expect(life.tally.events).toBeGreaterThan(before + 2);
  });

  test("the end's card: put away only once the lessons are over", () => {
    const { g, life } = fresh();
    expect(cmd(g, { k: "tut", act: "close" })).toBe(
      "The lessons aren't over yet.",
    );
    playThrough(g, life);
    expect(cmd(g, { k: "tut", act: "close" })).toBe(null);
    expect(life.tut!.closed).toBe(true);
  });

  test("carrying on: after the end it's a normal game, letters and all", () => {
    const { g, life } = fresh();
    playThrough(g, life);
    cmd(g, { k: "tut", act: "close" });
    const before = life.tally.events;
    for (let d = 0; d < 365; d++) {
      g.tick();
      for (const ev of [...life.events])
        cmd(g, { k: "event", id: ev.id, choice: 0 });
    }
    // Matters at work and the town's goings-on, as in any life.
    expect(life.tally.events - before).toBeGreaterThan(4);
    expect(life.job?.kind).toBe("craftsman");
  });
});

describe("it plays the same way every time", () => {
  test("the same choices give the same life, to the last field", () => {
    const a = fresh();
    const b = fresh();
    playThrough(a.g, a.life);
    playThrough(b.g, b.life);
    ticks(a.g, 40);
    ticks(b.g, 40);
    expect(JSON.stringify(a.g.s)).toBe(JSON.stringify(b.g.s));
  });

  test("the town and its people are the same in every first life", () => {
    const a = fresh();
    const b = fresh();
    const names = (x: { g: ConquestGame; life: Life }) =>
      Object.values(x.life.tut!.cast).map((id) => {
        const c = x.g.s.chars[id];
        return `${c.first} ${c.family} ${c.born}`;
      });
    expect(names(a)).toEqual(names(b));
  });
});

describe("nothing can go wrong while they run", () => {
  test("two years left alone: alive, well, solvent, and nothing came but the lessons", () => {
    const { g, life } = fresh();
    let low = 100;
    const keys = new Set<string>();
    for (let d = 0; d < 730; d++) {
      g.tick();
      low = Math.min(low, life.health);
      for (const e of life.events) keys.add(e.key);
    }
    expect(meOf(g.s, life)?.alive).toBe(true);
    expect(low).toBeGreaterThanOrEqual(TUT_FLOOR);
    expect([...keys].every((k) => k.startsWith("tut-"))).toBe(true);
    expect(life.purse).toBeGreaterThan(0);
    expect(step(life)).toBe("places");
    // The people the lessons are made with are left alone by the months.
    const t = life.tut!;
    for (const id of [
      t.cast.mother,
      t.cast.sister,
      t.cast.friend,
      t.cast.rival,
    ])
      expect(g.s.chars[id].alive, String(id)).toBe(true);
  });

  test("no hurt takes health below the floor, and the month's roll for death passes it by", () => {
    const { g, life } = fresh();
    expect(hurt(g, life, 500, "a test")).toBe(false);
    expect(life.health).toBe(TUT_FLOOR);
    expect(meOf(g.s, life)?.alive).toBe(true);
    // Even at nothing (set by hand), the months don't kill.
    life.health = 0;
    runUntil(g, () => dateOf(g.s.day).month === 6, 120);
    expect(meOf(g.s, life)?.alive).toBe(true);
  });

  test("the perilous things wait, with a word why; the rest goes ahead", () => {
    const { g, life } = fresh();
    for (const c of [
      { k: "crime", act: "pickpocket" },
      { k: "person", c: life.tut!.cast.rival, act: "duel" },
      { k: "job", place: "fort", job: "soldier" },
      { k: "takeup", job: "thief", place: "market" },
      { k: "europe", takeHeir: false },
      { k: "sea", act: "join" },
      { k: "movement", act: "join", id: 1 },
    ] as LifeCommand[])
      expect(cmd(g, c), JSON.stringify(c)).toBe(TUT_WAITS);
    expect(cmd(g, { k: "enter", area: "tavern" })).toBe(null);
    // After the lessons, the same command is the game's to answer.
    cmd(g, { k: "tut", act: "leave" });
    expect(cmd(g, { k: "crime", act: "pickpocket" })).not.toBe(TUT_WAITS);
  });

  test("what the player starts goes ahead; what comes unasked waits", () => {
    const { g, life } = fresh();
    // Raised by the days (not by a command of the player's): held.
    raiseEvent(g, life, "kin-question", {});
    expect(life.events.length).toBe(0);
    expect(life.tut!.held?.length).toBe(1);
  });

  test("a step that no longer applies passes itself over: no work, no 'how hard'", () => {
    const { g, life } = fresh();
    cmd(g, { k: "enter", area: "workshop" });
    expect(step(life)).toBe("work");
    expect(cmd(g, { k: "quit", how: "now" })).toBe(null);
    ticks(g, 1);
    expect(step(life)).toBe("talk");
    expect(life.tut!.skipped).toEqual(["work"]);
  });

  test("the life that had the lessons gone (by any road): they end, left", () => {
    const { g, life } = fresh();
    kill(g, meOf(g.s, life)!, "a road the shield doesn't cover");
    expect(life.tut!.over?.how).toBe("left");
    expect(tutRunning(life)).toBe(false);
  });

  test("a step skipped takes its waiting letter with it", () => {
    const { g, life } = fresh();
    for (let i = 0; i < 3; i++) cmd(g, { k: "tut", act: "skip", step: i });
    expect(life.events.map((e) => e.key)).toEqual(["tut-rival"]);
    cmd(g, { k: "tut", act: "skip", step: 3 });
    expect(life.events).toEqual([]);
    expect(life.ties[life.tut!.cast.rival]).toBeUndefined();
  });
});

describe("saves, the delta and old games", () => {
  test("a save made mid-lessons loads and carries on at the step", () => {
    const { g, life } = fresh();
    cmd(g, { k: "enter", area: "workshop" });
    cmd(g, { k: "effort", v: "hard" });
    cmd(g, { k: "person", c: life.tut!.cast.friend, act: "talk" });
    expect(life.tut!.wait).toBe("tut-friend");
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const h = new ConquestGame(map, saved);
    const l2 = lifeOfSeat(h.s, "s1")!;
    expect(step(l2)).toBe("talk");
    expect(l2.events.map((e) => e.key)).toEqual(["tut-friend"]);
    answer(h, l2, 0);
    expect(step(l2)).toBe("rival");
    // The shield and the quiet come back with it.
    expect(shieldOf(h, l2)).toBe(TUT_FLOOR);
    raiseEvent(h, l2, "kin-question", {});
    expect(l2.events.map((e) => e.key)).toEqual(["tut-rival"]);
  });

  test("the browser's copy (the delta) keeps up with every step", () => {
    const { g, life } = fresh();
    const client = JSON.parse(JSON.stringify(g.s)) as GameState;
    const sync = () => applyDelta(client, g.takeDelta());
    const mine = () => lifeOfSeat(client, "s1")!.tut;
    cmd(g, { k: "enter", area: "workshop" });
    sync();
    expect(mine()?.step).toBe(1);
    cmd(g, { k: "effort", v: "hard" });
    cmd(g, { k: "person", c: life.tut!.cast.friend, act: "talk" });
    sync();
    expect(mine()?.wait).toBe("tut-friend");
    for (let i = 2; i < TUTORIAL_STEPS.length; i++)
      cmd(g, { k: "tut", act: "skip", step: i });
    sync();
    expect(mine()?.over?.how).toBe("done");
    expect(JSON.stringify(mine())).toBe(JSON.stringify(life.tut));
  });

  test("an old save (or any normal game) has no lessons, and nothing changes for it", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    expect(life.tut).toBeUndefined();
    expect(shieldOf(g, life)).toBe(null);
    expect(cmd(g, { k: "tut", act: "skip" })).toBe("You have no lessons.");
    for (let d = 0; d < 200; d++) {
      g.tick();
      for (const ev of [...life.events])
        g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 });
    }
    expect(life.tally.events).toBeGreaterThan(2);
    expect(life.tut).toBeUndefined();
  });
});

describe("First life: the account's alone", () => {
  test("250 Derp Coins onto the account on any difficulty, and nothing in the game", () => {
    const def = ACHIEVEMENT_BY_KEY.get(FIRST_LIFE)!;
    expect(def.coins).toBe(FIRST_LIFE_COINS);
    expect(FIRST_LIFE_COINS).toBe(250);
    expect(def.account).toBe(true);
    expect(gameCoins(def)).toBe(0);
    for (const d of ["easy", "normal", "hard"])
      expect(paysOverall(FIRST_LIFE, d)).toBe(true);
    // The rest keep their rule: onto the account only on Hard.
    expect(paysOverall("first-job", "easy")).toBe(false);
    expect(paysOverall("first-job", "hard")).toBe(true);
  });

  test("a finished first life's coins in the game don't count it (a replay pays nothing more)", () => {
    const a = fresh();
    const b = fresh();
    playThrough(a.g, a.life);
    cmd(b.g, { k: "tut", act: "leave" });
    runUntil(b.g, () => b.g.s.day >= a.g.s.day);
    expect(a.life.achieved?.[FIRST_LIFE]).toBeDefined();
    expect(b.life.achieved?.[FIRST_LIFE]).toBeUndefined();
    const line = (l: Life) =>
      lifeCoins(l, false).lines.find((x) => /achievements/.test(x.line))
        ?.coins ?? 0;
    // Both earned An honest living; only that pays in the game.
    expect(line(a.life)).toBe(line(b.life));
  });

  test("the lessons begin and end on dates the world agrees with", () => {
    expect(TUT_START).toBe(dayOf(1700, 4, 1));
  });
});
