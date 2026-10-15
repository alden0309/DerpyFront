// Mr. Based's validator, and every chapter actually written: each must parse
// cleanly, every jump must land, no scene may run off its end, every flag
// that's read must be set somewhere, every scene must be reachable, and the
// chapter must be finishable. Also plays each chapter down many random paths
// (r22: wandering the open world, through its doors, as a player might).

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { ITEM_DRAWINGS } from "../../src/based/client/ItemArt";
import { navFor } from "../../src/based/engine/Nav";
import { PlaceDef } from "../../src/based/engine/Place";
import { chapterStart, StoryRun } from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { areaAt } from "../../src/based/engine/Sight";
import {
  buildOf,
  languagePool,
  withLanguages,
} from "../../src/based/engine/Skills";
import { Chapter, FREE } from "../../src/based/engine/Types";
import {
  errorsOf,
  formatProblem,
  validateChapter,
  validatePlaces,
} from "../../src/based/engine/Validate";
import { playRandomly } from "./play";

const ROOT = path.resolve(__dirname, "../..");
const STORY = path.join(ROOT, "src/based/story");
const ART = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/art"))
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, "")),
);
const SOUNDS = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/audio"))
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.replace(/\.mp3$/, "")),
);
// r21: the 3D places and the models they're built from.
const MODELS = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/models"))
    .filter((f) => f.endsWith(".glb"))
    .map((f) => f.replace(/\.glb$/, "")),
);
const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  fs
    .readdirSync(path.join(ROOT, "src/based/places"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(
        fs.readFileSync(path.join(ROOT, "src/based/places", f), "utf8"),
      ) as PlaceDef,
    ]),
);

function problems(src: string) {
  const { chapter, errors } = parseChapter(src);
  expect(errors).toEqual([]);
  return errorsOf(validateChapter(chapter)).map((p) => p.message);
}

describe("the validator", () => {
  const head = `@chapter 1 "T"\n@cast HERO "Hero"\n`;

  test("a jump to a scene that doesn't exist", () => {
    expect(problems(`${head}== a\nHi.\n-> b\n`)).toContainEqual(
      `"-> b": there's no such scene`,
    );
  });

  test("a scene that runs off its end", () => {
    const p = problems(
      `${head}== a\nchoose\n  * [x] -> END\n  * [y]\n    Hm.\nend\n`,
    );
    expect(p.some((m) => m.includes("can run off its end"))).toBe(true);
  });

  test("a flag read but never set", () => {
    expect(
      problems(`${head}== a\nif ghost\n  Boo.\nend\n-> END\n`),
    ).toContainEqual(`flag "ghost" is read but never set`);
  });

  test("a scene nobody can reach", () => {
    expect(problems(`${head}== a\n-> END\n== b\n-> END\n`)).toContainEqual(
      `scene "b" can't be reached from "a"`,
    );
  });

  test("a chapter that never ends", () => {
    const p = problems(`${head}== a\n-> b\n== b\n-> a\n`);
    expect(p).toContainEqual(`nothing ever reaches "-> END"`);
    expect(p).toContainEqual(`from "a" the chapter can never end`);
  });

  test("a choice that can run out of options", () => {
    const p = problems(
      `${head}== a\nset x\nchoose\n  * once [x] -> a\n  * if x [y] -> END\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes("could run out of options"))).toBe(true);
  });

  test("a spot whose text leaves the room", () => {
    const p = problems(
      `${head}== a\ninvestigate "Look"\n  spot s 1 1 "S"\n    -> END\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes("can't leave the room"))).toBe(true);
  });

  test("a deduction that needs something that isn't there", () => {
    const p = problems(
      `${head}== a\ninvestigate "Look"\n  spot s 1 1 "S"\n    S.\n  deduce d "D" needs=s,t\n    D.\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes(`needs "t"`))).toBe(true);
  });

  test("missing art", () => {
    const { chapter } = parseChapter(
      `${head}== a\n@backdrop nowhere\nHi.\n-> END\n`,
    );
    const p = validateChapter(chapter, { art: new Set(["bar"]) });
    expect(p.map((x) => x.message)).toContainEqual(
      "@backdrop nowhere: no such picture in the art folder",
    );
  });

  test("a clean chapter has no errors", () => {
    expect(
      problems(
        `${head}== a\nset x\nif x\n  Hi.\nend\nchoose\n  * [Go] -> b\n  * [Stay]\nend\n-> b\n== b\n-> END\n`,
      ),
    ).toEqual([]);
  });
});

describe("the art and sound", () => {
  const credits = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/based/art/credits.json"), "utf8"),
  ) as {
    items: {
      keys: string[];
      what?: string;
      author: string;
      license: string;
      source: string;
    }[];
  };
  const credited = new Set(credits.items.flatMap((c) => c.keys));

  test("every picture, sound and model is credited", () => {
    expect(
      [...ART, ...SOUNDS, ...MODELS].filter((k) => !credited.has(k)),
    ).toEqual([]);
    for (const c of credits.items) {
      expect(c.author.length).toBeGreaterThan(0);
      // BPEOPLE (r22): the owner's own models have no licence or link;
      // BFIX (r23): nor have the props modelled for the game in Fusion.
      if (c.license === "Model supplied by the owner") continue;
      if (c.license === "Original work") {
        expect(c.changes).toContain("Modelled for Mr. Based in Autodesk Fusion");
        continue;
      }
      // BPLAY (r22): the typefaces are under font licences.
      expect(c.license).toMatch(
        c.what === "Typeface" ? /^(SIL Open Font|Apache)/ : /^CC/,
      );
      expect(c.source).toMatch(/^https:\/\//);
    }
  });

  test("every model is a small, compressed glTF binary", () => {
    // BPEOPLE (r22): the people's bodies and clips; the owner's own models
    // may join them (their limits are checked in BasedPeople.test.ts).
    expect([...MODELS]).toEqual(
      expect.arrayContaining(["anims", "body_f", "body_m", "props"]),
    );
    for (const key of MODELS) {
      const buf = fs.readFileSync(
        path.join(ROOT, "src/based/models", `${key}.glb`),
      );
      expect(buf.subarray(0, 4).toString(), key).toBe("glTF");
      expect(buf.length, key).toBeLessThanOrEqual(1_000_000);
      // meshopt-compressed (the client decodes it).
      const json = buf.subarray(20, 20 + buf.readUInt32LE(12)).toString();
      expect(json, key).toContain("EXT_meshopt_compression");
    }
  });

  test("every picture is a small WebP", () => {
    for (const key of ART) {
      const size = fs.statSync(
        path.join(ROOT, "src/based/art", `${key}.webp`),
      ).size;
      expect(size, key).toBeLessThanOrEqual(250_000);
    }
  });
});

const files = fs.readdirSync(STORY).filter((f) => f.endsWith(".story"));

describe("the places", () => {
  test("the street, the bar and the palace, joined by doors", () => {
    expect(Object.keys(PLACES).sort()).toEqual(["elysee", "street", "vauban"]);
    expect(validatePlaces(PLACES)).toEqual([]);
    // Each door has one back.
    const doors = (k: string) =>
      Object.values(PLACES[k].hotspots)
        .filter((h) => h.to)
        .map((h) => h.to!.place);
    expect(doors("street")).toEqual(["vauban", "vauban"]);
    expect(doors("vauban")).toEqual(["street", "street"]);
  });

  test.each(Object.keys(PLACES))("%s: every mark can be walked to", (key) => {
    const p = PLACES[key];
    expect(p.key).toBe(key);
    // BFIX (r23): the grid knows the furniture (Solid.ts), so a path ends
    // at the mark itself, or (for a seat's mark, whose last step is onto
    // the stool) beside it.
    const nav = navFor(p);
    const marks = Object.entries(p.marks);
    expect(marks.length).toBeGreaterThan(0);
    const [, from] = marks[0];
    for (const [name, m] of marks) {
      const path = nav.path(from.at, m.at);
      expect(path, `${key}: no way to ${name}`).not.toBeNull();
      const end = path![path!.length - 1];
      const off = Math.hypot(end[0] - m.at[0], end[1] - m.at[1]);
      expect(off, `${key}: ${name} is in something`).toBeLessThan(
        m.seat ? 0.75 : 0.01,
      );
    }
    // Every room that can be cut away is inside the walkable plan.
    for (const a of p.areas) {
      expect(a.rect[0]).toBeGreaterThanOrEqual(p.nav.bounds[0]);
      expect(a.rect[2]).toBeLessThanOrEqual(p.nav.bounds[2]);
    }
  });

  test("a place keeps to a few lights; the lamps share a pool", () => {
    // What a place asks for before the world's budget (World.ts) trims it.
    for (const p of Object.values(PLACES)) {
      const placeLights = p.lights.filter(
        (l) => l.kind === "point" || l.kind === "spot",
      ).length;
      expect(placeLights, p.key).toBeLessThanOrEqual(3);
    }
    // The bar is no longer drawn with the street: none of the street's
    // lamps, cars or façades is in it.
    const kinds = new Set(PLACES.vauban.items.map((i) => i.kind));
    for (const k of ["lamppost", "facade", "shopfront", "puddle"]) {
      expect(kinds.has(k), k).toBe(false);
    }
  });
});

describe("the chapters as written", () => {
  test("there is at least chapter one", () => {
    expect(files).toContain("chapter-01.story");
  });

  test.each(files)("%s parses and validates", (file) => {
    const { chapter, errors } = parseChapter(
      fs.readFileSync(path.join(STORY, file), "utf8"),
    );
    expect(errors.map((e) => `line ${e.line}: ${e.message}`)).toEqual([]);
    const found = validateChapter(chapter, {
      art: ART,
      sounds: SOUNDS,
      places: PLACES,
    });
    expect(errorsOf(found).map(formatProblem)).toEqual([]);
    expect(file).toBe(`chapter-${String(chapter.n).padStart(2, "0")}.story`);
  });

  test.each(files)(
    "%s can be played to the end down many paths",
    (file) => {
      const { chapter } = parseChapter(
        fs.readFileSync(path.join(STORY, file), "utf8"),
      );
      const scenesSeen = new Set<string>();
      const optionsSeen = new Set<string>();
      const builds = chapter.archetypes.map(buildOf);
      for (let run = 0; run < 200; run++) {
        // Every archetype, and a different throw of the dice each time.
        const p = playRandomly(chapter, PLACES, {
          seed: run + 1,
          build: builds.length > 0 ? builds[run % builds.length] : null,
          max: 5000,
        });
        expect(p.ended, `run ${run} never ended`).toBe(true);
        // r22 BPLAY: what he carries stays sound down every path.
        expect(p.run.euros).toBeGreaterThanOrEqual(0);
        for (const [k, n] of Object.entries(p.run.items)) {
          expect(chapter.items[k], k).toBeDefined();
          expect(n).toBeGreaterThan(0);
        }
        for (const [slot, k] of Object.entries(p.run.gear)) {
          expect(chapter.items[k!]?.slot, `${k} in ${slot}`).toBe(slot);
        }
        for (const step of p.run.history()) {
          if (step.startsWith("s:")) scenesSeen.add(step.slice(2));
          else optionsSeen.add(step.slice(2));
        }
      }
      // Every scene turns up on some path.
      expect([...chapter.order].filter((s) => !scenesSeen.has(s))).toEqual([]);
      expect(optionsSeen.size).toBeGreaterThan(10);
    },
    60_000,
  );
});

describe("chapter one's opening (r22)", () => {
  const text = fs.readFileSync(path.join(STORY, "chapter-01.story"), "utf8");
  const { chapter } = parseChapter(text);

  /** Every line said or narrated in a scene, as written. */
  const said = (c: Chapter, id: string) =>
    c.scenes[id].ops.flatMap((o) =>
      o.op === "line" ? [`${o.who ?? ""}: ${o.text} ${o.trans ?? ""}`] : [],
    );

  test("it starts on the street and lets him walk in himself", () => {
    const open = chapter.scenes[chapter.start];
    expect(open.ops.find((o) => o.op === "place")).toMatchObject({
      key: "street",
    });
    const r = new StoryRun(chapter);
    for (let i = 0; i < 50 && r.beat.kind !== "free"; i++) r.advance();
    expect(r.beat).toEqual({ kind: "free" });
    expect(r.stage.place).toBe("street");
    // Nothing poured before he orders: no glass on the bar.
    const bar = PLACES.vauban.items.filter((i) =>
      ["glass_second", "his_beer", "water_glass"].includes(i.id ?? ""),
    );
    expect(bar.every((i) => i.hidden === true)).toBe(true);
    // Walking in is his: the bar's scene starts when he enters.
    expect(chapter.scenes.vauban.trigger).toMatchObject({
      on: "enter",
      target: "vauban",
    });
    // The TV and the posters are still there.
    expect(open.ops.some((o) => o.op === "news" && o.text)).toBe(true);
    expect(chapter.scenes.posters.trigger?.target).toBe("posters");
  });

  test("nobody knows him: not the barman, not the man in grey", () => {
    for (const id of [
      "order",
      "tv_talk",
      "stranger",
      "talk",
      "read_stranger",
    ]) {
      for (const l of said(chapter, id)) {
        if (/^(BARMAN|ANSELME|STRANGER|DELORME):/.test(l)) {
          expect(l, id).not.toMatch(/Based|Bah-ZAY/);
        }
      }
    }
    // The man in grey learns a name only if he's given one.
    expect(said(chapter, "name").join(" ")).toContain("Based");
  });

  test("the other woman is gone", () => {
    expect(text).not.toMatch(/Kir Royale|first glass|CONSCIENCE|Her name/i);
    expect(chapter.skills.map((s) => s.id).sort()).toEqual(
      [
        "CHARISMA",
        "DECEPTION",
        "DEXTERITY",
        "EMPATHY",
        "ENDURANCE",
        "FOCUS",
        "INSTINCT",
        "INTIMIDATION",
        "LANGUAGES",
        "MEMORY",
        "PERCEPTION",
        "STRENGTH",
      ].sort(),
    );
  });

  test("the world opens after the meeting, and people always have something to say", () => {
    const r = playRandomly(chapter, PLACES, { seed: 3, max: 5000 });
    expect(r.ended).toBe(true);
    const h = r.run.history();
    const met = h.indexOf("s:contact");
    expect(met).toBeGreaterThan(0);
    // Every person the open world can find answers when spoken to.
    const talkers = new Set(
      chapter.order
        .map((id) => chapter.scenes[id].trigger)
        .filter((t) => t?.on === "talk")
        .map((t) => t!.target),
    );
    for (const who of ["BARMAN", "WOMAN", "WATCHER", "PORTER"]) {
      expect(talkers.has(who), who).toBe(true);
      // ...with a scene that has no condition to fall back on.
      expect(
        chapter.order.some((id) => {
          const t = chapter.scenes[id].trigger;
          return t?.on === "talk" && t.target === who && !t.cond && !t.once;
        }),
        who,
      ).toBe(true);
    }
    expect(FREE).toBe("FREE");
  });
});

describe("things to examine (r22 BPLAY)", () => {
  const text = fs.readFileSync(path.join(STORY, "chapter-01.story"), "utf8");
  const { chapter } = parseChapter(text);
  /** Every hotspot an @on look scene is about, by place, but the doors. */
  const looks = new Map<string, Set<string>>();
  for (const id of chapter.order) {
    const t = chapter.scenes[id].trigger;
    if (t?.on !== "look") continue;
    for (const [key, p] of Object.entries(PLACES)) {
      const h = p.hotspots[t.target!];
      if (!h || h.to || (t.place && t.place !== key)) continue;
      const set = looks.get(key) ?? new Set<string>();
      set.add(t.target!);
      looks.set(key, set);
    }
  }
  const areaOf = (place: string, id: string) => {
    const p = PLACES[place];
    const h = p.hotspots[id];
    const at = h.stand ? p.marks[h.stand].at : [h.at[0], h.at[2]];
    return areaAt(p.areas, at[0], at[1])?.id ?? place;
  };

  test("plenty in the street, the bar and the lobby", () => {
    const by: Record<string, string[]> = {};
    for (const [place, ids] of looks) {
      for (const id of ids) (by[areaOf(place, id)] ??= []).push(id);
    }
    expect(by.street.length).toBeGreaterThanOrEqual(15);
    expect(by.bar.length).toBeGreaterThanOrEqual(15);
    expect(by.lobby.length).toBeGreaterThanOrEqual(9);
    // At least thirty of them new this round.
    const r21 = [
      "posters",
      "van",
      "pharmacy",
      "flyer",
      "room_mirror",
      "corner",
      "door",
      "coats",
      "room_tv",
      "register",
      "delorme_card",
      "street_west",
    ];
    const all = [...looks.values()].flatMap((s) => [...s]);
    expect(all.filter((id) => !r21.includes(id)).length).toBeGreaterThanOrEqual(
      30,
    );
  });

  test("every one can be walked to", () => {
    for (const [place, ids] of looks) {
      const p = PLACES[place];
      const nav = navFor(p);
      // From where he comes in at each door.
      const entries = Object.values(PLACES)
        .flatMap((o) => Object.values(o.hotspots))
        .filter((h) => h.to?.place === place)
        .map((h) => p.marks[h.to!.mark].at);
      expect(entries.length).toBeGreaterThan(0);
      for (const id of ids) {
        const h = p.hotspots[id];
        if (h.on) continue; // on a person: reached with them
        const goal = h.stand
          ? p.marks[h.stand].at
          : nav.nearestFree(h.at[0], h.at[2])!;
        expect(goal, `${place}.${id}`).toBeTruthy();
        if (h.stand) {
          expect(
            nav.walkable(goal[0], goal[1]),
            `${place}.${id} stands on a block`,
          ).toBe(true);
        }
        for (const from of entries) {
          // BFIX (r23): all the way there, not just as near as he can get.
          const path = nav.path([from[0], from[1]], [goal[0], goal[1]]);
          expect(path, `${place}.${id} from ${from}`).not.toBeNull();
          const end = path![path!.length - 1];
          expect(
            Math.hypot(end[0] - goal[0], end[1] - goal[1]),
            `${place}.${id} from ${from}: stops short`,
          ).toBeLessThan(0.01);
        }
      }
    }
  });

  test("each can always be looked at again (but what he takes away)", () => {
    const taken = ["bar_paper", "delorme_card", "street_west"];
    for (const ids of looks.values()) {
      for (const id of ids) {
        if (taken.includes(id)) continue;
        const plain = chapter.order.some((s) => {
          const t = chapter.scenes[s].trigger;
          return t?.on === "look" && t.target === id && !t.once && !t.cond;
        });
        expect(plain, `${id} has no plain @on look`).toBe(true);
      }
    }
  });

  test("some change with the weather or the hour; some give things", () => {
    const reads = (k: string) =>
      chapter.order.filter((s) =>
        chapter.scenes[s].ops.some(
          (o) => o.op === "if" && JSON.stringify(o.cond).includes(`"k":"${k}"`),
        ),
      );
    expect(reads("weather").length).toBeGreaterThanOrEqual(4);
    expect(reads("time").length).toBeGreaterThanOrEqual(3);
    const giving = chapter.order.filter(
      (s) =>
        chapter.scenes[s].trigger?.on === "look" &&
        chapter.scenes[s].ops.some(
          (o) =>
            (o.op === "item" && o.delta > 0) ||
            (o.op === "money" && o.delta > 0),
        ),
    );
    expect(giving.length).toBeGreaterThanOrEqual(6);
  });

  test("every item has a drawing, and his starting outfit his model", () => {
    for (const it of Object.values(chapter.items)) {
      if (it.icon) expect(ITEM_DRAWINGS, it.key).toContain(it.icon);
    }
    const worn = Object.values(chapter.items).filter((i) => i.start === "worn");
    expect(worn.map((i) => i.slot).sort()).toEqual([
      "jacket",
      "shirt",
      "shoes",
      "trousers",
    ]);
    // Only the jacket has a 3D model so far: the owner's own (BPEOPLE).
    expect(worn.filter((i) => i.look).map((i) => i.look)).toEqual([
      "field_jacket",
    ]);
    expect(chapter.cast[0].look).toBe("field_jacket");
  });
});

describe("languages in chapter one (r22 BPLAY)", () => {
  const text = fs.readFileSync(path.join(STORY, "chapter-01.story"), "utf8");
  const { chapter } = parseChapter(text);

  test("English (British), French and Russian; German is gone", () => {
    expect(chapter.languages.map((l) => l.code).sort()).toEqual([
      "en_gb",
      "fr",
      "ru",
    ]);
    for (const id of chapter.order) {
      for (const o of chapter.scenes[id].ops) {
        if (o.op === "line") expect(o.lang, id).not.toBe("de");
      }
    }
    expect(text).not.toMatch(/speaks\.de|\[de\b|German that/);
  });

  test("the archetypes' pools, and BWORLD's saves turned into points", () => {
    const [analyst, handler, operator] = chapter.archetypes.map(buildOf);
    expect(
      [analyst, handler, operator].map((b) => languagePool(chapter, b)),
    ).toEqual([4, 3, 2]);
    // BWORLD's Analyst had French, English and German: German's points go
    // to the other two.
    expect(
      withLanguages(chapter, { ...analyst, langs: ["fr", "en_gb", "de"] })
        .langPts,
    ).toEqual({ fr: 2, en_gb: 2 });
    // His Operator had French alone.
    expect(
      withLanguages(chapter, { ...operator, langs: ["fr"] }).langPts,
    ).toEqual({ fr: 2 });
    // And such a save plays on.
    const r = new StoryRun(
      chapter,
      chapterStart(chapter, undefined, {
        build: { ...analyst, langs: ["fr", "en_gb", "de"] },
      }),
    );
    expect(r.languages()).toEqual({ fr: 2, en_gb: 2, ru: 0 });
  });

  test("the porter's call is in Russian, with a check in Russian", () => {
    const ops = chapter.scenes.porter.ops;
    expect(ops.find((o) => o.op === "line" && o.lang)).toMatchObject({
      who: "PORTER",
      lang: "ru",
    });
    const choice = ops.find((o) => o.op === "choose");
    if (choice?.op !== "choose") throw new Error("no choice");
    expect(
      choice.options.find((o) => o.check?.skill === "LANGUAGES.ru"),
    ).toBeTruthy();
    // The phrasebook from lost property adds a point of Russian in hand.
    expect(chapter.items.phrasebook.bonus).toEqual([
      { skill: "LANGUAGES.ru", delta: 1 },
    ]);
  });
});
