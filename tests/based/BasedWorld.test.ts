// Mr. Based's open world (r22): what starts a scene (@on), being free to go
// where he likes (-> FREE), the journal, the clock, his languages, the
// weather and getting wet, noticing things by walking about, running, the
// save slots, round 21's saves, and how it all holds up in a long game.

import { describe, expect, test } from "vitest";
import {
  RUN_SPEED,
  setGait,
  setWetness,
} from "../../src/based/client/world/PeopleHooks";
import { neighbours, PlaceDef } from "../../src/based/engine/Place";
import {
  chapterStart,
  clockText,
  LINE_SECONDS,
  SAVED_PATH,
  StoryRun,
} from "../../src/based/engine/Runtime";
import {
  emptyProfile,
  fromV1,
  isSlot,
  noteSeen,
  slotOf,
  SLOTS,
  V1Save,
} from "../../src/based/engine/Save";
import { parseChapter } from "../../src/based/engine/Script";
import { canSee, noticed, noticeRange } from "../../src/based/engine/Sight";
import {
  buildOf,
  buildProblem,
  defaultBuild,
  languagePool,
  withLanguages,
} from "../../src/based/engine/Skills";
import { Chapter, FREE } from "../../src/based/engine/Types";
import {
  errorsOf,
  validateChapter,
  validatePlaces,
} from "../../src/based/engine/Validate";
import {
  startWeather,
  stepWeather,
  stepWetness,
  weatherAt,
} from "../../src/based/engine/Weather";
import { playRandomly } from "./play";

/** Two small places joined by a door, for the tests. */
function room(key: string, other: string): PlaceDef {
  return {
    key,
    name: key === "street" ? "The street" : "The bar",
    camera: { azimuth: 45, elevation: 36 },
    nav: { bounds: [0, 0, 10, 10], cell: 0.5, blocks: [[0, 4.8, 6, 5.2]] },
    areas: [
      { id: key, rect: [0, 0, 10, 10], span: 10, inside: key !== "street" },
    ],
    marks: {
      in: { at: [8, 8] },
      door_side: { at: [8, 9] },
      far: { at: [1, 1] },
      stool: { at: [2, 8], seat: 0.8 },
    },
    hotspots: {
      door: {
        at: [8, 1, 9.5],
        stand: "door_side",
        to: { place: other, mark: "in" },
      },
      thing: { at: [3, 0.5, 7], stand: "stool" },
      far_thing: { at: [1, 0.5, 1] },
    },
    shots: {},
    items: [],
    lights: [],
    env: { background: "#000", fog: "#000", fogDensity: 0.01 },
  };
}
const PLACES: Record<string, PlaceDef> = {
  street: room("street", "bar"),
  bar: room("bar", "street"),
};

const SCRIPT = `@chapter 1 "Open"
@time 21:30
@cast HERO "Hero"
@cast BARMAN "The barman" look=barman
@cast JULES "Jules" body=BARMAN
@attribute MIND "Mind" "Thinking."
@attribute BODY "Body" "Doing."
@skill LANGUAGES MIND "Languages" "Tongues."
@skill FOCUS MIND "Focus" "Putting it together."
@skill PERCEPTION BODY "Perception" "Eyes."
@archetype TALKER "Talker" MIND=4 BODY=2 signature=LANGUAGES "Many tongues."
@archetype DOER "Doer" MIND=1 BODY=5 signature=PERCEPTION "Few words."
@points 6 min=1 max=5
@language fr "French"
@language en_gb "English (British)"
@language ru "Russian"

== start "Start"
@place street
@weather rain
@actor HERO in
@actor BARMAN stool in=bar
He arrives.
task meet "Meet the barman."
-> FREE

== arrive "The bar"
@on enter bar once
He goes in.
-> FREE

== look_thing "A thing"
@on look thing once in=street
A thing in the street.
set saw_thing
-> FREE

== look_thing_again "A thing"
@on look thing
The thing again.
-> FREE

== hello "Hello"
@on talk BARMAN once
BARMAN [fr]: Bonsoir. | Good evening.
BARMAN [ru medium]: Dobryy vecher. | Good evening, in Russian.
JULES: I'm Jules.
set met
task meet done
task leave "Go home."
-> FREE

== chat "Chat"
@on talk JULES if met
JULES: Still here?
-> FREE

== idea "An idea"
@on think "What was that thing?" if saw_thing and met
~ FOCUS: It was a thing.
set had_idea
-> FREE

== happens "It happens"
@on auto if had_idea
@time 01:15
Something happens by itself.
-> FREE

== home "Home"
@on look far_thing in=street if met
choose "Go home?"
  * [Yes] -> END
  * silent [Not yet] -> FREE
end
`;

function load(src = SCRIPT): Chapter {
  const { chapter, errors } = parseChapter(src);
  expect(errors).toEqual([]);
  return chapter;
}

/** Reads on to the next thing that needs the player. */
function settle(r: StoryRun): void {
  for (let i = 0; i < 100; i++) {
    const b = r.beat;
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      r.advance();
    } else return;
  }
}

describe("the open world's format", () => {
  test("@on, -> FREE, task, @weather, @time and languages parse", () => {
    const c = load();
    expect(c.clock).toBe(21 * 60 + 30);
    expect(c.languages.map((l) => l.code)).toEqual(["fr", "en_gb", "ru"]);
    expect(c.scenes.arrive.trigger).toMatchObject({
      on: "enter",
      target: "bar",
      once: true,
    });
    expect(c.scenes.look_thing.trigger).toMatchObject({
      on: "look",
      target: "thing",
      place: "street",
      once: true,
    });
    expect(c.scenes.idea.trigger).toMatchObject({
      on: "think",
      label: "What was that thing?",
      once: true,
    });
    // auto and think always play once.
    expect(c.scenes.happens.trigger?.once).toBe(true);
    const hello = c.scenes.hello.ops.filter((o) => o.op === "line");
    expect(hello[0]).toMatchObject({
      who: "BARMAN",
      lang: "fr",
      text: "Bonsoir.",
      trans: "Good evening.",
    });
    expect(hello[1]).toMatchObject({ lang: "ru", langDiff: 9 });
  });

  test("mistakes in the new directions are reported", () => {
    const { errors } = parseChapter(`@chapter 1 "T"
@cast HERO "Hero"
== a
@checkpoint "Old"
@on wander somewhere
@weather sleet
@time 25:00
task x
HERO [fr]: Bonjour.
-> FREE
`);
    const m = errors.map((e) => `${e.line}: ${e.message}`);
    expect(m.some((x) => x.startsWith("4: @checkpoint is gone"))).toBe(true);
    expect(m.some((x) => x.startsWith("5: @on talk WHO"))).toBe(true);
    expect(m.some((x) => x.startsWith("6: @weather"))).toBe(true);
    expect(m.some((x) => x.startsWith("7: @time"))).toBe(true);
    expect(m.some((x) => x.startsWith("8: task id"))).toBe(true);
    expect(m.some((x) => x.startsWith("9: a line in [fr] needs"))).toBe(true);
  });
});

describe("the validator, open world", () => {
  test("the test chapter is clean, with its places", () => {
    expect(
      errorsOf(validateChapter(load(), { places: PLACES })).map(
        (p) => p.message,
      ),
    ).toEqual([]);
    expect(validatePlaces(PLACES)).toEqual([]);
  });

  test("@on scenes need FREE to be reachable, and real targets", () => {
    const c = load(`@chapter 1 "T"
@cast HERO "Hero"
== a
@place street
-> END
== b
@on talk NOBODY
-> FREE
== c
@on look nothing_here
-> FREE
== d
@on enter nowhere
-> FREE
`);
    const m = errorsOf(validateChapter(c, { places: PLACES })).map(
      (p) => p.message,
    );
    expect(m).toContainEqual(`@on talk NOBODY: not in the cast`);
    expect(m.some((x) => x.includes(`no hotspot "nothing_here"`))).toBe(true);
    expect(m).toContainEqual(`@on enter nowhere: no such place`);
    expect(m.some((x) => x.includes(`nothing ever reaches "-> FREE"`))).toBe(
      true,
    );
  });

  test("free with nothing that leads to the end is a trap", () => {
    const c = load(`@chapter 1 "T"
@cast HERO "Hero"
== a
-> FREE
== b
@on auto
Nothing.
-> FREE
`);
    const m = errorsOf(validateChapter(c)).map((p) => p.message);
    expect(m).toContainEqual(`nothing ever reaches "-> END"`);
    expect(m).toContainEqual(
      `once he's free, nothing he can start ever leads to "-> END"`,
    );
  });

  test("marks are checked in the place a trigger fires in", () => {
    const c = load(`@chapter 1 "T"
@cast HERO "Hero"
== a
@place street
-> FREE
== b
@on look thing in=street
@actor HERO nowhere_mark
-> END
`);
    const m = errorsOf(validateChapter(c, { places: PLACES })).map(
      (p) => p.message,
    );
    expect(m).toContainEqual(`mark "nowhere_mark" isn't in the place "street"`);
  });

  test("a door to a place that isn't there", () => {
    const bad = {
      street: {
        ...PLACES.street,
        hotspots: {
          door: { at: [0, 0, 0], to: { place: "moon", mark: "in" } },
        },
      },
    } as Record<string, PlaceDef>;
    expect(validatePlaces(bad)).toEqual([
      `street.door: leads to "moon", no such place`,
    ]);
  });
});

describe("free to go where he likes", () => {
  test("the opening sets him free; things answer by their conditions", () => {
    const c = load();
    const r = new StoryRun(
      c,
      chapterStart(c, undefined, { build: buildOf(c.archetypes[0]) }),
    );
    settle(r);
    expect(r.beat).toEqual({ kind: "free" });
    expect(r.free).toBe(true);
    expect(r.tasks).toEqual([
      { id: "meet", text: "Meet the barman.", done: false },
    ]);
    // In the street: the thing, nobody to talk to (the barman's in the bar).
    expect(r.available()).toEqual({
      talk: [],
      look: ["thing"],
      think: [],
      use: [],
    });
    r.look("thing");
    settle(r);
    expect(r.flag("saw_thing")).toBe(1);
    // Once: the next look is the other scene.
    r.look("thing");
    expect(r.beat).toMatchObject({ kind: "line", text: "The thing again." });
    settle(r);
    // Nothing to see here: null, and he stays free.
    expect(r.look("nothing")).toBeNull();
    expect(r.beat.kind).toBe("free");
  });

  test("walking into a place starts what starts there, once", () => {
    const c = load();
    const r = new StoryRun(c);
    settle(r);
    r.enterPlace("bar", "in");
    expect(r.beat).toMatchObject({ kind: "line", text: "He goes in." });
    expect(r.stage.place).toBe("bar");
    expect(r.stage.actors.HERO).toMatchObject({ at: "in", place: "bar" });
    settle(r);
    r.enterPlace("street", "in");
    r.enterPlace("bar", "in");
    expect(r.beat.kind).toBe("free");
    // The barman (who goes by two names) is here, and will talk.
    expect(r.available().talk).toEqual(["BARMAN"]);
    expect(r.talk("BARMAN")).toMatchObject({ kind: "line", who: "BARMAN" });
  });

  test("thoughts surface when they can, and some things just happen", () => {
    const c = load();
    const r = new StoryRun(c);
    settle(r);
    r.look("thing");
    settle(r);
    expect(r.available().think).toEqual([]);
    r.enterPlace("bar", "in");
    settle(r);
    r.talk("BARMAN");
    settle(r);
    expect(r.tasks).toEqual([
      { id: "meet", text: "Meet the barman.", done: true },
      { id: "leave", text: "Go home.", done: false },
    ]);
    // After he's met the barman, talking to him plays the other scene,
    // by his other name.
    expect(r.available().think).toEqual([
      { id: "idea", label: "What was that thing?" },
    ]);
    const before = r.clock;
    r.think("idea");
    expect(r.beat).toMatchObject({ kind: "line", voice: { skill: "FOCUS" } });
    r.advance();
    // The thought sets a flag that starts "happens" by itself; its @time
    // is past midnight: the next day.
    expect(r.beat).toMatchObject({ text: "Something happens by itself." });
    expect(r.clock).toBeGreaterThan(before);
    expect(clockText(r.clock)).toEqual({ time: "01:15", day: 1 });
    settle(r);
    expect(r.available().think).toEqual([]);
    expect(r.talk("JULES")).toMatchObject({ text: "Still here?" });
  });

  test("a save while free loads free, where he was", () => {
    const c = load();
    const r = new StoryRun(c);
    settle(r);
    r.enterPlace("bar", "in");
    settle(r);
    const snap = JSON.parse(JSON.stringify(r.snapshot()));
    expect(snap.scene).toBe(FREE);
    expect(snap.done).toEqual(["arrive"]);
    const back = new StoryRun(c, snap);
    expect(back.beat).toEqual({ kind: "free" });
    expect(back.stage.place).toBe("bar");
    // "arrive" has played: walking in again starts nothing.
    back.enterPlace("street", "in");
    expect(back.enterPlace("bar", "in")).toEqual({ kind: "free" });
  });

  test("the clock moves with what's read", () => {
    const c = load();
    const r = new StoryRun(c);
    expect(r.clock).toBe((21 * 60 + 30) * 60 + LINE_SECONDS);
    expect(clockText(r.clock).time).toBe("21:30");
  });
});

describe("languages (r22 BPLAY: points under Languages)", () => {
  const c = load();
  const talker = buildOf(c.archetypes[0]);
  const doer = buildOf(c.archetypes[1]);

  test("his Languages at the start is the pool of points", () => {
    // The Talker: Mind 4, known for Languages: 5. The Doer: Mind 1: 1.
    expect(languagePool(c, talker)).toBe(5);
    expect(languagePool(c, doer)).toBe(1);
    // A build the engine makes by itself spreads them in the order written.
    expect(defaultBuild(c).langPts).toEqual({ fr: 2, en_gb: 2, ru: 1 });
  });

  test("the setup screen's rules for spending them", () => {
    expect(buildProblem(c, { ...doer, langPts: {} })).toBe(
      "spend his language points (1 left)",
    );
    expect(buildProblem(c, { ...doer, langPts: { fr: 2 } })).toBe(
      "his Languages give 1 language point, not 2",
    );
    expect(buildProblem(c, { ...doer, langPts: { xx: 1 } })).toBe(
      "no language xx",
    );
    expect(buildProblem(c, { ...talker, langPts: { fr: 4, ru: 1 } })).toBe(
      "a language takes 0 to 3 points",
    );
    expect(buildProblem(c, { ...doer, langPts: { ru: 1 } })).toBeNull();
    expect(
      buildProblem(c, { ...talker, langPts: { fr: 3, ru: 2 } }),
    ).toBeNull();
  });

  test("BWORLD's saves, with languages given, become points", () => {
    // He had French (and German, which is gone): French as far as three
    // goes; r26: what's left over goes round the others, a point each.
    expect(withLanguages(c, { ...talker, langs: ["fr", "de"] })).toEqual({
      ...talker,
      langPts: { fr: 3, en_gb: 1, ru: 1 },
    });
    expect(
      withLanguages(c, { ...talker, langs: ["fr", "en_gb"] }).langPts,
    ).toEqual({ fr: 3, en_gb: 2 });
    // German was all he had: the points go round the others.
    expect(withLanguages(c, { ...doer, langs: ["de"] }).langPts).toEqual({
      fr: 1,
    });
    // Points already spent are kept; r26: a gone language's go to the
    // others, a point at a time to the one he has least of.
    expect(
      withLanguages(c, { ...talker, langPts: { fr: 2, de: 2, ru: 1 } }).langPts,
    ).toEqual({ fr: 2, ru: 1, en_gb: 2 });
  });

  /** Plays to the barman's first lines with these points. */
  function lines(langPts: Record<string, number>, arch = 0) {
    const r = new StoryRun(
      c,
      chapterStart(c, undefined, {
        build: { ...buildOf(c.archetypes[arch]), langPts },
      }),
    );
    settle(r);
    r.enterPlace("bar", "in");
    settle(r);
    r.talk("BARMAN");
    const first = r.beat;
    const second = r.advance();
    return [first, second];
  }

  test("a tongue he has a point in is translated; one at 0 isn't", () => {
    const [fr] = lines({ fr: 1 }, 1);
    expect(fr).toMatchObject({
      text: "Good evening.",
      lang: {
        code: "fr",
        name: "French",
        understood: true,
        original: "Bonsoir.",
      },
    });
    const [notFr] = lines({ ru: 1 }, 1);
    expect(notFr).toMatchObject({
      text: "Bonsoir.",
      lang: { code: "fr", understood: false },
    });
  });

  test("a hard line reads his Languages plus his rating in it", () => {
    // The Talker, Languages 5, no Russian: 5 + 0 + 6 reaches medium (9):
    // the gist, by his Languages.
    const [, ru] = lines({ fr: 3, en_gb: 2 });
    expect(ru).toMatchObject({
      text: "Good evening, in Russian.",
      lang: { understood: true, via: "skill", tier: "Medium" },
    });
    // The Doer, Languages 1: getting by in Russian isn't enough (1 + 1 + 6).
    const [, ru2] = lines({ ru: 1 }, 1);
    expect(ru2).toMatchObject({
      text: "Dobryy vecher.",
      lang: { understood: false },
    });
  });

  test("conditions can ask what he speaks", () => {
    const { chapter, errors } = parseChapter(`@chapter 1 "T"
@cast HERO "Hero"
@language fr "French"
== a
if speaks.fr
  Oui.
else
  Non.
end
if speaks.xx
  Never.
end
-> END
`);
    expect(errors).toEqual([]);
    expect(
      errorsOf(validateChapter(chapter)).map((p) => p.message),
    ).toContainEqual("speaks.xx: not a @language");
  });
});

describe("noticing things", () => {
  const p = PLACES.street;

  test("near enough, widened by Perception; doors from further off", () => {
    const h = p.hotspots.thing;
    const o = { door: false, seated: false, showAll: false };
    expect(noticeRange(h, { ...o, perception: 1 })).toBe(2.5);
    expect(noticeRange(h, { ...o, perception: 5 })).toBe(4.5);
    expect(
      noticeRange(p.hotspots.door, { ...o, door: true, perception: 1 }),
    ).toBe(7);
    // Seated, he reads the whole room.
    expect(noticeRange(h, { ...o, seated: true, perception: 1 })).toBe(8.5);
  });

  test("only what's near him and in sight, never the whole place", () => {
    const things = ["thing", "far_thing", "door"];
    const opts = { perception: 2, seated: false, showAll: false };
    // Beside the thing: it and the door (7 m), not the far one.
    expect([...noticed(p, [3, 7.5], things, opts)].sort()).toEqual([
      "door",
      "thing",
    ]);
    // Across the place, by the far thing.
    expect([...noticed(p, [1.5, 1.5], things, opts)]).toEqual(["far_thing"]);
  });

  test("a room sees only itself; the street sees the street", () => {
    const areas = [
      { id: "street", rect: [0, 0, 10, 10], span: 10 },
      { id: "bar", rect: [0, 0, 5, 5], span: 8, inside: true },
      { id: "lobby", rect: [5, 0, 10, 5], span: 8, inside: true },
    ] as PlaceDef["areas"];
    expect(canSee(areas, [2, 2], [4, 4])).toBe(true);
    expect(canSee(areas, [2, 2], [7, 2])).toBe(false);
    expect(canSee(areas, [2, 8], [2, 2])).toBe(false);
    expect(canSee(areas, [2, 8], [9, 9])).toBe(true);
    // A thing looked at from inside the room, seen from inside it.
    expect(canSee(areas, [2, 2], [2, 8], [2, 4])).toBe(true);
  });
});

describe("weather and getting wet", () => {
  test("the story's weather, or a drift through the night", () => {
    expect(weatherAt("fog", 9999)).toBe("fog");
    const seen = new Set<string>();
    for (let t = 0; t < 430; t += 10) seen.add(weatherAt("changing", t));
    expect([...seen].sort()).toEqual(["clear", "drizzle", "fog", "rain"]);
    expect(weatherAt(null, 0)).toBe("rain");
  });

  test("puddles form in the rain and dry slowly after", () => {
    let s = { rain: 0, fog: 0, ground: 0 };
    for (let i = 0; i < 90; i++) s = stepWeather(s, "rain", 1);
    expect(s.rain).toBeGreaterThan(0.99);
    expect(s.ground).toBe(1);
    for (let i = 0; i < 60; i++) s = stepWeather(s, "clear", 1);
    expect(s.rain).toBeLessThan(0.01);
    // A minute after the rain the street is still mostly wet.
    expect(s.ground).toBeGreaterThan(0.8);
    for (let i = 0; i < 600; i++) s = stepWeather(s, "clear", 1);
    expect(s.ground).toBe(0);
    expect(startWeather("rain").ground).toBe(1);
  });

  test("he soaks in the rain, and dries indoors faster than out", () => {
    let wet = 0;
    for (let i = 0; i < 30; i++) wet = stepWetness(wet, 1, false, 1);
    expect(wet).toBe(1);
    // A drizzle wets him more slowly.
    expect(stepWetness(0, 0.35, false, 10)).toBeCloseTo(0.1225, 4);
    // Under a roof, the rain doesn't reach him.
    expect(stepWetness(0.5, 1, true, 10)).toBeLessThan(0.5);
    const inside = stepWetness(1, 0, true, 60);
    const outside = stepWetness(1, 0, false, 60);
    expect(inside).toBeLessThan(outside);
    let t = 0;
    for (wet = 1; wet > 0; t++) wet = stepWetness(wet, 0, true, 1);
    expect(t).toBeGreaterThan(200);
    expect(t).toBeLessThan(300);
  });
});

describe("running, and the people's hooks", () => {
  test("a person who can't run yet hurries its walk instead", () => {
    const plain = {};
    expect(setGait(plain, "run")).toBe(RUN_SPEED);
    expect(setGait(plain, "walk")).toBe(1);
    expect(() => setWetness(plain, 0.5)).not.toThrow();
  });

  test("a person with the hooks runs and gets wet by itself", () => {
    const calls: string[] = [];
    const p = {
      setGait: (g: string) => calls.push(`gait ${g}`),
      setWetness: (k: number) => calls.push(`wet ${k}`),
    };
    expect(setGait(p, "run")).toBe(1);
    setWetness(p, 1.4);
    expect(calls).toEqual(["gait run", "wet 1"]);
  });
});

describe("save slots", () => {
  const c = load();

  test("ten slots of his own, an autosave and a quicksave", () => {
    expect(SLOTS).toHaveLength(12);
    expect(SLOTS.slice(0, 2)).toEqual(["auto", "quick"]);
    expect(isSlot("10")).toBe(true);
    expect(isSlot("11")).toBe(false);
    expect(isSlot("../x")).toBe(false);
  });

  test("a slot says where, when, how long; and loads back", () => {
    const r = new StoryRun(c);
    settle(r);
    r.enterPlace("bar", "in");
    settle(r);
    const slot = slotOf(r, {
      placeName: "The bar",
      played: 754.6,
      savedAt: "2026-10-14T21:00:00.000Z",
      world: { x: 8, z: 7.5, heading: 3.1, wet: 0.4 },
    });
    expect(slot.v).toBe(2);
    expect(slot.meta).toMatchObject({
      place: "bar",
      placeName: "The bar",
      chapter: 1,
      played: 755,
      scene: FREE,
      label: "Free to go",
    });
    expect(clockText(slot.meta.clock).time).toBe("21:30");
    const back = new StoryRun(c, JSON.parse(JSON.stringify(slot.snap)));
    expect(back.beat.kind).toBe("free");
  });

  test("the profile keeps what's been seen, compactly", () => {
    const p = emptyProfile();
    noteSeen(p, 1, ["s:a", "c:x=y", "s:a", "s:b"], ["thing"]);
    noteSeen(p, 1, ["s:b", "c:x=y"], ["thing"]);
    expect(p.seen["1"]).toEqual({
      scenes: ["a", "b"],
      options: ["x=y"],
      found: ["thing"],
    });
  });
});

describe("a long game", () => {
  /** A made-up chapter of many places and scenes, as a long story might be. */
  function big(nPlaces: number, perPlace: number) {
    const lines = [
      `@chapter 1 "Long"`,
      `@cast HERO "Hero"`,
      `@cast FRIEND "A friend" look=barman`,
      `== start`,
      `@place p0`,
      `@actor FRIEND stool`,
      `-> FREE`,
    ];
    const places: Record<string, PlaceDef> = {};
    for (let i = 0; i < nPlaces; i++) {
      const key = `p${i}`;
      const def = room(key, `p${(i + 1) % nPlaces}`);
      def.key = key;
      def.hotspots.back = {
        at: [2, 1, 9.5],
        stand: "door_side",
        to: { place: `p${(i + nPlaces - 1) % nPlaces}`, mark: "in" },
      };
      for (let k = 0; k < perPlace; k++) {
        def.hotspots[`t${k}`] = {
          at: [1 + (k % 8), 0.5, 1 + Math.floor(k / 8)],
        };
        lines.push(
          `== s_${i}_${k}`,
          `@on look t${k} in=${key}${k % 3 === 0 ? " once" : ""}`,
          `Something in ${key}.`,
          `add seen_${i} 1`,
          k === 0
            ? `if seen_${i} >= 3 and visits >= ${nPlaces * 6}`
            : `if seen_${i} > 99999`,
          `  -> END`,
          `end`,
          `-> FREE`,
        );
      }
      lines.push(`== in_${i}`, `@on enter ${key}`, `add visits 1`, `-> FREE`);
      places[key] = def;
    }
    lines.push(`== talk`, `@on talk FRIEND`, `Hello.`, `-> FREE`);
    return { src: lines.join("\n"), places };
  }

  test("hundreds of places and thousands of scenes stay quick", () => {
    const { src, places } = big(120, 25);
    const t0 = performance.now();
    const { chapter, errors } = parseChapter(src);
    expect(errors).toEqual([]);
    expect(chapter.order.length).toBeGreaterThan(3000);
    const problems = errorsOf(validateChapter(chapter, { places }));
    expect(problems.map((p) => p.message)).toEqual([]);
    const parsed = performance.now() - t0;
    // Generous for a shared machine; it takes a fraction of this.
    expect(parsed).toBeLessThan(8000);
    // A long wander: the save stays small however long the path.
    const t1 = performance.now();
    const p = playRandomly(chapter, places, { seed: 7, max: 30_000 });
    expect(p.steps).toBeGreaterThan(1000);
    const snap = p.run.snapshot();
    expect(snap.path.length).toBeLessThanOrEqual(SAVED_PATH);
    expect(JSON.stringify(snap).length).toBeLessThan(40_000);
    expect(performance.now() - t1).toBeLessThan(15_000);
  }, 60_000);
});

describe("round 21's saves", () => {
  const c = load();

  test("an empty one becomes nothing", () => {
    const r = fromV1(
      { v: 1, current: null, checkpoints: {}, seen: {}, finished: {} },
      c,
      { now: "2026-10-14T00:00:00Z", pastScenes: [], openFlag: "met" },
    );
    expect(r.auto).toBeNull();
  });

  test("one mid-chapter becomes an autosave at the start, keeping who he was", () => {
    const old: V1Save = {
      v: 1,
      current: {
        chapter: 1,
        scene: "anselme",
        flags: { thoughts: 2 },
        rels: {},
        stage: {} as never,
        path: ["s:open"],
        taken: [],
        build: {
          attrs: { WITS: 4, NERVE: 2, HEART: 3 },
          signature: "MEMORY",
          archetype: "DOER",
        },
        seed: 99,
      },
      checkpoints: {},
      seen: {},
      finished: {},
    };
    const r = fromV1(old, c, {
      now: "2026-10-14T00:00:00Z",
      pastScenes: ["penhallow"],
      openFlag: "met",
    });
    expect(r.auto).not.toBeNull();
    expect(r.auto!.snap.scene).toBe("start");
    expect(r.auto!.snap.build).toMatchObject({
      archetype: "DOER",
      langPts: { fr: 1 },
    });
    expect(r.auto!.snap.seed).toBe(99);
    expect(r.profile.migrated).toContain("the start of chapter one");
    new StoryRun(c, r.auto!.snap);
  });

  test("one past the meeting opens where the world opens", () => {
    const old: V1Save = {
      v: 1,
      current: {
        chapter: 1,
        scene: "penhallow",
        flags: {},
        rels: {},
        stage: {} as never,
        path: [],
        taken: [],
        build: {
          attrs: { WITS: 2, NERVE: 4, HEART: 3 },
          signature: "COMPOSURE",
        },
      },
    };
    const r = fromV1(old, c, {
      now: "2026-10-14T00:00:00Z",
      pastScenes: ["penhallow"],
      openFlag: "met",
      places: PLACES,
    });
    // An own build maps to the new attributes and skills.
    const snap = r.auto!.snap;
    expect(snap.scene).toBe(FREE);
    expect(snap.flags.met).toBe(1);
    expect(r.profile.migrated).toContain("the world opens");
    const run = new StoryRun(c, snap);
    expect(run.free).toBe(true);
  });
});

describe("the places as written", () => {
  test("neighbours come from doors", () => {
    expect(neighbours(PLACES.street)).toEqual(["bar"]);
  });
});
