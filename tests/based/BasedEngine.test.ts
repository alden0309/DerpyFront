// Mr. Based's engine: the script format, choices, flags, conditions,
// timers, investigations, and saving and loading mid-chapter.

import { describe, expect, test } from "vitest";
import { evalExpr, parseExpr } from "../../src/based/engine/Expr";
import { Beat, StoryRun } from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { Chapter } from "../../src/based/engine/Types";

const SCRIPT = `
// A tiny chapter that uses every part of the format.
@chapter 9 "Test Pattern"
@summary "A chapter for the tests."
@start bar
@cast HERO "Mr. Test" portrait=hero
@cast BARMAN "The barman" portrait=barman
@carry "You were rude." if rude

== bar "The bar"
@checkpoint "At the bar"
@backdrop bar_wide
@ambient rain_in
@figure BARMAN
Narration comes first.
BARMAN (dryly): Evening.
~ A thought, in his own voice.
choose "Say what?" timer=5
  * [Hello] "Hello there."
    rel BARMAN +1
  * [Get lost] "Get lost."
    set rude
    rel BARMAN -2
    remember BARMAN
  * silent [Say nothing]
    add silences 1
end
if rude
  BARMAN: Charming.
elif silences >= 1
  BARMAN: Quiet one.
else
  BARMAN: Likewise.
end
-> menu

== menu "Menu"
choose "Think about"
  * once [The rain] -> rain
  * if rel.barman >= 1 [The barman] -> barman_thought
  * [Look around] -> look
end

== rain "Rain"
@backdrop rain_window
It rains.
add thoughts 1
-> menu

== barman_thought "The barman"
He seems decent.
-> menu

== look "Look"
investigate "Look around" min=2 leave="Done"
  spot glass 10 20 "The glass"
    A glass.
  spot door 80 50 "The door"
    A door.
    if rude
      ~ I should leave.
    end
  spot coat 50 50 "The coat"
    A coat.
  deduce leaving "Time to go" needs=glass,door
    Time to go.
end
@card "THE END" "Of the test"
-> END
`;

function chapter(): Chapter {
  const { chapter, errors } = parseChapter(SCRIPT);
  expect(errors).toEqual([]);
  return chapter;
}

function line(b: Beat): string {
  if (b.kind !== "line") throw new Error(`expected a line, got ${b.kind}`);
  return b.text;
}

describe("the script format", () => {
  test("reads the header, cast and scenes", () => {
    const c = chapter();
    expect(c.n).toBe(9);
    expect(c.title).toBe("Test Pattern");
    expect(c.summary).toBe("A chapter for the tests.");
    expect(c.start).toBe("bar");
    expect(c.cast.map((m) => m.id)).toEqual(["HERO", "BARMAN"]);
    expect(c.cast[1].portrait).toBe("barman");
    expect(c.order).toEqual(["bar", "menu", "rain", "barman_thought", "look"]);
    expect(c.scenes.bar.checkpoint).toBe("At the bar");
    expect(c.carry).toHaveLength(1);
  });

  test("reads lines, speakers, stage directions and thoughts", () => {
    const ops = chapter().scenes.bar.ops.filter((o) => o.op === "line");
    expect(ops[0]).toMatchObject({
      kind: "narr",
      text: "Narration comes first.",
    });
    expect(ops[1]).toMatchObject({
      kind: "say",
      who: "BARMAN",
      how: "dryly",
      text: "Evening.",
    });
    expect(ops[2]).toMatchObject({
      kind: "think",
      text: "A thought, in his own voice.",
    });
  });

  test("reads options with modifiers, spoken lines and ids", () => {
    const c = chapter();
    const choose = c.scenes.bar.ops.find((o) => o.op === "choose");
    expect(choose).toMatchObject({
      id: "bar#1",
      prompt: "Say what?",
      timer: 5,
    });
    const opts = (choose as Extract<typeof choose, { op: "choose" }>)!.options;
    expect(opts.map((o) => o.id)).toEqual(["hello", "get-lost", "say-nothing"]);
    expect(opts[2].silent).toBe(true);
    const menu = c.scenes.menu.ops[0] as Extract<
      Chapter["scenes"][string]["ops"][number],
      { op: "choose" }
    >;
    expect(menu.options[0].once).toBe(true);
    expect(menu.options[1].cond).toEqual({
      k: "cmp",
      op: ">=",
      a: { k: "rel", who: "BARMAN" },
      b: { k: "num", v: 1 },
    });
  });

  test("reports mistakes with line numbers", () => {
    const { errors } = parseChapter(`@chapter 1 "Broken"
@cast HERO "Hero"
== one
NOBODY: Who am I?
choose "Pick"
  stray text
end
if (open
  Text.
-> nowhere at all
@sparkle
`);
    const messages = errors.map((e) => `${e.line}: ${e.message}`);
    expect(
      messages.some((m) => m.startsWith('4: "NOBODY" isn\'t in the cast')),
    ).toBe(true);
    expect(messages.some((m) => m.startsWith("6: text inside a choice"))).toBe(
      true,
    );
    expect(
      messages.some((m) => m.startsWith("5: a choice with no options")),
    ).toBe(true);
    expect(messages.some((m) => m.startsWith("8: condition"))).toBe(true);
    expect(messages.some((m) => m.startsWith("10:"))).toBe(true);
    expect(
      messages.some((m) => m.startsWith('11: unknown direction "@sparkle"')),
    ).toBe(true);
    expect(messages.some((m) => m.includes("never closed"))).toBe(true);
  });
});

describe("conditions", () => {
  const v = { flags: { a: 1, n: 3 }, rels: { BARMAN: 2 } };
  test.each([
    ["a", 1],
    ["b", 0],
    ["not b", 1],
    ["a and b", 0],
    ["a or b", 1],
    ["n >= 3 and rel.barman == 2", 1],
    ["not (a and n > 3)", 1],
    ["n != 3", 0],
  ])("%s", (src, want) => {
    expect(evalExpr(parseExpr(src), v)).toBe(want);
  });

  test("refuses nonsense", () => {
    expect(() => parseExpr("a and")).toThrow();
    expect(() => parseExpr("(a")).toThrow();
    expect(() => parseExpr("Flag")).toThrow();
    expect(() => parseExpr("a b")).toThrow();
  });
});

describe("playing a chapter", () => {
  test("lines, a choice, relationships and memory", () => {
    const run = new StoryRun(chapter());
    expect(run.stage).toEqual({
      backdrop: "bar_wide",
      figure: "BARMAN",
      ambient: "rain_in",
      news: null,
    });
    const first = run.drain();
    expect(first).toEqual([
      {
        type: "scene",
        scene: "bar",
        label: "The bar",
        checkpoint: "At the bar",
      },
    ]);
    expect(line(run.beat)).toBe("Narration comes first.");
    expect(line(run.advance())).toBe("Evening.");
    expect(line(run.advance())).toBe("A thought, in his own voice.");
    const choice = run.advance();
    expect(choice.kind).toBe("choice");
    if (choice.kind !== "choice") return;
    expect(choice.timer).toBe(5);
    expect(choice.options.map((o) => o.label)).toEqual([
      "Hello",
      "Get lost",
      "Say nothing",
    ]);
    const said = run.choose("get-lost");
    // He says his line first; what it does lands as the story moves on.
    expect(said).toMatchObject({
      kind: "line",
      who: "HERO",
      text: "Get lost.",
    });
    expect(line(run.advance())).toBe("Charming.");
    expect(run.flag("rude")).toBe(1);
    expect(run.rel("BARMAN")).toBe(-2);
    expect(run.drain()).toEqual([
      { type: "rel", who: "BARMAN", delta: -2 },
      { type: "remember", who: "BARMAN" },
    ]);
  });

  test("a timed choice that runs out says nothing", () => {
    const run = new StoryRun(chapter());
    while (run.beat.kind !== "choice") run.advance();
    run.timeout();
    expect(run.flag("silences")).toBe(1);
    expect(line(run.beat)).toBe("Quiet one.");
    expect(run.history()).toEqual(["s:bar", "c:bar#1=say-nothing"]);
  });

  test("once options go, conditional options appear", () => {
    const run = new StoryRun(chapter());
    while (run.beat.kind !== "choice") run.advance();
    run.choose("hello");
    run.advance(); // "Hello there." -> "Likewise."
    run.advance();
    let menu = run.beat;
    expect(menu.kind).toBe("choice");
    if (menu.kind !== "choice") return;
    expect(menu.options.map((o) => o.id)).toEqual([
      "the-rain",
      "the-barman",
      "look-around",
    ]);
    run.choose("the-rain");
    expect(line(run.beat)).toBe("It rains.");
    expect(run.stage.backdrop).toBe("rain_window");
    menu = run.advance();
    if (menu.kind !== "choice") throw new Error("expected the menu again");
    expect(menu.options.map((o) => o.id)).toEqual([
      "the-barman",
      "look-around",
    ]);
    expect(run.flag("thoughts")).toBe(1);
  });

  test("an investigation: spots, deductions, and leaving", () => {
    const run = new StoryRun(chapter());
    while (run.beat.kind !== "choice") run.advance();
    run.choose("get-lost");
    while (run.beat.kind !== "choice") run.advance();
    run.choose("look-around");
    let look = run.beat;
    expect(look.kind).toBe("investigate");
    if (look.kind !== "investigate") return;
    expect(look.canLeave).toBe(false);
    expect(() => run.leave()).toThrow();
    expect(look.deductions[0]).toMatchObject({ id: "leaving", ready: false });
    expect(() => run.deduce("leaving")).toThrow();

    expect(line(run.examine("glass"))).toBe("A glass.");
    look = run.advance();
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.spots.find((s) => s.id === "glass")!.seen).toBe(true);
    expect(look.canLeave).toBe(false);

    expect(line(run.examine("door"))).toBe("A door.");
    expect(line(run.advance())).toBe("I should leave.");
    look = run.advance();
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.canLeave).toBe(true);
    expect(look.deductions[0].ready).toBe(true);

    expect(line(run.deduce("leaving"))).toBe("Time to go.");
    look = run.advance();
    if (look.kind !== "investigate") throw new Error("back to the room");
    expect(look.deductions[0].done).toBe(true);

    expect(run.leave()).toMatchObject({ kind: "card", title: "THE END" });
    expect(run.advance()).toEqual({ kind: "end" });
    expect(run.drain().at(-1)).toEqual({ type: "end" });
  });

  test("saves at the start of each scene and loads back there", () => {
    const c = chapter();
    const run = new StoryRun(c);
    while (run.beat.kind !== "choice") run.advance();
    run.choose("get-lost");
    while (run.beat.kind !== "choice") run.advance();
    run.choose("the-rain");
    const save = JSON.parse(JSON.stringify(run.snapshot()));
    expect(save).toMatchObject({
      chapter: 9,
      scene: "rain",
      flags: { rude: 1 },
      rels: { BARMAN: -2 },
      path: ["s:bar", "c:bar#1=get-lost", "s:menu", "c:menu#1=the-rain"],
      taken: ["menu#1/the-rain"],
    });
    expect(save.stage.backdrop).toBe("bar_wide");

    // Somewhere else, later: the scene starts over with the same state.
    const again = new StoryRun(c, save);
    expect(line(again.beat)).toBe("It rains.");
    expect(again.stage.backdrop).toBe("rain_window");
    expect(again.flag("rude")).toBe(1);
    again.advance();
    const menu = again.beat;
    if (menu.kind !== "choice") throw new Error("expected the menu");
    // The rain was taken before the save, so it's still gone.
    expect(menu.options.map((o) => o.id)).toEqual(["look-around"]);
  });

  test("a save for a scene that no longer exists is refused", () => {
    const c = chapter();
    const save = new StoryRun(c).snapshot();
    expect(() => new StoryRun(c, { ...save, scene: "gone" })).toThrow();
  });
});
