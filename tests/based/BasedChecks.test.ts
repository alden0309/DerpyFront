// Mr. Based's skill checks (r21): the dice and their odds, the script syntax
// for skills, checks, voices and checked deductions, and how the runtime
// rolls them: white checks wait for something to change, red ones are gone
// once tried, passive ones speak by themselves.

import { describe, expect, test } from "vitest";
import {
  chance,
  parseDifficulty,
  passes,
  percent,
  rollDice,
  tierName,
} from "../../src/based/engine/Dice";
import {
  Beat,
  chapterStart,
  RollBeat,
  StoryRun,
} from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import {
  buildProblem,
  defaultBuild,
  skillValues,
} from "../../src/based/engine/Skills";
import { Build, Chapter } from "../../src/based/engine/Types";
import { validateChapter } from "../../src/based/engine/Validate";

const HEAD = `@chapter 3 "Checks"
@cast HERO "Hero"
@cast BARMAN "Barman"
@attribute WITS "Wits" "The mind."
@attribute NERVE "Nerve" "The will."
@skill MEMORY WITS "Memory" "Faces and files."
@skill COMPOSURE NERVE "Composure" "The poker face."
@archetype ANALYST "The Analyst" WITS=4 NERVE=2 signature=MEMORY "A reader of files."
@archetype OPERATOR "The Operator" WITS=2 NERVE=4 signature=COMPOSURE "A man of the street."
@points 6 min=1 max=5
`;

function load(body: string): Chapter {
  const { chapter, errors } = parseChapter(HEAD + body);
  expect(errors).toEqual([]);
  return chapter;
}

function build(attrs: Record<string, number>, signature: string): Build {
  return { attrs, signature };
}

function run(c: Chapter, b: Build, seed = 1): StoryRun {
  return new StoryRun(c, chapterStart(c, undefined, { build: b, seed }));
}

/** Finds a seed whose first roll of `id` passes (or fails). */
function seedWhere(
  c: Chapter,
  b: Build,
  want: boolean,
  toCheck: (r: StoryRun) => RollBeat,
): number {
  for (let seed = 1; seed < 500; seed++) {
    const roll = toCheck(run(c, b, seed));
    if (roll.pass === want) return seed;
  }
  throw new Error("no seed found");
}

describe("the dice", () => {
  test("the odds of 2d6 + bonus against a difficulty are exact", () => {
    // 2d6 >= 7 is 21 throws in 36.
    expect(chance(3, 10)).toBeCloseTo(21 / 36, 10);
    expect(percent(3, 10)).toBe(58);
    // Double six always succeeds; double one always fails.
    expect(chance(0, 15)).toBeCloseTo(1 / 36, 10);
    expect(chance(20, 5)).toBeCloseTo(35 / 36, 10);
    expect(passes(6, 6, -10, 30)).toBe(true);
    expect(passes(1, 1, 50, 3)).toBe(false);
    // More skill never lowers the odds.
    for (let b = 0; b < 10; b++) {
      expect(chance(b + 1, 10)).toBeGreaterThanOrEqual(chance(b, 10));
    }
  });

  test("difficulties by name or number, and their tiers", () => {
    expect(parseDifficulty("challenging")).toBe(10);
    expect(parseDifficulty("Medium")).toBe(9);
    expect(parseDifficulty("12")).toBe(12);
    expect(parseDifficulty("hard")).toBeNull();
    expect(tierName(10)).toBe("Challenging");
    expect(tierName(6)).toBe("Trivial");
    expect(tierName(17)).toBe("Impossible");
  });

  test("rolls are fixed by the seed, the check and the attempt", () => {
    expect(rollDice(42, "a/b", 0)).toEqual(rollDice(42, "a/b", 0));
    const faces = new Array(7).fill(0);
    let differ = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const [a, b] = rollDice(seed, "x/y", 0);
      faces[a]++;
      faces[b]++;
      const again = rollDice(seed, "x/y", 1);
      if (again[0] !== a || again[1] !== b) differ++;
    }
    // Every face turns up about a sixth of the time.
    for (let f = 1; f <= 6; f++) {
      expect(faces[f] / 6000).toBeGreaterThan(0.14);
      expect(faces[f] / 6000).toBeLessThan(0.193);
    }
    expect(faces[0]).toBe(0);
    // A second attempt is a new throw.
    expect(differ).toBeGreaterThan(2500);
  });
});

describe("skills and builds", () => {
  test("skills start at their attribute; the signature is one higher", () => {
    const c = load(`== a\n-> END\n`);
    expect(c.attributes.map((a) => a.id)).toEqual(["WITS", "NERVE"]);
    expect(c.skills.map((s) => s.id)).toEqual(["MEMORY", "COMPOSURE"]);
    expect(c.points).toEqual({ total: 6, min: 1, max: 5 });
    expect(defaultBuild(c).archetype).toBe("ANALYST");
    expect(skillValues(c, defaultBuild(c))).toEqual({
      MEMORY: 5,
      COMPOSURE: 2,
    });
    expect(
      skillValues(c, build({ WITS: 3, NERVE: 3 }, "COMPOSURE"), [
        { skill: "MEMORY", delta: 1, why: "x" },
      ]),
    ).toEqual({ MEMORY: 4, COMPOSURE: 4 });
  });

  test("the setup screen's rules", () => {
    const c = load(`== a\n-> END\n`);
    expect(buildProblem(c, build({ WITS: 3, NERVE: 3 }, "MEMORY"))).toBeNull();
    expect(buildProblem(c, build({ WITS: 4, NERVE: 3 }, "MEMORY"))).toMatch(
      /add up to 6/,
    );
    expect(buildProblem(c, build({ WITS: 6, NERVE: 0 }, "MEMORY"))).toMatch(
      /1 to 5/,
    );
    expect(buildProblem(c, build({ WITS: 3, NERVE: 3 }, "NOPE"))).toMatch(
      /signature/,
    );
  });

  test("mistakes in the header are reported", () => {
    const { errors } = parseChapter(`@chapter 1 "T"
@cast HERO "Hero"
@attribute WITS "Wits" "x"
@skill MEMORY BRAWN "Memory" "x"
@archetype A "A" WITS=3 signature=NOPE "x"
@points 4
== a
* white NOPE 10 [x]
~ GHOST 9: Boo.
-> END
`);
    const m = errors.map((e) => `${e.line}: ${e.message}`);
    expect(m.some((x) => x.startsWith('4: @skill MEMORY: "BRAWN"'))).toBe(
      true,
    );
    expect(m.some((x) => x.includes("signature=NOPE"))).toBe(true);
    expect(m.some((x) => x.includes("add up to 3, not @points 4"))).toBe(true);
    expect(m.some((x) => x.startsWith('9: "GHOST" isn\'t a @skill'))).toBe(
      true,
    );
  });
});

const CHECKS = `== a
choose "Well?"
  * white COMPOSURE challenging [Hold his gaze] "Say it."
    bonus +2 if seen_shoes "You saw his shoes"
    bonus -1 "You're tired"
    He blinked first.
    set won
  fail
    You blinked first.
    set lost
  * red MEMORY 12 [Remember him]
    You remember.
    set remembered
  * if lost [Look at his shoes]
    set seen_shoes
  * [Leave] -> END
end
-> a
`;

describe("checks in choices", () => {
  test("the option shows its odds; the roll shows the dice", () => {
    const c = load(CHECKS);
    const op = c.scenes.a.ops.find((o) => o.op === "choose");
    if (op?.op !== "choose") throw new Error("no choice");
    expect(op.options[0].check).toMatchObject({
      skill: "COMPOSURE",
      diff: 10,
      kind: "white",
    });
    expect(op.options[0].check!.mods).toHaveLength(2);

    const b = build({ WITS: 3, NERVE: 3 }, "MEMORY"); // Composure 3
    const r = run(c, b);
    const choice = r.beat;
    if (choice.kind !== "choice") throw new Error("expected a choice");
    const gaze = choice.options.find((o) => o.id === "hold-his-gaze")!;
    // 3, and -1 for being tired: 2d6 + 2 against 10.
    expect(gaze.check).toMatchObject({
      base: 3,
      bonus: 2,
      tier: "Challenging",
      percent: percent(2, 10),
      locked: false,
    });
    expect(gaze.check!.mods).toEqual([{ delta: -1, why: "You're tired" }]);

    expect(r.choose("hold-his-gaze")).toMatchObject({
      kind: "line",
      who: "HERO",
      text: "Say it.",
    });
    const roll = r.advance();
    if (roll.kind !== "roll") throw new Error("expected the dice");
    expect(roll.skill).toBe("COMPOSURE");
    expect(roll.total).toBe(roll.dice![0] + roll.dice![1] + 2);
    expect(roll.pass).toBe(passes(roll.dice![0], roll.dice![1], 2, 10));
    const after = r.advance();
    expect(after).toMatchObject({
      kind: "line",
      text: roll.pass ? "He blinked first." : "You blinked first.",
    });
  });

  test("a failed white check is locked until something changes", () => {
    const c = load(CHECKS);
    const b = build({ WITS: 3, NERVE: 3 }, "MEMORY");
    const toGaze = (r: StoryRun) => {
      r.choose("hold-his-gaze");
      return r.advance() as RollBeat;
    };
    const seed = seedWhere(c, b, false, toGaze);
    const r = run(c, b, seed);
    toGaze(r);
    expect(r.advance()).toMatchObject({ text: "You blinked first." });
    let menu = r.advance();
    expect(r.flag("lost")).toBe(1);
    if (menu.kind !== "choice") throw new Error("back to the choice");
    const locked = menu.options.find((o) => o.id === "hold-his-gaze")!;
    expect(locked.check!.locked).toBe(true);
    expect(() => r.choose("hold-his-gaze")).toThrow(/locked/);

    // Something changes: he notices the shoes, worth +2.
    r.choose("look-at-his-shoes");
    menu = r.beat;
    if (menu.kind !== "choice") throw new Error("back to the choice");
    const open = menu.options.find((o) => o.id === "hold-his-gaze")!;
    expect(open.check!.locked).toBe(false);
    expect(open.check!.bonus).toBe(4);
    expect(open.check!.tries).toBe(1);
    r.choose("hold-his-gaze");
    const second = r.advance();
    if (second.kind !== "roll") throw new Error("expected the dice");
    // A second attempt is a new throw, not the same one again.
    expect(second.id).toBe("a#1/hold-his-gaze");
  });

  test("a red check can't be tried twice; a passed check is done", () => {
    const c = load(CHECKS);
    const b = build({ WITS: 4, NERVE: 2 }, "MEMORY"); // Memory 5
    const r = run(c, b);
    r.choose("remember-him");
    const roll = r.beat as RollBeat;
    expect(roll.kind).toBe("roll");
    expect(roll.kind2).toBe("red");
    while (r.beat.kind !== "choice") r.advance();
    const menu = r.beat;
    if (menu.kind !== "choice") throw new Error("expected the choice");
    expect(menu.options.map((o) => o.id)).not.toContain("remember-him");
  });

  test("the same seed always rolls the same; loading never rerolls", () => {
    const c = load(CHECKS);
    const b = build({ WITS: 3, NERVE: 3 }, "MEMORY");
    const results = new Set<boolean>();
    for (let seed = 1; seed <= 40; seed++) {
      const one = run(c, b, seed);
      const two = new StoryRun(c, one.snapshot());
      one.choose("hold-his-gaze");
      two.choose("hold-his-gaze");
      const x = one.advance() as RollBeat;
      const y = two.advance() as RollBeat;
      expect(y.dice).toEqual(x.dice);
      results.add(x.pass);
    }
    // At 2d6 + 2 against 10 some pass and some don't.
    expect([...results].sort()).toEqual([false, true]);
  });

  test("a check option can't jump straight off", () => {
    const { errors } = parseChapter(
      `${HEAD}== a\nchoose\n  * white MEMORY 9 [x] -> END\n  * [y] -> END\nend\n`,
    );
    expect(errors.some((e) => e.message.includes("can't jump"))).toBe(true);
  });
});

describe("voices", () => {
  const c = load(`== a
~ MEMORY: Always heard.
~ COMPOSURE medium: Only with nerve.
~ MEMORY 15: Only with a godly memory.
His own thought.
-> END
`);

  test("a passive voice speaks only if skill + 6 reaches it", () => {
    const steady = run(c, build({ WITS: 2, NERVE: 4 }, "COMPOSURE")); // 5
    expect(steady.beat).toMatchObject({
      text: "Always heard.",
      voice: { skill: "MEMORY" },
    });
    expect(steady.advance()).toMatchObject({
      text: "Only with nerve.",
      voice: { skill: "COMPOSURE", diff: 9, tier: "Medium" },
    });
    expect(steady.advance()).toMatchObject({ text: "His own thought." });

    const shaky = run(c, build({ WITS: 5, NERVE: 1 }, "MEMORY")); // 1
    shaky.advance();
    expect(shaky.beat).toMatchObject({ text: "His own thought." });
  });
});

const ROOM = `== a
investigate "Read him" min=1 leave="Enough"
  spot shoes "His shoes"
    Police soles.
  spot ring "His hand" at=left_hand
    A pale band.
  spot pin "His lapel"
    An oak leaf.
  spot tie "His tie"
    Silk.
  deduce party "Not police. Party." needs=shoes,pin skill=MEMORY diff=formidable
    Party.
  fail
    It won't come.
  deduce simple "He's married" needs=ring
    Married.
end
-> END
`;

describe("checked deductions", () => {
  const c = load(ROOM);

  test("spots on a place's hotspots", () => {
    const look = c.scenes.a.ops[0];
    if (look.op !== "investigate") throw new Error("no investigation");
    expect(look.spots[0]).toMatchObject({
      id: "shoes",
      label: "His shoes",
      x: -1,
      anchor: "shoes",
    });
    expect(look.spots[1].anchor).toBe("left_hand");
    expect(look.deductions[0].check).toMatchObject({
      skill: "MEMORY",
      diff: 11,
    });
    expect(look.deductions[0].failAt).toBeGreaterThan(look.deductions[0].at);
  });

  test("a strong skill works it out at once, in its own voice", () => {
    const r = run(c, build({ WITS: 5, NERVE: 1 }, "MEMORY")); // 6
    r.examine("shoes");
    r.advance();
    r.examine("pin");
    const said = r.advance();
    expect(said).toMatchObject({
      kind: "roll",
      dice: null,
      pass: true,
      skill: "MEMORY",
      label: "Not police. Party.",
    });
    expect(r.flag("party")).toBe(1);
    expect(r.advance()).toMatchObject({ kind: "line", text: "Party." });
    const look = r.advance();
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.deductions[0].done).toBe(true);
  });

  test("a weak one rolls, and noticing more makes it easier", () => {
    const b = build({ WITS: 1, NERVE: 5 }, "COMPOSURE"); // Memory 1
    const r = run(c, b);
    r.examine("shoes");
    r.advance();
    r.examine("pin");
    let look = r.advance();
    if (look.kind !== "investigate") throw new Error("still in the room");
    expect(look.deductions[0]).toMatchObject({ ready: true, done: false });
    expect(look.deductions[0].check).toMatchObject({ bonus: 1, mods: [] });
    r.examine("tie");
    r.advance();
    look = r.beat as Beat as typeof look;
    if (look.kind !== "investigate") throw new Error("still in the room");
    expect(look.deductions[0].check).toMatchObject({
      bonus: 2,
      mods: [{ delta: 1, why: "Everything else you've noticed" }],
    });
  });

  test("a failed deduction plays its failure and waits for more", () => {
    const b = build({ WITS: 1, NERVE: 5 }, "COMPOSURE");
    const toRoll = (r: StoryRun) => {
      r.examine("shoes");
      r.advance();
      r.examine("pin");
      r.advance();
      return r.deduce("party") as RollBeat;
    };
    const seed = seedWhere(c, b, false, toRoll);
    const r = run(c, b, seed);
    toRoll(r);
    expect(r.advance()).toMatchObject({ text: "It won't come." });
    let look = r.advance();
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.deductions[0].done).toBe(false);
    expect(look.deductions[0].check!.locked).toBe(true);
    expect(() => r.deduce("party")).toThrow(/locked/);
    r.examine("ring");
    r.advance();
    look = r.beat as typeof look;
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.deductions[0].check!.locked).toBe(false);
  });
});

describe("places on the stage", () => {
  test("@place, @actor, @focus, @show and boost reach the stage", () => {
    const c = load(`== a
@place bar
@actor HERO stool_end sit
@actor BARMAN behind_bar lean walk wear=apron
@focus glasses
@vignette london
@show card
boost COMPOSURE +1 "Vienna, remembered"
Here.
@actor BARMAN none
-> END
`);
    const r = run(c, build({ WITS: 3, NERVE: 3 }, "MEMORY"));
    expect(r.stage).toMatchObject({
      place: "bar",
      actors: {
        HERO: { at: "stool_end", pose: "sit" },
        BARMAN: { at: "behind_bar", pose: "lean", wear: "apron" },
      },
      focus: "glasses",
      vignette: "london",
      props: { card: true },
    });
    expect(r.skills().COMPOSURE).toBe(4);
    const ev = r.drain();
    expect(ev).toContainEqual({
      type: "actor",
      who: "BARMAN",
      state: { at: "behind_bar", pose: "lean", wear: "apron" },
      walk: true,
    });
    expect(ev).toContainEqual({
      type: "boost",
      skill: "COMPOSURE",
      delta: 1,
      why: "Vienna, remembered",
    });
    r.advance();
    expect(r.stage.actors.BARMAN).toBeUndefined();
  });

  test("names must exist in the place a scene is in", () => {
    const c = load(`== a
@place bar
@actor HERO nowhere
investigate "Look"
  spot ghost "A ghost"
    Boo.
end
-> b
== b
@focus moon
-> END
`);
    const place = {
      key: "bar",
      name: "Bar",
      camera: { azimuth: 45, elevation: 35 },
      nav: { bounds: [0, 0, 1, 1] as [number, number, number, number], cell: 0.5, blocks: [] },
      areas: [],
      marks: { stool_end: { at: [0, 0] as [number, number] } },
      hotspots: {},
      shots: {},
      items: [],
      lights: [],
      env: { background: "#000", fog: "#000", fogDensity: 0 },
    };
    const msgs = validateChapter(c, { places: { bar: place } }).map(
      (p) => p.message,
    );
    expect(msgs).toContainEqual(`mark "nowhere" isn't in the place "bar"`);
    expect(msgs).toContainEqual(`hotspot "ghost" isn't in the place "bar"`);
    // The place carries into the next scene.
    expect(msgs).toContainEqual(`shot "moon" isn't in the place "bar"`);
  });
});

describe("old saves", () => {
  test("a save from before skills loads with the chapter's first build", () => {
    const c = load(`== a\n~ MEMORY 9: Heard.\n-> END\n`);
    const old = {
      chapter: 3,
      scene: "a",
      flags: { x: 1 },
      rels: {},
      stage: { backdrop: "bar", figure: null, ambient: null, news: null },
      path: [],
      taken: [],
    };
    const r = new StoryRun(c, old as never);
    expect(r.build.archetype).toBe("ANALYST");
    expect(r.stage.place).toBeNull();
    expect(r.beat).toMatchObject({ text: "Heard." });
    expect(r.snapshot()).toMatchObject({ checks: {}, boosts: [], seed: 1 });
  });
});
